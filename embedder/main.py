import os
import tempfile
from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, CrossEncoder
from faster_whisper import WhisperModel
import torch
import pytesseract
from pdf2image import convert_from_path
from PIL import Image

app_title = os.environ.get("EMBEDDER_APP_TITLE", "Complexity Embedder")
app_version = os.environ.get("EMBEDDER_APP_VERSION", "1.0.0")
model_name = os.environ.get("EMBEDDER_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
rerank_model_name = os.environ.get("EMBEDDER_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
whisper_model_name = os.environ.get("EMBEDDER_WHISPER_MODEL", "base")

app = FastAPI(title=app_title, version=app_version)

# Sentence Transformer for embeddings
embed_model = SentenceTransformer(model_name)

# CrossEncoder for reranking
print(f"Loading Cross-Encoder model: {rerank_model_name}...")
rerank_model = CrossEncoder(rerank_model_name)

# Whisper model for transcription
print(f"Loading Faster-Whisper model: {whisper_model_name}...")
whisper_model = WhisperModel(whisper_model_name, device="cpu", compute_type="int8")

class EmbedRequest(BaseModel):
    texts: list[str]


class RerankRequest(BaseModel):
    query: str
    documents: list[str]
    top_k: int = 10


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


@app.post("/rerank")
def rerank(request: RerankRequest):
    if not request.documents:
        return {"results": []}
    
    # CrossEncoder.predict takes a list of [query, doc] pairs
    pairs = [[request.query, doc] for doc in request.documents]
    scores = rerank_model.predict(pairs)
    
    # Combine docs with scores and sort
    results = []
    for i, score in enumerate(scores):
        results.append({
            "index": i,
            "score": float(score)
        })
    
    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    
    return {"results": results[:request.top_k]}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)) -> dict[str, str]:
    # Save the uploaded file to a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Convert PDF to images
        # 300 DPI is usually good for OCR
        images = convert_from_path(tmp_path, dpi=300)
        
        full_text = []
        for i, image in enumerate(images):
            # Perform OCR on each page
            text = pytesseract.image_to_string(image)
            full_text.append(f"--- Page {i+1} ---\n{text}")
            
        return {"text": "\n\n".join(full_text).strip()}
    except Exception as e:
        return {"text": f"OCR Error: {str(e)}"}
    finally:
        # Clean up the temporary file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict[str, str]:
    # Save the uploaded file to a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1] or ".webm") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Transcribe the audio file
        segments, info = whisper_model.transcribe(tmp_path, beam_size=5)
        text = " ".join([segment.text for segment in segments]).strip()
        return {"text": text}
    finally:
        # Clean up the temporary file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
