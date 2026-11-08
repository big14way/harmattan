'use client'

import { money, PAYABLE_STATUS } from '@/lib/format'
import type { DashboardState } from '@/lib/types'
import { againText, demoAgain } from './dashboard'
import type { RunControl } from './runs'
import { Avatar, Button, ExternalLink, Icon, SectionHeader, Tag } from './ui'

export function Schedule({ state, control }: { state: DashboardState; control: RunControl }) {
  const { payables, view } = state
  const again = demoAgain(state)
  const today = view.today.day
  const shown = payables.slice(0, 10)
  const due = payables.filter((p) => p.status === 'scheduled' && p.dueDate <= today)
  return (
    <section>
      <SectionHeader
        id="schedule"
        index="06"
        eyebrow="Schedule"
        title={due.length ? `${due.length} payment${due.length > 1 ? 's' : ''} due for the agent` : 'The agent is up to date'}
        lead="Your payment schedule. The agent works through what is due on each run and records what happened to every item."
      />
      {shown.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {shown.map((p) => {
            const payee = view.policy.payees[p.payeeId]
            const s = PAYABLE_STATUS[p.status] ?? { label: p.status, tone: 'neutral' as const }
            return (
              <li key={p.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 py-4 sm:grid-cols-[auto_1fr_120px_140px_auto]">
                <Avatar id={p.payeeId} name={payee?.name ?? p.payeeId} size={32} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] leading-5 text-ink">{p.description}</p>
                  <p className="truncate text-[12px] leading-[18px] text-muted">
                    {payee?.name ?? p.payeeId} · due {p.dueDate === today ? 'today' : p.dueDate}
                  </p>
                </div>
                <p className="num text-right text-[15px] text-ink sm:order-none">{money(p.amountCents)}</p>
                <div className="col-start-2 sm:col-start-auto sm:text-right">
                  <Tag tone={s.tone}>{s.label}</Tag>
                </div>
                <div className="col-start-3 row-start-2 text-right sm:col-start-auto sm:row-start-auto">
                  {p.explorerUrl ? (
                    <ExternalLink href={p.explorerUrl} className="text-[13px] text-muted">
                      Ledger
                    </ExternalLink>
                  ) : (
                    <span className="text-[13px] text-faint">—</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-[16px] border border-dashed border-line-strong px-6 py-10 text-center text-[15px] text-muted">
          Nothing scheduled. Add payments with <code className="font-mono text-[13px] text-ink">pnpm seed demo</code>.
        </p>
      )}
      {again ? (
        <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`max-w-[640px] text-[14px] leading-5 ${again.refusal ? 'text-warn' : 'text-muted'}`}>{again.refusal ?? againText(state)}</p>
          <Button className="shrink-0" onClick={() => void control.again()} disabled={control.running || !state.agent || Boolean(again.refusal)}>
            <Icon name="again" /> {control.running ? 'The agent is working…' : 'Run the demo again'}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
