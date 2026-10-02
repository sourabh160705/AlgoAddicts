import axios from 'axios'
import type { AccountSummary, Investigation, MuleAccount, Stats } from '../types/investigation'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api',
  timeout: 30000,
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
