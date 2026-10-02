from __future__ import annotations
from functools import lru_cache
from typing import Any
import bisect
from datetime import timedelta
import duckdb
from backend.database.db import get_connection

WEIGHTS = {
    "velocity": 35,
    "fan_in": 20,
    "fan_out": 20,
    "terminal": 15,
    "network_device": 10
}
SUSPICIOUS_TERMS = ("crypto", "p2p", "wallet", "cashout", "cash-out", "gateway", "offshore", "atm")
SUSPICIOUS_DEVICES = ("web_emulator", "linux_script")
SUSPICIOUS_IP_PREFIXES = ("185.", "194.")

_ACCOUNT_RISK_CACHE: dict[str, dict[str, Any]] = {}

def clear_risk_cache():
    _ACCOUNT_RISK_CACHE.clear()

def analyze_accounts_batch(accounts: list[str]) -> dict[str, dict[str, Any]]:
    if not accounts:
        return {}
    
    missing_accounts = [acc for acc in accounts if acc not in _ACCOUNT_RISK_CACHE]
    
    if not missing_accounts:
        return {acc: _ACCOUNT_RISK_CACHE[acc] for acc in accounts if acc in _ACCOUNT_RISK_CACHE}
    
    ph = ",".join("?" for _ in missing_accounts)

    with get_connection(read_only=True) as con:
        # 1. Fetch account summaries in one fast indexed query
        cur = con.execute(f"SELECT * FROM account_summary WHERE account IN ({ph})", missing_accounts)
        cols = [d[0] for d in cur.description]
        stats_map = {row[cols.index("account")]: dict(zip(cols, row)) for row in cur.fetchall()}

        # 2. Fetch all inbound transactions in one fast indexed query
        inbound_cur = con.execute(
            f"SELECT receiver_account, amount, timestamp FROM transactions WHERE receiver_account IN ({ph}) ORDER BY timestamp ASC",
            missing_accounts
        ).fetchall()
        inbound_map: dict[str, list] = {}
        for acc, amt, ts in inbound_cur:
            inbound_map.setdefault(acc, []).append((amt, ts))

        # 3. Fetch all outbound transactions in one fast indexed query
        outbound_cur = con.execute(
            f"SELECT sender_account, amount, timestamp, narration, ip_address, device_type FROM transactions WHERE sender_account IN ({ph}) ORDER BY timestamp ASC",
            missing_accounts
        ).fetchall()
        outbound_map: dict[str, list] = {}
        for acc, amt, ts, narr, ip, dev in outbound_cur:
            outbound_map.setdefault(acc, []).append((amt, ts, narr, ip, dev))

    for account in missing_accounts:
        stats = stats_map.get(account, {})
        inbound = inbound_map.get(account, [])
        outbound = outbound_map.get(account, [])

        max_dispersion_ratio = 0.0
        if inbound and outbound:
            out_ts = [o[1] for o in outbound]
            prefix = [0.0]
            for o in outbound:
                prefix.append(prefix[-1] + float(o[0]))
            
            for in_amt, in_ts in inbound:
                if in_amt <= 0:
                    continue
                t_start = in_ts + timedelta(minutes=3)
                t_end = in_ts + timedelta(minutes=15)
                idx_start = bisect.bisect_left(out_ts, t_start)
                idx_end = bisect.bisect_right(out_ts, t_end)
                dispersed = prefix[idx_end] - prefix[idx_start]
                ratio = dispersed / float(in_amt)
                if ratio > max_dispersion_ratio:
                    max_dispersion_ratio = ratio

        suspicious_narration = 0
        suspicious_ip = 0
        suspicious_device = 0

        for _, _, narr, ip, dev in outbound:
            narr_lower = (narr or "").lower()
            if any(term in narr_lower for term in SUSPICIOUS_TERMS):
                suspicious_narration += 1
            if ip and (ip.startswith("185.") or ip.startswith("194.")):
                suspicious_ip += 1
            if dev and dev.lower() in SUSPICIOUS_DEVICES:
                suspicious_device += 1

        velocity_ratio = float(max_dispersion_ratio)
        fan_in = int(stats.get("unique_senders") or 0)
        fan_out = int(stats.get("unique_receivers") or 0)
        
        velocity_hit = velocity_ratio >= 0.90
        fan_in_hit = fan_in >= 4
        fan_out_hit = 3 <= fan_out <= 7
        terminal_hit = bool(suspicious_narration or suspicious_ip or suspicious_device)
        network_device_hit = bool(suspicious_ip or suspicious_device)

        # Explicit points breakdown calculation
        velocity_pts = WEIGHTS["velocity"] if velocity_hit else 0
        fan_in_pts = WEIGHTS["fan_in"] if fan_in_hit else 0
        fan_out_pts = WEIGHTS["fan_out"] if fan_out_hit else 0
        terminal_pts = WEIGHTS["terminal"] if terminal_hit else 0
        device_pts = WEIGHTS["network_device"] if network_device_hit else 0

        score = velocity_pts + fan_in_pts + fan_out_pts + terminal_pts + device_pts

        breakdown = [
            {
                "factor": "High-Velocity Pass-Through",
                "points": velocity_pts,
                "max_points": WEIGHTS["velocity"],
                "hit": velocity_hit,
                "detail": f"{min(velocity_ratio * 100, 100.0):.1f}% of funds dispersed within 3-15 min window (threshold >= 90%)" if velocity_hit else f"Max 3-15m dispersion ratio was {velocity_ratio*100:.1f}% (< 90% threshold)"
            },
            {
                "factor": "Layer 1 Fan-In Aggregation",
                "points": fan_in_pts,
                "max_points": WEIGHTS["fan_in"],
                "hit": fan_in_hit,
                "detail": f"{fan_in} distinct senders detected (smurfing collector threshold >= 4)" if fan_in_hit else f"{fan_in} senders (< 4 threshold)"
            },
            {
                "factor": "Layer 2 Fan-Out Rapid Dispersal",
                "points": fan_out_pts,
                "max_points": WEIGHTS["fan_out"],
                "hit": fan_out_hit,
                "detail": f"{fan_out} distinct receivers split dispersal (distributor pattern 3-7)" if fan_out_hit else f"{fan_out} receivers (outside 3-7 split pattern)"
            },
            {
                "factor": "Layer 3 Terminal Narration Markers",
                "points": terminal_pts,
                "max_points": WEIGHTS["terminal"],
                "hit": terminal_hit,
                "detail": f"{suspicious_narration} transaction(s) matched crypto/P2P/wallet/cashout markers" if suspicious_narration else ("Flagged via offshore network signals" if terminal_hit else "No suspicious terminal keywords in narrations")
            },
            {
                "factor": "Suspicious Network / Device Fingerprint",
                "points": device_pts,
                "max_points": WEIGHTS["network_device"],
                "hit": network_device_hit,
                "detail": f"{suspicious_ip} foreign proxy IP(s) [185.x / 194.x], {suspicious_device} emulator/script device(s)" if network_device_hit else "Clean standard device and domestic IP range"
            }
        ]

        factor_short_names = {
            "High-Velocity Pass-Through": "Velocity",
            "Layer 1 Fan-In Aggregation": "Fan-In",
            "Layer 2 Fan-Out Rapid Dispersal": "Fan-Out",
            "Layer 3 Terminal Narration Markers": "Terminal",
            "Suspicious Network / Device Fingerprint": "Device"
        }
        active_formula_parts = [f"{b['points']} ({factor_short_names.get(b['factor'], b['factor'])})" for b in breakdown if b['points'] > 0]
        formula_str = " + ".join(active_formula_parts) + f" = {score}/100" if active_formula_parts else "0/100 (No suspicious risk signals)"

        signals: list[dict[str, Any]] = []
        if velocity_hit:
            signals.append({"name": "high_velocity", "detail": f"+{velocity_pts} pts: {min(velocity_ratio, 1.0):.2f} dispersion ratio in 3-15m"})
        if fan_in_hit:
            signals.append({"name": "fan_in", "detail": f"+{fan_in_pts} pts: {fan_in} distinct senders"})
        if fan_out_hit:
            signals.append({"name": "fan_out", "detail": f"+{fan_out_pts} pts: {fan_out} distinct receivers"})
        if suspicious_narration:
            signals.append({"name": "suspicious_narration", "detail": f"+{terminal_pts} pts: {suspicious_narration} crypto/p2p/wallet markers"})
        if suspicious_ip:
            signals.append({"name": "foreign_proxy_ip_pattern", "detail": f"+{device_pts} pts: {suspicious_ip} foreign proxy IPs"})
        if suspicious_device:
            signals.append({"name": "suspicious_device", "detail": f"+{device_pts} pts: {suspicious_device} emulator/script devices"})

        layer = 3 if terminal_hit else 2 if fan_out_hit else 1 if fan_in_hit else 0
        item = {
            "account": account,
            "risk_score": int(min(score, 100)),
            "layer": layer,
            "breakdown": breakdown,
            "formula": formula_str,
            "signals": signals,
            "stats": stats,
            "method": "Explainable Additive Rule Weights (35 Velocity + 20 Fan-In + 20 Fan-Out + 15 Terminal + 10 Device)",
        }
        _ACCOUNT_RISK_CACHE[account] = item

    return {acc: _ACCOUNT_RISK_CACHE[acc] for acc in accounts if acc in _ACCOUNT_RISK_CACHE}

@lru_cache(maxsize=8192)
def analyze_account(account: str) -> dict[str, Any]:
    res = analyze_accounts_batch([account])
    return res.get(account, {
        "account": account,
        "risk_score": 0,
        "layer": 0,
        "breakdown": [],
        "formula": "0/100",
        "signals": [],
        "stats": {}
    })
