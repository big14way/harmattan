/**
 * Money is held as integer cents everywhere in Harmattan's policy code, and converted to the
 * ledger's decimal string only at the edge. This avoids float drift in budget arithmetic.
 */
export function toCents(value: string | number): number {
  const s = typeof value === 'number' ? value.toFixed(2) : value.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Invalid amount "${value}": use up to 2 decimals`)
  const [whole, frac = ''] = s.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

export function fromCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Invalid cents ${cents}`)
  const whole = Math.floor(cents / 100)
  const frac = cents % 100
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`
}

export function formatMoney(cents: number, symbol = 'RLUSD'): string {
  const whole = Math.floor(cents / 100).toLocaleString('en-US')
  return `${whole}.${String(cents % 100).padStart(2, '0')} ${symbol}`
}
