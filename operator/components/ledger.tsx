'use client'

import { useState } from 'react'
import { clock, codeText, money, outcomeTag, relTime, shortAddress } from '@/lib/format'
import type { DashboardState, DecisionRecord } from '@/lib/types'
import { Avatar, ExternalLink, Glyph, Icon, SectionHeader, Tag } from './ui'

const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'paid', label: 'Paid', match: (d: DecisionRecord) => d.outcome === 'cosigned' && d.approvedBy === 'limits' },
  { key: 'approved', label: 'Approved by you', match: (d: DecisionRecord) => d.outcome === 'cosigned' && d.approvedBy === 'operator' },
  { key: 'refused', label: 'Refused', match: (d: DecisionRecord) => d.outcome === 'refused' },
  { key: 'failed', label: 'Failed', match: (d: DecisionRecord) => d.outcome === 'failed' },
] as const

function Detail({ d }: { d: DecisionRecord }) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-3 bg-sunken px-6 py-4 text-[13px] sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="label">Reason</p>
        <p className="mt-1 text-ink">{d.reason}</p>
      </div>
      <div>
        <p className="label">Payment id</p>
        <p className="mt-1 break-all font-mono text-[12px] font-light text-ink">{d.paymentId}</p>
      </div>
      <div>
        <p className="label">Destination</p>
        <p className="mt-1 break-all font-mono text-[12px] font-light text-ink">{d.destination}</p>
      </div>
      <div>
        <p className="label">Decision code</p>
        <p className="mt-1 font-mono text-[12px] font-light text-ink">{d.code}</p>
      </div>
      <div>
        <p className="label">Ledger</p>
        <p className="mt-1 text-ink">
          {d.txHash && d.explorerUrl ? (
            <ExternalLink href={d.explorerUrl} className="font-mono text-[12px] font-light">{`${d.ledgerResult ?? ''} · ${d.txHash.slice(0, 10)}…`}</ExternalLink>
          ) : (
            'Never reached the ledger: no second signature'
          )}
        </p>
      </div>
    </div>
  )
}

export function Ledger({ state, now }: { state: DashboardState; now: number }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [limit, setLimit] = useState(20)
  const { decisions, view } = state
  const f = FILTERS.find((x) => x.key === filter)!
  const rows = decisions.filter(f.match)

  return (
    <section>
      <SectionHeader
        id="ledger"
        index="06"
        eyebrow="Ledger"
        title="Every request, refusals included"
        lead="The limits service logs each request the agent makes before anything reaches the XRP Ledger. Paid rows link to the transaction."
        right={
          <a href="/api/ledger.csv" className="inline-flex items-center gap-2 rounded-[6px] border border-line bg-surface px-4 py-2.5 text-[14px] font-normal hover:border-line-strong">
            <Icon name="download" /> Download CSV
          </a>
        }
      />
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1" role="tablist">
        {FILTERS.map((x) => {
          const count = decisions.filter(x.match).length
          const active = x.key === filter
          return (
            <button
              key={x.key}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(x.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-normal transition-colors ${active ? 'bg-ink text-canvas' : 'text-muted hover:bg-sunken hover:text-ink'}`}
            >
              {x.label} <span className={`num ${active ? 'opacity-70' : 'text-faint'}`}>{count}</span>
            </button>
          )
        })}
      </div>
      <div className="overflow-hidden rounded-[16px] border border-line bg-surface">
        {rows.length ? (
          <ul>
            {rows.slice(0, limit).map((d) => {
              const payee = d.payeeId ? view.policy.payees[d.payeeId] : undefined
              const tag = outcomeTag(d.outcome, d.approvedBy)
              const t = codeText(d.code)
              const headline = d.outcome === 'failed' ? `Ledger rejected it (${d.ledgerResult ?? 'error'})` : t.title
              const isOpen = open === d.id
              return (
                <li key={d.id} className="border-b border-line last:border-0">
                  <button
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-6 py-4 text-left hover:bg-sunken/60 sm:grid-cols-[140px_1.2fr_120px_1.6fr_16px]"
                    onClick={() => setOpen(isOpen ? null : d.id)}
                    aria-expanded={isOpen}
                  >
                    <div className="hidden sm:block">
                      <p className="text-[14px] leading-5 text-ink">{clock(d.at, view.policy.timezone)}</p>
                      <p className="text-[12px] leading-[18px] text-muted">{relTime(d.at, now)}</p>
                    </div>
                    <div className="flex min-w-0 items-center gap-3">
                      {payee ? <Avatar id={payee.id} name={payee.name} size={32} /> : <Glyph seed={d.destination} size={32} />}
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-normal leading-5 text-ink">{payee?.name ?? 'Unknown address'}</p>
                        <p className="truncate text-[12px] leading-[18px] text-muted">{payee ? `${payee.city}` : shortAddress(d.destination)}<span className="sm:hidden"> · {relTime(d.at, now)}</span></p>
                      </div>
                    </div>
                    <p className="num text-right text-[15px] text-ink">{money(d.cents)}</p>
                    <div className="col-span-2 flex min-w-0 items-center gap-2.5 sm:col-span-1">
                      <Tag tone={tag.tone}>{tag.label}</Tag>
                      <span className="truncate text-[13px] text-muted">{headline}</span>
                    </div>
                    <Icon name="chevron" size={14} className={`hidden text-faint transition-transform sm:block ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {isOpen ? <Detail d={d} /> : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-6 py-10 text-center text-[15px] text-muted">No {f.key === 'all' ? '' : `${f.label.toLowerCase()} `}requests yet.</p>
        )}
      </div>
      {rows.length > limit ? (
        <button onClick={() => setLimit(limit + 20)} className="mt-4 text-[14px] text-muted underline underline-offset-4 hover:text-ink">
          Show {Math.min(20, rows.length - limit)} more of {rows.length - limit}
        </button>
      ) : null}
    </section>
  )
}
