'use client'

import type { ReactNode } from 'react'
import { codeText, money, relTime, shortAddress } from '@/lib/format'
import type { DashboardState } from '@/lib/types'
import { ExternalLink, Glyph, SectionHeader, Tag, ToneIcon } from './ui'

function Callout({ label, children, side }: { label: string; children: ReactNode; side: 'left' | 'right' }) {
  return (
    <div className={`hidden lg:flex lg:items-center lg:gap-4 ${side === 'left' ? 'lg:flex-row-reverse lg:text-right' : ''}`}>
      <span className="h-px w-12 shrink-0 bg-line-strong" aria-hidden />
      <div className="max-w-[240px]">
        <p className="eyebrow !text-ink">{label}</p>
        <p className="mt-2 text-[15px] leading-[22px] text-muted">{children}</p>
      </div>
    </div>
  )
}

function Row({ left, right, sub }: { left: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0 text-[14px] leading-5 text-ink">
        {left}
        {sub ? <p className="text-[12px] leading-[18px] text-muted">{sub}</p> : null}
      </div>
      {right ? <div className="shrink-0 font-mono text-[11px] font-light text-muted">{right}</div> : null}
    </div>
  )
}

export function AgentCard({ state, now }: { state: DashboardState; now: number }) {
  const { view, decisions, explorer } = state
  const { policy, signers } = view
  const payeeCount = Object.values(policy.payees).filter((p) => p.active).length
  const recent = decisions.slice(0, 3)
  const nameOf = (id: string | null, dest: string) => (id ? (policy.payees[id]?.name ?? id) : shortAddress(dest))

  return (
    <section>
      <SectionHeader
        id="agent"
        index="03"
        eyebrow="Controls"
        title="What the agent can and cannot do"
        lead="The agent plans and signs payments with its own key. The treasury's signer list on the ledger decides whether that signature is ever enough."
      />
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_400px_1fr]">
        <div className="flex flex-col gap-24">
          <Callout side="left" label="Identity">
            Its own XRPL key, weight 1 of the 2 the treasury needs, so it can never pay alone.
          </Callout>
          <Callout side="left" label="Policy">
            Checked by an independent co-signer before any money moves. The agent can read it, never change it.
          </Callout>
        </div>

        <div className="mx-auto w-full max-w-[400px] rounded-[16px] border border-line bg-surface p-7 shadow-card">
          <div className="flex items-center gap-3">
            <Glyph seed={signers.agent} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-normal leading-6">Treasury agent</p>
              <ExternalLink href={`${explorer}/accounts/${signers.agent}`} className="font-mono text-[11px] font-light text-muted no-underline">
                {shortAddress(signers.agent)}
              </ExternalLink>
            </div>
            {policy.paused ? <Tag tone="warn">Paused</Tag> : <Tag tone="good">Active</Tag>}
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <p className="label mb-2">Policy</p>
            <Row left={<span className="flex items-center gap-2.5"><ToneIcon tone="good" />Up to {money(policy.perPaymentCapCents)} per payment</span>} />
            <Row left={<span className="flex items-center gap-2.5"><ToneIcon tone="good" />{money(policy.dailyBudgetCents)} a day</span>} right={`${money(view.today.spentCents, { symbol: false })} used`} />
            <Row left={<span className="flex items-center gap-2.5"><ToneIcon tone="good" />Per-payee monthly limits</span>} right={`${payeeCount} payees`} />
            <Row left={<span className="flex items-center gap-2.5"><ToneIcon tone="good" />Above any limit: your signature</span>} />
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <p className="label mb-2">Signers on the treasury</p>
            <Row left="Agent" sub={shortAddress(signers.agent)} right="weight 1" />
            <Row left="Limits service" sub={shortAddress(signers.limits)} right="weight 1" />
            <Row left="You, the operator" sub={shortAddress(signers.operator)} right="weight 2" />
            <p className="mt-2 font-mono text-[11px] font-light text-muted">Quorum 2 · enforced by the XRP Ledger</p>
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <p className="label mb-2">Audit trail</p>
            {recent.length ? (
              recent.map((d) => {
                const t = codeText(d.code)
                const tone = d.outcome === 'cosigned' ? 'good' : d.outcome === 'failed' ? 'bad' : t.tone
                return (
                  <Row
                    key={d.id}
                    left={
                      <span className="flex items-center gap-2.5">
                        <ToneIcon tone={tone} />
                        <span className="truncate">{nameOf(d.payeeId, d.destination)}</span>
                      </span>
                    }
                    sub={<span className="pl-[30px]">{d.outcome === 'failed' ? `Ledger rejected · ${money(d.cents)}` : `${t.title} · ${money(d.cents)}`}</span>}
                    right={relTime(d.at, now)}
                  />
                )
              })
            ) : (
              <p className="text-[13px] text-muted">No requests yet.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-24">
          <Callout side="right" label="Approvals">
            Above your limits, only your key can complete a payment. You sign exactly what the agent asked for, nothing else.
          </Callout>
          <Callout side="right" label="Audit trail">
            Every request is logged with its reason, refusals included, and every payment links to the ledger.
          </Callout>
        </div>
      </div>
    </section>
  )
}
