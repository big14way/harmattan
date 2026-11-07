/** Client-safe formatting and the plain-language map for the limits service's decision codes. */

export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

export function money(cents: number, opts: { symbol?: boolean } = {}): string {
  const s = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return opts.symbol === false ? s : `${s} RLUSD`
}

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

export function relTime(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export function clock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export const COUNTRY: Record<string, string> = { KE: 'Kenya', UG: 'Uganda', ZA: 'South Africa', NG: 'Nigeria', GH: 'Ghana', TZ: 'Tanzania', RW: 'Rwanda' }

interface CodeText {
  title: string
  tone: Tone
}

/** Every code the limits service returns, as the operator should read it. */
export const CODE_TEXT: Record<string, CodeText> = {
  OK: { title: 'Paid inside your limits', tone: 'good' },
  APPROVED_BY_OPERATOR: { title: 'Paid with your approval', tone: 'good' },
  OVER_CAP: { title: 'Above the per-payment cap', tone: 'warn' },
  OVER_DAILY_BUDGET: { title: "Over today's budget", tone: 'warn' },
  OVER_PAYEE_MONTHLY: { title: "Over the payee's monthly limit", tone: 'warn' },
  UNKNOWN_PAYEE: { title: 'Not on your payee list', tone: 'bad' },
  PAYEE_INACTIVE: { title: 'Payee is switched off', tone: 'bad' },
  PAUSED: { title: 'Agent payments were paused', tone: 'neutral' },
  DUPLICATE: { title: 'Already paid', tone: 'neutral' },
  BAD_TX: { title: 'Malformed payment', tone: 'bad' },
  BAD_SIGNATURE: { title: 'Not signed by the agent key', tone: 'bad' },
}

export function codeText(code: string): CodeText {
  return CODE_TEXT[code] ?? { title: code, tone: 'neutral' }
}

/** Short tag for a ledger row: what happened to the money. */
export function outcomeTag(outcome: string, approvedBy: string | null): { label: string; tone: Tone } {
  if (outcome === 'cosigned') return approvedBy === 'operator' ? { label: 'Approved', tone: 'good' } : { label: 'Paid', tone: 'good' }
  if (outcome === 'failed') return { label: 'Failed', tone: 'bad' }
  return { label: 'Refused', tone: 'warn' }
}

export const PAYABLE_STATUS: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  paid: { label: 'Paid', tone: 'good' },
  awaiting_approval: { label: 'Waiting for you', tone: 'warn' },
  refused: { label: 'Refused', tone: 'bad' },
  failed: { label: 'Failed', tone: 'bad' },
}

/** Stable hue per id, for generated avatars. */
export function hueOf(id: string): number {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 360
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() || '?'
}
