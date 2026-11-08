import { rippleTimeToISOTime } from 'xrpl'
import { getClient } from './client.ts'
import { stablecoin } from './config.ts'
import { txUrl } from './explorer.ts'
import { toCents } from './money.ts'

export interface ReceivedPayment {
  hash: string
  at: string
  cents: number
  from: string
  paymentId: string | null
  note: string
  explorerUrl: string
}

interface RawEntry {
  hash?: string
  close_time_iso?: string
  tx_json?: Record<string, unknown>
  tx?: Record<string, unknown>
  meta?: { TransactionResult?: string; delivered_amount?: unknown } | string
}

function memo(tx: Record<string, unknown>): { id: string | null; note: string } {
  const data = (tx.Memos as Array<{ Memo?: { MemoData?: string } }> | undefined)?.[0]?.Memo?.MemoData
  if (!data) return { id: null, note: '' }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'hex').toString('utf8')) as { id?: unknown; note?: unknown }
    return { id: typeof parsed.id === 'string' ? parsed.id : null, note: typeof parsed.note === 'string' ? parsed.note : '' }
  } catch {
    return { id: null, note: '' }
  }
}

/** RLUSD payments an address received, read from the ledger itself (newest first). */
export async function rlusdReceived(address: string, opts: { from?: string; limit?: number } = {}): Promise<ReceivedPayment[]> {
  const client = await getClient()
  const asset = stablecoin()
  let entries: RawEntry[]
  try {
    const res = await client.request({ command: 'account_tx', account: address, limit: opts.limit ?? 100 })
    entries = res.result.transactions as unknown as RawEntry[]
  } catch (err) {
    if ((err as { data?: { error?: string } }).data?.error === 'actNotFound') return []
    throw err
  }
  const out: ReceivedPayment[] = []
  for (const e of entries) {
    const tx = e.tx_json ?? e.tx
    if (!tx || tx.TransactionType !== 'Payment' || tx.Destination !== address) continue
    if (opts.from && tx.Account !== opts.from) continue
    const meta = typeof e.meta === 'object' ? e.meta : undefined
    if (meta?.TransactionResult !== 'tesSUCCESS') continue
    const delivered = meta.delivered_amount as { currency?: string; issuer?: string; value?: string } | string | undefined
    if (!delivered || typeof delivered === 'string' || delivered.currency !== asset.currency || delivered.issuer !== asset.issuer) continue
    const hash = e.hash ?? (tx.hash as string)
    const at = e.close_time_iso ?? (typeof tx.date === 'number' ? rippleTimeToISOTime(tx.date) : '')
    const m = memo(tx)
    out.push({ hash, at, cents: toCents(Number(delivered.value).toFixed(2)), from: String(tx.Account), paymentId: m.id, note: m.note, explorerUrl: txUrl(hash) })
  }
  return out
}

export interface SentPayment {
  hash: string
  at: string
  cents: number
  to: string
}

/**
 * RLUSD an address paid to other accounts, read from the ledger (newest first). Its own currency
 * swaps (top-ups: Destination is itself) are left out. Covers the latest `limit` transactions.
 */
export async function rlusdSent(address: string, opts: { limit?: number } = {}): Promise<SentPayment[]> {
  const client = await getClient()
  const asset = stablecoin()
  let entries: RawEntry[]
  try {
    const res = await client.request({ command: 'account_tx', account: address, limit: opts.limit ?? 200, forward: false })
    entries = res.result.transactions as unknown as RawEntry[]
  } catch (err) {
    if ((err as { data?: { error?: string } }).data?.error === 'actNotFound') return []
    throw err
  }
  const out: SentPayment[] = []
  for (const e of entries) {
    const tx = e.tx_json ?? e.tx
    if (!tx || tx.TransactionType !== 'Payment' || tx.Account !== address || tx.Destination === address) continue
    const meta = typeof e.meta === 'object' ? e.meta : undefined
    if (meta?.TransactionResult !== 'tesSUCCESS') continue
    const delivered = meta.delivered_amount as { currency?: string; issuer?: string; value?: string } | string | undefined
    if (!delivered || typeof delivered === 'string' || delivered.currency !== asset.currency || delivered.issuer !== asset.issuer) continue
    const hash = e.hash ?? (tx.hash as string)
    const at = e.close_time_iso ?? (typeof tx.date === 'number' ? rippleTimeToISOTime(tx.date) : '')
    out.push({ hash, at, cents: toCents(Number(delivered.value).toFixed(2)), to: String(tx.Destination) })
  }
  return out
}
