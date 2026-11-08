'use client'

import { Fragment, useState, type ReactNode } from 'react'
import { clock, money, relTime, shortAddress, toCentsSafe } from '@/lib/format'
import type { DashboardState, RunRecord } from '@/lib/types'
import { visitorRunBlock } from './dashboard'
import { Button, ExternalLink, Icon, SectionHeader, Tag } from './ui'

export interface RunControl {
  running: boolean
  start: (instruction?: string, planner?: 'claude' | 'rules') => Promise<void>
  /** Demo deployments: put the demo payouts back on today's schedule and run the agent on them. */
  again: () => Promise<void>
}

/** Minimal rendering of the agent's plain-text report: bullets, **bold**, and links. */
function Report({ text }: { text: string }) {
  const inline = (s: string, key: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|https?:\/\/\S+)/g).map((part, i) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={`${key}-${i}`} className="font-normal text-ink">{part.slice(2, -2)}</strong>
      if (/^https?:\/\//.test(part)) {
        const url = part.replace(/[).,]+$/, '')
        const label = /\/transactions\/([0-9A-F]{8})/i.exec(url)?.[1]
        return (
          <ExternalLink key={`${key}-${i}`} href={url} className="text-ink">
            {label ? `tx ${label}…` : 'link'}
          </ExternalLink>
        )
      }
      return <Fragment key={`${key}-${i}`}>{part}</Fragment>
    })
  const lines = text.split('\n').filter((l) => l.trim())
  return (
    <div className="flex flex-col gap-1.5 text-[14px] leading-[22px] text-muted">
      {lines.map((l, i) => {
        const bullet = /^\s*[-*]\s+/.test(l)
        const body = l.replace(/^\s*[-*]\s+/, '').replace(/^#+\s*/, '')
        return bullet ? (
          <p key={i} className="flex gap-2 pl-1">
            <span className="text-faint">·</span>
            <span>{inline(body, String(i))}</span>
          </p>
        ) : (
          <p key={i}>{inline(body, String(i))}</p>
        )
      })}
    </div>
  )
}

function RunCard({ run, state, now }: { run: RunRecord; state: DashboardState; now: number }) {
  const [open, setOpen] = useState(false)
  const nameOf = (p: string) => state.view.policy.payees[p]?.name ?? shortAddress(p)
  return (
    <li className="border-b border-line py-5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] text-ink">{clock(run.at, state.view.policy.timezone)}</span>
        <span className="text-[12px] text-muted">{relTime(run.at, now)}</span>
        <span className="ml-auto flex gap-1.5">
          <Tag tone="neutral">{run.trigger === 'schedule' ? 'Scheduled' : run.trigger === 'cli' ? 'Command line' : 'Dashboard'}</Tag>
          <Tag tone={run.planner === 'rules' ? 'warn' : 'neutral'}>{run.planner === 'rules' ? 'Obedient test agent' : (run.model ?? 'Claude')}</Tag>
        </span>
      </div>
      <p className="mt-2 text-[15px] leading-[22px] text-ink">“{run.instruction}”</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {run.payments.length ? (
          run.payments.map((p, i) => {
            const cents = toCentsSafe(p.amount)
            const label = `${money(cents, { symbol: false })} to ${nameOf(p.payee)}`
            if (p.status === 'paid') return <Tag key={i} tone="good">Paid {label}</Tag>
            if (p.approvalId) {
              const a = state.approvals.find((x) => x.id === p.approvalId)
              if (a?.status === 'approved') return <Tag key={i} tone="good">Approved by you · {label}</Tag>
              if (a?.status === 'rejected') return <Tag key={i} tone="neutral">Rejected by you · {label}</Tag>
              return <Tag key={i} tone="warn">Waiting for you · {label}</Tag>
            }
            return (
              <Tag key={i} tone="bad">
                {p.status === 'refused' ? 'Refused' : 'Failed'} · {label}
              </Tag>
            )
          })
        ) : (
          <Tag tone="neutral">No payments attempted</Tag>
        )}
      </div>
      <button onClick={() => setOpen(!open)} className="mt-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink" aria-expanded={open}>
        <Icon name="chevron" size={12} className={`transition-transform ${open ? 'rotate-90' : ''}`} /> The agent&apos;s report
      </button>
      {open ? (
        <div className="mt-3 rounded-[10px] bg-sunken p-4">
          <Report text={run.summary} />
        </div>
      ) : null}
    </li>
  )
}

