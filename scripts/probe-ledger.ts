/**
 * Probes what XRPL testnet actually enforces for Harmattan's design and records the results in
 * deployments/<network>.json. Transactions are signed by hand so xrpl.js's local validation does not
 * hide what the ledger itself says.
 *
 *  1. PaymentChannelCreate denominated in RLUSD            (are token payment channels supported?)
 *  2. EscrowCreate of RLUSD from the treasury              (can RLUSD be locked in a token escrow?)
 *  3. EscrowCreate of a token whose issuer allows locking   (control: TokenEscrow itself works)
 *  4. PaymentChannelCreate in XRP with the agent as signer  (control: XRP channels work)
 *  5. The agent multisigns a treasury payment alone         (quorum enforced?)
 *  6. The agent single-signs as the treasury                (no authority over the account?)
 */
import 'dotenv/config'
import { sign as keypairSign } from 'ripple-keypairs'
import { Wallet, encode, encodeForSigning, isoTimeToRippleTime, xrpToDrops, type Transaction } from 'xrpl'
import {
  buildRlusdPayment,
  cosign,
  disconnect,
  getClient,
  loadWallet,
  network,
  prepareMultisig,
  readDeployment,
  rlusd,
  signAndSubmit,
  submitBlob,
  toCents,
  updateDeployment,
  type TxOutcome,
} from '../ledger/src/index.ts'

type Raw = Record<string, unknown>

async function prepareRaw(tx: Raw, account: string): Promise<Raw> {
  const client = await getClient()
  const info = await client.request({ command: 'account_info', account, ledger_index: 'current' })
  const ledger = await client.getLedgerIndex()
  return { ...tx, Sequence: info.result.account_data.Sequence, Fee: '12', LastLedgerSequence: ledger + 20, Flags: 0 }
}

/** Single-signs without xrpl.js validation, so malformed-by-design probes reach the server. */
function rawSign(wallet: Wallet, tx: Raw): string {
  const withKey = { ...tx, SigningPubKey: wallet.publicKey }
  const signature = keypairSign(encodeForSigning(withKey as unknown as Transaction), wallet.privateKey)
  return encode({ ...withKey, TxnSignature: signature } as unknown as Transaction)
}

const results: Array<{ key: string; expect: string; out: TxOutcome; note: string }> = []

function record(key: string, expect: string, out: TxOutcome, note: string) {
  results.push({ key, expect, out, note })
  const ok = expect.split('|').includes(out.result)
  console.log(`${ok ? 'as expected' : 'UNEXPECTED '}  ${key.padEnd(30)} ${out.result.padEnd(18)} ${out.applied ? out.explorerUrl : '(rejected before ledger, no fee)'}`)
}

