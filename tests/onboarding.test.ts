import { describe, expect, it } from 'vitest'
import { payeeFromInvite, payeeIdFor, type Invite } from '../operator/lib/invites.ts'
import type { Policy } from '../limits/src/policy.ts'
import { receiptBodies } from '../receipts/src/index.ts'

const policy = { payees: { wanjiru: {}, amina: {} } } as unknown as Policy

describe('payee onboarding', () => {
  it('derives a unique directory id from the first name', () => {
    expect(payeeIdFor('Okello Mugisha', policy)).toBe('okello')
    expect(payeeIdFor('Amina Njeri', policy)).toBe('amina-2')
    expect(payeeIdFor('Zoë Ndlovu', policy)).toBe('zoe')
  })

  it('adds invited payees switched off and pending confirmation', () => {
    const invite: Invite = { token: 't', name: 'Amina Njeri', city: 'Mombasa', country: 'KE', monthlyLimitCents: 3000, createdAt: '', status: 'open' }
    const p = payeeFromInvite(invite, 'amina', 'rJGhy9Apwhqer6KP6MM1dY6RyW49Bgt1ds')
    expect(p).toMatchObject({ active: false, pendingConfirmation: true, monthlyLimitCents: 3000 })
  })
})

describe('receipts', () => {
  it('says who approved the payment and links the ledger', () => {
    const b = receiptBodies({ paymentId: 'p', payeeId: 'thandi', payeeName: 'Thandi Nkosi', cents: 4000, memo: 'Launch video', txHash: 'H', explorerUrl: 'https://testnet.xrpl.org/transactions/H', approvedBy: 'operator' })
    expect(b.payee).toContain('40.00 RLUSD')
    expect(b.payee).toContain('https://testnet.xrpl.org/transactions/H')
    expect(b.operator).toContain('with your approval')
  })
})
