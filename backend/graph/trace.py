from __future__ import annotations
from typing import Any
from backend.analytics.risk import analyze_account
from backend.config import MAX_GRAPH_EDGES, MAX_GRAPH_NODES
from backend.database.db import get_connection


def _edges(frontier: list[str], limit: int) -> list[dict[str,Any]]:
    if not frontier: return []
    ph=",".join("?" for _ in frontier)
    with get_connection(read_only=True) as con:
        cur=con.execute(f"""SELECT transaction_id,sender_account,receiver_account,amount,timestamp,payment_mode,sender_ifsc,receiver_ifsc FROM transactions WHERE sender_account IN ({ph}) ORDER BY timestamp LIMIT ?""", frontier+[limit])
        cols=[d[0] for d in cur.description]
        return [dict(zip(cols,row)) for row in cur.fetchall()]


def trace_money_flow(victim_account: str, max_hops: int=4)->dict[str,Any]:
    max_hops=min(max(1,max_hops),4)
    nodes={victim_account:{"id":victim_account,"account":victim_account,"hop":0,"layer":0}}
    edges=[]; visited={victim_account}; frontier=[victim_account]
    for hop in range(1,max_hops+1):
        if not frontier or len(nodes)>=MAX_GRAPH_NODES or len(edges)>=MAX_GRAPH_EDGES: break
        rows=_edges(frontier,MAX_GRAPH_EDGES-len(edges)); next_frontier=[]
        for e in rows:
            if e["sender_account"] not in visited: continue
            edges.append(e); receiver=e["receiver_account"]
            if receiver not in nodes:
                nodes[receiver]={"id":receiver,"account":receiver,"hop":hop}
                visited.add(receiver); next_frontier.append(receiver)
            if len(nodes)>=MAX_GRAPH_NODES or len(edges)>=MAX_GRAPH_EDGES: break
        frontier=next_frontier
    for a,n in nodes.items():
        r=analyze_account(a)
        n.update({"risk_score":r.get("risk_score",0),"layer":r.get("layer",n["hop"]),"signals":r.get("signals",[]),"stats":r.get("stats",{})})
    return {"victim_account":victim_account,"max_hops":max_hops,"node_count":len(nodes),"edge_count":len(edges),"nodes":list(nodes.values()),"edges":edges}
