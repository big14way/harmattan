'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { money, shortAddress } from '@/lib/format'
import { demoRescheduleRefusal, demoRunRefusal } from '@/lib/demo-rules'
import type { DashboardState, DemoStatus, RunRecord } from '@/lib/types'
import { AgentCard } from './agent-card'
import { Approvals } from './approvals'
import { Ledger } from './ledger'
import { Limits } from './limits'
import { Payees } from './payees'
import { Runs, type RunControl } from './runs'
import { Schedule } from './schedule'
import { ExternalLink, Icon, Logo } from './ui'

export interface Toast {
  tone: 'good' | 'bad'
  text: string
  href?: string
}

export interface Actions {
  run: (fn: () => Promise<Toast | void>) => Promise<boolean>
  busy: boolean
  /** False for a public-demo visitor: limits, payees and invites are read-only. */
  operator: boolean
  demo: DemoStatus | null
}

/**
 * On a demo deployment, once today's demo is finished (nothing due, nothing waiting for a signature):
 * the offer to run it again, with the reason it cannot happen now if there is one. Null otherwise.
 */
export function demoAgain(state: DashboardState): { refusal: string | null } | null {
  if (!state.demoSchedule) return null
  const today = state.view.today.day
  const dueCount = state.payables.filter((p) => p.status === 'scheduled' && p.dueDate <= today).length
  const pendingCount = state.approvals.filter((a) => a.status === 'pending').length
  if (dueCount || pendingCount) return null
  const demo = state.viewer.operator ? null : state.viewer.demo
  return { refusal: demoRescheduleRefusal({ dueCount, pendingCount, totalCents: state.demoSchedule.totalCents }, demo) }
}

/** Why a public-demo visitor cannot start a run right now, or null (always null for the operator). */
export function visitorRunBlock(state: DashboardState): string | null {
  return !state.viewer.operator && state.viewer.demo ? demoRunRefusal(state.viewer.demo) : null
}

export async function api<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok || json.error) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json
}

const NAV = [
  { key: 'a', label: 'Approvals', target: 'approvals' },
  { key: 'r', label: 'Run', target: 'runs' },
  { key: 'l', label: 'Limits', target: 'limits' },
  { key: 'p', label: 'Payees', target: 'payees' },
  { key: 'g', label: 'Ledger', target: 'ledger' },
]

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), [])
  return (
    <button
      aria-label={dark ? 'Use light theme' : 'Use dark theme'}
      className="inline-flex size-9 items-center justify-center rounded-[6px] text-muted hover:text-ink"
      onClick={() => {
        const next = !dark
        setDark(next)
        if (next) document.documentElement.dataset.theme = 'dark'
        else delete document.documentElement.dataset.theme
        try {
          localStorage.setItem('harmattan-theme', next ? 'dark' : 'light')
        } catch {}
      }}
    >
      <Icon name={dark ? 'sun' : 'moon'} size={17} />
    </button>
  )
}

