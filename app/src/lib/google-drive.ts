import { google } from "googleapis";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "@/lib/env";

export class GoogleDriveService {
  private static async getAccessToken(userId: string) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")))
      .limit(1);

    if (!account || !account.access_token) {
      throw new Error("Google account not linked or access token missing");
    }

    // Check if token is expired and refresh if necessary
    // Note: NextAuth handles basic refresh, but for background workers we might need manual refresh
    // For now, we assume the token is valid or NextAuth will refresh it on next login.
    // In a real production app, we'd use the refresh_token here.
    return account.access_token;
  }

  static async downloadFile(userId: string, fileId: string): Promise<{ data: Buffer; filename: string; mimeType: string }> {
    const accessToken = await this.getAccessToken(userId);
    
    const auth = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: "v3", auth });

    const metadata = await drive.files.get({
      fileId,
      fields: "name, mimeType, size",
    });

    const filename = metadata.data.name || "untitled";
    const mimeType = metadata.data.mimeType || "application/octet-stream";

    let data: Buffer;

    // Handle Google Docs/Sheets/Slides by exporting them
    if (mimeType.startsWith("application/vnd.google-apps.")) {
      let exportMimeType = "text/plain";
      if (mimeType.includes("document")) exportMimeType = "application/pdf";
      else if (mimeType.includes("spreadsheet")) exportMimeType = "application/pdf";
      else if (mimeType.includes("presentation")) exportMimeType = "application/pdf";

      const response = await drive.files.export(
        { fileId, mimeType: exportMimeType },
        { responseType: "arraybuffer" }
      );
      data = Buffer.from(response.data as ArrayBuffer);
      
      // Update metadata for the exported format
      return { 
        data, 
        filename: filename + (exportMimeType === "application/pdf" ? ".pdf" : ".txt"), 
        mimeType: exportMimeType 
      };
    } else {
      // Direct download for binary files
      const response = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" }
      );
      data = Buffer.from(response.data as ArrayBuffer);
      return { data, filename, mimeType };
    }
  }
}
