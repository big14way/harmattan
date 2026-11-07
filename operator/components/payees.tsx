'use client'

import { useState } from 'react'
import { COUNTRY, money, shortAddress } from '@/lib/format'
import type { DashboardState } from '@/lib/types'
import { api, type Actions } from './dashboard'
import { Avatar, Button, ExternalLink, Icon, SectionHeader, Tag } from './ui'

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

function PhoneEditor({ p, actions }: { p: PayeePolicy; actions: Actions }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(p.phone ?? '')
  if (!editing) {
    return (
      <button className="text-left text-[12px] leading-[18px] text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => setEditing(true)}>
        {p.phone ? `WhatsApp ${p.phone}` : 'Add WhatsApp for receipts'}
      </button>
    )
  }
  return (
    <form
      className="mt-1 flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const phone = value.replace(/[\s()-]/g, '')
        const ok = await actions.run(async () => {
          await api('/api/policy', 'PUT', { payee: { id: p.id, phone: phone || null } })
          return { tone: 'good', text: phone ? `Receipts for ${p.name} go to WhatsApp ${phone}.` : `Removed ${p.name}'s WhatsApp number.` }
        })
        if (ok) setEditing(false)
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="+254712345678"
        aria-label={`WhatsApp number for ${p.name}`}
        className="w-40 rounded-[6px] border border-line-strong bg-surface px-2 py-1 font-mono text-[12px] outline-none focus:border-ink"
      />
      <Button type="submit" size="sm" variant="primary" disabled={actions.busy}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  )
}

function StatusCell({ p, actions }: { p: PayeePolicy; actions: Actions }) {
  const [confirming, setConfirming] = useState(false)
  if (p.pendingConfirmation) {
    return confirming ? (
      <div className="flex max-w-[260px] flex-col items-end gap-2 text-right">
        <p className="text-[12px] leading-[18px] text-ink">
          Pay {p.name} at <span className="break-all font-mono">{p.address}</span>? Check it with them on a call you started.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={actions.busy}
            onClick={() =>
              actions.run(async () => {
                await api('/api/policy', 'PUT', { payee: { id: p.id, confirm: true } })
                setConfirming(false)
                return { tone: 'good', text: `${p.name} confirmed. The agent can now pay them, inside their ${money(p.monthlyLimitCents)} monthly limit.` }
              })
            }
          >
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex flex-col items-end gap-1.5">
        <Tag tone="warn">New address</Tag>
        <button className="text-[12px] text-ink underline underline-offset-4" onClick={() => setConfirming(true)}>
          Confirm to switch on
        </button>
      </div>
    )
  }
  return (
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
  )
}

const COUNTRIES = ['KE', 'UG', 'ZA', 'TZ', 'RW', 'GH', 'NG']

function InvitePanel({ state, actions }: { state: DashboardState; actions: Actions }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', city: '', country: 'KE', phone: '', monthly: '30' })
  const [copied, setCopied] = useState<string | null>(null)
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const linkOf = (token: string) => `${origin}/join/${token}`
  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(linkOf(token))
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch {}
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value })
  const input = 'w-full rounded-[6px] border border-line-strong bg-surface px-3 py-2 text-[14px] outline-none focus:border-ink'

  return (
    <div className="mt-6 flex flex-col gap-4">
      {state.invites.length ? (
        <ul className="divide-y divide-line rounded-[16px] border border-line bg-surface">
          {state.invites.map((i) => (
            <li key={i.token} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-ink">
                  {i.name} <span className="text-muted">· invited, not joined yet</span>
                </p>
                <p className="truncate font-mono text-[12px] font-light text-muted">{linkOf(i.token)}</p>
              </div>
              <Button size="sm" onClick={() => copy(i.token)}>
                {copied === i.token ? 'Copied' : 'Copy link'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={actions.busy}
                onClick={() =>
                  actions.run(async () => {
                    await api(`/api/invites/${i.token}`, 'DELETE')
                    return { tone: 'good', text: `Invite for ${i.name} revoked. The link no longer works.` }
                  })
                }
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <form
          className="grid grid-cols-1 gap-4 rounded-[16px] border border-line bg-surface p-6 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault()
            let token = ''
            const ok = await actions.run(async () => {
              const r = await api<{ invite: { token: string } }>('/api/invites', 'POST', form)
              token = r.invite.token
              return { tone: 'good', text: `Invite link for ${form.name} created and copied. Send it to them on WhatsApp.` }
            })
            if (ok) {
              await copy(token)
              setOpen(false)
              setForm({ name: '', city: '', country: 'KE', phone: '', monthly: '30' })
            }
          }}
        >
          <p className="label sm:col-span-2">Invite a payee</p>
          <label className="text-[13px] text-muted">
            Name
            <input required value={form.name} onChange={set('name')} placeholder="Amina Njeri" className={`mt-1 ${input}`} />
          </label>
          <label className="text-[13px] text-muted">
            City
            <input value={form.city} onChange={set('city')} placeholder="Mombasa" className={`mt-1 ${input}`} />
          </label>
          <label className="text-[13px] text-muted">
            Country
            <select value={form.country} onChange={set('country')} className={`mt-1 ${input}`}>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {COUNTRY[c] ?? c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] text-muted">
            WhatsApp for receipts (optional)
            <input value={form.phone} onChange={set('phone')} placeholder="+254712345678" className={`mt-1 font-mono ${input}`} />
          </label>
          <label className="text-[13px] text-muted">
            Monthly limit (RLUSD)
            <input value={form.monthly} onChange={set('monthly')} inputMode="decimal" className={`mt-1 num ${input}`} />
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="primary" disabled={actions.busy}>
              Create invite link
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-[12px] leading-[18px] text-muted sm:col-span-2">
            The payee opens the link, creates a testnet wallet or brings their own, and lands here switched off. The agent can pay them only after you confirm the address.
          </p>
        </form>
      ) : (
        <div>
          <Button onClick={() => setOpen(true)}>
            <Icon name="spark" /> Invite a payee
          </Button>
        </div>
      )}
    </div>
  )
}

export function Payees({ state, actions }: { state: DashboardState; actions: Actions }) {
  const { policy } = state.view
  const payees = Object.values(policy.payees)
  return (
    <section>
      <SectionHeader
        id="payees"
        index="05"
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
                      <a href={`/p/${p.id}`} target="_blank" rel="noreferrer" className="block truncate text-[15px] font-normal leading-5 text-ink hover:underline hover:underline-offset-4" title="Open the payee's page">
                        {p.name}
                      </a>
                      <p className="truncate text-[12px] leading-[18px] text-muted">
                        {[p.city, COUNTRY[p.country] ?? p.country].filter(Boolean).join(', ')}
                      </p>
                      <PhoneEditor p={p} actions={actions} />
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
                  <StatusCell p={p} actions={actions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InvitePanel state={state} actions={actions} />
    </section>
  )
}
