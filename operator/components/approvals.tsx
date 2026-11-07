'use client'

import { useState } from 'react'
import { clock, COUNTRY, money, relTime, shortAddress } from '@/lib/format'
import type { Approval, DashboardState } from '@/lib/types'
import { api, type Actions } from './dashboard'
import { Avatar, Button, ExternalLink, Glyph, Icon, SectionHeader, Tag, ToneIcon } from './ui'

interface ApproveResponse {
  status: 'paid' | 'failed'
  tx: { hash: string; result: string; explorerUrl: string }
}

function ApprovalCard({ a, state, now, actions }: { a: Approval; state: DashboardState; now: number; actions: Actions }) {
  const [confirmReject, setConfirmReject] = useState(false)
  const [working, setWorking] = useState<'approve' | 'reject' | null>(null)
  const payee = a.payeeId ? state.view.policy.payees[a.payeeId] : undefined
  const name = payee?.name ?? 'Unknown address'
  const operatorAddr = state.view.signers.operator

  const checks: Array<{ tone: 'good' | 'warn'; text: string }> = [
    { tone: 'good', text: payee ? `${payee.name} is on your payee list` : 'Address checked against your payee list' },
    { tone: 'good', text: "Signed by the agent's own key" },
    { tone: 'good', text: 'Not paid before' },
    { tone: 'warn', text: a.reason.replace(/; an operator must approve it$/, '') },
  ]

  async function approve() {
    setWorking('approve')
    await actions.run(async () => {
      const r = await api<ApproveResponse>(`/api/approvals/${a.id}`, 'POST', { action: 'approve' })
      return { tone: 'good', text: `Paid ${money(a.cents)} to ${name}. Signed with your key and validated on the ledger.`, href: r.tx.explorerUrl }
    })
    setWorking(null)
  }

  async function reject() {
    setWorking('reject')
    await actions.run(async () => {
      await api(`/api/approvals/${a.id}`, 'POST', { action: 'reject', note: 'Rejected in the operator console' })
      return { tone: 'good', text: `Rejected ${money(a.cents)} to ${name}. Nothing was sent.` }
    })
    setWorking(null)
    setConfirmReject(false)
  }

  return (
    <article className="flex flex-col rounded-[16px] border border-line bg-surface shadow-card">
      <div className="flex items-start justify-between gap-4 p-6 pb-5">
        <div className="flex min-w-0 items-center gap-3">
          {payee ? <Avatar id={payee.id} name={payee.name} size={44} /> : <Glyph seed={a.destination} size={44} />}
          <div className="min-w-0">
            <p className="truncate text-[17px] font-normal leading-6 text-ink">{name}</p>
            <p className="truncate text-[13px] leading-5 text-muted">{payee ? `${payee.city}, ${COUNTRY[payee.country] ?? payee.country}` : shortAddress(a.destination)}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="num text-[30px] font-light leading-8 tracking-[-0.02em] text-ink">{money(a.cents, { symbol: false })}</p>
          <p className="label mt-1">RLUSD</p>
        </div>
      </div>

      {a.memo ? <p className="mx-6 mb-5 border-l-2 border-line-strong pl-3 text-[15px] leading-[22px] text-ink">“{a.memo}”</p> : null}

      <div className="mx-6 border-t border-line pt-4">
        <p className="label mb-3">Checks</p>
        <ul className="flex flex-col gap-2.5">
          {checks.map((c) => (
            <li key={c.text} className="flex items-start gap-2.5 text-[14px] leading-5 text-ink">
              <ToneIcon tone={c.tone} />
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto px-6 pb-6 pt-6">
        {a.lastError ? <p className="mb-3 rounded-[8px] bg-bad-bg px-3 py-2 text-[13px] text-bad">Last attempt failed: {a.lastError}</p> : null}
        {confirmReject ? (
          <div className="flex flex-col gap-3 rounded-[10px] bg-sunken p-4">
            <p className="text-[14px] leading-5 text-ink">
              Reject {money(a.cents)} to {name}? Nothing is sent, and the request is closed as rejected.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" size="sm" onClick={reject} disabled={actions.busy}>
                {working === 'reject' ? 'Rejecting…' : 'Yes, reject'}
              </Button>
              <Button size="sm" onClick={() => setConfirmReject(false)} disabled={actions.busy}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" className="flex-1" onClick={approve} disabled={actions.busy}>
              <Icon name="key" />
              {working === 'approve' ? 'Signing with your key…' : `Approve and pay ${money(a.cents)}`}
            </Button>
            <Button onClick={() => setConfirmReject(true)} disabled={actions.busy}>
              Reject
            </Button>
          </div>
        )}
        <p className="mt-4 text-[12px] leading-[18px] text-muted">
          Requested {relTime(a.requestedAt, now)} · {clock(a.requestedAt, state.view.policy.timezone)}. Your key {shortAddress(operatorAddr)} signs alone (weight 2 of 2);
          the limits service checks it is exactly this payment before submitting.
        </p>
      </div>
    </article>
  )
}

export function Approvals({ state, now, actions }: { state: DashboardState; now: number; actions: Actions }) {
  const pending = state.approvals.filter((a) => a.status === 'pending')
  const resolved = state.approvals.filter((a) => a.status !== 'pending').slice(0, 4)
  return (
    <section>
      <SectionHeader
        id="approvals"
        index="01"
        eyebrow="Approvals"
        title={pending.length ? 'Waiting for your signature' : 'Nothing waiting for you'}
        lead="Payments above the per-payment cap, a payee's monthly limit or today's budget stop here. The agent cannot complete them; only your key can."
      />
      {pending.length ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {pending.map((a) => (
            <ApprovalCard key={a.id} a={a} state={state} now={now} actions={actions} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-[16px] border border-dashed border-line-strong px-6 py-10 sm:items-center sm:text-center">
          <Icon name="shield" size={22} className="text-muted" />
          <p className="text-[16px] text-ink">The agent has nothing above your limits right now.</p>
          <p className="max-w-md text-[14px] leading-5 text-muted">When it asks for more than the cap, a payee&apos;s monthly limit or what is left of today&apos;s budget, the request lands here with the reason.</p>
        </div>
      )}
      {resolved.length ? (
        <div className="mt-8">
          <p className="label mb-3">Recently resolved</p>
          <ul className="divide-y divide-line border-y border-line">
            {resolved.map((a) => {
              const payee = a.payeeId ? state.view.policy.payees[a.payeeId] : undefined
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-[14px]">
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {money(a.cents)} to {payee?.name ?? shortAddress(a.destination)}
                    <span className="text-muted"> · {a.memo || a.paymentId}</span>
                  </span>
                  <span className="text-[13px] text-muted">{a.resolvedAt ? relTime(a.resolvedAt, now) : ''}</span>
                  {a.status === 'approved' ? <Tag tone="good">Approved</Tag> : <Tag tone="neutral">Rejected</Tag>}
                  {a.explorerUrl ? (
                    <ExternalLink href={a.explorerUrl} className="text-[13px] text-muted">
                      Ledger
                    </ExternalLink>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
