import type { Metadata } from 'next'
import { isValidClassicAddress } from 'xrpl'
import { network, readDeployment, rlusdBalance, rlusdReceived, toCents } from '../../../../ledger/src/index.ts'
import { AutoRefresh } from '@/components/auto-refresh'
import { Avatar, ExternalLink, Glyph, Logo } from '@/components/ui'
import { clock, COUNTRY, money, shortAddress } from '@/lib/format'
import { operator } from '@/lib/state'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your payments · Harmattan', robots: { index: false } }

/** A testnet read can fail on a busy public node; try again before telling the payee it failed. */
async function withRetry<T>(what: string, fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= tries) {
        console.warn(`[payee page] ${what} failed after ${tries} tries: ${(err as Error).message}`)
        throw err
      }
      await new Promise((r) => setTimeout(r, 700 * attempt))
    }
  }
}

/**
 * Public payee view: balance and payments received from the treasury, read from the XRP Ledger.
 * Shows nothing about other payees or the operator's policy.
 */
export default async function PayeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const treasury = readDeployment().accounts.treasury!
  const { policy } = await operator().view()
  const payee = policy.payees[id] ?? Object.values(policy.payees).find((p) => p.address === id)
  const address = payee?.address ?? (isValidClassicAddress(id) ? id : null)
  const company = process.env.HARMATTAN_COMPANY_NAME ?? 'your client'

  if (!address) {
    return (
      <main className="mx-auto max-w-[640px] px-4 pt-24">
        <p className="eyebrow">Harmattan</p>
        <h1 className="mt-4 text-[34px] font-light tracking-[-0.025em]">No payee here.</h1>
      </main>
    )
  }

  const [balanceRead, receivedRead] = await Promise.allSettled([
    withRetry('balance read', () => rlusdBalance(address)),
    withRetry('payment history read', () => rlusdReceived(address, { from: treasury })),
  ])
  const balance = balanceRead.status === 'fulfilled' ? balanceRead.value : null
  const received = receivedRead.status === 'fulfilled' ? receivedRead.value : []
  const historyFailed = receivedRead.status === 'rejected'
  const total = received.reduce((s, r) => s + r.cents, 0)
  const tz = policy.timezone

  return (
    <div className="min-h-screen">
      <AutoRefresh seconds={6} />
      <header className="border-b border-line">
        <div className="mx-auto flex h-[60px] max-w-[640px] items-center justify-between gap-2.5 px-4">
          <span className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[18px] font-normal tracking-[-0.02em]">Harmattan</span>
          </span>
          <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">XRPL {network().name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-[640px] px-4 pb-20 pt-10">
        <div className="flex items-center gap-3">
          {payee ? <Avatar id={payee.id} name={payee.name} size={48} /> : <Glyph seed={address} size={48} />}
          <div>
            <p className="text-[18px] font-normal leading-6">{payee?.name ?? shortAddress(address)}</p>
            <p className="text-[13px] text-muted">{payee ? [payee.city, COUNTRY[payee.country] ?? payee.country].filter(Boolean).join(', ') : 'XRPL wallet'}</p>
          </div>
        </div>

        <p className="label mt-10">In your wallet</p>
        <p className="num mt-2 text-[56px] font-light leading-[1] tracking-[-0.03em]">
          {balance === null ? '—' : money(toCents(Number(balance).toFixed(2)), { symbol: false })}
          <span className="ml-2 align-middle font-mono text-[14px] font-light tracking-[0.12em] text-muted">RLUSD</span>
        </p>
        <p className="mt-3 text-[14px] text-muted">
          {historyFailed
            ? 'Couldn’t reach the XRP Ledger just now. This page tries again every few seconds.'
            : received.length
              ? `${money(total)} received from ${company} in ${received.length} payment${received.length > 1 ? 's' : ''}.`
              : `No payments from ${company} yet.`}{' '}
          <ExternalLink href={`${network().explorer}/accounts/${address}`} className="text-muted">
            {shortAddress(address)}
          </ExternalLink>
        </p>
        {payee?.pendingConfirmation ? (
          <p className="mt-4 rounded-[8px] bg-warn-bg px-4 py-3 text-[14px] text-warn">Your address is waiting for {company} to confirm it. Payments start after that.</p>
        ) : null}

        <p className="label mb-3 mt-10">Payments</p>
        {received.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {received.map((r) => (
              <li key={r.hash} className="flex items-start justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] leading-5 text-ink">{r.note || 'Payment'}</p>
                  <p className="mt-1 text-[12px] leading-[18px] text-muted">
                    {r.at ? clock(r.at, tz) : ''} ·{' '}
                    <ExternalLink href={r.explorerUrl} className="text-muted">
                      receipt on the ledger
                    </ExternalLink>
                  </p>
                </div>
                <p className="num shrink-0 text-[16px] text-good">+{money(r.cents, { symbol: false })}</p>
              </li>
            ))}
          </ul>
        ) : historyFailed ? (
          <p className="rounded-[12px] bg-warn-bg px-4 py-8 text-center text-[14px] text-warn">Couldn’t read your payments from the ledger just now. Trying again.</p>
        ) : (
          <p className="rounded-[12px] border border-dashed border-line-strong px-4 py-8 text-center text-[14px] text-muted">Payments will appear here as they land on the ledger.</p>
        )}
        <p className="mt-10 text-[12px] leading-[18px] text-faint">Read live from the XRP Ledger {network().name}. Harmattan never holds your funds: RLUSD goes straight to your wallet.</p>
      </main>
    </div>
  )
}
