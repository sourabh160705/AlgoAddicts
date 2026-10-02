from __future__ import annotations
from functools import lru_cache
from typing import Any
from backend.database.db import get_connection

WEIGHTS = {"velocity": 35, "fan_in": 20, "fan_out": 20, "terminal": 15, "network_device": 10}
SUSPICIOUS_TERMS = ("crypto", "p2p", "wallet", "cashout", "cash-out", "gateway", "offshore", "atm")
SUSPICIOUS_DEVICES = ("web_emulator", "linux_script")
SUSPICIOUS_IP_PREFIXES = ("185.", "194.")


@lru_cache(maxsize=2048)
def analyze_account(account: str) -> dict[str, Any]:
    """Apply transparent heuristic signals to a single account.

    This is a deterministic screening score, not a legal conclusion or a claim
    that the account is actually controlled by a criminal organization.

    Results are cached because graph tracing and mule-ranking repeatedly analyze
    the same accounts during a single investigation session.
    """
    with get_connection(read_only=True) as con:
        summary_row = con.execute("SELECT * FROM account_summary WHERE account = ?", [account]).fetchone()
        if not summary_row:
            return {"account": account, "risk_score": 0, "signals": [], "layer": 0}
        summary_cols = [d[0] for d in con.description]
        stats = dict(zip(summary_cols, summary_row))

        velocity_row = con.execute(
            """
            WITH inbound AS (
                SELECT transaction_id, amount, timestamp
                FROM transactions
                WHERE receiver_account = ?
            ), dispersed AS (
                SELECT i.transaction_id,
                       i.amount AS inbound_amount,
                       COALESCE(SUM(o.amount), 0) AS dispersed_amount
                FROM inbound i
                LEFT JOIN transactions o
                  ON o.sender_account = ?
                 AND o.timestamp >= i.timestamp + INTERVAL '3 minutes'
                 AND o.timestamp <= i.timestamp + INTERVAL '15 minutes'
                GROUP BY i.transaction_id, i.amount
            )
            SELECT COALESCE(MAX(CASE WHEN inbound_amount > 0 THEN dispersed_amount / inbound_amount ELSE 0 END), 0)
            FROM dispersed
            """,
            [account, account],
        ).fetchone()[0]

        terminal_counts = con.execute(
            """
            SELECT
              SUM(CASE WHEN LOWER(COALESCE(narration,'')) LIKE '%crypto%'
                    OR LOWER(COALESCE(narration,'')) LIKE '%p2p%'
                    OR LOWER(COALESCE(narration,'')) LIKE '%wallet%'
                    OR LOWER(COALESCE(narration,'')) LIKE '%cashout%'
                    OR LOWER(COALESCE(narration,'')) LIKE '%cash-out%'
                    OR LOWER(COALESCE(narration,'')) LIKE '%gateway%'
                    OR LOWER(COALESCE(narration,'')) LIKE '%offshore%'
                    OR LOWER(COALESCE(narration,'')) LIKE '%atm%'
                  THEN 1 ELSE 0 END) AS suspicious_narration,
              SUM(CASE WHEN STARTS_WITH(COALESCE(ip_address,''), '185.')
                    OR STARTS_WITH(COALESCE(ip_address,''), '194.') THEN 1 ELSE 0 END) AS suspicious_ip,
              SUM(CASE WHEN LOWER(COALESCE(device_type,'')) IN ('web_emulator','linux_script') THEN 1 ELSE 0 END) AS suspicious_device
            FROM transactions
            WHERE sender_account = ?
            """,
            [account],
        ).fetchone()

    velocity_ratio = float(velocity_row or 0)
    suspicious_narration, suspicious_ip, suspicious_device = [int(x or 0) for x in terminal_counts]
    fan_in = int(stats.get("unique_senders") or 0)
    fan_out = int(stats.get("unique_receivers") or 0)
    velocity_hit = velocity_ratio >= 0.90
    fan_in_hit = fan_in >= 4
    fan_out_hit = 3 <= fan_out <= 7
    terminal_hit = bool(suspicious_narration or suspicious_ip or suspicious_device)
    network_device_hit = bool(suspicious_ip or suspicious_device)

    score = sum([
        WEIGHTS["velocity"] if velocity_hit else 0,
        WEIGHTS["fan_in"] if fan_in_hit else 0,
        WEIGHTS["fan_out"] if fan_out_hit else 0,
        WEIGHTS["terminal"] if terminal_hit else 0,
        WEIGHTS["network_device"] if network_device_hit else 0,
    ])

    signals: list[dict[str, Any]] = []
    if velocity_hit:
        signals.append({"name": "high_velocity", "detail": f"maximum three-to-fifteen-minute dispersion ratio {min(velocity_ratio, 1.0):.2f}"})
    if fan_in_hit:
        signals.append({"name": "fan_in", "detail": f"{fan_in} distinct senders"})
    if fan_out_hit:
        signals.append({"name": "fan_out", "detail": f"{fan_out} distinct receivers"})
    if suspicious_narration:
        signals.append({"name": "suspicious_narration", "detail": f"{suspicious_narration} outgoing transaction(s) matched configured narration markers"})
    if suspicious_ip:
        signals.append({"name": "foreign_proxy_ip_pattern", "detail": f"{suspicious_ip} outgoing transaction(s) matched configured IP prefixes"})
    if suspicious_device:
        signals.append({"name": "suspicious_device", "detail": f"{suspicious_device} outgoing transaction(s) used configured emulator/script device labels"})

    layer = 3 if terminal_hit else 2 if fan_out_hit else 1 if fan_in_hit else 0
    return {
        "account": account,
        "risk_score": int(min(score, 100)),
        "layer": layer,
        "signals": signals,
        "stats": stats,
        "method": "deterministic heuristic screening; configurable weights",
    }
