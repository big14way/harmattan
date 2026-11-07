'use client'

import { useState } from 'react'
import { COUNTRY, money, shortAddress } from '@/lib/format'
import type { DashboardState } from '@/lib/types'
import { api, type Actions } from './dashboard'
import { Avatar, Button, ExternalLink, SectionHeader, Tag } from './ui'

type PayeePolicy = DashboardState['view']['policy']['payees'][string]

function MonthlyLimit({ p, spent, actions }: { p: PayeePolicy; spent: number; actions: Actions }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState((p.monthlyLimitCents / 100).toFixed(2))
  const pct = p.monthlyLimitCents ? Math.min(100, (spent / p.monthlyLimitCents) * 100) : 100
  const valid = /^\d{1,9}(\.\d{1,2})?$/.test(value)

  if (editing) {
    return (
      <form
        className="flex items-center justify-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!valid) return
          const ok = await actions.run(async () => {
            await api('/api/policy', 'PUT', { payee: { id: p.id, monthly: value } })
            return { tone: 'good', text: `${p.name}'s monthly limit is now ${money(Math.round(Number(value) * 100))}.` }
          })
          if (ok) setEditing(false)
        }}
      >
        <input
          autoFocus
          aria-label={`Monthly limit for ${p.name}`}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
          className="num w-24 rounded-[6px] border border-line-strong bg-surface px-2 py-1 text-right text-[14px] outline-none focus:border-ink"
        />
        <Button type="submit" size="sm" variant="primary" disabled={!valid || actions.busy}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    )
  }
  return (
    <button className="group flex w-full flex-col items-end gap-1.5 text-right" onClick={() => setEditing(true)} title="Change monthly limit">
      <span className="num whitespace-nowrap text-[15px] text-ink">
        {money(spent, { symbol: false })} <span className="text-muted">/ {money(p.monthlyLimitCents, { symbol: false })}</span>
      </span>
      <span className="h-1 w-24 overflow-hidden rounded-full bg-sunken sm:w-32">
        <span className={`block h-full rounded-full ${pct >= 100 ? 'bg-warn' : 'bg-ink'}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[12px] text-muted underline-offset-4 group-hover:underline">Change limit</span>
    </button>
  )
}

export function Payees({ state, actions }: { state: DashboardState; actions: Actions }) {
  const { policy } = state.view
  const payees = Object.values(policy.payees)
  return (
    <section>
      <SectionHeader
        id="payees"
        index="04"
        eyebrow="Payees"
        title="Who the agent may pay"
        lead="The limits service co-signs payments only to these addresses, and only up to each payee's monthly limit. Anyone else is refused, whatever the agent is told."
      />
      <div className="overflow-hidden rounded-[16px] border border-line bg-surface">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="label py-3 pl-4 pr-2 font-light sm:px-6">Payee</th>
              <th className="label hidden px-4 py-3 font-light md:table-cell">XRPL address</th>
              <th className="label py-3 pl-2 pr-4 text-right font-light sm:px-4">This month</th>
              <th className="label hidden px-6 py-3 text-right font-light sm:table-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            {payees.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="py-4 pl-4 pr-2 sm:px-6">
                  <div className="flex items-center gap-3">
                    <Avatar id={p.id} name={p.name} />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-normal leading-5 text-ink">{p.name}</p>
                      <p className="truncate text-[12px] leading-[18px] text-muted">
                        {p.city}, {COUNTRY[p.country] ?? p.country}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-4 md:table-cell">
                  <ExternalLink href={`${state.explorer}/accounts/${p.address}`} className="font-mono text-[12px] font-light text-muted no-underline">
                    {shortAddress(p.address)}
                  </ExternalLink>
                </td>
                <td className="py-4 pl-2 pr-4 sm:px-4">
                  <MonthlyLimit p={p} spent={state.view.spentThisMonthByPayee[p.id] ?? 0} actions={actions} />
                </td>
                <td className="hidden px-6 py-4 text-right sm:table-cell">
                  <div className="flex flex-col items-end gap-1.5">
                    {p.active ? <Tag tone="good">Active</Tag> : <Tag tone="neutral">Switched off</Tag>}
                    <button
                      className="text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
                      disabled={actions.busy}
                      onClick={() =>
                        actions.run(async () => {
                          await api('/api/policy', 'PUT', { payee: { id: p.id, active: !p.active } })
                          return { tone: 'good', text: p.active ? `${p.name} switched off. The agent can no longer pay them.` : `${p.name} can be paid again.` }
                        })
                      }
                    >
                      {p.active ? 'Switch off' : 'Switch on'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
