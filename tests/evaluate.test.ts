import { describe, expect, it } from 'vitest'
import { Wallet, multisign, type Payment } from 'xrpl'
import { RLUSD_TESTNET } from '../ledger/src/config.ts'
import { toCents } from '../ledger/src/money.ts'
import { buildRlusdPayment } from '../ledger/src/rlusd.ts'
import { summarize, type DecisionRecord } from '../limits/src/decisions.ts'
import { evaluatePayment, type EvaluateInput } from '../limits/src/evaluate.ts'
import type { Policy } from '../limits/src/policy.ts'
import { hasOnlyValidSignatureFrom } from '../limits/src/verify.ts'

const treasury = Wallet.generate().classicAddress
const wanjiru = Wallet.generate().classicAddress
const stranger = Wallet.generate().classicAddress

const policy: Policy = {
  version: 1,
  paused: false,
  perPaymentCapCents: toCents('150'),
  dailyBudgetCents: toCents('500'),
  timezone: 'Africa/Lagos',
  payees: {
    wanjiru: { id: 'wanjiru', name: 'Wanjiru Kamau', address: wanjiru, country: 'KE', city: 'Nairobi', monthlyLimitCents: toCents('300'), active: true },
  },
  updatedAt: '2026-11-06T00:00:00Z',
  updatedBy: 'test',
}

const noSpend = { spentTodayCents: 0, spentThisMonthByPayee: {}, paidPaymentIds: new Set<string>() }

function prepared(to: string, amount: string, paymentId = 'pay-1'): Payment {
  return { ...buildRlusdPayment({ from: treasury, to, cents: toCents(amount), paymentId }), Fee: '30', Sequence: 10, LastLedgerSequence: 1000, SigningPubKey: '' }
}

function check(overrides: Partial<EvaluateInput> & { tx?: Payment }) {
  return evaluatePayment({
    policy,
    spend: noSpend,
    tx: prepared(wanjiru, '120'),
    paymentId: 'pay-1',
    treasury,
    asset: RLUSD_TESTNET,
    agentSignatureValid: true,
    ...overrides,
  })
}

describe('evaluatePayment', () => {
  it('co-signs a payment inside every limit', () => {
    expect(check({})).toMatchObject({ ok: true, code: 'OK', payeeId: 'wanjiru', cents: 12000 })
  })

  it('refuses above the per-payment cap and marks it as needing approval', () => {
    expect(check({ tx: prepared(wanjiru, '400') })).toMatchObject({ ok: false, code: 'OVER_CAP', needsApproval: true })
  })

  it('refuses when the daily budget would be exceeded', () => {
    const spend = { ...noSpend, spentTodayCents: toCents('450') }
    expect(check({ spend, tx: prepared(wanjiru, '100') })).toMatchObject({ ok: false, code: 'OVER_DAILY_BUDGET' })
  })

  it("refuses when the payee's monthly limit would be exceeded", () => {
    const spend = { ...noSpend, spentThisMonthByPayee: { wanjiru: toCents('250') } }
    expect(check({ spend, tx: prepared(wanjiru, '100') })).toMatchObject({ ok: false, code: 'OVER_PAYEE_MONTHLY' })
  })

  it('refuses an address that is not on the payee list', () => {
    expect(check({ tx: prepared(stranger, '20') })).toMatchObject({ ok: false, code: 'UNKNOWN_PAYEE', needsApproval: false })
  })

  it('refuses everything while paused', () => {
    expect(check({ policy: { ...policy, paused: true } })).toMatchObject({ ok: false, code: 'PAUSED' })
  })

  it('refuses paying the same payment id twice', () => {
    const spend = { ...noSpend, paidPaymentIds: new Set(['pay-1']) }
    expect(check({ spend })).toMatchObject({ ok: false, code: 'DUPLICATE' })
  })

  it('refuses a request without a valid agent signature', () => {
    expect(check({ agentSignatureValid: false })).toMatchObject({ ok: false, code: 'BAD_SIGNATURE' })
  })

  it.each([
    ['a cross-currency SendMax', { SendMax: '1000000' }],
    ['a different source account', { Account: stranger }],
    ['an excessive fee', { Fee: '2000000' }],
    ['payment flags', { Flags: 131072 }],
    ['no LastLedgerSequence', { LastLedgerSequence: undefined }],
    ['another token', { Amount: { currency: 'USD', issuer: stranger, value: '10' } }],
    ['XRP instead of RLUSD', { Amount: '10000000' }],
    ['more than 2 decimals', { Amount: { ...RLUSD_TESTNET, value: '1.005' } }],
  ])('refuses a malformed payment: %s', (_label, patch) => {
    const tx = { ...prepared(wanjiru, '20'), ...patch } as Payment
    expect(check({ tx })).toMatchObject({ ok: false, code: 'BAD_TX' })
  })

  it('refuses when the InvoiceID does not match the payment id', () => {
    expect(check({ tx: prepared(wanjiru, '20', 'other-id') })).toMatchObject({ ok: false, code: 'BAD_TX' })
  })
})

