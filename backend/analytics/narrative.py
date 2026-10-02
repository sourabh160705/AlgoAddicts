from __future__ import annotations
from datetime import datetime
from typing import Any

def generate_case_narrative(trace_result: dict[str, Any], evidence: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Generates an AI-powered natural-language executive summary & forensic case narrative
    designed for Investigating Officers (I.O.) and court-ready Section 172 Case Diaries.
    """
    victim = trace_result.get("victim_account") or trace_result.get("seed_account") or "UNKNOWN"
    nodes = trace_result.get("nodes", [])
    edges = trace_result.get("edges", [])
    
    # Calculate victim outflow (defrauded amount)
    victim_outflow = sum(
        float(e.get("amount", 0)) for e in edges if e.get("sender_account") == victim
    )
    
    # Sort edges chronologically
    sorted_edges = sorted(
        edges,
        key=lambda e: str(e.get("timestamp", "")) if e.get("timestamp") else ""
    )
    
    first_tx_time = sorted_edges[0].get("timestamp") if sorted_edges else "Incident Timestamp"
    last_tx_time = sorted_edges[-1].get("timestamp") if sorted_edges else None
    
    # Calculate velocity & dispersion duration
    duration_str = "Under 15 minutes"
    time_gap_seconds = 0
    if sorted_edges and len(sorted_edges) > 1 and first_tx_time and last_tx_time:
        try:
            t1 = datetime.fromisoformat(str(first_tx_time).replace("Z", "+00:00"))
            t2 = datetime.fromisoformat(str(last_tx_time).replace("Z", "+00:00"))
            diff = (t2 - t1).total_seconds()
            time_gap_seconds = int(diff)
            if diff < 60:
                duration_str = f"{int(diff)} seconds"
            elif diff < 3600:
                duration_str = f"{int(diff // 60)} minutes {int(diff % 60)} seconds"
            elif diff < 86400:
                duration_str = f"{diff / 3600:.1f} hours"
            else:
                duration_str = f"{diff / 86400:.1f} days"
        except Exception:
            pass

    # Break down accounts by layer
    l1_nodes = [n for n in nodes if n.get("hop", 0) == 1 or n.get("layer") == 1]
    l2_nodes = [n for n in nodes if n.get("hop", 0) == 2 or n.get("layer") == 2]
    l3_nodes = [n for n in nodes if n.get("hop", 0) >= 3 or n.get("layer") == 3 or n.get("stats", {}).get("is_terminal")]
    
    # Terminal cash-outs amount
    terminal_cashout = sum(
        float(n.get("stats", {}).get("total_outflow", 0)) for n in l3_nodes if n.get("stats", {}).get("is_terminal")
    )
    if terminal_cashout == 0 and victim_outflow > 0:
        terminal_cashout = victim_outflow * 0.85 # Estimated dissipated cash-out

    # Primary suspect mule (highest risk score)
    mules_sorted = sorted(
        [n for n in nodes if n.get("account") != victim and n.get("hop", 0) > 0],
        key=lambda n: (n.get("risk_score", 0), n.get("stats", {}).get("total_inflow", 0)),
        reverse=True
    )
    top_mule = mules_sorted[0] if mules_sorted else None
    
    def fmt_inr(val: float) -> str:
        return f"₹{val:,.2f}"

    # Build Case Brief Paragraphs
    paragraphs = []
    
    # 1. Incident initiation
    p1 = (
        f"On {first_tx_time}, victim account `{victim}` reported an unauthorized fraudulent transaction "
        f"of {fmt_inr(victim_outflow)}. Forensic BFS graph traversal detected the money trail propagating across "
        f"{len(nodes) - 1} downstream mule accounts across a {len(set(n.get('hop', 0) for n in nodes)) - 1}-hop topology."
    )
    paragraphs.append(p1)
    
    # 2. Layer-1 & Layer-2 dispersion behavior
    if len(l1_nodes) > 1:
        p2 = (
            f"At Layer 1, illicit funds were partitioned across {len(l1_nodes)} primary receiver mule(s) "
            f"within {duration_str}. The funds were subsequently funneled through {len(l2_nodes)} Layer-2 intermediary "
            f"distributor nodes, exhibiting coordinated syndication and smurfing characteristics."
        )
    else:
        p2 = (
            f"The primary illicit inflow was immediately absorbed by Layer-1 mule `{l1_nodes[0].get('account') if l1_nodes else 'target'}` "
            f"and routed onwards to intermediate distribution accounts with rapid pass-through velocity ({duration_str})."
        )
    paragraphs.append(p2)
    
    # 3. Terminal cash-out & Primary Suspect identification
    if top_mule:
        p3 = (
            f"The primary syndicate coordinator is identified as Account `{top_mule.get('account')}` "
            f"with an Explainable Mule Risk Index of {top_mule.get('risk_score')}/100 ({top_mule.get('formula', '35 Velocity + 20 Fan-In + 20 Fan-Out + 15 Terminal + 10 Device')}). "
            f"Approximately {fmt_inr(terminal_cashout)} was converted to cash/merchant settlements at terminal Layer 3 endpoints."
        )
        paragraphs.append(p3)

    full_narrative = "\n\n".join(paragraphs)

    # Key Red Flags
    red_flags = []
    if time_gap_seconds < 1800 and time_gap_seconds > 0:
        red_flags.append(f"⚡ Ultra-High Velocity Dispersion: Full fund cycle completed in {duration_str}")
    else:
        red_flags.append(f"⚡ Rapid Pass-Through Flow: Multiple inter-bank hops recorded across {duration_str}")
        
    if len(l1_nodes) >= 2:
        red_flags.append(f"🔀 Layer-1 Fan-Out Smurfing: Funds split across {len(l1_nodes)} parallel mule accounts")
        
    if top_mule and top_mule.get("risk_score", 0) >= 50:
        red_flags.append(f"🚨 High Risk Target: `{top_mule.get('account')}` assigned Risk Index {top_mule.get('risk_score')}/100")
        
    if l3_nodes:
        red_flags.append(f"🏧 Terminal Cash-Out Detected: {len(l3_nodes)} endpoint(s) marked for cash withdrawal")

    # Statutory recommendations for I.O.
    recommendations = [
        {
            "statute": "Section 91 CrPC / Sec 94 BNSS",
            "action": "Immediate Account Debit Freeze Requisition",
            "target": top_mule.get("account") if top_mule else "Identified Mule Accounts",
            "urgency": "CRITICAL - Golden Hour Requisition"
        },
        {
            "statute": "Section 172 CrPC / Sec 192 BNSS",
            "action": "Case Diary Evidence Hash Logging",
            "target": f"Annexure #{trace_result.get('investigation_id', 'EVD-99')}",
            "urgency": "STANDARD - Judicial Admissibility"
        },
        {
            "statute": "Section 102 CrPC / Sec 106 BNSS",
            "action": "Seizure of Terminal Merchant Device & ATM Logs",
            "target": "Terminal Gateway Settlement Points",
            "urgency": "HIGH - Physical Device Recovery"
        }
    ]

    return {
        "victim_account": victim,
        "narrative_text": full_narrative,
        "executive_summary": full_narrative,
        "duration_str": duration_str,
        "total_defrauded": victim_outflow,
        "total_terminal_cashout": terminal_cashout,
        "top_mule_account": top_mule.get("account") if top_mule else None,
        "top_mule_risk": top_mule.get("risk_score") if top_mule else 0,
        "hop_count": len(set(n.get('hop', 0) for n in nodes)) - 1,
        "total_nodes": len(nodes),
        "total_edges": len(edges),
        "red_flags": red_flags,
        "recommendations": recommendations,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    }
