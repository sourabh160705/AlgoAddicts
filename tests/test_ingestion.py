from pathlib import Path
from backend.ingestion.loader import ingest_csv

def test_ingest_fixture(tmp_path):
    src=Path(__file__).parents[1]/'data'/'fixtures'/'test_transactions.csv'
    r=ingest_csv(src,tmp_path/'test.duckdb')
    assert r['rows']==4
