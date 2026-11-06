import { multisign, type SignerListSet, type SubmittableTransaction, type Wallet } from 'xrpl'
import { getClient } from './client.ts'
import { signAndSubmit, type TxOutcome } from './submit.ts'

export interface SignerEntryInput {
  account: string
  weight: number
}

/**
 * Installs the treasury's signer list. With quorum 2 and the agent and limits service at
 * weight 1 each, no payment can leave the treasury unless the limits service co-signs it.
 */
export async function setSignerList(
  owner: Wallet,
  entries: SignerEntryInput[],
  quorum: number,
): Promise<TxOutcome> {
  const tx: SignerListSet = {
    TransactionType: 'SignerListSet',
    Account: owner.classicAddress,
    SignerQuorum: quorum,
    SignerEntries: entries.map((e) => ({ SignerEntry: { Account: e.account, SignerWeight: e.weight } })),
  }
  return signAndSubmit(owner, tx)
}

export interface SignerListState {
  quorum: number
  entries: SignerEntryInput[]
}

export async function getSignerList(address: string): Promise<SignerListState | null> {
  const client = await getClient()
  const res = await client.request({ command: 'account_info', account: address, signer_lists: true, ledger_index: 'validated' })
  const list = (res.result as { signer_lists?: Array<{ SignerQuorum: number; SignerEntries: Array<{ SignerEntry: { Account: string; SignerWeight: number } }> }> }).signer_lists?.[0]
    ?? (res.result.account_data as { signer_lists?: Array<{ SignerQuorum: number; SignerEntries: Array<{ SignerEntry: { Account: string; SignerWeight: number } }> }> }).signer_lists?.[0]
  if (!list) return null
  return {
    quorum: list.SignerQuorum,
    entries: list.SignerEntries.map((e) => ({ account: e.SignerEntry.Account, weight: e.SignerEntry.SignerWeight })),
  }
}

/** Autofills a transaction that will carry `signers` multisignatures (fee scales with signer count). */
export async function prepareMultisig<T extends SubmittableTransaction>(tx: T, signers: number): Promise<T> {
  const client = await getClient()
  return client.autofill(tx, signers)
}

/** One signer's contribution to a multisigned transaction. */
export function cosign(wallet: Wallet, prepared: SubmittableTransaction): string {
  return wallet.sign(prepared, true).tx_blob
}

export function combineSignatures(blobs: string[]): string {
  return multisign(blobs)
}
