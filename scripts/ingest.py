import sys, argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT))
from backend.config import DB_PATH
from backend.ingestion.loader import ingest_csv
p=argparse.ArgumentParser(); p.add_argument('--csv',required=True); a=p.parse_args(); print(ingest_csv(a.csv,DB_PATH))
