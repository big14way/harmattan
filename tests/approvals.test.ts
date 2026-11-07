import { describe, expect, it } from 'vitest'
import { Wallet, type Payment } from 'xrpl'
import { RLUSD_TESTNET } from '../ledger/src/config.ts'
import { toCents } from '../ledger/src/money.ts'
import { buildRlusdPayment } from '../ledger/src/rlusd.ts'
import { checkApprovalTx, payoutNote } from '../limits/src/approvals.ts'

const treasury = Wallet.generate().classicAddress
const thandi = Wallet.generate().classicAddress
const ctx = { treasury, asset: RLUSD_TESTNET }
const approval = { paymentId: 'thandi-launch-video', destination: thandi, cents: toCents('40') }

function signedByOperator(patch: Partial<Payment> = {}, paymentId = approval.paymentId, amount = '40'): Payment {
  return {
    ...buildRlusdPayment({ from: treasury, to: thandi, cents: toCents(amount), paymentId, memo: 'Launch video' }),
    Fee: '24',
    Sequence: 5,
    LastLedgerSequence: 900,
    SigningPubKey: '',
    ...patch,
  } as Payment
}

describe('checkApprovalTx', () => {
  it('accepts exactly the requested payment', () => {
    expect(checkApprovalTx(signedByOperator(), approval, ctx)).toEqual({ ok: true })
  })

  it('rejects a different payee address', () => {
    const tx = signedByOperator({ Destination: Wallet.generate().classicAddress })
    expect(checkApprovalTx(tx, approval, ctx)).toMatchObject({ ok: false })
  })

  it('rejects a different amount', () => {
    expect(checkApprovalTx(signedByOperator({}, approval.paymentId, '400'), approval, ctx)).toMatchObject({ ok: false })
  })

  it('rejects a payment bound to another payment id', () => {
    expect(checkApprovalTx(signedByOperator({}, 'something-else'), approval, ctx)).toMatchObject({ ok: false })
  })

  it('rejects cross-currency fields', () => {
    expect(checkApprovalTx(signedByOperator({ SendMax: '1000000' }), approval, ctx)).toMatchObject({ ok: false })
  })
})

describe('payoutNote', () => {
  it('reads the note from a Harmattan payout memo', () => {
    expect(payoutNote(signedByOperator())).toBe('Launch video')
  })

  it('returns an empty note for missing or foreign memos', () => {
    expect(payoutNote({})).toBe('')
    expect(payoutNote({ Memos: [{ Memo: { MemoData: 'ZZ' } }] })).toBe('')
  })
})
