import type { IssuedCurrencyAmount, Payment, TrustSet, Wallet } from 'xrpl'
import { createHash } from 'node:crypto'
import { getClient } from './client.ts'
import { stablecoin } from './config.ts'
import { fromCents } from './money.ts'
import { signAndSubmit, type TxOutcome } from './submit.ts'

export function rlusd(cents: number): IssuedCurrencyAmount {
  const asset = stablecoin()
  return { currency: asset.currency, issuer: asset.issuer, value: fromCents(cents) }
}

export interface TrustLineState {
  balance: string
  limit: string
}

export async function rlusdTrustLine(address: string): Promise<TrustLineState | null> {
  const client = await getClient()
  const asset = stablecoin()
  try {
    const res = await client.request({
      command: 'account_lines',
      account: address,
      peer: asset.issuer,
      ledger_index: 'validated',
    })
    const line = res.result.lines.find((l) => l.currency === asset.currency)
    return line ? { balance: line.balance, limit: line.limit } : null
  } catch (err) {
    if ((err as { data?: { error?: string } }).data?.error === 'actNotFound') return null
    throw err
  }
}

export async function rlusdBalance(address: string): Promise<string> {
  return (await rlusdTrustLine(address))?.balance ?? '0'
}

export async function xrpBalance(address: string): Promise<string> {
  const client = await getClient()
  try {
    return String(await client.getXrpBalance(address))
  } catch (err) {
    if ((err as { data?: { error?: string } }).data?.error === 'actNotFound') return '0'
    throw err
  }
}

export async function setRlusdTrustLine(wallet: Wallet, limit = '1000000'): Promise<TxOutcome> {
  const asset = stablecoin()
  const tx: TrustSet = {
    TransactionType: 'TrustSet',
    Account: wallet.classicAddress,
    LimitAmount: { currency: asset.currency, issuer: asset.issuer, value: limit },
  }
  return signAndSubmit(wallet, tx)
}

/** 256-bit InvoiceID derived from Harmattan's payment id, so the ledger record links back to it. */
export function invoiceIdFor(paymentId: string): string {
  return createHash('sha256').update(`harmattan:${paymentId}`).digest('hex').toUpperCase()
}

function hex(s: string): string {
  return Buffer.from(s, 'utf8').toString('hex').toUpperCase()
}

export interface RlusdPaymentInput {
  from: string
  to: string
  cents: number
  paymentId: string
  memo?: string
}

export function buildRlusdPayment(input: RlusdPaymentInput): Payment {
  return {
    TransactionType: 'Payment',
    Account: input.from,
    Destination: input.to,
    Amount: rlusd(input.cents),
    InvoiceID: invoiceIdFor(input.paymentId),
    Memos: [
      {
        Memo: {
          MemoType: hex('harmattan/payout'),
          MemoData: hex(JSON.stringify({ id: input.paymentId, note: input.memo ?? '' })),
        },
      },
    ],
  }
}
