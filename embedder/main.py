import os
import tempfile
from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from faster_whisper import WhisperModel
import torch

app_title = os.environ.get("EMBEDDER_APP_TITLE", "Complexity Embedder")
app_version = os.environ.get("EMBEDDER_APP_VERSION", "1.0.0")
model_name = os.environ.get("EMBEDDER_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
whisper_model_name = os.environ.get("EMBEDDER_WHISPER_MODEL", "base")

app = FastAPI(title=app_title, version=app_version)

# Sentence Transformer for embeddings
embed_model = SentenceTransformer(model_name)

# Lazy-loaded Whisper model
whisper_model = None

def get_whisper_model():
    global whisper_model
    if whisper_model is None:
        print(f"Loading Faster-Whisper model: {whisper_model_name}...")
        # compute_type="int8" is best for CPU efficiency
        whisper_model = WhisperModel(whisper_model_name, device="cpu", compute_type="int8")
    return whisper_model


class EmbedRequest(BaseModel):
    texts: list[str]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/embed")
def embed(request: EmbedRequest) -> dict[str, list[list[float]]]:
    if not request.texts:
        return {"embeddings": []}

    vectors = embed_model.encode(
        request.texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    return {"embeddings": vectors.tolist()}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict[str, str]:
    model = get_whisper_model()
    
    # Save the uploaded file to a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1] or ".webm") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Transcribe the audio file
        segments, info = model.transcribe(tmp_path, beam_size=5)
        text = " ".join([segment.text for segment in segments]).strip()
        return {"text": text}
    finally:
        # Clean up the temporary file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
