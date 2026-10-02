from __future__ import annotations
from decimal import Decimal
from typing import Any


def build_evidence(trace: dict[str,Any])->dict[str,Any]:
    edges=trace.get("edges",[])
    direct=sum(Decimal(str(e["amount"])) for e in edges if e.get("sender_account")==trace["victim_account"])
    layers=[{
        "account": n.get("account"),
        "hop": n.get("hop"),
        "layer": n.get("layer"),
        "risk_score": n.get("risk_score", 0),
        "formula": n.get("formula", ""),
        "breakdown": n.get("breakdown", []),
        "signals": n.get("signals", [])
    } for n in sorted(trace.get("nodes",[]), key=lambda n:(n.get("hop",0),n.get("account",""))) if n.get("hop",0)>0]
    return {"victim_account":trace["victim_account"],"total_direct_outflow_identified":float(direct),"layers":layers,"transactions":edges,"source":"verified local transaction database"}
