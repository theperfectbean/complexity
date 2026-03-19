import os
import tempfile
from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, CrossEncoder
from faster_whisper import WhisperModel
import torch

app_title = os.environ.get("EMBEDDER_APP_TITLE", "Complexity Embedder")
app_version = os.environ.get("EMBEDDER_APP_VERSION", "1.0.0")
model_name = os.environ.get("EMBEDDER_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
rerank_model_name = os.environ.get("EMBEDDER_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
whisper_model_name = os.environ.get("EMBEDDER_WHISPER_MODEL", "base")

app = FastAPI(title=app_title, version=app_version)

# Sentence Transformer for embeddings
embed_model = SentenceTransformer(model_name)

# Lazy-loaded CrossEncoder
rerank_model = None

# Lazy-loaded Whisper model
whisper_model = None

def get_rerank_model():
    global rerank_model
    if rerank_model is None:
        print(f"Loading Cross-Encoder model: {rerank_model_name}...")
        rerank_model = CrossEncoder(rerank_model_name)
    return rerank_model

def get_whisper_model():
    global whisper_model
    if whisper_model is None:
        print(f"Loading Faster-Whisper model: {whisper_model_name}...")
        # compute_type="int8" is best for CPU efficiency
        whisper_model = WhisperModel(whisper_model_name, device="cpu", compute_type="int8")
    return whisper_model


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
    
    model = get_rerank_model()
    
    # CrossEncoder.predict takes a list of [query, doc] pairs
    pairs = [[request.query, doc] for doc in request.documents]
    scores = model.predict(pairs)
    
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
