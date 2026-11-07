import type { Metadata } from 'next'
import { findInvite } from '@/lib/invites'
import { COUNTRY } from '@/lib/format'
import { JoinFlow } from '@/components/join'
import { Logo } from '@/components/ui'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Set up your payments · Harmattan', robots: { index: false } }

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = findInvite(token)
  const company = process.env.HARMATTAN_COMPANY_NAME ?? 'Your client'
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-[60px] max-w-[640px] items-center gap-2.5 px-4">
          <Logo />
          <span className="text-[18px] font-normal tracking-[-0.02em]">Harmattan</span>
        </div>
      </header>
      <main className="mx-auto max-w-[640px] px-4 pb-20 pt-12">
        {!invite || invite.status === 'revoked' ? (
          <>
            <p className="eyebrow">Payment setup</p>
            <h1 className="mt-4 text-[34px] font-light leading-[1.1] tracking-[-0.025em]">This link is not valid.</h1>
            <p className="mt-4 text-[16px] leading-[25px] text-muted">Ask the person who sent it for a new one.</p>
          </>
        ) : invite.status === 'joined' ? (
          <>
            <p className="eyebrow">Payment setup</p>
            <h1 className="mt-4 text-[34px] font-light leading-[1.1] tracking-[-0.025em]">You are already set up.</h1>
            <p className="mt-4 text-[16px] leading-[25px] text-muted">
              Payments go to <span className="font-mono text-[14px] text-ink">{invite.address}</span>.
            </p>
            <a href={`/p/${invite.payeeId}`} className="mt-6 inline-flex rounded-[6px] border border-line bg-surface px-4 py-2.5 text-[14px] font-normal hover:border-line-strong">
              See your payments
            </a>
          </>
        ) : (
          <JoinFlow token={token} firstName={invite.name.split(/\s+/)[0] ?? invite.name} company={company} place={[invite.city, COUNTRY[invite.country] ?? invite.country].filter(Boolean).join(', ')} />
        )}
      </main>
    </div>
  )
}
