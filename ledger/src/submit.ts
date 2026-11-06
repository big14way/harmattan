import { decode, hashes, type SubmittableTransaction, type Wallet } from 'xrpl'
import { getClient } from './client.ts'
import { txUrl } from './explorer.ts'

export interface TxOutcome {
  hash: string
  /** Engine result code, e.g. tesSUCCESS, tecNO_PERMISSION, temBAD_AMOUNT, tefBAD_QUORUM. */
  result: string
  /** True when the transaction is in a validated ledger (tes or tec). */
  applied: boolean
  /** True only for tesSUCCESS in a validated ledger. */
  success: boolean
  ledgerIndex?: number
  explorerUrl: string
  message?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Submits a signed blob and waits for a final outcome. Unlike submitAndWait, a tem/tef/tel
 * rejection returns at once (it can never be validated) instead of waiting out LastLedgerSequence.
 */
export async function submitBlob(txBlob: string): Promise<TxOutcome> {
  const client = await getClient()
  const hash = hashes.hashSignedTx(txBlob)
  const explorerUrl = txUrl(hash)
  const sub = await client.request({ command: 'submit', tx_blob: txBlob })
  const prelim = sub.result.engine_result
  if (/^(tem|tef|tel)/.test(prelim)) {
    return {
      hash,
      result: prelim,
      applied: false,
      success: false,
      explorerUrl,
      message: sub.result.engine_result_message,
    }
  }
  const lastLedger = Number((decode(txBlob) as { LastLedgerSequence?: number }).LastLedgerSequence ?? 0)
  for (;;) {
    await sleep(1000)
    try {
      const tx = await client.request({ command: 'tx', transaction: hash })
      if (tx.result.validated) {
        const meta = tx.result.meta
        const result = typeof meta === 'object' && meta ? meta.TransactionResult : 'unknown'
        return {
          hash,
          result,
          applied: true,
          success: result === 'tesSUCCESS',
          ledgerIndex: tx.result.ledger_index,
          explorerUrl,
        }
      }
    } catch (err) {
      const code = (err as { data?: { error?: string } }).data?.error
      if (code !== 'txnNotFound') throw err
    }
    if (lastLedger && (await client.getLedgerIndex()) > lastLedger) {
      return { hash, result: prelim, applied: false, success: false, explorerUrl, message: 'expired: LastLedgerSequence passed' }
    }
  }
}

/** Autofills, signs with a single key and submits. */
export async function signAndSubmit(wallet: Wallet, tx: SubmittableTransaction): Promise<TxOutcome> {
  const client = await getClient()
  const prepared = await client.autofill(tx)
  const { tx_blob } = wallet.sign(prepared)
  return submitBlob(tx_blob)
}