describe('hasOnlyValidSignatureFrom', () => {
  const agent = Wallet.generate()
  const other = Wallet.generate()
  const tx = prepared(wanjiru, '20')

  it('accepts exactly one valid agent multisignature', () => {
    expect(hasOnlyValidSignatureFrom(agent.sign(tx, true).tx_blob, agent.classicAddress)).toBe(true)
  })

  it('rejects a signature from another key', () => {
    expect(hasOnlyValidSignatureFrom(other.sign(tx, true).tx_blob, agent.classicAddress)).toBe(false)
  })

  it('rejects a blob already carrying a second signature', () => {
    const both = multisign([agent.sign(tx, true).tx_blob, other.sign(tx, true).tx_blob])
    expect(hasOnlyValidSignatureFrom(both, agent.classicAddress)).toBe(false)
  })

  it('rejects a single-signed blob', () => {
    expect(hasOnlyValidSignatureFrom(agent.sign({ ...tx, Account: agent.classicAddress }).tx_blob, agent.classicAddress)).toBe(false)
  })
})

describe('summarize', () => {
  const rec = (p: Partial<DecisionRecord>): DecisionRecord => ({
    id: 'x', at: '', day: '2026-11-06', month: '2026-11', paymentId: 'p', payeeId: 'wanjiru', destination: wanjiru,
    cents: 1000, outcome: 'cosigned', code: 'OK', reason: '', approvedBy: 'limits', ledgerResult: 'tesSUCCESS', ...p,
  })

  it('counts only successful co-signed payments in the current day and month', () => {
    const s = summarize(
      [
        rec({ paymentId: 'a' }),
        rec({ paymentId: 'b', day: '2026-11-05' }),
        rec({ paymentId: 'c', outcome: 'refused', ledgerResult: undefined }),
        rec({ paymentId: 'd', outcome: 'failed', ledgerResult: 'tecPATH_DRY' }),
      ],
      new Date('2026-11-06T12:00:00Z'),
      'Africa/Lagos',
    )
    expect(s.spentTodayCents).toBe(1000)
    expect(s.spentThisMonthByPayee.wanjiru).toBe(2000)
    expect([...s.paidPaymentIds].sort()).toEqual(['a', 'b'])
  })

  it('keeps operator-signed payments out of the agent budget but still blocks paying them twice', () => {
    const s = summarize(
      [rec({ paymentId: 'big', cents: 4000, approvedBy: 'operator', code: 'APPROVED_BY_OPERATOR' })],
      new Date('2026-11-06T12:00:00Z'),
      'Africa/Lagos',
    )
    expect(s.spentTodayCents).toBe(0)
    expect(s.spentThisMonthByPayee.wanjiru).toBeUndefined()
    expect(s.paidPaymentIds.has('big')).toBe(true)
  })
})
