import { operator } from '@/lib/state'

export const dynamic = 'force-dynamic'

const COLUMNS = ['at', 'day', 'paymentId', 'payeeId', 'destination', 'amount', 'outcome', 'code', 'approvedBy', 'reason', 'txHash', 'ledgerResult', 'explorerUrl'] as const

function cell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v)
  // Quote everything and neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

/** Every request the limits service decided, refusals included, oldest first. */
export async function GET() {
  const rows = (await operator().decisions(500)).reverse()
  const lines = [
    COLUMNS.join(','),
    ...rows.map((r) => COLUMNS.map((c) => cell(c === 'amount' ? (r.cents / 100).toFixed(2) : r[c])).join(',')),
  ]
  const day = new Date().toISOString().slice(0, 10)
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="harmattan-ledger-${day}.csv"`,
    },
  })
}
