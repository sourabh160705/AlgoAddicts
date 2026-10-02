import os
from pathlib import Path
import duckdb
from backend.config import DB_PATH

def get_connection(read_only: bool = False) -> duckdb.DuckDBPyConnection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB_PATH), read_only=False)
    # Optimize DuckDB engine parameters for low latency
    num_threads = os.cpu_count() or 4
    con.execute(f"PRAGMA threads={num_threads}")
    con.execute("PRAGMA preserve_insertion_order=false")
    return con
