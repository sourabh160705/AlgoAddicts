import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileCheck2,
  FileText,
  Fingerprint,
  Gauge,
  LayoutDashboard,
  Menu,
  Network,
  Play,
  Search,
  Server,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  X,
  Zap,
} from 'lucide-react'
import GraphView from './components/GraphView'
import {
  createReport,
  getAccount,
  getAccountTimeline,
  getHealth,
  getStats,
  getTopMules,
  searchAccounts,
  trace,
} from './services/api'
import type { AccountSummary, GraphEdge, GraphNode, Investigation, MuleAccount, Stats } from './types/investigation'
import './styles.css'

type Page = 'dashboard' | 'investigation' | 'mules' | 'timeline' | 'evidence'

const nav = [
  { id: 'dashboard' as Page, label: 'Command Center', icon: LayoutDashboard },
  { id: 'investigation' as Page, label: 'Investigation', icon: Network },
  { id: 'mules' as Page, label: 'Mule Intelligence', icon: ShieldAlert },
  { id: 'timeline' as Page, label: 'Temporal Analysis', icon: Clock3 },
  { id: 'evidence' as Page, label: 'Evidence & Reports', icon: FileCheck2 },
]

function money(value: number | string | undefined) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function shortAccount(value: string) {
  if (!value) return '—'
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value
}

