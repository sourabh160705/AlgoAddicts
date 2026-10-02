from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.units import mm
from backend.config import REPORTS_DIR
from backend.reports.llm import draft_narrative


def styles():
    s=getSampleStyleSheet(); s.add(ParagraphStyle(name="Small2",parent=s["BodyText"],fontSize=8,leading=10)); return s


def make_case_diary(evidence:dict, investigation_id:str)->Path:
    p=REPORTS_DIR/f"{investigation_id}_case_diary.pdf"; doc=SimpleDocTemplate(str(p),pagesize=A4,rightMargin=12*mm,leftMargin=12*mm,topMargin=12*mm,bottomMargin=12*mm); s=styles()
    story=[Paragraph("ABHEDYA-CHAKRA — POLICE CASE DIARY (DRAFT)",s["Title"]),Spacer(1,6),Paragraph(draft_narrative(evidence).replace("\n","<br/>"),s["BodyText"]),Spacer(1,8),Paragraph("Verified Investigation Facts",s["Heading2"]),Paragraph(f"Victim Account: {evidence['victim_account']}",s["BodyText"]),Paragraph(f"Direct outflow identified from victim node: ₹{evidence['total_direct_outflow_identified']:,.2f}",s["BodyText"]),Spacer(1,8)]
    data=[["Txn ID","Sender","Receiver","Amount","Timestamp","Mode"]]
    for t in evidence["transactions"][:200]: data.append([t["transaction_id"],t["sender_account"],t["receiver_account"],f"₹{t['amount']:,.2f}",str(t["timestamp"]),t["payment_mode"]])
    table=Table(data,repeatRows=1,colWidths=[25*mm,32*mm,32*mm,22*mm,38*mm,18*mm]); table.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#0f172a")),("TEXTCOLOR",(0,0),(-1,0),colors.white),("FONTSIZE",(0,0),(-1,-1),6),("GRID",(0,0),(-1,-1),0.25,colors.grey),("VALIGN",(0,0),(-1,-1),"TOP")]))
    story += [table,Spacer(1,10),Paragraph("This generated document is a draft and requires authorized officer review.",s["Small2"])]
    doc.build(story); return p


def make_freeze_requisition(evidence:dict, investigation_id:str)->Path:
    p=REPORTS_DIR/f"{investigation_id}_freeze_requisition.pdf"; doc=SimpleDocTemplate(str(p),pagesize=landscape(A4),rightMargin=10*mm,leftMargin=10*mm,topMargin=10*mm,bottomMargin=10*mm); s=styles()
    story=[Paragraph("BANK FREEZE REQUISITION — DRAFT (SECTION 91 CrPC / BNSS WORKFLOW)",s["Title"]),Spacer(1,5),Paragraph(f"Investigation: {investigation_id}",s["BodyText"]),Spacer(1,5)]
    data=[["Account","Layer","Risk","IFSC","Transaction ID","Amount","Timestamp"]]
    for t in evidence["transactions"][:250]: data.append([t["receiver_account"],"Derived from trace","See graph",t.get("receiver_ifsc",""),t["transaction_id"],f"₹{t['amount']:,.2f}",str(t["timestamp"])])
    table=Table(data,repeatRows=1); table.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#0f172a")),("TEXTCOLOR",(0,0),(-1,0),colors.white),("FONTSIZE",(0,0),(-1,-1),7),("GRID",(0,0),(-1,-1),0.25,colors.grey)]))
    story += [table,Spacer(1,10),Paragraph("This is a system-generated draft for authorized review; it does not itself constitute a legal order.",s["Small2"])]
    doc.build(story); return p
