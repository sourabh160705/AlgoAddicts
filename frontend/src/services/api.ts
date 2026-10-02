import axios from 'axios'
import type { AccountSummary, Investigation, MuleAccount, Stats } from '../types/investigation'

// Smart API URL resolution for Vercel / Render deployment & local dev
const rawBase = import.meta.env.VITE_API_BASE_URL || ''
let resolvedBase = '/api'

if (rawBase) {
  const clean = rawBase.replace(/\/+$/, '')
  resolvedBase = clean.endsWith('/api') ? clean : `${clean}/api`
}

export const api = axios.create({
  baseURL: resolvedBase,
  timeout: 45000,
})

export async function getStats(): Promise<Stats> {
  return (await api.get<Stats>('/data/stats')).data
}

export async function getHealth() {
  return (await api.get('/health')).data
}

export async function searchAccounts(q: string, limit = 10): Promise<AccountSummary[]> {
  return (await api.get<AccountSummary[]>('/accounts/search', { params: { q, limit } })).data
}

export async function getAccount(account: string): Promise<AccountSummary> {
  return (await api.get<AccountSummary>(`/accounts/${encodeURIComponent(account)}`)).data
}

export async function getAccountTransactions(account: string, limit = 500) {
  return (await api.get(`/accounts/${encodeURIComponent(account)}/transactions`, { params: { limit } })).data
}

export async function getAccountTimeline(account: string, limit = 1000) {
  return (await api.get(`/accounts/${encodeURIComponent(account)}/timeline`, { params: { limit } })).data
}

export async function getTopMules(limit = 20): Promise<MuleAccount[]> {
  return (await api.get<MuleAccount[]>('/mules/top', { params: { limit } })).data
}

export async function trace(victim_account: string, max_hops = 4): Promise<Investigation> {
  return (await api.post<Investigation>('/investigation/trace', { victim_account, max_hops })).data
}

export async function getInvestigation(id: string): Promise<Investigation> {
  return (await api.get<Investigation>(`/investigation/${id}`)).data
}

export async function createReport(id: string, kind: 'case-diary' | 'freeze-requisition') {
  return (await api.post(`/investigation/${id}/${kind}`)).data
}

export async function downloadReportPdf(id: string, kind: 'case-diary' | 'freeze-requisition') {
  const response = await api.get(`/investigation/${id}/download/${kind}`, {
    responseType: 'blob',
  })
  const filename = kind === 'case-diary' ? `Case_Diary_${id}.pdf` : `Freeze_Requisition_Sec91_${id}.pdf`
  const blob = new Blob([response.data], { type: 'application/pdf' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  a.remove()
  return filename
}