async function main() {
  const client = await getClient()
  const d = readDeployment()
  const treasury = loadWallet('treasury')
  const agent = loadWallet('agent')
  const payee = d.payees.wanjiru?.address
  if (!payee || !d.accounts.treasury) throw new Error('Run pnpm setup:testnet first')
  const now = Math.floor(Date.now() / 1000)
  const rippleTime = (offsetSec: number) => isoTimeToRippleTime(new Date((now + offsetSec) * 1000).toISOString())

  console.log(`Probing ${network().name}\n`)

  // 1. Token payment channel
  {
    const tx = await prepareRaw(
      {
        TransactionType: 'PaymentChannelCreate',
        Account: treasury.classicAddress,
        Destination: payee,
        Amount: rlusd(toCents('1')),
        SettleDelay: 3600,
        PublicKey: agent.publicKey,
      },
      treasury.classicAddress,
    )
    record('rlusdPaymentChannel', 'temBAD_AMOUNT', await submitBlob(rawSign(treasury, tx)), 'PaymentChannelCreate with an RLUSD Amount')
  }

  // 2. RLUSD token escrow
  {
    const tx = await prepareRaw(
      {
        TransactionType: 'EscrowCreate',
        Account: treasury.classicAddress,
        Destination: payee,
        Amount: rlusd(toCents('1')),
        FinishAfter: rippleTime(60),
        CancelAfter: rippleTime(3600),
      },
      treasury.classicAddress,
    )
    record('rlusdTokenEscrow', 'tecNO_PERMISSION', await submitBlob(rawSign(treasury, tx)), 'EscrowCreate of RLUSD; issuer has allowTrustLineLocking unset')
  }

  // 3 + 4. Controls from a throwaway probe issuer/holder
  const issuer = Wallet.generate()
  const holder = Wallet.generate()
  await client.fundWallet(issuer, { faucetHost: network().faucetHost })
  await client.fundWallet(holder, { faucetHost: network().faucetHost })
  await signAndSubmit(issuer, { TransactionType: 'AccountSet', Account: issuer.classicAddress, SetFlag: 17 }) // asfAllowTrustLineLocking
  await signAndSubmit(holder, {
    TransactionType: 'TrustSet',
    Account: holder.classicAddress,
    LimitAmount: { currency: 'PRB', issuer: issuer.classicAddress, value: '1000' },
  })
  await signAndSubmit(issuer, {
    TransactionType: 'Payment',
    Account: issuer.classicAddress,
    Destination: holder.classicAddress,
    Amount: { currency: 'PRB', issuer: issuer.classicAddress, value: '100' },
  })
  {
    const tx = await prepareRaw(
      {
        TransactionType: 'EscrowCreate',
        Account: holder.classicAddress,
        Destination: payee,
        Amount: { currency: 'PRB', issuer: issuer.classicAddress, value: '10' },
        FinishAfter: rippleTime(60),
        CancelAfter: rippleTime(3600),
      },
      holder.classicAddress,
    )
    record('controlTokenEscrow', 'tesSUCCESS', await submitBlob(rawSign(holder, tx)), `EscrowCreate of a probe token whose issuer ${issuer.classicAddress} set allowTrustLineLocking`)
  }
  {
    const tx = await prepareRaw(
      {
        TransactionType: 'PaymentChannelCreate',
        Account: holder.classicAddress,
        Destination: payee,
        Amount: xrpToDrops(1),
        SettleDelay: 3600,
        PublicKey: agent.publicKey,
      },
      holder.classicAddress,
    )
    record('controlXrpPaymentChannel', 'tesSUCCESS', await submitBlob(rawSign(holder, tx)), 'PaymentChannelCreate in XRP with the agent key as claim signer')
  }

  // 5. Agent alone, multisigned
  {
    const tx = await prepareMultisig(buildRlusdPayment({ from: treasury.classicAddress, to: payee, cents: toCents('1'), paymentId: `probe-${now}` }), 1)
    const blob = cosign(agent, tx)
    record('agentAloneMultisig', 'tefBAD_QUORUM', await submitBlob(blob), 'Treasury RLUSD payment carrying only the agent signature (weight 1 of quorum 2)')
  }

  // 6. Agent alone, single-signed as the treasury
  {
    const tx = await prepareRaw(
      { TransactionType: 'Payment', Account: treasury.classicAddress, Destination: payee, Amount: rlusd(toCents('1')) },
      treasury.classicAddress,
    )
    record('agentSingleSignAsTreasury', 'tefBAD_AUTH|tefBAD_AUTH_MASTER', await submitBlob(rawSign(agent, tx)), 'Treasury payment single-signed with the agent key')
  }

  updateDeployment((dep) => {
    for (const r of results) {
      dep.probes[r.key] = {
        result: r.out.result,
        hash: r.out.applied ? r.out.hash : undefined,
        note: r.note,
        at: new Date().toISOString(),
      }
    }
  })
  const unexpected = results.filter((r) => !r.expect.split('|').includes(r.out.result))
  console.log(`\n${results.length - unexpected.length}/${results.length} probes as expected; recorded in deployments/${network().name}.json`)
  if (unexpected.length) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(disconnect)
