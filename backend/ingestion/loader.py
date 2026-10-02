from pathlib import Path
import time
import duckdb

from backend.analytics.risk import analyze_account
from backend.database.queries import account_summary, database_stats, search_accounts, top_account_candidates

EXPECTED_COLUMNS = ["Transaction_ID","Sender_Account","Receiver_Account","Sender_IFSC","Receiver_IFSC","Amount","Timestamp","Payment_Mode","Narration","IP_Address","Device_Type"]


def ingest_csv(csv_path: str | Path, db_path: str | Path) -> dict:
    csv_path = Path(csv_path)
    db_path = Path(db_path)
    if not csv_path.exists():
        raise FileNotFoundError(csv_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    with duckdb.connect(str(db_path)) as con:
        con.execute("PRAGMA threads=4")
        source_columns = [d[0] for d in con.execute("SELECT * FROM read_csv_auto(?, header=true, sample_size=100)", [str(csv_path)]).description]
        missing = sorted(set(EXPECTED_COLUMNS) - set(source_columns))
        if missing:
            raise ValueError(f"Dataset is missing required columns: {missing}")
        for table in ("transactions", "account_summary", "dataset_metadata"):
            con.execute(f"DROP TABLE IF EXISTS {table}")
        for idx in ("idx_sender", "idx_receiver", "idx_timestamp", "idx_txn_id"):
            con.execute(f"DROP INDEX IF EXISTS {idx}")

        con.execute("""
            CREATE TABLE transactions AS
            SELECT
                CAST(Transaction_ID AS VARCHAR) AS transaction_id,
                LPAD(TRIM(CAST(Sender_Account AS VARCHAR)), 12, '0') AS sender_account,
                LPAD(TRIM(CAST(Receiver_Account AS VARCHAR)), 12, '0') AS receiver_account,
                UPPER(TRIM(CAST(Sender_IFSC AS VARCHAR))) AS sender_ifsc,
                UPPER(TRIM(CAST(Receiver_IFSC AS VARCHAR))) AS receiver_ifsc,
                CAST(Amount AS DOUBLE) AS amount,
                CAST(Timestamp AS TIMESTAMP) AS timestamp,
                UPPER(TRIM(CAST(Payment_Mode AS VARCHAR))) AS payment_mode,
                COALESCE(CAST(Narration AS VARCHAR), '') AS narration,
                TRIM(CAST(IP_Address AS VARCHAR)) AS ip_address,
                TRIM(CAST(Device_Type AS VARCHAR)) AS device_type
            FROM read_csv_auto(?, header=true, sample_size=-1, ignore_errors=false)
        """, [str(csv_path)])

        con.execute("CREATE INDEX idx_sender ON transactions(sender_account)")
        con.execute("CREATE INDEX idx_receiver ON transactions(receiver_account)")
        con.execute("CREATE INDEX idx_timestamp ON transactions(timestamp)")
        con.execute("CREATE INDEX idx_txn_id ON transactions(transaction_id)")
        con.execute("CREATE INDEX idx_sender_ts ON transactions(sender_account, timestamp)")
        con.execute("CREATE INDEX idx_receiver_ts ON transactions(receiver_account, timestamp)")
        con.execute("""
            CREATE TABLE account_summary AS
            WITH inflow AS (
                SELECT receiver_account AS account, SUM(amount) AS total_inflow, COUNT(*) AS inbound_txns, COUNT(DISTINCT sender_account) AS unique_senders
                FROM transactions GROUP BY receiver_account
            ), outflow AS (
                SELECT sender_account AS account, SUM(amount) AS total_outflow, COUNT(*) AS outbound_txns, COUNT(DISTINCT receiver_account) AS unique_receivers
                FROM transactions GROUP BY sender_account
            )
            SELECT COALESCE(i.account,o.account) AS account,
                   COALESCE(i.total_inflow,0) AS total_inflow,
                   COALESCE(o.total_outflow,0) AS total_outflow,
                   COALESCE(i.inbound_txns,0) AS inbound_txns,
                   COALESCE(o.outbound_txns,0) AS outbound_txns,
                   COALESCE(i.unique_senders,0) AS unique_senders,
                   COALESCE(o.unique_receivers,0) AS unique_receivers
            FROM inflow i FULL OUTER JOIN outflow o USING(account)
        """)
        con.execute("CREATE INDEX idx_summary_acc ON account_summary(account)")
        count = con.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        min_ts, max_ts = con.execute("SELECT MIN(timestamp), MAX(timestamp) FROM transactions").fetchone()
        con.execute("""CREATE TABLE dataset_metadata AS SELECT ? AS source_file, ?::BIGINT AS row_count, ?::TIMESTAMP AS min_timestamp, ?::TIMESTAMP AS max_timestamp, NOW() AS ingested_at""", [str(csv_path), count, min_ts, max_ts])
    analyze_account.cache_clear()
    account_summary.cache_clear()
    database_stats.cache_clear()
    search_accounts.cache_clear()
    top_account_candidates.cache_clear()
    elapsed = time.perf_counter() - started
    return {"rows": int(count), "elapsed_seconds": round(elapsed,3), "rows_per_second": round(count/elapsed,2) if elapsed else None, "min_timestamp": str(min_ts) if min_ts else None, "max_timestamp": str(max_ts) if max_ts else None, "db_path": str(db_path)}