function riskLabel(score: number) {
  if (score >= 75) return 'Critical'
  if (score >= 50) return 'High'
  if (score >= 25) return 'Watch'
  return 'Low'
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [stats, setStats] = useState<Stats>({ loaded: false })
  const [health, setHealth] = useState<any>(null)
  const [mules, setMules] = useState<MuleAccount[]>([])
  const [account, setAccount] = useState('')
  const [traceAccount, setTraceAccount] = useState('')
  const [suggestions, setSuggestions] = useState<AccountSummary[]>([])
  const [inv, setInv] = useState<Investigation | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [isolationId, setIsolationId] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<GraphEdge[]>([])
  const [timelineIndex, setTimelineIndex] = useState(999999)
  const [loading, setLoading] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    Promise.all([getStats(), getHealth()]).then(([s, h]) => {
      setStats(s)
      setHealth(h)
    }).catch(() => setHealth({ status: 'offline' }))
    getTopMules(12).then(setMules).catch(() => setMules([]))
  }, [])

  useEffect(() => {
    const q = traceAccount.trim()
    if (q.length < 3) {
      setSuggestions([])
      return
    }
    const t = window.setTimeout(() => {
      searchAccounts(q, 6).then(setSuggestions).catch(() => setSuggestions([]))
    }, 220)
    return () => window.clearTimeout(t)
  }, [traceAccount])

  useEffect(() => {
    if (!inv) return
    setTimeline(inv.edges)
    setTimelineIndex(inv.edges.length)
    setIsolationId(null)
  }, [inv])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 3000)
    return () => window.clearTimeout(t)
  }, [toast])

  const timelineEdges = useMemo(() => timeline.slice(0, Math.min(timelineIndex, timeline.length)), [timeline, timelineIndex])
  const isolatedIds = useMemo(() => {
    if (!isolationId || !inv) return null
    const ids = new Set<string>([isolationId])
    let changed = true
    while (changed) {
      changed = false
      inv.edges.forEach((e) => {
        if (ids.has(e.sender_account) && !ids.has(e.receiver_account)) { ids.add(e.receiver_account); changed = true }
        if (ids.has(e.receiver_account) && !ids.has(e.sender_account)) { ids.add(e.sender_account); changed = true }
      })
    }
    return ids
  }, [inv, isolationId])
  const visibleEdges = useMemo(() => {
    if (!isolationId || !isolatedIds) return timelineEdges
    return timelineEdges.filter((e) => isolatedIds.has(e.sender_account) && isolatedIds.has(e.receiver_account))
  }, [timelineEdges, isolationId, isolatedIds])
  const visibleIds = useMemo(() => {
    const ids = new Set<string>([inv?.victim_account || ''])
    visibleEdges.forEach((e) => { ids.add(e.sender_account); ids.add(e.receiver_account) })
    if (isolationId) ids.add(isolationId)
    return ids
  }, [inv, visibleEdges, isolationId])
  const visibleNodes = useMemo(() => inv?.nodes.filter((n) => visibleIds.has(n.id)) || [], [inv, visibleIds])
  const highestRisk = useMemo(() => Math.max(0, ...(inv?.nodes || []).map((n) => n.risk_score)), [inv])
  const suspiciousEdges = useMemo(() => inv?.edges.filter((e) => Number(e.amount) > 0) || [], [inv])
  const totalTraced = useMemo(() => suspiciousEdges.reduce((sum, e) => sum + Number(e.amount || 0), 0), [suspiciousEdges])

  async function runTrace(nextAccount = traceAccount.trim()) {
    if (!nextAccount) return
    setLoading(true)
    setBusyLabel('Tracing four-hop money flow…')
    setError('')
    setSelectedNode(null)
    setIsolationId(null)
    try {
      const result = await trace(nextAccount, 4)
      setInv(result)
      setTraceAccount(nextAccount)
      setAccount(nextAccount)
      setPage('investigation')
      setToast(`Investigation ${result.investigation_id} loaded`)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Trace failed. Load the actual dataset and verify the API is running.')
    } finally {
      setLoading(false)
      setBusyLabel('')
    }
  }

  async function loadAccount(accountId: string) {
    try {
      setLoading(true)
      setBusyLabel('Loading account intelligence…')
      const [summary, tl] = await Promise.all([getAccount(accountId), getAccountTimeline(accountId, 400)])
      setAccount(summary.account)
      setTraceAccount(summary.account)
      setTimeline(tl)
      setTimelineIndex(tl.length)
      setIsolationId(null)
      setPage('timeline')
      setToast('Account timeline loaded')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Account could not be loaded.')
    } finally {
      setLoading(false)
      setBusyLabel('')
    }
  }

  async function report(kind: 'case-diary' | 'freeze-requisition') {
    if (!inv) return
    try {
      setLoading(true)
      setBusyLabel('Preparing verified document…')
      const r = await createReport(inv.investigation_id, kind)
      setToast(`Generated ${r.filename}`)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Report generation failed.')
    } finally {
      setLoading(false)
      setBusyLabel('')
    }
  }

  function exportTransactions() {
    if (!inv) return
    const rows = visibleEdges
    const header = ['Transaction_ID','Sender_Account','Receiver_Account','Amount','Timestamp','Payment_Mode','Sender_IFSC','Receiver_IFSC']
    const escape = (v: unknown) => `\"${String(v ?? '').replaceAll('\"', '\"\"')}\"`
    const csv = [header.join(','), ...rows.map((e) => [e.transaction_id,e.sender_account,e.receiver_account,e.amount,e.timestamp,e.payment_mode,e.sender_ifsc,e.receiver_ifsc].map(escape).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `abhedya-subgraph-${inv.investigation_id}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setToast('Subgraph transaction CSV exported')
  }

  function exportEvidence() {
    if (!inv) return
    const blob = new Blob([JSON.stringify(inv.evidence || {}, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `abhedya-evidence-${inv.investigation_id}.json`
    a.click()
    URL.revokeObjectURL(url)
    setToast('Evidence JSON exported')
  }

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Shield size={20} /></div>
          <div><div className="brand-name">ABHEDYA-CHAKRA</div><div className="brand-subtitle">Digital Forensics Command Suite</div></div>
        </div>
        <div className="mode-pill"><span className="pulse-dot" /> LOCAL • OFFLINE CORE</div>
        <div className="side-section-label">OPERATIONS</div>
        <nav className="side-nav">
          {nav.map((item) => {
            const Icon = item.icon
            return <button key={item.id} className={`side-nav-item ${page === item.id ? 'active' : ''}`} onClick={() => { setPage(item.id); setSidebarOpen(false) }}><Icon size={17} /><span>{item.label}</span>{item.id === 'investigation' && inv && <b>{inv.node_count}</b>}</button>
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="side-section-label">SYSTEM</div>
          <div className="system-card">
            <div className="system-row"><span><Server size={14} /> API</span><strong className={health?.status === 'ok' ? 'ok' : 'warn'}>{health?.status === 'ok' ? 'ONLINE' : 'CHECK'}</strong></div>
            <div className="system-row"><span><Database size={14} /> Dataset</span><strong className={stats.loaded ? 'ok' : 'warn'}>{stats.loaded ? 'READY' : 'MISSING'}</strong></div>
            <div className="system-meta">All processing is designed to stay on-device.</div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={18} /></button>
          <div><span className="breadcrumb">CYBER INVESTIGATION / {page.toUpperCase()}</span><h1>{page === 'dashboard' ? 'Command Center' : page === 'investigation' ? 'Investigation Workspace' : page === 'mules' ? 'Mule Intelligence' : page === 'timeline' ? 'Temporal Analysis' : 'Evidence & Reports'}</h1></div>
          <div className="topbar-actions"><div className="topbar-status"><span className="pulse-dot" /> Local core active</div><button className="icon-button"><Bell size={17} /></button></div>
        </header>

        {error && <div className="alert-banner"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
        {toast && <div className="toast"><CheckCircle2 size={16} /> {toast}</div>}
        {busyLabel && <div className="busybar"><span className="busy-spinner" />{busyLabel}</div>}

        {page === 'dashboard' && (
          <section className="page-stack">
            <div className="hero-grid">
              <div className="hero-copy panel-surface">
                <div className="hero-kicker"><Sparkles size={14} /> OPERATIONAL INTELLIGENCE</div>
                <h2>Trace the money.<br /><span>Expose the network.</span></h2>
                <p>Search a victim account, reconstruct up to four downstream hops, surface mule-risk signals, inspect the timeline and produce evidence-grounded reports.</p>
                <div className="trace-input-row">
                  <div className="search-field"><Search size={17} /><input value={traceAccount} onChange={(e) => setTraceAccount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runTrace()} placeholder="Enter victim account ID" /><kbd>ENTER</kbd></div>
                  <button className="primary-button" onClick={() => runTrace()} disabled={!traceAccount || loading}><Network size={16} /> TRACE MONEY <ArrowRight size={15} /></button>
                </div>
                {suggestions.length > 0 && <div className="suggestion-list">{suggestions.map((s) => <button key={s.account} onClick={() => { setTraceAccount(s.account); setSuggestions([]) }}><span>{s.account}</span><small>{money(s.total_inflow)} in · {s.unique_senders} senders</small></button>)}</div>}
                <div className="hero-foot"><span><Zap size={13} /> 4-hop tracing target</span><span><ShieldAlert size={13} /> Explainable 0–100 risk</span><span><FileText size={13} /> Draft reports</span></div>
              </div>
              <div className="hero-radar panel-surface">
                <div className="radar-head"><span>INVESTIGATION HEALTH</span><Gauge size={18} /></div>
                <div className="radar-ring"><div className="radar-core"><strong>{stats.loaded ? 'READY' : 'WAIT'}</strong><span>LOCAL CORE</span></div></div>
                <div className="health-list"><div><span>2M-row architecture</span><strong className="ok">SUPPORTED</strong></div><div><span>Cloud dependency</span><strong className="ok">NONE</strong></div><div><span>Evidence provenance</span><strong className="ok">VERIFIED</strong></div></div>
              </div>
            </div>

            <div className="metric-grid">
              <Metric icon={<Database size={16} />} label="Transactions indexed" value={stats.loaded ? stats.rows!.toLocaleString() : '—'} meta={stats.loaded ? 'live local dataset' : 'run ingestion'} />
              <Metric icon={<Fingerprint size={16} />} label="Unique accounts" value={stats.loaded ? stats.accounts!.toLocaleString() : '—'} meta="account graph universe" />
              <Metric icon={<Target size={16} />} label="Top mule risk" value={mules.length ? `${mules[0].risk_score}/100` : '—'} meta={mules[0] ? `${riskLabel(mules[0].risk_score)} signal` : 'awaiting data'} accent />
              <Metric icon={<Activity size={16} />} label="Dataset window" value={stats.loaded ? `${stats.min_timestamp?.slice(5, 10)} → ${stats.max_timestamp?.slice(5, 10)}` : '—'} meta="15-day challenge window" />
            </div>

            <div className="dashboard-grid">
              <section className="panel-surface panel-block">
                <div className="section-head"><div><span className="overline">PRIORITY QUEUE</span><h3>Highest-risk accounts</h3></div><button className="ghost-button" onClick={() => setPage('mules')}>View all <ArrowRight size={14} /></button></div>
                <div className="risk-table">{mules.slice(0, 7).map((m) => <button className="risk-row" key={m.account} onClick={() => loadAccount(m.account)}><span className="risk-rank">{mules.indexOf(m) + 1}</span><span className="risk-account"><strong>{shortAccount(m.account)}</strong><small>{m.signals.slice(0, 2).map((s) => s.name.replaceAll('_', ' ')).join(' · ') || 'No signal labels'}</small></span><span className={`risk-chip r${m.risk_score >= 75 ? 'critical' : m.risk_score >= 50 ? 'high' : m.risk_score >= 25 ? 'watch' : 'low'}`}>{m.risk_score} • {riskLabel(m.risk_score)}</span><ArrowRight size={15} /></button>)}{!mules.length && <div className="empty-state"><ShieldAlert size={22} /><span>Load the dataset to populate risk intelligence.</span></div>}</div>
              </section>
              <section className="panel-surface panel-block">
                <div className="section-head"><div><span className="overline">INVESTIGATION FLOW</span><h3>From victim to terminal</h3></div><Network size={19} className="muted-icon" /></div>
                <div className="flow-visual"><FlowNode label="VICTIM" detail="Input account" type="victim" /><ArrowRight /><FlowNode label="L1" detail="Collector" type="l1" /><ArrowRight /><FlowNode label="L2" detail="Distributor" type="l2" /><ArrowRight /><FlowNode label="L3" detail="Terminal" type="l3" /></div>
                <div className="flow-notes"><span><span className="dot blue" /> victim source</span><span><span className="dot violet" /> intermediary</span><span><span className="dot orange" /> dispersal</span><span><span className="dot red" /> terminal</span></div>
              </section>
            </div>
          </section>
        )}

        {page === 'investigation' && (
          <section className="page-stack">
            <div className="workspace-toolbar panel-surface">
              <div className="toolbar-title"><Network size={18} /><div><strong>Live Money-Trail Graph</strong><span>{inv ? `${inv.node_count} nodes · ${inv.edge_count} edges` : 'Awaiting victim query'}</span></div></div>
              <div className="toolbar-actions"><button className="ghost-button" onClick={exportTransactions} disabled={!inv}><Download size={14} /> Subgraph CSV</button><button className="ghost-button" onClick={exportEvidence} disabled={!inv}><FileCheck2 size={14} /> Evidence JSON</button><button className="primary-button compact" onClick={() => runTrace()} disabled={!traceAccount || loading}><Play size={14} /> Re-run trace</button></div>
            </div>
            <div className="investigation-grid">
              <section className="panel-surface graph-panel"><div className="panel-heading"><div><span className="overline">GRAPH ANALYSIS</span><h3>{inv ? `Victim ${shortAccount(inv.victim_account)}` : 'No investigation loaded'}</h3></div>{inv && <div className="mini-stats"><span>{money(totalTraced)} traced</span><span>{inv.elapsed_seconds.toFixed(3)}s query</span></div>}</div>{inv ? <GraphView nodes={visibleNodes} edges={visibleEdges} selectedId={selectedNode?.id} onSelect={setSelectedNode} /> : <div className="graph-empty"><Network size={30} /><strong>Trace a victim account</strong><span>Use Command Center to start a verified four-hop investigation.</span></div>}<div className="graph-legend"><span className="isolation-chip">{isolationId ? `ISOLATED • ${shortAccount(isolationId)}` : 'FULL TRACE'}</span><Legend color="#5ee7ff" label="Victim" /><Legend color="#8b9cff" label="Layer 1" /><Legend color="#ffb454" label="Layer 2" /><Legend color="#ff5f7a" label="Layer 3 / high risk" /></div></section>
              <aside className="panel-surface intelligence-panel"><div className="panel-heading"><div><span className="overline">ACCOUNT INTELLIGENCE</span><h3>{selectedNode ? shortAccount(selectedNode.account) : 'Select a node'}</h3></div><Fingerprint size={17} className="muted-icon" /></div>{selectedNode ? <NodeInspector node={selectedNode} onIsolate={() => setIsolationId(selectedNode.id)} isolated={isolationId === selectedNode.id} onResetIsolation={() => setIsolationId(null)} /> : <div className="inspector-empty"><MousePointerIcon /><p>Click any node in the graph to inspect its layer, risk signals and flow statistics.</p></div>}</aside>
            </div>
            {inv && <section className="panel-surface table-section"><div className="section-head"><div><span className="overline">TRANSACTION LEDGER</span><h3>Verified traced transactions</h3></div><span className="count-badge">{visibleEdges.length} visible</span></div><TransactionTable edges={visibleEdges.slice(0, 300)} /></section>}
          </section>
        )}

        {page === 'mules' && (
          <section className="page-stack">
            <div className="page-intro panel-surface"><div><span className="overline">RISK ENGINE</span><h2>Mule Intelligence</h2><p>Rule-based indicators surface fan-in, fan-out, velocity and terminal signals from the verified local transaction graph.</p></div><div className="intro-stat"><strong>0–100</strong><span>Explainable risk index</span></div></div>
            <div className="metric-grid"><Metric icon={<ShieldAlert size={16} />} label="Critical" value={String(mules.filter((m) => m.risk_score >= 75).length)} meta="priority accounts" accent /><Metric icon={<Target size={16} />} label="High" value={String(mules.filter((m) => m.risk_score >= 50).length)} meta="needs investigation" /><Metric icon={<BarChart3 size={16} />} label="Signals" value={String(mules.reduce((n, m) => n + m.signals.length, 0))} meta="top-ranked sample" /><Metric icon={<Zap size={16} />} label="Analysis mode" value="LOCAL" meta="deterministic rules" /></div>
            <section className="panel-surface table-section"><div className="section-head"><div><span className="overline">RANKED ACCOUNTS</span><h3>Risk leaderboard</h3></div><button className="ghost-button" onClick={() => getTopMules(25).then(setMules)}>Refresh <Activity size={14} /></button></div><div className="mule-table"><div className="mule-header"><span>ACCOUNT</span><span>LAYER</span><span>RISK</span><span>PRIMARY SIGNALS</span><span></span></div>{mules.map((m) => <button className="mule-row" key={m.account} onClick={() => loadAccount(m.account)}><span className="account-cell"><span className="account-avatar"><ShieldAlert size={14} /></span><span><strong>{m.account}</strong><small>{money(m.stats?.total_inflow)} inflow · {money(m.stats?.total_outflow)} outflow</small></span></span><span><span className="layer-badge">L{m.layer || '—'}</span></span><span><strong className="score-number">{m.risk_score}</strong><small>{riskLabel(m.risk_score)}</small></span><span className="signal-list">{m.signals.slice(0, 3).map((s) => <span key={s.name}>{s.name.replaceAll('_', ' ')}</span>)}</span><ArrowRight size={15} /></button>)}{!mules.length && <div className="empty-state tall"><ShieldAlert size={24} /><span>Run ingestion to populate mule intelligence.</span></div>}</div></section>
          </section>
        )}

        {page === 'timeline' && (
          <section className="page-stack">
            <div className="page-intro panel-surface"><div><span className="overline">TEMPORAL FORENSICS</span><h2>Propagation Timeline</h2><p>Scrub through the transaction sequence to reveal how value propagated across the graph.</p></div>{timeline.length > 0 && <div className="intro-stat"><strong>{timeline.length}</strong><span>transactions loaded</span></div>}</div>
            <section className="panel-surface timeline-panel"><div className="timeline-toolbar"><div className="timeline-account"><Fingerprint size={17} /><span>{account || 'No account selected'}</span></div><input type="range" min="0" max={timeline.length || 0} value={Math.min(timelineIndex, timeline.length)} onChange={(e) => setTimelineIndex(Number(e.target.value))} /><div className="timeline-count">{Math.min(timelineIndex, timeline.length)} / {timeline.length}</div><button className="ghost-button" onClick={() => setTimelineIndex(timeline.length)}><Clock3 size={14} /> Show all</button></div>{timeline.length ? <div className="timeline-track"><div className="track-line" />{timeline.slice(0, 20).map((e, i) => <div className={`timeline-dot-item ${i < timelineIndex ? 'active' : ''}`} key={e.transaction_id} style={{ left: `${timeline.length > 1 ? (i / (Math.min(timeline.length, 20) - 1)) * 100 : 0}%` }}><span className="timeline-dot" /><div className="timeline-card"><strong>{money(e.amount)}</strong><small>{e.payment_mode} · {String(e.timestamp).slice(11, 19)}</small><span>{shortAccount(e.sender_account)} → {shortAccount(e.receiver_account)}</span></div></div>)}</div> : <div className="graph-empty"><Clock3 size={30} /><strong>Select an account</strong><span>Choose a ranked mule or trace a victim to load its historical flow.</span></div>}</section>
            {timeline.length > 0 && <section className="panel-surface table-section"><div className="section-head"><div><span className="overline">CURRENT WINDOW</span><h3>Visible transactions</h3></div></div><TransactionTable edges={visibleEdges.slice(0, 200)} /></section>}
          </section>
        )}

        {page === 'evidence' && (
          <section className="page-stack">
            <div className="page-intro panel-surface"><div><span className="overline">EVIDENCE CHAIN</span><h2>Evidence & Reports</h2><p>Generate draft investigation documents from the verified evidence returned by the local graph engine.</p></div><div className="intro-stat"><strong>{inv ? inv.investigation_id : '—'}</strong><span>current investigation</span></div></div>
            <div className="evidence-grid"><section className="panel-surface report-card"><div className="report-icon"><FileText size={20} /></div><div><span className="overline">POLICE CASE DIARY</span><h3>Chronological case narrative</h3><p>Summarizes the verified money trail, layer classification, timestamps and recorded risk signals.</p></div><button className="primary-button" disabled={!inv || loading} onClick={() => report('case-diary')}>Generate PDF <ArrowRight size={14} /></button></section><section className="panel-surface report-card"><div className="report-icon red"><FileCheck2 size={20} /></div><div><span className="overline">BANK FREEZE REQUISITION</span><h3>Evidence-grounded draft notice</h3><p>Creates a printable draft using exact beneficiary accounts, IFSCs and transaction IDs found in the investigation graph.</p></div><button className="primary-button danger" disabled={!inv || loading} onClick={() => report('freeze-requisition')}>Generate Draft <ArrowRight size={14} /></button></section></div>
            {inv && <section className="panel-surface table-section"><div className="section-head"><div><span className="overline">PROVENANCE</span><h3>Verified evidence snapshot</h3></div><button className="ghost-button" onClick={exportEvidence}><Download size={14} /> Export JSON</button></div><div className="provenance-grid"><InfoStat label="Victim" value={inv.victim_account} /><InfoStat label="Direct outflow identified" value={money(inv.evidence?.total_direct_outflow_identified)} /><InfoStat label="Accounts traced" value={String(inv.node_count)} /><InfoStat label="Trace latency" value={`${inv.elapsed_seconds.toFixed(3)} s`} /></div></section>}
          </section>
        )}
      </main>
    </div>
  )
}

function Metric({ icon, label, value, meta, accent = false }: { icon: React.ReactNode; label: string; value: string; meta: string; accent?: boolean }) {
  return <div className={`metric-card ${accent ? 'accent' : ''}`}><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{meta}</small></div>
}

function FlowNode({ label, detail, type }: { label: string; detail: string; type: string }) {
  return <div className={`flow-node ${type}`}><strong>{label}</strong><span>{detail}</span></div>
}

function Legend({ color, label }: { color: string; label: string }) { return <span className="legend-item"><i style={{ background: color }} />{label}</span> }

function NodeInspector({ node, onIsolate, isolated, onResetIsolation }: { node: GraphNode; onIsolate: () => void; isolated: boolean; onResetIsolation: () => void }) {
  return <div className="node-inspector"><div className="node-score"><div><span className="overline">RISK INDEX</span><strong>{node.risk_score}</strong><small>{riskLabel(node.risk_score)}</small></div><div className={`score-orbit risk-${node.risk_score >= 75 ? 'critical' : node.risk_score >= 50 ? 'high' : node.risk_score >= 25 ? 'watch' : 'low'}`} /></div><div className="inspector-grid"><InfoStat label="Layer" value={node.hop === 0 ? 'Victim' : `L${node.layer || node.hop}`} /><InfoStat label="Hop depth" value={String(node.hop)} /><InfoStat label="Inflow" value={money(node.stats?.total_inflow)} /><InfoStat label="Outflow" value={money(node.stats?.total_outflow)} /><InfoStat label="Senders" value={String(node.stats?.unique_senders ?? 0)} /><InfoStat label="Receivers" value={String(node.stats?.unique_receivers ?? 0)} /></div><div className="inspector-actions"><button className="primary-button compact" onClick={onIsolate}><Network size={13} /> {isolated ? 'Subgraph isolated' : 'Isolate subgraph'}</button>{isolated && <button className="ghost-button" onClick={onResetIsolation}>Reset</button>}</div><div className="inspector-actions"><button className="primary-button compact" onClick={onIsolate}><Network size={13} /> {isolated ? 'Subgraph isolated' : 'Isolate subgraph'}</button>{isolated && <button className="ghost-button" onClick={onResetIsolation}>Reset</button>}</div><div className="signal-box"><span className="overline">DETECTED SIGNALS</span>{node.signals.length ? node.signals.map((s) => <div className="signal" key={s.name}><CheckCircle2 size={14} /><div><strong>{s.name.replaceAll('_', ' ')}</strong><span>{typeof s.detail === 'string' ? s.detail : JSON.stringify(s.detail)}</span></div></div>) : <div className="no-signal">No recorded signal above the configured thresholds.</div>}</div></div>
}

function InfoStat({ label, value }: { label: string; value: string }) { return <div className="info-stat"><span>{label}</span><strong title={value}>{value}</strong></div> }

function TransactionTable({ edges }: { edges: GraphEdge[] }) {
  if (!edges.length) return <div className="empty-state"><Activity size={20} /><span>No transactions in the current window.</span></div>
  return <div className="data-table-wrap"><table><thead><tr><th>Transaction</th><th>Sender</th><th>Receiver</th><th>Amount</th><th>Timestamp</th><th>Mode</th><th>IFSC</th></tr></thead><tbody>{edges.map((e) => <tr key={e.transaction_id}><td><code>{e.transaction_id}</code></td><td>{shortAccount(e.sender_account)}</td><td>{shortAccount(e.receiver_account)}</td><td className="amount-cell">{money(e.amount)}</td><td>{String(e.timestamp).replace('T', ' ').slice(0, 19)}</td><td><span className="mode-tag">{e.payment_mode}</span></td><td>{e.receiver_ifsc || '—'}</td></tr>)}</tbody></table></div>
}

function MousePointerIcon() { return <div className="inspector-placeholder-icon"><SlidersHorizontal size={22} /></div> }