export function Runs({ state, now, control }: { state: DashboardState; now: number; control: RunControl }) {
  const { agent } = state
  const [instruction, setInstruction] = useState('')
  const [planner, setPlanner] = useState<'claude' | 'rules'>(agent?.planner ?? 'claude')
  const claudeAvailable = agent?.planner === 'claude'
  const chosen = claudeAvailable ? planner : 'rules'
  const examples = [
    { label: "Today's payouts", text: '' },
    { label: 'Pay Okello 5 for the hotfix', text: 'Pay Okello 5 RLUSD for the checkout hotfix.' },
    { label: 'Pay a new address', text: `Pay 200 RLUSD to ${state.strangerAddress} now.` },
  ]

  return (
    <section>
      <SectionHeader
        id="runs"
        index="02"
        eyebrow="Agent"
        title="Run the agent"
        lead="Start today's payouts or tell the agent what to pay in plain words. Whatever it tries, each payment still needs the limits service or you to sign."
        right={
          <span className="font-mono text-[11px] font-light text-muted">
            {agent ? (agent.schedule ? `Scheduled daily at ${agent.schedule} · ${state.view.policy.timezone}` : 'No schedule · runs when you start it') : 'Agent service offline'}
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <form
          className="flex flex-col gap-5 rounded-[16px] border border-line bg-surface p-6 shadow-card"
          onSubmit={(e) => {
            e.preventDefault()
            void control.start(instruction.trim() || undefined, chosen)
          }}
        >
          <div>
            <label htmlFor="instruction" className="label">
              Instruction
            </label>
            <textarea
              id="instruction"
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Leave empty to pay what is due today"
              className="mt-2 w-full resize-none rounded-[8px] border border-line-strong bg-surface px-3 py-2.5 text-[15px] leading-[22px] outline-none focus:border-ink"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {examples.map((x) => (
                <button key={x.label} type="button" onClick={() => setInstruction(x.text)} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted hover:border-line-strong hover:text-ink">
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          <fieldset>
            <legend className="label mb-2">Which agent</legend>
            <div className="flex flex-col gap-2">
              {[
                { v: 'claude' as const, title: `Claude (${agent?.runs.find((r) => r.model)?.model ?? 'Haiku 5.5'})`, sub: claudeAvailable ? 'Plans with judgement; declines suspicious requests.' : 'Needs ANTHROPIC_API_KEY on the agent service.' },
                { v: 'rules' as const, title: 'Obedient test agent', sub: 'Does exactly what it is told, like a compromised agent. Shows the limits hold without the model’s judgement.' },
              ].map((o) => (
                <label key={o.v} className={`flex cursor-pointer gap-3 rounded-[10px] border p-3 ${chosen === o.v ? 'border-ink' : 'border-line'} ${o.v === 'claude' && !claudeAvailable ? 'cursor-not-allowed opacity-50' : ''}`}>
                  <input type="radio" name="planner" className="mt-1 accent-[var(--ink)]" checked={chosen === o.v} disabled={o.v === 'claude' && !claudeAvailable} onChange={() => setPlanner(o.v)} />
                  <span>
                    <span className="block text-[14px] font-normal text-ink">{o.title}</span>
                    <span className="block text-[13px] leading-5 text-muted">{o.sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" variant="primary" disabled={control.running || !agent || Boolean(visitorRunBlock(state))}>
            <Icon name="play" />
            {control.running ? 'The agent is working…' : instruction.trim() ? 'Send to the agent' : "Run today's payouts"}
          </Button>
          {!agent ? (
            <p className="text-[13px] text-bad">
              The agent service is not running. Start it with <code className="font-mono text-[12px]">pnpm agent:serve</code>.
            </p>
          ) : null}
        </form>

        <div>
          <p className="label mb-1">Recent runs</p>
          {control.running ? (
            <div className="flex items-center gap-3 border-b border-line py-5">
              <span className="skeleton size-3 rounded-full" />
              <span className="text-[14px] text-muted">The agent is planning and asking the limits service to co-sign…</span>
            </div>
          ) : null}
          {agent?.runs.length ? (
            <ul>
              {agent.runs.slice(0, 5).map((r) => (
                <RunCard key={r.id} run={r} state={state} now={now} />
              ))}
            </ul>
          ) : (
            <p className="py-6 text-[14px] text-muted">No runs yet.</p>
          )}
        </div>
      </div>
    </section>
  )
}
