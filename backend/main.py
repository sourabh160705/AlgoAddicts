from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from backend.api.routes import router

from contextlib import asynccontextmanager
from backend.config import DB_PATH, ROOT
from backend.ingestion.loader import ingest_csv

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize database on cloud deploy if missing
    csv_fixture = ROOT / "data" / "fixtures" / "Transactions.csv"
    if not DB_PATH.exists() and csv_fixture.exists():
        print(f"[Startup] Initializing DuckDB from {csv_fixture}...")
        try:
            ingest_csv(csv_fixture, DB_PATH)
            print("[Startup] Database initialization complete!")
        except Exception as e:
            print(f"[Startup] Database auto-ingest warning: {e}")
    yield

app = FastAPI(title="Abhedya-Chakra API", version="1.0.0", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(router)

@app.get("/")
def root():
    return {"name": "Abhedya-Chakra", "status": "online"}
