import os
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app_title = os.environ.get("EMBEDDER_APP_TITLE", "Complexity Embedder")
app_version = os.environ.get("EMBEDDER_APP_VERSION", "1.0.0")
model_name = os.environ.get("EMBEDDER_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")

app = FastAPI(title=app_title, version=app_version)
model = SentenceTransformer(model_name)


class EmbedRequest(BaseModel):
    texts: list[str]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/embed")
def embed(request: EmbedRequest) -> dict[str, list[list[float]]]:
    if not request.texts:
        return {"embeddings": []}

    vectors = model.encode(
        request.texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    return {"embeddings": vectors.tolist()}
