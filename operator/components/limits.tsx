'use client'

import { useEffect, useState } from 'react'
import { money } from '@/lib/format'
import type { DashboardState } from '@/lib/types'
import { api, type Actions } from './dashboard'
import { Button, Icon, SectionHeader } from './ui'

const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/

function AmountEditor({
  label,
  help,
  cents,
  field,
  actions,
  children,
}: {
  label: string
  help: string
  cents: number
  field: 'cap' | 'budget'
  actions: Actions
  children?: React.ReactNode
}) {
  const current = (cents / 100).toFixed(2)
  const [value, setValue] = useState(current)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setValue(current)
  }, [current, focused])
  const dirty = value !== current
  const valid = AMOUNT.test(value)

  return (
    <div className="flex flex-col rounded-[16px] border border-line bg-surface p-6">
      <p className="label">{label}</p>
      <form
        className="mt-3 flex items-baseline gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!dirty || !valid) return
          await actions.run(async () => {
            await api('/api/policy', 'PUT', { [field]: value })
            return { tone: 'good', text: `${label} set to ${money(Math.round(Number(value) * 100))}. The limits service applies it to the next request.` }
          })
        }}
      >
        <input
          aria-label={label}
          inputMode="decimal"
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
          className="num min-w-[3ch] max-w-full border-b border-transparent bg-transparent text-[40px] [field-sizing:content] font-light leading-[44px] tracking-[-0.02em] text-ink outline-none hover:border-line focus:border-ink"
        />
        <span className="label shrink-0">RLUSD</span>
        {dirty ? (
          <Button type="submit" variant="primary" size="sm" disabled={!valid || actions.busy} className="ml-2 shrink-0">
            Save
          </Button>
        ) : null}
      </form>
      {dirty && !valid ? <p className="mt-1 text-[12px] text-bad">Use an amount like 15 or 15.50</p> : null}
      {children}
      <p className="mt-auto pt-4 text-[13px] leading-5 text-muted">{help}</p>
    </div>
  )
}

function PauseSwitch({ paused, actions }: { paused: boolean; actions: Actions }) {
  const [confirm, setConfirm] = useState(false)
  const set = (next: boolean) =>
    actions.run(async () => {
      await api('/api/policy', 'PUT', { paused: next })
      setConfirm(false)
      return { tone: 'good', text: next ? 'All agent payments are paused. The limits service refuses every request until you resume.' : 'Agent payments resumed.' }
    })

  return (
    <div className={`flex flex-col rounded-[16px] border p-6 ${paused ? 'border-warn/40 bg-warn-bg' : 'border-line bg-surface'}`}>
      <p className="label">Pause switch</p>
      <p className="mt-3 text-[28px] font-light leading-[44px] tracking-[-0.02em] text-ink">{paused ? 'Paused' : 'Agent can pay'}</p>
      <div className="mt-3">
        {paused ? (
          <Button variant="primary" onClick={() => set(false)} disabled={actions.busy}>
            <Icon name="play" /> Resume payments
          </Button>
        ) : confirm ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] leading-5 text-ink">Pause now? Every request from the agent will be refused until you resume.</p>
            <div className="flex gap-2">
              <Button variant="danger" size="sm" onClick={() => set(true)} disabled={actions.busy}>
                Pause now
              </Button>
              <Button size="sm" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setConfirm(true)} disabled={actions.busy}>
            <Icon name="pause" /> Pause all agent payments
          </Button>
        )}
      </div>
      <p className="mt-auto pt-4 text-[13px] leading-5 text-muted">Stops the co-signer, not just the agent: nothing leaves the treasury without your own signature while paused.</p>
    </div>
  )
}

export function Limits({ state, actions }: { state: DashboardState; actions: Actions }) {
  const { policy, today } = state.view
  const pct = policy.dailyBudgetCents ? Math.min(100, (today.spentCents / policy.dailyBudgetCents) * 100) : 0
  return (
    <section>
      <SectionHeader
        id="limits"
        index="03"
        eyebrow="Limits"
        title="Your limits"
        lead="Changes go to the limits service, which the agent can read but not write. They apply to the very next request."
        right={<span className="font-mono text-[11px] font-light text-muted">Policy v{policy.version} · {policy.timezone}</span>}
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <AmountEditor label="Per-payment cap" field="cap" cents={policy.perPaymentCapCents} actions={actions} help="Anything larger waits for your signature." />
        <AmountEditor label="Daily budget" field="budget" cents={policy.dailyBudgetCents} actions={actions} help={`What the agent may pay on its own per day. ${money(today.remainingCents)} left today.`}>
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
          </div>
        </AmountEditor>
        <PauseSwitch paused={policy.paused} actions={actions} />
      </div>
    </section>
  )
}
