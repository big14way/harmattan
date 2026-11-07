'use client'

import { useState } from 'react'
import { Button, ExternalLink, Icon } from './ui'

interface Joined {
  payeeId: string
  address: string
  seed?: string
  explorerUrl: string
}

async function post(token: string, body: unknown): Promise<Joined> {
  const res = await fetch(`/api/join/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = (await res.json().catch(() => ({}))) as Joined & { error?: string }
  if (!res.ok || json.error) throw new Error(json.error ?? 'Something went wrong')
  return json
}

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="label">{label}</p>
      <div className={`mt-2 flex items-center gap-2 rounded-[8px] border px-3 py-2.5 ${secret ? 'border-warn/40 bg-warn-bg' : 'border-line bg-sunken'}`}>
        <code className="min-w-0 flex-1 break-all font-mono text-[13px] font-light text-ink">{value}</code>
        <Button
          size="sm"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {}
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}

export function JoinFlow({ token, firstName, company, place }: { token: string; firstName: string; company: string; place: string }) {
  const [busy, setBusy] = useState<'create' | 'address' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [done, setDone] = useState<Joined | null>(null)

  async function go(mode: 'create' | 'address') {
    setBusy(mode)
    setError(null)
    try {
      setDone(await post(token, mode === 'create' ? { mode } : { mode, address }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (done) {
    return (
      <div>
        <p className="eyebrow">Payment setup · done</p>
        <h1 className="mt-4 text-[34px] font-light leading-[1.1] tracking-[-0.025em]">You&apos;re set up, {firstName}.</h1>
        <p className="mt-4 text-[16px] leading-[25px] text-muted">{company} will confirm your address before the first payment. Each payment arrives as RLUSD in this wallet, with a receipt.</p>
        <div className="mt-8 flex flex-col gap-5 rounded-[16px] border border-line bg-surface p-6 shadow-card">
          <CopyField label="Your XRPL address" value={done.address} />
          {done.seed ? (
            <>
              <CopyField label="Secret key (shown once)" value={done.seed} secret />
              <p className="text-[13px] leading-5 text-warn">
                Save this secret key now, for example in a password manager. It is shown once and Harmattan does not keep it. Anyone who has it controls the wallet.
              </p>
            </>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <a href={`/p/${done.payeeId}`} className="inline-flex items-center gap-2 rounded-[6px] border border-accent bg-accent px-4 py-2.5 text-[14px] font-normal text-accent-ink hover:bg-accent-hover">
              See your payments
            </a>
            <ExternalLink href={done.explorerUrl} className="self-center text-[14px] text-muted">
              Wallet on the ledger
            </ExternalLink>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="eyebrow">Payment setup{place ? ` · ${place}` : ''}</p>
      <h1 className="mt-4 text-[34px] font-light leading-[1.1] tracking-[-0.025em] sm:text-[44px]">Hi {firstName}. Choose where you get paid.</h1>
      <p className="mt-4 text-[16px] leading-[25px] text-muted sm:text-[18px] sm:leading-[28px]">
        {company} pays you in RLUSD, a US dollar stablecoin, on the XRP Ledger. Payments arrive in seconds with a receipt. This is the XRP Ledger testnet: no real money moves.
      </p>

      {error ? <p className="mt-6 rounded-[8px] bg-bad-bg px-4 py-3 text-[14px] leading-5 text-bad">{error}</p> : null}

      <div className="mt-8 flex flex-col gap-4">
        <section className="rounded-[16px] border border-line bg-surface p-6 shadow-card">
          <p className="label">Recommended</p>
          <h2 className="mt-2 text-[20px] font-normal">Create a wallet for me</h2>
          <p className="mt-2 text-[14px] leading-[22px] text-muted">We create a testnet XRPL wallet, fund it with test XRP for fees and open its RLUSD trust line. You get the secret key once.</p>
          <Button variant="primary" className="mt-5 w-full sm:w-auto" onClick={() => go('create')} disabled={busy !== null}>
            <Icon name="spark" />
            {busy === 'create' ? 'Creating your wallet… about 10 seconds' : 'Create my wallet'}
          </Button>
        </section>

        <section className="rounded-[16px] border border-line bg-surface p-6">
          <h2 className="text-[20px] font-normal">I already have an XRPL wallet</h2>
          <p className="mt-2 text-[14px] leading-[22px] text-muted">Paste its address. It needs an RLUSD trust line so it can receive RLUSD.</p>
          <form
            className="mt-5 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              if (address.trim()) void go('address')
            }}
          >
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="r…"
              aria-label="Your XRPL address"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-[6px] border border-line-strong bg-surface px-3 py-2.5 font-mono text-[14px] font-light outline-none focus:border-ink"
            />
            <Button type="submit" disabled={busy !== null || !address.trim()}>
              {busy === 'address' ? 'Checking…' : 'Use this wallet'}
            </Button>
          </form>
        </section>
      </div>
    </div>
  )
}
