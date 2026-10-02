from __future__ import annotations
import time, uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from backend.database.queries import database_stats, account_summary, account_transactions, timeline, search_accounts, top_account_candidates
from backend.graph.trace import trace_money_flow
from backend.evidence.builder import build_evidence
from backend.reports.pdf_reports import make_case_diary, make_freeze_requisition
from backend.analytics.risk import analyze_account, analyze_accounts_batch
from backend.analytics.narrative import generate_case_narrative

router = APIRouter(prefix="/api")
INVESTIGATIONS: dict[str, dict] = {}

class TraceRequest(BaseModel):
    victim_account: str = Field(min_length=1, max_length=32)
    max_hops: int = Field(default=4, ge=1, le=4)

@router.get("/health")
def health():
    return {"status": "ok", "database": database_stats()}

@router.get("/data/stats")
def stats():
    return database_stats()

@router.get("/accounts/search")
def accounts_search(q: str = Query(min_length=1), limit: int = Query(10, ge=1, le=25)):
    return search_accounts(q, limit)

@router.get("/accounts/{account}")
def account(account: str):
    r = account_summary(account)
    if not r:
        raise HTTPException(404, "Account not found")
    return r

@router.get("/accounts/{account}/transactions")
def transactions(account: str, limit: int = Query(500, ge=1, le=5000)):
    return account_transactions(account, limit)

@router.get("/accounts/{account}/timeline")
def account_timeline(account: str, limit: int = Query(1000, ge=1, le=5000)):
    return timeline(account, limit)

@router.get("/accounts/{account}/risk")
def account_risk(account: str):
    if not account_summary(account):
        raise HTTPException(404, "Account not found")
    return analyze_account(account)

@router.get("/mules/top")
def top_mules(limit: int = Query(20, ge=1, le=100)):
    candidates = top_account_candidates(min(max(limit * 4, 20), 250))
    candidate_accs = [c["account"] for c in candidates]
    analyzed_map = analyze_accounts_batch(candidate_accs)
    ranked = list(analyzed_map.values())
    ranked.sort(key=lambda x: (x.get("risk_score", 0), x.get("stats", {}).get("total_inflow", 0)), reverse=True)
    return ranked[:limit]

@router.post("/investigation/trace")
def trace(req: TraceRequest):
    start = time.perf_counter()
    result = trace_money_flow(req.victim_account, req.max_hops)
    elapsed = time.perf_counter() - start
    iid = uuid.uuid4().hex[:12]
    evidence = build_evidence(result)
    narrative = generate_case_narrative({**result, "investigation_id": iid}, evidence)
    payload = {
        **result,
        "elapsed_seconds": round(elapsed, 4),
        "evidence": evidence,
        "narrative": narrative
    }
    INVESTIGATIONS[iid] = payload
    return {"investigation_id": iid, **payload}

@router.get("/investigation/{investigation_id}/narrative")
def investigation_narrative(investigation_id: str):
    r = INVESTIGATIONS.get(investigation_id)
    if not r:
        raise HTTPException(404, "Investigation not found")
    return r.get("narrative") or generate_case_narrative({**r, "investigation_id": investigation_id}, r.get("evidence"))

@router.get("/investigation/{investigation_id}")
def get_investigation(investigation_id: str):
    r = INVESTIGATIONS.get(investigation_id)
    if not r:
        raise HTTPException(404, "Investigation not found in this backend session")
    return {"investigation_id": investigation_id, **r}

@router.get("/investigation/{investigation_id}/evidence")
def investigation_evidence(investigation_id: str):
    r = INVESTIGATIONS.get(investigation_id)
    if not r:
        raise HTTPException(404, "Investigation not found")
    return r["evidence"]

@router.get("/investigation/{investigation_id}/download/{kind}")
def download_report(investigation_id: str, kind: str):
    r = INVESTIGATIONS.get(investigation_id)
    if not r:
        raise HTTPException(404, "Investigation not found")
    
    if kind in ("case-diary", "case_diary"):
        p = make_case_diary(r["evidence"], investigation_id)
        filename = f"Case_Diary_{investigation_id}.pdf"
    elif kind in ("freeze-requisition", "freeze_requisition"):
        p = make_freeze_requisition(r["evidence"], investigation_id)
        filename = f"Freeze_Requisition_Sec91_{investigation_id}.pdf"
    else:
        raise HTTPException(400, "Invalid report kind. Must be case-diary or freeze-requisition.")

    return FileResponse(
        path=str(p),
        media_type="application/pdf",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.post("/investigation/{investigation_id}/case-diary")
def case_diary(investigation_id: str):
    r = INVESTIGATIONS.get(investigation_id)
    if not r:
        raise HTTPException(404, "Investigation not found")
    p = make_case_diary(r["evidence"], investigation_id)
    return {"filename": p.name, "path": str(p), "download_url": f"/api/investigation/{investigation_id}/download/case-diary"}

@router.post("/investigation/{investigation_id}/freeze-requisition")
def freeze_requisition(investigation_id: str):
    r = INVESTIGATIONS.get(investigation_id)
    if not r:
        raise HTTPException(404, "Investigation not found")
    p = make_freeze_requisition(r["evidence"], investigation_id)
    return {"filename": p.name, "path": str(p), "download_url": f"/api/investigation/{investigation_id}/download/freeze-requisition"}
