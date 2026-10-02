from functools import lru_cache
from typing import Any
from .db import get_connection


def _rows(sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    with get_connection(read_only=True) as con:
        cur = con.execute(sql, params or [])
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


@lru_cache(maxsize=256)
def database_stats() -> dict[str, Any]:
    with get_connection(read_only=True) as con:
        try:
            row = con.execute("SELECT row_count, min_timestamp, max_timestamp, source_file FROM dataset_metadata ORDER BY ingested_at DESC LIMIT 1").fetchone()
        except Exception:
            return {"loaded": False}
        if not row:
            return {"loaded": False}
        accounts = con.execute("SELECT COUNT(*) FROM account_summary").fetchone()[0]
        return {"loaded": True, "rows": int(row[0]), "min_timestamp": str(row[1]), "max_timestamp": str(row[2]), "source_file": row[3], "accounts": int(accounts)}


@lru_cache(maxsize=4096)
def account_summary(account: str) -> dict[str, Any] | None:
    with get_connection(read_only=True) as con:
        row = con.execute("SELECT * FROM account_summary WHERE account = ?", [account]).fetchone()
        if not row:
            return None
        cols = [d[0] for d in con.description]
        return dict(zip(cols, row))


def account_transactions(account: str, limit: int = 500) -> list[dict[str, Any]]:
    return _rows("""SELECT * FROM transactions WHERE sender_account = ? OR receiver_account = ? ORDER BY timestamp LIMIT ?""", [account, account, limit])


def timeline(account: str, limit: int = 1000) -> list[dict[str, Any]]:
    return _rows("""SELECT transaction_id, sender_account, receiver_account, amount, timestamp, payment_mode, sender_ifsc, receiver_ifsc FROM transactions WHERE sender_account = ? OR receiver_account = ? ORDER BY timestamp LIMIT ?""", [account, account, limit])


@lru_cache(maxsize=256)
def search_accounts(query: str, limit: int = 10) -> list[dict[str, Any]]:
    q = query.strip()
    if not q:
        return []
    return _rows(
        """SELECT account,total_inflow,total_outflow,inbound_txns,outbound_txns,unique_senders,unique_receivers
           FROM account_summary
           WHERE account LIKE ?
           ORDER BY total_inflow DESC
           LIMIT ?""",
        [f"%{q}%", limit],
    )


@lru_cache(maxsize=64)
def top_account_candidates(limit: int = 50) -> list[dict[str, Any]]:
    return _rows(
        """SELECT account,total_inflow,total_outflow,inbound_txns,outbound_txns,unique_senders,unique_receivers
           FROM account_summary
           ORDER BY (unique_senders * 3 + unique_receivers * 3 + outbound_txns) DESC
           LIMIT ?""",
        [limit],
    )
