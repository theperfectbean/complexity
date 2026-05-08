// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies that are not needed for unit testing CSV/ZIP logic
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/env", () => ({
  env: { EMBEDDER_URL: "http://localhost:8000" },
}));
vi.mock("@/lib/config", () => ({
  runtimeConfig: {
    documents: { allowedExtensions: [".pdf", ".docx", ".txt", ".md", ".zip", ".csv"] },
  },
}));
vi.mock("pdf-parse", () => ({
  PDFParse: vi.fn(),
}));
vi.mock("mammoth", () => ({
  default: { extractRawText: vi.fn() },
}));

import AdmZip from "adm-zip";
import { csvToText, extractTextFromZip } from "@/lib/documents";

// ---------------------------------------------------------------------------
// csvToText
// ---------------------------------------------------------------------------

describe("csvToText", () => {
  it("converts a simple CSV to pipe-delimited row text", () => {
    const csv = `Name,Age,City\nAlice,30,NYC\nBob,25,LA\n`;
    const result = csvToText(Buffer.from(csv), "people.csv");

    expect(result).toContain("Columns: Name, Age, City");
    expect(result).toContain("Total records: 2");
    expect(result).toContain("Name: Alice");
    expect(result).toContain("Name: Bob");
  });

  it("groups rows by date when a date column is present", () => {
    const csv = [
      "Date,Glucose,Meal",
      "2024-01-01,95,Fasting",
      "2024-01-01,142,Post-Breakfast",
      "2024-01-02,88,Fasting",
    ].join("\n");

    const result = csvToText(Buffer.from(csv), "glucose.csv");

    // Should have day headers
    expect(result).toContain("Date: 2024-01-01");
    expect(result).toContain("Date: 2024-01-02");
    // Should include individual readings
    expect(result).toContain("Glucose: 95");
    expect(result).toContain("Glucose: 142");
    expect(result).toContain("Glucose: 88");
    // Should include stats for glucose (numeric column)
    expect(result).toContain("min/avg/max");
  });

  it("emits numeric stats correctly for date-grouped data", () => {
    const csv = [
      "Date,Value",
      "2024-01-01,100",
      "2024-01-01,200",
      "2024-01-01,150",
    ].join("\n");

    const result = csvToText(Buffer.from(csv), "test.csv");
    // min=100, avg=150, max=200
    expect(result).toContain("100.0/150.0/200.0");
  });

  it("handles CSVs with datetime timestamps by extracting date part", () => {
    const csv = [
      "Timestamp,BG",
      "2024-03-15T08:30:00,110",
      "2024-03-15T12:00:00,175",
      "2024-03-16T07:00:00,95",
    ].join("\n");

    const result = csvToText(Buffer.from(csv), "data.csv");
    expect(result).toContain("Date: 2024-03-15");
    expect(result).toContain("Date: 2024-03-16");
  });

  it("handles empty CSV gracefully", () => {
    const result = csvToText(Buffer.from("Name,Age\n"), "empty.csv");
    expect(result).toBe("");
  });

  it("handles malformed CSV by returning raw text", () => {
    // csv-parse will fail on severely malformed input; we fall back to raw text
    const badCsv = Buffer.from("not,a,\"valid\ncsv at all\0\0\0");
    // Should not throw
    const result = csvToText(badCsv, "bad.csv");
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// extractTextFromZip
// ---------------------------------------------------------------------------

describe("extractTextFromZip", () => {
  function makeZip(entries: Array<{ name: string; content: string }>): Buffer {
    const zip = new AdmZip();
    for (const { name, content } of entries) {
      zip.addFile(name, Buffer.from(content));
    }
    return zip.toBuffer();
  }

  it("extracts text from a ZIP containing two CSV files", async () => {
    const zip = makeZip([
      {
        name: "glucose.csv",
        content: "Date,Value\n2024-01-01,100\n2024-01-02,110\n",
      },
      {
        name: "insulin.csv",
        content: "Date,Units,Type\n2024-01-01,4,Rapid\n",
      },
    ]);

    const result = await extractTextFromZip(zip, "glooko-export.zip");

    expect(result).toContain("=== glucose.csv ===");
    expect(result).toContain("=== insulin.csv ===");
    expect(result).toContain("Date: 2024-01-01");
    expect(result).toContain("Units: 4");
  });

  it("extracts a mixed ZIP with CSV and TXT entries", async () => {
    const zip = makeZip([
      {
        name: "notes.txt",
        content: "Patient notes for January 2024.",
      },
      {
        name: "readings.csv",
        content: "Time,BG\n08:00,95\n12:00,140\n",
      },
    ]);

    const result = await extractTextFromZip(zip, "mixed.zip");

    expect(result).toContain("=== notes.txt ===");
    expect(result).toContain("Patient notes for January 2024.");
    expect(result).toContain("=== readings.csv ===");
    expect(result).toContain("BG");
  });

  it("skips binary files inside the ZIP", async () => {
    const zip = makeZip([
      { name: "photo.jpg", content: "\xFF\xD8\xFF\xE0" }, // fake JPEG header
      { name: "data.csv", content: "Col\nValue\n" },
    ]);

    const result = await extractTextFromZip(zip, "with-image.zip");

    expect(result).not.toContain("=== photo.jpg ===");
    expect(result).toContain("=== data.csv ===");
  });

  it("skips empty entries and still returns text from non-empty ones", async () => {
    const zip = makeZip([
      { name: "empty.csv", content: "" },
      { name: "valid.txt", content: "Hello from valid.txt" },
    ]);

    const result = await extractTextFromZip(zip, "test.zip");
    expect(result).toContain("=== valid.txt ===");
    expect(result).not.toContain("=== empty.csv ===");
  });

  it("throws when ZIP is empty of extractable text", async () => {
    const zip = makeZip([
      { name: "image.png", content: "\x89PNG" },
    ]);

    await expect(extractTextFromZip(zip, "empty.zip")).rejects.toThrow(
      /no extractable text/i,
    );
  });

  it("throws on an invalid (non-ZIP) buffer", async () => {
    const notAZip = Buffer.from("this is not a zip file at all");
    await expect(extractTextFromZip(notAZip, "fake.zip")).rejects.toThrow();
  });
});
