from pathlib import Path
import os
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "backend" / ".env")

DB_PATH = Path(os.getenv("ABHEDYA_DB_PATH", ROOT / "data" / "processed" / "abhedya.duckdb"))
REPORTS_DIR = Path(os.getenv("ABHEDYA_REPORTS_DIR", ROOT / "reports"))
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "")
MAX_GRAPH_NODES = int(os.getenv("MAX_GRAPH_NODES", "600"))
MAX_GRAPH_EDGES = int(os.getenv("MAX_GRAPH_EDGES", "1800"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
