import { decode, deriveAddress, encodeForMultiSigning, verifyKeypairSignature, type Transaction } from 'xrpl'

interface SignerField {
  Signer: { Account: string; SigningPubKey: string; TxnSignature: string }
}

/**
 * True when the blob carries exactly one multisignature and it is a valid signature by `expected`.
 * The signer's public key must derive to the expected address (the agent signs with its master key).
 */
export function hasOnlyValidSignatureFrom(txBlob: string, expected: string): boolean {
  const tx = decode(txBlob) as unknown as Transaction & { Signers?: SignerField[]; TxnSignature?: string; SigningPubKey?: string }
  if (tx.TxnSignature) return false
  if (tx.SigningPubKey !== undefined && tx.SigningPubKey !== '') return false
  const signers = tx.Signers ?? []
  if (signers.length !== 1) return false
  const s = signers[0]!.Signer
  if (s.Account !== expected) return false
  if (deriveAddress(s.SigningPubKey) !== expected) return false
  const { Signers: _signers, ...unsigned } = tx
  const message = encodeForMultiSigning(unsigned as Transaction, expected)
  try {
    return verifyKeypairSignature(message, s.TxnSignature, s.SigningPubKey)
  } catch {
    return false
  }
}
