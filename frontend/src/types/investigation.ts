export interface RiskBreakdownItem {
  factor: string
  points: number
  max_points: number
  hit: boolean
  detail: string
}

export interface GraphNode {
  id: string
  account: string
  hop: number
  layer: number
  risk_score: number
  formula?: string
  breakdown?: RiskBreakdownItem[]
  signals: Array<{ name: string; detail: unknown }>
  stats?: {
    total_inflow?: number
    total_outflow?: number
    inbound_txns?: number
    outbound_txns?: number
    unique_senders?: number
    unique_receivers?: number
  }
}

export interface GraphEdge {
  transaction_id: string
  sender_account: string
  receiver_account: string
  amount: number
  timestamp: string
  payment_mode: string
  sender_ifsc?: string
  receiver_ifsc?: string
}

export interface Evidence {
  victim_account: string
  total_direct_outflow_identified: number
  layers: Array<{
    account: string
    hop: number
    layer: number
    risk_score: number
    formula?: string
    breakdown?: RiskBreakdownItem[]
    signals: Array<{ name: string; detail: unknown }>
  }>
  transactions: GraphEdge[]
  source: string
}

export interface CaseNarrative {
  victim_account: string
  narrative_text: string
  executive_summary: string
  duration_str: string
  total_defrauded: number
  total_terminal_cashout: number
  top_mule_account?: string
  top_mule_risk?: number
  hop_count: number
  total_nodes: number
  total_edges: number
  red_flags: string[]
  recommendations: Array<{
    statute: string
    action: string
    target: string
    urgency: string
  }>
  generated_at: string
}

export interface Investigation {
  investigation_id: string
  victim_account: string
  max_hops: number
  node_count: number
  edge_count: number
  elapsed_seconds: number
  nodes: GraphNode[]
  edges: GraphEdge[]
  evidence?: Evidence
  narrative?: CaseNarrative
}

export interface Stats {
  loaded: boolean
  rows?: number
  accounts?: number
  min_timestamp?: string
  max_timestamp?: string
  source_file?: string
}

export interface AccountSummary {
  account: string
  total_inflow: number
  total_outflow: number
  inbound_txns: number
  outbound_txns: number
  unique_senders: number
  unique_receivers: number
}

export interface MuleAccount {
  account: string
  risk_score: number
  layer: number
  formula?: string
  breakdown?: RiskBreakdownItem[]
  signals: Array<{ name: string; detail: unknown }>
  stats?: AccountSummary
}
