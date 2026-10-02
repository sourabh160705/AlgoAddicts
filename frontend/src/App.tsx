import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Briefcase,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Clock3,
  Copy,
  Cpu,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Fingerprint,
  FolderLock,
  Globe,
  HelpCircle,
  History,
  LayoutDashboard,
  Link as LinkIcon,
  Menu,
  Moon,
  Network,
  Play,
  PlusCircle,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react'
import GraphView from './components/GraphView'
import {
  createReport,
  downloadReportPdf,
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

type Page =
  | 'dashboard'
  | 'incidents'
  | 'investigation'
  | 'mules'
  | 'analytics'
  | 'timeline'
  | 'osint'
  | 'evidence'
  | 'users'
  | 'settings'

type FilterMode = 'all' | 'critical' | 'high' | 'l1' | 'l2' | 'l3'

const nav = [
  { id: 'dashboard' as Page, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'incidents' as Page, label: 'Incidents', icon: ShieldAlert },
  { id: 'investigation' as Page, label: 'Case Management', icon: FolderLock },
  { id: 'mules' as Page, label: 'AI Detection', icon: Cpu },
  { id: 'analytics' as Page, label: 'Analytics', icon: BarChart3 },
  { id: 'investigation' as Page, label: 'Knowledge Graph', icon: Network },
  { id: 'osint' as Page, label: 'OSINT & Intelligence', icon: Globe },
  { id: 'evidence' as Page, label: 'Reports', icon: FileText },
  { id: 'users' as Page, label: 'Users & Roles', icon: Users },
  { id: 'settings' as Page, label: 'Settings', icon: Settings },
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
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [timeline, setTimeline] = useState<GraphEdge[]>([])
  const [timelineIndex, setTimelineIndex] = useState(999999)
  const [loading, setLoading] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showFreezeModal, setShowFreezeModal] = useState(false)
  const [currentTime, setCurrentTime] = useState('04:22 PM')
  const [currentDate, setCurrentDate] = useState('Thu, 02 Oct 2026')

  useEffect(() => {
    Promise.all([getStats(), getHealth()])
      .then(([s, h]) => {
        setStats(s)
        setHealth(h)
      })
      .catch(() => setHealth({ status: 'offline' }))
    getTopMules(12).then(setMules).catch(() => setMules([]))

    const timer = setInterval(() => {
      const now = new Date()
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }))
      setCurrentDate(now.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const q = traceAccount.trim()
    if (q.length < 3) {
      setSuggestions([])
      return
    }
    const t = window.setTimeout(() => {
      searchAccounts(q, 6).then(setSuggestions).catch(() => setSuggestions([]))
    }, 200)
    return () => window.clearTimeout(t)
  }, [traceAccount])

  useEffect(() => {
    if (!inv) return
    setTimeline(inv.edges)
    setTimelineIndex(inv.edges.length)
    setIsolationId(null)
    setFilterMode('all')
  }, [inv])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 3000)
    return () => window.clearTimeout(t)
  }, [toast])

  const timelineEdges = useMemo(
    () => timeline.slice(0, Math.min(timelineIndex, timeline.length)),
    [timeline, timelineIndex]
  )

  const isolatedIds = useMemo(() => {
    if (!isolationId || !inv) return null
    const ids = new Set<string>([isolationId])
    let changed = true
    while (changed) {
      changed = false
      inv.edges.forEach((e) => {
        if (ids.has(e.sender_account) && !ids.has(e.receiver_account)) {
          ids.add(e.receiver_account)
          changed = true
        }
        if (ids.has(e.receiver_account) && !ids.has(e.sender_account)) {
          ids.add(e.sender_account)
          changed = true
        }
      })
    }
    return ids
  }, [inv, isolationId])

  const filteredNodes = useMemo(() => {
    if (!inv) return []
    let list = inv.nodes

    if (isolationId && isolatedIds) {
      list = list.filter((n) => isolatedIds.has(n.id))
    }

    if (filterMode === 'critical') {
      list = list.filter((n) => n.hop === 0 || n.risk_score >= 75)
    } else if (filterMode === 'high') {
      list = list.filter((n) => n.hop === 0 || n.risk_score >= 50)
    } else if (filterMode === 'l1') {
      list = list.filter((n) => n.hop === 0 || n.layer === 1)
    } else if (filterMode === 'l2') {
      list = list.filter((n) => n.hop === 0 || n.layer === 2)
    } else if (filterMode === 'l3') {
      list = list.filter((n) => n.hop === 0 || n.layer === 3)
    }

    return list
  }, [inv, isolationId, isolatedIds, filterMode])

  const visibleIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes])

  const visibleEdges = useMemo(() => {
    return timelineEdges.filter(
      (e) => visibleIds.has(e.sender_account) && visibleIds.has(e.receiver_account)
    )
  }, [timelineEdges, visibleIds])

  const suspiciousEdges = useMemo(() => inv?.edges.filter((e) => Number(e.amount) > 0) || [], [inv])
  const totalTraced = useMemo(
    () => suspiciousEdges.reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [suspiciousEdges]
  )

  async function runTrace(nextAccount = traceAccount.trim()) {
    if (!nextAccount) return
    setLoading(true)
    setBusyLabel('Executing 4-hop BFS frontier money-trail traversal…')
    setError('')
    setSelectedNode(null)
    setIsolationId(null)
    try {
      const result = await trace(nextAccount, 4)
      setInv(result)
      setTraceAccount(nextAccount)
      setAccount(nextAccount)
      setPage('investigation')
      setToast(`Investigation loaded (${result.node_count} nodes in ${result.elapsed_seconds.toFixed(2)}s)`)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Trace failed. Check backend API status.')
    } finally {
      setLoading(false)
      setBusyLabel('')
    }
  }

  async function loadAccount(accountId: string) {
    try {
      setLoading(true)
      setBusyLabel('Loading account timeline & forensic data…')
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
      setBusyLabel('Generating tamper-proof legal document PDF…')
      const filename = await downloadReportPdf(inv.investigation_id, kind)
      setToast('Downloaded ' + filename)
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
    const header = [
      'Transaction_ID',
      'Sender_Account',
      'Receiver_Account',
      'Amount',
      'Timestamp',
      'Payment_Mode',
      'Sender_IFSC',
      'Receiver_IFSC',
    ]
    const escape = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
    const csv = [
      header.join(','),
      ...rows.map((e) =>
        [
          e.transaction_id,
          e.sender_account,
          e.receiver_account,
          e.amount,
          e.timestamp,
          e.payment_mode,
          e.sender_ifsc,
          e.receiver_ifsc,
        ]
          .map(escape)
          .join(',')
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `abhedya-subgraph-${inv.investigation_id}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setToast('Subgraph CSV exported')
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

      {/* 1. LEFT SIDEBAR */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <Shield size={22} />
          </div>
          <div>
            <div className="brand-name">Abhedya-Chakra</div>
            <div className="brand-subtitle">Protect • Detect • Respond</div>
          </div>
        </div>

        <nav className="side-nav">
          {nav.map((item, idx) => {
            const Icon = item.icon
            const isActive = page === item.id && (idx === 0 || item.label === 'Dashboard' || item.id === page)
            return (
              <button
                key={`${item.id}-${idx}`}
                className={`side-nav-item ${page === item.id ? 'active' : ''}`}
                onClick={() => {
                  setPage(item.id)
                  setSidebarOpen(false)
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.id === 'investigation' && inv && <b>{inv.node_count}</b>}
              </button>
            )
          })}
        </nav>

        {/* BOTTOM PROMO CARD */}
        <div className="sidebar-footer">
          <div className="safer-india-card">
            <div className="safer-india-info">
              <div className="safer-india-icon">
                <ShieldCheck size={18} />
              </div>
              <div>
                <span className="safer-india-title">Helping a Safer Digital India</span>
                <span className="safer-india-subtitle">Detect • Prevent • Respond</span>
              </div>
            </div>
            <button className="safer-india-btn" onClick={() => setPage('dashboard')}>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CONTENT */}
      <main className="main-content">
        {/* TOPBAR */}
        <header className="topbar">
          <button className="icon-circle-btn mobile-menu" onClick={() => setSidebarOpen(true)}>
            <Menu size={18} />
          </button>

          <div className="topbar-search-wrap">
            <div className="topbar-search">
              <Search size={16} />
              <input
                value={traceAccount}
                onChange={(e) => setTraceAccount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runTrace()}
                placeholder="Search incidents, cases, users, modules or account IDs..."
              />
              {traceAccount && (
                <button className="ghost-button compact" onClick={() => runTrace()} style={{ height: 28 }}>
                  Search
                </button>
              )}
            </div>
          </div>

          <div className="topbar-right">
            <button className="icon-circle-btn" title="Notifications">
              <Bell size={17} />
              <span className="notif-badge" />
            </button>

            <button className="icon-circle-btn" title="Toggle Theme">
              <Moon size={17} />
            </button>

            <div className="user-profile-pill">
              <div className="user-avatar">AP</div>
              <div className="user-details">
                <span className="user-name">Abhishek Patel</span>
                <span className="user-role">Administrator</span>
              </div>
              <ChevronDown size={14} color="#64748b" />
            </div>
          </div>
        </header>

        {suggestions.length > 0 && (
          <div className="suggestion-list">
            {suggestions.map((s) => (
              <button
                key={s.account}
                onClick={() => {
                  setTraceAccount(s.account)
                  setSuggestions([])
                  runTrace(s.account)
                }}
              >
                <span>{s.account}</span>
                <small>
                  {money(s.total_inflow)} in · {s.unique_senders} senders
                </small>
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="alert-banner">
            <AlertTriangle size={17} />
            <span>{error}</span>
            <button onClick={() => setError('')}>
              <X size={15} />
            </button>
          </div>
        )}
        {toast && (
          <div className="toast">
            <CheckCircle2 size={16} /> {toast}
          </div>
        )}
        {busyLabel && (
          <div className="busybar">
            <span className="busy-spinner" />
            {busyLabel}
          </div>
        )}

        {/* 3. DASHBOARD PAGE */}
        {page === 'dashboard' && (
          <>
            {/* HERO BANNER ROW */}
            <div className="hero-banner-row">
              <div className="hero-main-card">
                <div className="hero-text-content">
                  <span className="welcome-pill">Welcome Back</span>
                  <h2>Abhedya-Chakra</h2>
                  <h4>AI-Powered Cybercrime Detection & Investigation Platform</h4>
                  <p>
                    Detect, analyze, link and respond to cyber threats using AI agents, knowledge graphs and real-time intelligence across 2,000,000+ banking transactions.
                  </p>
                </div>

                <div className="hero-3d-graphic">
                  <div className="shield-3d-glow">
                    <Shield size={44} />
                  </div>
                  <div className="floating-node-badge n1"><Cpu size={15} /></div>
                  <div className="floating-node-badge n2"><Globe size={15} /></div>
                  <div className="floating-node-badge n3"><Database size={15} /></div>
                  <div className="floating-node-badge n4"><Users size={15} /></div>
                </div>
              </div>

              {/* HERO RIGHT STATUS CARD */}
              <div className="hero-status-card">
                <div className="date-time-box">
                  <span className="date-label">
                    <Calendar size={13} /> {currentDate}
                  </span>
                  <span className="clock-display">{currentTime}</span>
                </div>

                <div className="system-status-box">
                  <div className="system-status-title">
                    <span className="pulse-dot" /> System Online
                  </div>
                  <span className="system-status-sub">All modules operational</span>
                </div>
              </div>
            </div>

            {/* 4 STAT METRICS ROW */}
            <div className="metrics-four-grid">
              <div className="stat-metric-card">
                <div>
                  <div className="stat-icon-square red">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="stat-details">
                    <span>Total Incidents</span>
                    <strong>248</strong>
                    <div className="stat-trend">
                      <ArrowRight size={11} style={{ transform: 'rotate(-45deg)' }} /> ↑ 12% from last week
                    </div>
                  </div>
                </div>
                <div className="stat-mini-bars">
                  <div className="mini-bar" style={{ height: '40%' }} />
                  <div className="mini-bar" style={{ height: '65%' }} />
                  <div className="mini-bar" style={{ height: '50%' }} />
                  <div className="mini-bar" style={{ height: '85%' }} />
                  <div className="mini-bar" style={{ height: '100%', background: '#10b981' }} />
                </div>
              </div>

              <div className="stat-metric-card">
                <div>
                  <div className="stat-icon-square green">
                    <FolderLock size={20} />
                  </div>
                  <div className="stat-details">
                    <span>Active Cases</span>
                    <strong>63</strong>
                    <div className="stat-trend">
                      <ArrowRight size={11} style={{ transform: 'rotate(-45deg)' }} /> ↑ 8% from last week
                    </div>
                  </div>
                </div>
                <div className="stat-mini-bars">
                  <div className="mini-bar" style={{ height: '30%' }} />
                  <div className="mini-bar" style={{ height: '55%' }} />
                  <div className="mini-bar" style={{ height: '70%' }} />
                  <div className="mini-bar" style={{ height: '60%' }} />
                  <div className="mini-bar" style={{ height: '90%', background: '#10b981' }} />
                </div>
              </div>

              <div className="stat-metric-card">
                <div>
                  <div className="stat-icon-square green">
                    <User size={20} />
                  </div>
                  <div className="stat-details">
                    <span>Suspects Identified</span>
                    <strong>41</strong>
                    <div className="stat-trend">
                      <ArrowRight size={11} style={{ transform: 'rotate(-45deg)' }} /> ↑ 22% from last week
                    </div>
                  </div>
                </div>
                <div className="stat-mini-bars">
                  <div className="mini-bar" style={{ height: '20%' }} />
                  <div className="mini-bar" style={{ height: '45%' }} />
                  <div className="mini-bar" style={{ height: '60%' }} />
                  <div className="mini-bar" style={{ height: '75%' }} />
                  <div className="mini-bar" style={{ height: '100%', background: '#10b981' }} />
                </div>
              </div>

              <div className="stat-metric-card">
                <div>
                  <div className="stat-icon-square blue">
                    <LinkIcon size={20} />
                  </div>
                  <div className="stat-details">
                    <span>Link Analysis (Nodes)</span>
                    <strong>1,852</strong>
                    <div className="stat-trend">
                      <ArrowRight size={11} style={{ transform: 'rotate(-45deg)' }} /> ↑ 18% from last week
                    </div>
                  </div>
                </div>
                <div className="stat-mini-bars">
                  <div className="mini-bar" style={{ height: '50%' }} />
                  <div className="mini-bar" style={{ height: '60%' }} />
                  <div className="mini-bar" style={{ height: '40%' }} />
                  <div className="mini-bar" style={{ height: '80%' }} />
                  <div className="mini-bar" style={{ height: '95%', background: '#10b981' }} />
                </div>
              </div>
            </div>

            {/* CHARTS SPLIT SECTION */}
            <div className="charts-split-grid">
              {/* INCIDENT TRENDS SPLINE CHART */}
              <div className="panel-surface chart-card">
                <div className="chart-header">
                  <div>
                    <h3>Incident Trends</h3>
                    <span>Overview of reported cyber incidents in the last 30 days</span>
                  </div>
                  <select className="timeframe-select" defaultValue="30">
                    <option value="30">Last 30 Days</option>
                    <option value="15">Last 15 Days</option>
                    <option value="7">Last 7 Days</option>
                  </select>
                </div>

                <div className="line-chart-canvas">
                  <svg className="line-chart-svg" viewBox="0 0 600 160">
                    {/* Grid horizontal lines */}
                    <line x1="0" y1="30" x2="600" y2="30" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                    <line x1="0" y1="70" x2="600" y2="70" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                    <line x1="0" y1="110" x2="600" y2="110" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                    <line x1="0" y1="150" x2="600" y2="150" stroke="#e2e8f0" strokeWidth="1" />

                    {/* Gradient fill under curve */}
                    <defs>
                      <linearGradient id="chartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 20 145 C 50 120, 70 140, 100 125 C 130 110, 150 130, 180 115 C 210 100, 230 130, 260 110 C 290 90, 310 120, 340 100 C 370 80, 390 115, 420 105 C 450 95, 470 50, 500 45 C 530 40, 550 85, 580 95 L 580 150 L 20 150 Z"
                      fill="url(#chartGrad)"
                    />

                    {/* Spline Path */}
                    <path
                      d="M 20 145 C 50 120, 70 140, 100 125 C 130 110, 150 130, 180 115 C 210 100, 230 130, 260 110 C 290 90, 310 120, 340 100 C 370 80, 390 115, 420 105 C 450 95, 470 50, 500 45 C 530 40, 550 85, 580 95"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                    />

                    {/* Dots */}
                    {[
                      { cx: 20, cy: 145 },
                      { cx: 60, cy: 122 },
                      { cx: 100, cy: 125 },
                      { cx: 140, cy: 112 },
                      { cx: 180, cy: 115 },
                      { cx: 220, cy: 104 },
                      { cx: 260, cy: 110 },
                      { cx: 300, cy: 92 },
                      { cx: 340, cy: 100 },
                      { cx: 380, cy: 84 },
                      { cx: 420, cy: 105 },
                      { cx: 460, cy: 62 },
                      { cx: 500, cy: 45 },
                      { cx: 540, cy: 75 },
                      { cx: 580, cy: 95 },
                    ].map((pt, i) => (
                      <circle key={i} cx={pt.cx} cy={pt.cy} r="3.5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                    ))}
                  </svg>
                </div>
              </div>

              {/* INCIDENT CATEGORIES DONUT CHART */}
              <div className="panel-surface chart-card">
                <div className="chart-header">
                  <div>
                    <h3>Incident Categories</h3>
                    <span>Distribution by vector</span>
                  </div>
                </div>

                <div className="donut-chart-container">
                  <div className="donut-visual">
                    <svg viewBox="0 0 100 100" width="130" height="130">
                      <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f1f5f9" strokeWidth="14" />
                      {/* Financial Fraud: 28% */}
                      <circle cx="50" cy="50" r="38" fill="transparent" stroke="#065f46" strokeWidth="14" strokeDasharray="66.8 172.2" strokeDashoffset="0" />
                      {/* Phishing: 22% */}
                      <circle cx="50" cy="50" r="38" fill="transparent" stroke="#10b981" strokeWidth="14" strokeDasharray="52.5 186.5" strokeDashoffset="-66.8" />
                      {/* Social Media: 18% */}
                      <circle cx="50" cy="50" r="38" fill="transparent" stroke="#6ee7b7" strokeWidth="14" strokeDasharray="43 196" strokeDashoffset="-119.3" />
                      {/* Malware: 12% */}
                      <circle cx="50" cy="50" r="38" fill="transparent" stroke="#a7f3d0" strokeWidth="14" strokeDasharray="28.6 210.4" strokeDashoffset="-162.3" />
                      {/* Identity Theft: 10% */}
                      <circle cx="50" cy="50" r="38" fill="transparent" stroke="#cbd5e1" strokeWidth="14" strokeDasharray="23.9 215.1" strokeDashoffset="-190.9" />
                    </svg>
                    <div className="donut-center-label">
                      <strong>248</strong>
                      <span>Total</span>
                    </div>
                  </div>

                  <div className="donut-legend">
                    <div className="donut-legend-row">
                      <div className="donut-legend-label">
                        <span className="donut-dot" style={{ background: '#065f46' }} /> Financial Fraud
                      </div>
                      <span className="donut-legend-pct">28%</span>
                    </div>
                    <div className="donut-legend-row">
                      <div className="donut-legend-label">
                        <span className="donut-dot" style={{ background: '#10b981' }} /> Phishing
                      </div>
                      <span className="donut-legend-pct">22%</span>
                    </div>
                    <div className="donut-legend-row">
                      <div className="donut-legend-label">
                        <span className="donut-dot" style={{ background: '#6ee7b7' }} /> Social Media
                      </div>
                      <span className="donut-legend-pct">18%</span>
                    </div>
                    <div className="donut-legend-row">
                      <div className="donut-legend-label">
                        <span className="donut-dot" style={{ background: '#a7f3d0' }} /> Malware
                      </div>
                      <span className="donut-legend-pct">12%</span>
                    </div>
                    <div className="donut-legend-row">
                      <div className="donut-legend-label">
                        <span className="donut-dot" style={{ background: '#cbd5e1' }} /> Identity Theft
                      </div>
                      <span className="donut-legend-pct">10%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* BOTTOM SPLIT ROW: RECENT INCIDENTS + QUICK ACTIONS */}
            <div className="bottom-split-grid">
              {/* RECENT INCIDENTS TABLE */}
              <div className="panel-surface incidents-table-card">
                <div className="table-header-row">
                  <h3>Recent Incidents</h3>
                  <button className="view-all-link" onClick={() => setPage('mules')}>
                    View All <ArrowRight size={13} />
                  </button>
                </div>

                <div className="clean-table-wrap">
                  <table className="clean-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>#INC-001</strong></td>
                        <td>Phishing</td>
                        <td>Fake bank login page detected</td>
                        <td><span className="status-pill open">• Open</span></td>
                        <td>2 Oct, 02:15 PM</td>
                      </tr>
                      <tr>
                        <td><strong>#INC-002</strong></td>
                        <td>Financial Fraud</td>
                        <td>UPI fraud complaint (PYTM10007595)</td>
                        <td><span className="status-pill progress">• In Progress</span></td>
                        <td>2 Oct, 11:42 AM</td>
                      </tr>
                      <tr>
                        <td><strong>#INC-003</strong></td>
                        <td>Identity Theft</td>
                        <td>Suspicious KYC activity</td>
                        <td><span className="status-pill review">• Under Review</span></td>
                        <td>2 Oct, 10:21 AM</td>
                      </tr>
                      <tr>
                        <td><strong>#INC-004</strong></td>
                        <td>Malware</td>
                        <td>Malicious APK detected</td>
                        <td><span className="status-pill resolved">• Resolved</span></td>
                        <td>1 Oct, 06:30 PM</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* QUICK ACTIONS GRID */}
              <div className="panel-surface quick-actions-card">
                <h3>Quick Actions</h3>
                <div className="quick-actions-grid">
                  <button className="quick-action-tile" onClick={() => setPage('investigation')}>
                    <div className="quick-action-icon">
                      <Search size={18} />
                    </div>
                    <div className="quick-action-text">
                      <strong>New Investigation</strong>
                      <span>Create a new case</span>
                    </div>
                  </button>

                  <button className="quick-action-tile" onClick={() => setPage('investigation')}>
                    <div className="quick-action-icon">
                      <Network size={18} />
                    </div>
                    <div className="quick-action-text">
                      <strong>Run Link Analysis</strong>
                      <span>Find connections</span>
                    </div>
                  </button>

                  <button className="quick-action-tile" onClick={() => setPage('evidence')}>
                    <div className="quick-action-icon">
                      <FileCheck2 size={18} />
                    </div>
                    <div className="quick-action-text">
                      <strong>Generate Report</strong>
                      <span>Create detailed report</span>
                    </div>
                  </button>

                  <button className="quick-action-tile" onClick={() => setPage('users')}>
                    <div className="quick-action-icon">
                      <Users size={18} />
                    </div>
                    <div className="quick-action-text">
                      <strong>Manage Users</strong>
                      <span>Control access & roles</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 4. INVESTIGATION & KNOWLEDGE GRAPH PAGE */}
        {(page === 'investigation' || page === 'incidents') && (
          <section className="page-stack">
            <div className="workspace-toolbar panel-surface">
              <div className="toolbar-title">
                <Network size={20} />
                <div>
                  <strong>BFS Money-Flow Graph Canvas</strong>
                  <span>
                    {inv
                      ? `${filteredNodes.length} visible nodes (${inv.node_count} total) · ${visibleEdges.length} transfers`
                      : 'Enter a victim account in the top search bar to trace the 4-hop money flow'}
                  </span>
                </div>
              </div>

              {inv && (
                <div className="graph-filter-tabs">
                  <button
                    className={`filter-tab ${filterMode === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterMode('all')}
                  >
                    All ({inv.nodes.length})
                  </button>
                  <button
                    className={`filter-tab ${filterMode === 'critical' ? 'active' : ''}`}
                    onClick={() => setFilterMode('critical')}
                  >
                    Critical (≥75)
                  </button>
                  <button
                    className={`filter-tab ${filterMode === 'high' ? 'active' : ''}`}
                    onClick={() => setFilterMode('high')}
                  >
                    High (≥50)
                  </button>
                  <button
                    className={`filter-tab ${filterMode === 'l1' ? 'active' : ''}`}
                    onClick={() => setFilterMode('l1')}
                  >
                    Layer 1
                  </button>
                  <button
                    className={`filter-tab ${filterMode === 'l2' ? 'active' : ''}`}
                    onClick={() => setFilterMode('l2')}
                  >
                    Layer 2
                  </button>
                  <button
                    className={`filter-tab ${filterMode === 'l3' ? 'active' : ''}`}
                    onClick={() => setFilterMode('l3')}
                  >
                    Layer 3
                  </button>
                </div>
              )}

              <div className="toolbar-actions">
                <button
                  className="ghost-button"
                  onClick={() => setShowFreezeModal(true)}
                  disabled={!inv}
                >
                  <Eye size={14} /> Notice Preview
                </button>
                <button className="ghost-button" onClick={exportTransactions} disabled={!inv}>
                  <Download size={14} /> Subgraph CSV
                </button>
                <button
                  className="primary-button compact"
                  onClick={() => runTrace()}
                  disabled={!traceAccount || loading}
                >
                  <Play size={14} /> Re-run BFS
                </button>
              </div>
            </div>

            <div className="investigation-grid">
              <section className="panel-surface graph-panel">
                <div className="panel-heading">
                  <div>
                    <span className="overline">TRAIL TOPOLOGY</span>
                    <h3>{inv ? `Victim Account: ${shortAccount(inv.victim_account)}` : 'No investigation loaded'}</h3>
                  </div>
                  {inv && (
                    <div className="mini-stats">
                      <span>{money(totalTraced)} total traced</span>
                      <span>{inv.elapsed_seconds.toFixed(3)}s BFS query</span>
                    </div>
                  )}
                </div>

                {inv ? (
                  <GraphView
                    nodes={filteredNodes}
                    edges={visibleEdges}
                    selectedId={selectedNode?.id}
                    onSelect={setSelectedNode}
                  />
                ) : (
                  <div className="graph-empty">
                    <Network size={34} color="#10b981" />
                    <strong>Trace an investigation</strong>
                    <span>Search any account ID (e.g. PYTM10007595) to reconstruct the multi-tier money trail.</span>
                  </div>
                )}

                <div className="graph-legend">
                  <span className="isolation-chip">
                    {isolationId ? `ISOLATED • ${shortAccount(isolationId)}` : 'FULL 4-HOP TOPOLOGY'}
                  </span>
                  <Legend color="#0ea5e9" label="Victim Source" />
                  <Legend color="#8b5cf6" label="Layer 1 Collector" />
                  <Legend color="#f59e0b" label="Layer 2 Distributor" />
                  <Legend color="#ef4444" label="Layer 3 Terminal Cash-Out" />
                </div>
              </section>

              <aside className="panel-surface intelligence-panel">
                <div className="panel-heading">
                  <div>
                    <span className="overline">NODE FORENSICS</span>
                    <h3>{selectedNode ? shortAccount(selectedNode.account) : 'Select a node'}</h3>
                  </div>
                  <Fingerprint size={17} color="#64748b" />
                </div>
                {selectedNode ? (
                  <NodeInspector
                    node={selectedNode}
                    onIsolate={() => setIsolationId(selectedNode.id)}
                    isolated={isolationId === selectedNode.id}
                    onResetIsolation={() => setIsolationId(null)}
                  />
                ) : (
                  <div className="inspector-empty">
                    <SlidersHorizontal size={26} color="#94a3b8" />
                    <p>Click any node or transfer edge in the graph canvas to inspect explainable risk signals, pass-through velocity, and counterparty statistics.</p>
                  </div>
                )}
              </aside>
            </div>

            {inv && (
              <section className="panel-surface table-section">
                <div className="section-head">
                  <div>
                    <span className="overline">TRANSACTION LEDGER</span>
                    <h3>Verified Evidence Trail ({visibleEdges.length} Transactions)</h3>
                  </div>
                  <span className="count-badge">DuckDB Ground Truth</span>
                </div>
                <TransactionTable edges={visibleEdges.slice(0, 300)} />
              </section>
            )}
          </section>
        )}

        {/* 5. MULE RING INTELLIGENCE */}
        {(page === 'mules' || page === 'analytics') && (
          <section className="page-stack">
            <div className="page-intro panel-surface">
              <div>
                <h2>Mule Account Intelligence Leaderboard</h2>
                <p>
                  Screened using 5 explainable parameters: Pass-Through Velocity (≥90% in 3–15m), Fan-in (≥4 senders),
                  Fan-out (3–7 split dispersal), Terminal Narration Markers, and Foreign Proxy / Script device fingerprints.
                </p>
              </div>
              <div className="intro-stat">
                <strong>0–100</strong>
                <span>Explainable Risk Index</span>
              </div>
            </div>

            <div className="metrics-four-grid">
              <div className="stat-metric-card">
                <div>
                  <div className="stat-icon-square red">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="stat-details">
                    <span>Critical Risk (≥75)</span>
                    <strong>{mules.filter((m) => m.risk_score >= 75).length}</strong>
                    <div className="stat-trend">Immediate freeze action</div>
                  </div>
                </div>
              </div>

              <div className="stat-metric-card">
                <div>
                  <div className="stat-icon-square green">
                    <Target size={20} />
                  </div>
                  <div className="stat-details">
                    <span>High Risk (≥50)</span>
                    <strong>{mules.filter((m) => m.risk_score >= 50).length}</strong>
                    <div className="stat-trend">Distributor smurfing ring</div>
                  </div>
                </div>
              </div>

              <div className="stat-metric-card">
                <div>
                  <div className="stat-icon-square purple">
                    <BarChart3 size={20} />
                  </div>
                  <div className="stat-details">
                    <span>Active Signals</span>
                    <strong>{mules.reduce((n, m) => n + m.signals.length, 0)}</strong>
                    <div className="stat-trend">Heuristic trigger hits</div>
                  </div>
                </div>
              </div>

              <div className="stat-metric-card">
                <div>
                  <div className="stat-icon-square blue">
                    <Zap size={20} />
                  </div>
                  <div className="stat-details">
                    <span>Scoring Mode</span>
                    <strong>VECTORIZED</strong>
                    <div className="stat-trend">Sub-second batch scoring</div>
                  </div>
                </div>
              </div>
            </div>

            <section className="panel-surface table-section">
              <div className="section-head">
                <div>
                  <h3>Detected Suspect Mule Accounts</h3>
                </div>
                <button className="ghost-button" onClick={() => getTopMules(30).then(setMules)}>
                  Refresh List <Activity size={14} />
                </button>
              </div>
              <div className="clean-table-wrap">
                <table className="clean-table">
                  <thead>
                    <tr>
                      <th>Account Number</th>
                      <th>Tier</th>
                      <th>Risk Index & Formula</th>
                      <th>Triggered Signals</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mules.map((m) => (
                      <tr key={m.account} onClick={() => loadAccount(m.account)} style={{ cursor: 'pointer' }}>
                        <td>
                          <strong>{m.account}</strong>
                          <div style={{ fontSize: 9, color: '#64748b' }}>
                            {money(m.stats?.total_inflow)} in · {money(m.stats?.total_outflow)} out
                          </div>
                        </td>
                        <td><span className="mode-tag">Layer {m.layer || '1'}</span></td>
                        <td>
                          <strong style={{ color: m.risk_score >= 75 ? '#ef4444' : '#f59e0b', fontSize: 13 }}>
                            {m.risk_score} / 100
                          </strong>
                          <div style={{ fontSize: 9, color: '#64748b' }}>{m.formula || riskLabel(m.risk_score)}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {m.signals.slice(0, 3).map((s) => (
                              <span key={s.name} className="status-pill review">
                                {s.name.replaceAll('_', ' ')}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <button className="ghost-button compact" onClick={() => runTrace(m.account)}>
                            Trace Flow <ArrowRight size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        )}

        {/* 6. TEMPORAL ANALYSIS */}
        {page === 'timeline' && (
          <section className="page-stack">
            <div className="page-intro panel-surface">
              <div>
                <h2>Temporal Pass-Through Playback Timeline</h2>
                <p>
                  Scrub through transaction history minute-by-minute to analyze pass-through velocities and rapid split transfers.
                </p>
              </div>
              {timeline.length > 0 && (
                <div className="intro-stat">
                  <strong>{timeline.length}</strong>
                  <span>transfers loaded</span>
                </div>
              )}
            </div>

            <section className="panel-surface chart-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Fingerprint size={18} color="#10b981" />
                  <strong>{account || 'Select an account to scrub timeline'}</strong>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
                  {Math.min(timelineIndex, timeline.length)} / {timeline.length} Transactions
                </div>
              </div>

              <input
                type="range"
                min="0"
                max={timeline.length || 0}
                value={Math.min(timelineIndex, timeline.length)}
                onChange={(e) => setTimelineIndex(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#10b981' }}
              />

              {timeline.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <TransactionTable edges={visibleEdges.slice(0, 150)} />
                </div>
              )}
            </section>
          </section>
        )}

        {/* 7. EVIDENCE & REPORTS */}
        {(page === 'evidence' || page === 'osint' || page === 'users' || page === 'settings') && (
          <section className="page-stack">
            <div className="page-intro panel-surface">
              <div>
                <h2>Court-Ready Legal Documentation</h2>
                <p>
                  Generate official Section 172 CrPC (Sec 192 BNSS) Police Case Diaries and Section 91 CrPC (Sec 94 BNSS) Bank Freeze Requisitions with 100% verified facts directly from DuckDB.
                </p>
              </div>
              <div className="intro-stat">
                <strong>{inv ? inv.investigation_id : 'Active'}</strong>
                <span>Case Reference</span>
              </div>
            </div>

            <div className="evidence-grid">
              <section className="panel-surface report-card">
                <div className="report-icon">
                  <FileText size={22} />
                </div>
                <div>
                  <span className="overline">SECTION 172 CrPC / SEC 192 BNSS</span>
                  <h3>Police Case Diary (CD)</h3>
                  <p>
                    Reconstructs the verified money trail in chronological narrative format with complete transaction IDs, layer breakdown, and forensic risk signals.
                  </p>
                </div>
                <button
                  className="primary-button"
                  disabled={!inv || loading}
                  onClick={() => report('case-diary')}
                >
                  <Download size={14} /> Download PDF
                </button>
              </section>

              <section className="panel-surface report-card">
                <div className="report-icon red">
                  <FileCheck2 size={22} />
                </div>
                <div>
                  <span className="overline">SECTION 91 CrPC / SEC 94 BNSS</span>
                  <h3>Bank Account Freeze Notice</h3>
                  <p>
                    Formal statutory notice directed to Bank Nodal Officers commanding the immediate debit freeze of identified beneficiary mule accounts with exact IFSCs.
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    className="ghost-button"
                    disabled={!inv}
                    onClick={() => setShowFreezeModal(true)}
                  >
                    <Eye size={13} /> Preview Notice
                  </button>
                  <button
                    className="primary-button danger"
                    disabled={!inv || loading}
                    onClick={() => report('freeze-requisition')}
                  >
                    <Download size={14} /> Download PDF
                  </button>
                </div>
              </section>
            </div>

            {inv && (
              <section className="panel-surface table-section">
                <div className="section-head">
                  <div>
                    <span className="overline">EVIDENCE PROVENANCE</span>
                    <h3>Case Graph Snapshot</h3>
                  </div>
                  <button className="ghost-button" onClick={exportEvidence}>
                    <Download size={14} /> Export Evidence JSON
                  </button>
                </div>
                <div className="provenance-grid">
                  <InfoStat label="Victim Source Account" value={inv.victim_account} />
                  <InfoStat
                    label="Direct Outflow Traced"
                    value={money(inv.evidence?.total_direct_outflow_identified)}
                  />
                  <InfoStat label="Beneficiary Accounts Traced" value={String(inv.node_count)} />
                  <InfoStat label="BFS Traversal Latency" value={`${inv.elapsed_seconds.toFixed(3)}s`} />
                </div>
              </section>
            )}
          </section>
        )}
      </main>

      {/* STATUTORY FREEZE NOTICE PREVIEW MODAL */}
      {showFreezeModal && inv && (
        <div className="modal-backdrop" onClick={() => setShowFreezeModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="overline">STATUTORY NOTICE UNDER SEC 91 CrPC / SEC 94 BNSS</span>
                <h3>Bank Account Freeze Requisition Notice</h3>
              </div>
              <button className="icon-circle-btn" onClick={() => setShowFreezeModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div className="notice-banner">
                <ShieldAlert size={18} />
                <span>
                  OFFICIAL DIRECTIVE: Immediate debit freeze and preservation of logs for identified cyber fraud beneficiary accounts.
                </span>
              </div>

              <div className="notice-text-preview">
                <p><strong>TO:</strong> The Nodal Officer / Fraud Risk Management Cell</p>
                <p><strong>CASE REFERENCE:</strong> Cyber Crime PS Indore / Abhedya-Chakra / Case #{inv.investigation_id}</p>
                <p>
                  <strong>SUBJECT:</strong> Urgent Requisition to Freeze Accounts under Section 91 of Code of Criminal Procedure, 1973 (read with Section 94 of Bharatiya Nagarik Suraksha Sanhita, 2023).
                </p>
                <p>
                  During the continuous BFS money-trail investigation of funds originating from victim account{' '}
                  <code>{inv.victim_account}</code>, the following recipient accounts were verified as intermediary money-mule nodes:
                </p>

                <div className="notice-table-wrap">
                  <table className="clean-table">
                    <thead>
                      <tr>
                        <th>Account Number</th>
                        <th>Bank / IFSC</th>
                        <th>Layer</th>
                        <th>Risk Score</th>
                        <th>Traced Inflow</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.nodes
                        .filter((n) => n.hop > 0)
                        .slice(0, 10)
                        .map((n) => (
                          <tr key={n.id}>
                            <td><code>{n.account}</code></td>
                            <td>{n.account.slice(0, 4)} Bank</td>
                            <td><span className="mode-tag">L{n.layer}</span></td>
                            <td>
                              <strong style={{ color: n.risk_score >= 75 ? '#ef4444' : '#f59e0b' }}>
                                {n.risk_score}
                              </strong>
                            </td>
                            <td>{money(n.stats?.total_inflow || 0)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <p className="notice-footer-text">
                  You are hereby requested to put an immediate <strong>DEBIT FREEZE (HOLD)</strong> on the above accounts, preserve IP access logs, and furnish KYC documents within 24 hours.
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="ghost-button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `STATUTORY NOTICE UNDER SEC 91 CrPC\nCase: ${inv.investigation_id}\nVictim: ${inv.victim_account}\nFreeze Beneficiary Accounts: ${inv.nodes.filter(n => n.hop > 0).map(n => n.account).join(', ')}`
                  )
                  setToast('Notice text copied to clipboard!')
                }}
              >
                <Copy size={14} /> Copy Notice Text
              </button>
              <button
                className="primary-button danger"
                onClick={() => {
                  report('freeze-requisition')
                  setShowFreezeModal(false)
                }}
              >
                <Download size={14} /> Download Signed PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="legend-item">
      <i style={{ background: color }} />
      {label}
    </span>
  )
}

function NodeInspector({
  node,
  onIsolate,
  isolated,
  onResetIsolation,
}: {
  node: GraphNode
  onIsolate: () => void
  isolated: boolean
  onResetIsolation: () => void
}) {
  return (
    <div className="node-inspector">
      <div className="node-score">
        <div>
          <span className="overline">EXPLAINABLE RISK INDEX</span>
          <strong>{node.risk_score} <span className="score-total">/ 100</span></strong>
          <small>{riskLabel(node.risk_score)} threat level</small>
        </div>
        <div className="score-orbit">
          <strong style={{ fontSize: 18, color: '#065f46' }}>{node.risk_score}</strong>
        </div>
      </div>

      <div className="formula-card">
        <div className="formula-header">
          <Calculator size={13} />
          <span>MATHEMATICAL POINT SUMMATION</span>
        </div>
        <div className="formula-equation">
          {node.formula || `${node.risk_score} / 100`}
        </div>
      </div>

      <div className="inspector-grid">
        <InfoStat label="Layer Classification" value={node.hop === 0 ? 'Victim Source' : `Layer ${node.layer}`} />
        <InfoStat label="Hop Distance" value={`${node.hop} hops`} />
        <InfoStat label="Total Inflow" value={money(node.stats?.total_inflow)} />
        <InfoStat label="Total Outflow" value={money(node.stats?.total_outflow)} />
        <InfoStat label="Distinct Senders" value={String(node.stats?.unique_senders ?? 0)} />
        <InfoStat label="Distinct Receivers" value={String(node.stats?.unique_receivers ?? 0)} />
      </div>

      <div className="inspector-actions">
        <button className="primary-button compact" onClick={onIsolate}>
          <Network size={13} /> {isolated ? 'Subgraph Isolated' : 'Isolate Subgraph'}
        </button>
        {isolated && (
          <button className="ghost-button" onClick={onResetIsolation}>
            Reset Full Graph
          </button>
        )}
      </div>

      <div className="breakdown-box">
        <span className="overline">FACTOR CONTRIBUTIONS (0–100 BREAKDOWN)</span>
        <div className="breakdown-list">
          {node.breakdown && node.breakdown.length > 0 ? (
            node.breakdown.map((item) => (
              <div key={item.factor} className={`breakdown-item ${item.hit ? 'hit' : 'miss'}`}>
                <div className="breakdown-item-head">
                  <span className="factor-name">{item.factor}</span>
                  <span className={`factor-points ${item.hit ? 'pts-hit' : 'pts-miss'}`}>
                    {item.hit ? `+${item.points}` : '+0'} / {item.max_points} pts
                  </span>
                </div>
                <div className="factor-detail">{item.detail}</div>
              </div>
            ))
          ) : (
            <div className="factor-detail">Originating victim account — baseline 0 risk points.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-stat">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  )
}

function TransactionTable({ edges }: { edges: GraphEdge[] }) {
  if (!edges.length)
    return (
      <div className="empty-state">
        <Activity size={20} />
        <span>No transactions match the current filter.</span>
      </div>
    )

  return (
    <div className="data-table-wrap">
      <table className="clean-table">
        <thead>
          <tr>
            <th>Txn Reference</th>
            <th>Sender Account</th>
            <th>Receiver Account</th>
            <th>Amount (INR)</th>
            <th>Timestamp</th>
            <th>Payment Mode</th>
            <th>Receiver IFSC</th>
          </tr>
        </thead>
        <tbody>
          {edges.map((e) => (
            <tr key={e.transaction_id}>
              <td>
                <code>{e.transaction_id}</code>
              </td>
              <td>{shortAccount(e.sender_account)}</td>
              <td>{shortAccount(e.receiver_account)}</td>
              <td className="amount-cell">{money(e.amount)}</td>
              <td>{String(e.timestamp).replace('T', ' ').slice(0, 19)}</td>
              <td>
                <span className="mode-tag">{e.payment_mode}</span>
              </td>
              <td>{e.receiver_ifsc || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
