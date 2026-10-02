from backend.evidence.builder import build_evidence

def test_evidence_comes_from_trace():
    e=build_evidence({'victim_account':'111111111111','nodes':[{'account':'222222222222','hop':1,'layer':1,'risk_score':20,'signals':[]}],'edges':[{'transaction_id':'T001','sender_account':'111111111111','receiver_account':'222222222222','amount':100.0,'timestamp':'2026-01-01','payment_mode':'UPI'}]})
    assert e['victim_account']=='111111111111'; assert e['transactions'][0]['transaction_id']=='T001'
