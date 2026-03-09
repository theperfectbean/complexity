from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI(title="Complexity Embedder", version="1.0.0")
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")


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
