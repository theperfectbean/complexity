import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("file") as Blob;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const embedderUrl = process.env.EMBEDDER_URL || "http://embedder:8000";
    
    // Create a new FormData to send to the embedder service
    const embedderFormData = new FormData();
    embedderFormData.append("file", audioFile, "audio.webm");

    const response = await fetch(`${embedderUrl}/transcribe`, {
      method: "POST",
      body: embedderFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Embedder transcription error:", errorText);
      return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Transcription route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