function TopBar({ state }: { state: DashboardState | null }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable]')) return
      const item = NAV.find((n) => n.key === e.key.toLowerCase())
      if (item) document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const paused = state?.view.policy.paused
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[18px] font-normal tracking-[-0.02em]">Harmattan</span>
        </a>
        <nav className="hidden items-center gap-6 font-mono text-[13px] font-light md:flex">
          {NAV.map((n) => (
            <a key={n.key} href={`#${n.target}`} className="text-ink hover:opacity-70">
              <span className="text-muted">[{n.key.toUpperCase()}]</span> {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {state ? (
            <span className={`hidden items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] sm:inline-flex ${paused ? 'border-warn/30 text-warn' : 'border-line text-muted'}`}>
              <span className={`size-1.5 rounded-full ${paused ? 'bg-warn' : 'bg-good'}`} />
              {paused ? 'Paused' : 'Live'} · XRPL {state.network}
            </span>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

function DemoBanner({ state }: { state: DashboardState }) {
  const demo = state.viewer.demo
  if (!demo) return null
  const paid = demo.paidTodayCents === null ? 'the ledger could not be read just now' : `${money(demo.paidTodayCents)} paid today`
  const allowance = `approvals up to ${money(demo.approvalMaxCents)}, at most ${money(demo.dailyCents)} a day from the treasury (${paid})`
  if (state.viewer.operator) {
    return (
      <div className="border-b border-line bg-sunken">
        <p className="mx-auto max-w-[1200px] px-4 py-2.5 text-[13px] leading-5 text-muted sm:px-8">
          Signed in as the operator. The public demo is on: visitors can run the agent and approve payments, {allowance}. Limits, payees and invites are yours only.
        </p>
      </div>
    )
  }
  return (
    <div className="border-b border-accent/30 bg-accent/10">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-[14px] leading-[21px] text-ink">
          <span className="font-normal">Public demo on the XRP Ledger {state.network}.</span> You are the operator here: run today&apos;s payouts, approve the payment above the
          cap, and tell the agent to pay a stranger. Every payment is a real testnet transaction. Limits and payees are read-only; {allowance}.
        </p>
        <a href="/signin" className="shrink-0 font-mono text-[12px] text-muted underline underline-offset-4 hover:text-ink">
          Operator sign-in
        </a>
      </div>
    </div>
  )
}

/** What "Run the demo again" does, in one sentence. */
export function againText(state: DashboardState): string {
  const s = state.demoSchedule
  if (!s) return ''
  return `Today's demo is finished. Run it again to put the same ${s.count} payouts (${money(s.totalCents)}) back on today's schedule and start the agent on them.`
}

function Stat({ label, value, sub, children }: { label: string; value: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 px-0 py-5 sm:px-6 sm:first:pl-0">
      <p className="label">{label}</p>
      <p className="num text-[28px] font-light leading-[32px] tracking-[-0.02em] text-ink">{value}</p>
      {children}
      {sub ? <p className="text-[13px] leading-5 text-muted">{sub}</p> : null}
    </div>
  )
}

function Overview({ state, control }: { state: DashboardState; control: RunControl }) {
  const { view, approvals, decisions, treasury } = state
  const blocked = visitorRunBlock(state)
  const again = demoAgain(state)
  const pending = approvals.filter((a) => a.status === 'pending')
  const paidIds = new Set(decisions.filter((d) => d.outcome === 'cosigned').map((d) => d.paymentId))
  const stopped = decisions.filter((d) => d.day === view.today.day && d.outcome === 'refused' && !paidIds.has(d.paymentId))
  const stoppedIds = new Set(stopped.map((d) => d.paymentId))
  const stoppedCents = [...stoppedIds].reduce((sum, id) => sum + (stopped.find((d) => d.paymentId === id)?.cents ?? 0), 0)
  const spent = view.today.spentCents
  const budget = view.policy.dailyBudgetCents
  const pct = budget ? Math.min(100, (spent / budget) * 100) : 0

  const headline = pending.length
    ? `${pending.length} payment${pending.length > 1 ? 's' : ''} waiting for your signature.`
    : view.policy.paused
      ? 'Agent payments are paused.'
      : 'The agent is paying inside your limits.'

  return (
    <section id="top" className="relative">
      <div className="grid-paper pointer-events-none absolute inset-x-0 top-0 h-[340px]" aria-hidden />
      <div className="relative mx-auto max-w-[1200px] px-4 pb-10 pt-14 sm:px-8 sm:pt-20">
        <p className="eyebrow">Operator console · {new Date(state.now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: view.policy.timezone })}</p>
        <h1 className="mt-4 max-w-[900px] text-[40px] font-light leading-[1.02] tracking-[-0.03em] text-ink sm:text-[64px]">{headline}</h1>
        <p className="mt-5 max-w-[680px] text-[16px] leading-[25px] text-muted sm:text-[18px] sm:leading-[28px]">
          Today the agent paid {money(spent)} of your {money(budget)} budget
          {stoppedIds.size ? `, and ${stoppedIds.size} request${stoppedIds.size > 1 ? 's were' : ' was'} stopped` : ''}. Every treasury payment needs two signatures on the XRP Ledger: the agent holds one, and the second comes from the limits service or from you.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {again ? (
            <button
              onClick={() => void control.again()}
              disabled={control.running || !state.agent || Boolean(again.refusal)}
              className="inline-flex items-center gap-2 rounded-[6px] border border-accent bg-accent px-4 py-2.5 text-[14px] font-normal text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="again" /> {control.running ? 'The agent is working…' : 'Run the demo again'}
            </button>
          ) : (
            <button
              onClick={() => void control.start()}
              disabled={control.running || !state.agent || Boolean(blocked)}
              className="inline-flex items-center gap-2 rounded-[6px] border border-accent bg-accent px-4 py-2.5 text-[14px] font-normal text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="play" /> {control.running ? 'The agent is working…' : "Run today's payouts"}
            </button>
          )}
          <a href="#runs" className="inline-flex items-center gap-2 rounded-[6px] border border-line bg-surface px-4 py-2.5 text-[14px] font-normal hover:border-line-strong">
            Give the agent an instruction
          </a>
        </div>
        {again ? (
          <p className={`mt-3 max-w-[680px] text-[13px] leading-5 ${again.refusal ? 'text-warn' : 'text-muted'}`}>{again.refusal ?? againText(state)}</p>
        ) : blocked ? (
          <p className="mt-3 max-w-[680px] text-[13px] leading-5 text-warn">{blocked}</p>
        ) : null}

        <div className="mt-10 grid grid-cols-1 divide-y divide-line border-y border-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          <Stat
            label="Treasury"
            value={treasury ? money(treasury.rlusdCents) : '—'}
            sub={treasury ? <ExternalLink href={`${state.explorer}/accounts/${treasury.address}`}>{`${treasury.xrp.toFixed(1)} XRP for fees · ${shortAddress(treasury.address)}`}</ExternalLink> : 'Ledger unreachable'}
          />
          <Stat label="Paid by the agent today" value={money(spent)} sub={`of ${money(budget)} · ${money(view.today.remainingCents)} left`}>
            <div className="h-1 w-full overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${pct}%` }} />
            </div>
          </Stat>
          <Stat
            label="Waiting for you"
            value={String(pending.length)}
            sub={pending.length ? `${money(pending.reduce((s, a) => s + a.cents, 0))} held until you sign` : 'Nothing above your limits'}
          />
          <Stat label="Stopped today" value={String(stoppedIds.size)} sub={stoppedIds.size ? `${money(stoppedCents)} asked for, none sent` : 'No refusals today'} />
        </div>
      </div>
    </section>
  )
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-20 sm:px-8">
      <div className="skeleton h-3 w-48" />
      <div className="skeleton mt-6 h-14 w-[70%]" />
      <div className="skeleton mt-4 h-5 w-[50%]" />
      <div className="mt-10 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
    </div>
  )
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="mx-auto max-w-[720px] px-4 pt-24 sm:px-8">
      <p className="eyebrow">Can&apos;t reach the limits service</p>
      <h1 className="mt-4 text-[36px] font-light leading-[1.1] tracking-[-0.025em]">The console needs the limits service to show and change anything.</h1>
      <p className="mt-4 text-[16px] leading-[25px] text-muted">
        Start it with <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[13px] text-ink">pnpm limits</code> in the repository root. Until it is running the
        agent cannot get a second signature, so no payment can leave the treasury.
      </p>
      <p className="mt-3 font-mono text-[12px] text-faint">{message}</p>
      <button onClick={retry} className="mt-6 rounded-[6px] border border-line bg-surface px-4 py-2.5 text-[14px] font-normal hover:border-line-strong">
        Try again
      </button>
    </div>
  )
}

export function Dashboard() {
  const [state, setState] = useState<DashboardState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const s = await api<DashboardState>('/api/state', 'GET')
      setState(s)
      setError(null)
      setNow(Date.now())
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 4000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 7000)
    return () => clearTimeout(t)
  }, [toast])

  const [running, setRunning] = useState(false)
  const start: RunControl['start'] = async (instruction, planner) => {
    setRunning(true)
    try {
      const run = await api<RunRecord>('/api/run', 'POST', { instruction, planner })
      const paid = run.payments.filter((p) => p.status === 'paid').length
      const waiting = run.payments.filter((p) => p.approvalId).length
      const refused = run.payments.length - paid - waiting
      setToast({
        tone: 'good',
        text: run.payments.length
          ? `Agent run finished: ${paid} paid, ${waiting} waiting for you, ${refused} refused.`
          : 'Agent run finished without attempting a payment. Its report is under Run the agent.',
      })
    } catch (e) {
      setToast({ tone: 'bad', text: (e as Error).message })
    } finally {
      setRunning(false)
      await load()
    }
  }
  const control: RunControl = {
    running,
    start,
    // Puts the demo payouts back on today's schedule, then runs the agent on them.
    again: async () => {
      setRunning(true)
      try {
        await api('/api/schedule/demo', 'POST')
      } catch (e) {
        setToast({ tone: 'bad', text: (e as Error).message })
        setRunning(false)
        await load()
        return
      }
      await load()
      await start()
    },
  }

  const operator = state?.viewer.operator ?? false
  const demo = state?.viewer.demo ?? null
  const actions: Actions = useMemo(
    () => ({
      busy,
      operator,
      demo,
      run: async (fn) => {
        setBusy(true)
        try {
          const t = await fn()
          if (t) setToast(t)
          await load()
          return true
        } catch (e) {
          setToast({ tone: 'bad', text: (e as Error).message })
          return false
        } finally {
          setBusy(false)
        }
      },
    }),
    [busy, load, operator, demo],
  )

  return (
    <div className="min-h-screen">
      <TopBar state={state} />
      {state ? <DemoBanner state={state} /> : null}
      {!state && error ? <ErrorState message={error} retry={() => void load()} /> : null}
      {!state && !error ? <LoadingState /> : null}
      {state ? (
        <main>
          {error ? (
            <div className="border-b border-warn/30 bg-warn-bg px-4 py-2 text-center text-[13px] text-warn">Lost contact with the limits service; showing the last state. {error}</div>
          ) : null}
          <Overview state={state} control={control} />
          <div className="mx-auto flex max-w-[1200px] flex-col gap-24 px-4 pb-24 pt-10 sm:px-8">
            <Approvals state={state} now={now} actions={actions} />
            <Runs state={state} now={now} control={control} />
            <AgentCard state={state} now={now} />
            <Limits state={state} actions={actions} />
            <Payees state={state} actions={actions} />
            <Schedule state={state} control={control} />
            <Ledger state={state} now={now} />
          </div>
          <footer className="border-t border-line">
            <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <span className="flex items-center gap-2">
                <Logo size={18} /> Harmattan · RLUSD on the XRP Ledger {state.network}
              </span>
              {state.signerListTx ? <ExternalLink href={`${state.explorer}/transactions/${state.signerListTx}`}>Treasury signer list on the ledger</ExternalLink> : null}
            </div>
          </footer>
        </main>
      ) : null}
      {toast ? (
        <div role="status" className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-[10px] border border-line bg-surface p-4 shadow-card sm:inset-x-auto sm:right-6">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full ${toast.tone === 'good' ? 'bg-good-bg text-good' : 'bg-bad-bg text-bad'}`}>
              <Icon name={toast.tone === 'good' ? 'check' : 'x'} size={12} />
            </span>
            <div className="min-w-0 text-[14px] leading-5">
              <p className="text-ink">{toast.text}</p>
              {toast.href ? (
                <ExternalLink href={toast.href} className="mt-1 text-[13px] text-muted">
                  View on the XRPL explorer
                </ExternalLink>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
