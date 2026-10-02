# Implementation Checklist

This checklist maps the application to the supplied challenge statement. It distinguishes implementation that is present in the repository from benchmark claims that still require the official dataset on the target machine.

| Challenge capability | Implementation | Validation |
|---|---|---|
| Stream/chunk large dataset | DuckDB CSV ingestion path; no Python row list materialization | Run `scripts/ingest.py` on official CSV |
| Normalize accounts/IFSC/payment fields | SQL projection in `backend/ingestion/loader.py` | Inspect `transactions` table |
| Instant account history/counterparties/timeline | Indexed DuckDB queries + REST endpoints | `/api/accounts/...` |
| High-velocity pass-through | `backend/analytics/risk.py` | `/api/accounts/{account}/risk` |
| Fan-in / fan-out | `backend/analytics/risk.py` | Mule leaderboard / risk endpoint |
| Terminal indicators | Narration, configured IP prefixes, configured device labels | Risk endpoint signals |
| Mule Risk Index 0–100 | Transparent configurable weighted heuristic | Risk endpoint |
| Four-hop trace | `backend/graph/trace.py` | `/api/investigation/trace` + benchmark script |
| Interactive graph | Cytoscape.js | Investigation page |
| Temporal playback | Range slider over verified transaction timestamps | Timeline page |
| Subgraph isolation | Connected component isolation from current trace | Investigation node inspector |
| Subgraph export | CSV export of currently visible graph transactions | Investigation toolbar |
| Evidence export | Verified Evidence JSON | Investigation/evidence pages |
| Case diary | Deterministic PDF + optional local narrative | Evidence page |
| Freeze requisition | Draft PDF with account/IFSC/transaction facts | Evidence page |
| AI anti-hallucination guardrail | LLM sees verified evidence; identifiers are rendered separately | Inspect `backend/reports/llm.py` and `builder.py` |
| Local / no cloud core | DuckDB, FastAPI, React, local filesystem; optional local Ollama | Run without internet after installation |

## Benchmarks that must be measured on the official challenge hardware

The source brief sets targets of <=60 seconds for 2,000,000-row ingestion/indexing on 16 GB RAM and <=2 seconds for a four-hop trace. The repository includes measurement scripts but cannot truthfully pre-claim those results without the official dataset and the target machine.
