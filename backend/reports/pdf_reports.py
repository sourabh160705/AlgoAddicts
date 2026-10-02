from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.lib.units import mm
from backend.config import REPORTS_DIR
from backend.reports.llm import draft_narrative

def styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle(name="ReportTitle", parent=s["Title"], fontSize=14, leading=17, textColor=colors.HexColor("#0f172a"), alignment=1))
    s.add(ParagraphStyle(name="SubTitle", parent=s["Normal"], fontSize=9, leading=12, textColor=colors.HexColor("#475569"), alignment=1))
    s.add(ParagraphStyle(name="SectionHead", parent=s["Heading2"], fontSize=10, leading=13, textColor=colors.HexColor("#1e293b"), spaceBefore=6, spaceAfter=4))
    s.add(ParagraphStyle(name="SmallText", parent=s["BodyText"], fontSize=8, leading=11, textColor=colors.HexColor("#334155")))
    s.add(ParagraphStyle(name="LegalNotice", parent=s["Normal"], fontSize=7, leading=9, textColor=colors.HexColor("#64748b"), alignment=1))
    return s

def make_case_diary(evidence: dict, investigation_id: str) -> Path:
    p = REPORTS_DIR / f"{investigation_id}_case_diary.pdf"
    doc = SimpleDocTemplate(
        str(p),
        pagesize=A4,
        rightMargin=10 * mm,
        leftMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm
    )
    s = styles()
    narrative = draft_narrative(evidence).replace("\n", "<br/>")

    story = [
        Paragraph("<b>OFFICE OF THE COMMISSIONER OF POLICE, CYBER CRIME CELL</b>", s["ReportTitle"]),
        Paragraph("<b>POLICE CASE DIARY / INVESTIGATION REPORT (DRAFT)</b>", s["ReportTitle"]),
        Paragraph(f"Ref: Sec 172 CrPC / Sec 192 BNSS • Case ID: {investigation_id}", s["SubTitle"]),
        Spacer(1, 4 * mm),
        Paragraph("<b>1. Summary & Findings</b>", s["SectionHead"]),
        Paragraph(narrative, s["SmallText"]),
        Spacer(1, 3 * mm),
        Paragraph("<b>2. Primary Victim & Direct Outflow</b>", s["SectionHead"]),
        Paragraph(f"• <b>Victim Account Number:</b> {evidence['victim_account']}", s["SmallText"]),
        Paragraph(f"• <b>Total Direct Siphoned Outflow Identified:</b> ₹{evidence.get('total_direct_outflow_identified', 0):,.2f}", s["SmallText"]),
        Spacer(1, 3 * mm),
        Paragraph("<b>3. Chronological Disputed Transaction Trail (Verified Local Database)</b>", s["SectionHead"]),
    ]

    data = [["Txn ID", "Sender Account", "Receiver Account", "Amount (₹)", "Timestamp", "Mode"]]
    for t in evidence.get("transactions", [])[:250]:
        data.append([
            str(t.get("transaction_id", "")),
            str(t.get("sender_account", "")),
            str(t.get("receiver_account", "")),
            f"₹{float(t.get('amount', 0)):,.2f}",
            str(t.get("timestamp", ""))[:19],
            str(t.get("payment_mode", "UPI"))
        ])

    table = Table(data, repeatRows=1, colWidths=[26 * mm, 34 * mm, 34 * mm, 26 * mm, 42 * mm, 18 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 6.5),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (3, 1), (3, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")])
    ]))

    story.append(table)
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("<i>Note: This document is an AI-assisted draft compiled strictly from local cryptographically verified transaction facts. Requires authorized Investigating Officer review before submission.</i>", s["LegalNotice"]))

    doc.build(story)
    return p

def make_freeze_requisition(evidence: dict, investigation_id: str) -> Path:
    p = REPORTS_DIR / f"{investigation_id}_freeze_requisition.pdf"
    doc = SimpleDocTemplate(
        str(p),
        pagesize=landscape(A4),
        rightMargin=10 * mm,
        leftMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm
    )
    s = styles()

    story = [
        Paragraph("<b>URGENT BANK FREEZING REQUISITION / NOTICE</b>", s["ReportTitle"]),
        Paragraph("<b>UNDER SECTION 91 CrPC, 1973 / SECTION 94 BHARATIYA NAGARIK SURAKSHA SANHITA (BNSS), 2023</b>", s["SubTitle"]),
        Paragraph(f"To: Nodal Officer(s), Fraud Risk & Operations Department • Investigation Reference: {investigation_id}", s["SubTitle"]),
        Spacer(1, 4 * mm),
        Paragraph("<b>Beneficiary Accounts Requiring Immediate Debit Freeze (Lien Marking):</b>", s["SectionHead"]),
    ]

    data = [["S.No", "Beneficiary Account", "IFSC Code", "Disputed Amount", "Reference Txn ID", "Disputed Timestamp", "Action Required"]]
    for idx, t in enumerate(evidence.get("transactions", [])[:300], 1):
        data.append([
            str(idx),
            str(t.get("receiver_account", "")),
            str(t.get("receiver_ifsc", "N/A")),
            f"₹{float(t.get('amount', 0)):,.2f}",
            str(t.get("transaction_id", "")),
            str(t.get("timestamp", ""))[:19],
            "IMMEDIATE FREEZE"
        ])

    table = Table(data, repeatRows=1, colWidths=[12 * mm, 45 * mm, 35 * mm, 35 * mm, 45 * mm, 50 * mm, 40 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#881337")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#f43f5e")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (3, 1), (3, -1), "RIGHT"),
        ("TEXTCOLOR", (6, 1), (6, -1), colors.HexColor("#991b1b")),
        ("FONTNAME", (6, 1), (6, -1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fff1f2")])
    ]))

    story.append(table)
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("<i>By Order: Cyber Crime Investigation Cell, Indore Police Commissionerate • Non-compliance is punishable under applicable penal provisions.</i>", s["LegalNotice"]))

    doc.build(story)
    return p
