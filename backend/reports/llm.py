from __future__ import annotations
import requests
from backend.config import OLLAMA_BASE_URL, OLLAMA_MODEL


def _fallback(evidence:dict)->str:
    layers=evidence.get("layers",[])
    high=[x for x in layers if x.get("risk_score",0)>=60]
    return (f"The investigation starts from the victim node represented in the verified evidence. "
            f"The local transaction graph identified {len(evidence.get('transactions',[]))} traced transactions across {len(layers)} downstream accounts. "
            f"{len(high)} downstream accounts have a recorded risk score of 60 or higher. "
            "Factual identifiers and transaction values in the report are rendered from the verified local database.")


def draft_narrative(evidence:dict)->str:
    if not OLLAMA_MODEL: return _fallback(evidence)
    prompt=("You are an offline case-diary drafting assistant. Use ONLY the following verified evidence as data. "
            "Do not invent or alter account numbers, transaction IDs, amounts, timestamps, IFSC codes, banks, people, motives or legal conclusions. "
            "Do not output numeric identifiers; factual tables are generated separately by the application. "
            "Write two short factual paragraphs describing observed flow and risk signals.\n\nVERIFIED EVIDENCE:\n"+repr(evidence))
    try:
        r=requests.post(f"{OLLAMA_BASE_URL.rstrip('/')}/api/generate",json={"model":OLLAMA_MODEL,"prompt":prompt,"stream":False,"options":{"temperature":0}},timeout=30)
        r.raise_for_status(); text=r.json().get("response","").strip()
        return text or _fallback(evidence)
    except Exception:
        return _fallback(evidence)
