/**
 * Creates the Harmattan testnet accounts and wires the treasury's ledger-enforced controls.
 * Idempotent: rerunning skips anything already in place.
 *
 *   treasury  funded, RLUSD trust line, signer list {agent:1, limits:1, operator:2} quorum 2
 *   agent     funded with gas XRP only
 *   limits    key pair only (a signer does not need a funded account)
 *   operator  key pair only, the human approval key
 *   payees    funded demo wallets with RLUSD trust lines
 */
import 'dotenv/config'
import { Wallet } from 'xrpl'
import {
  accountUrl,
  disconnect,
  getClient,
  getSignerList,
  hasWallet,
  loadWallet,
  network,
  rlusdTrustLine,
  saveWallet,
  setRlusdTrustLine,
  setSignerList,
  stablecoin,
  updateDeployment,
  xrpBalance,
  type Role,
} from '../ledger/src/index.ts'
import { DEMO_PAYEES } from './demo-payees.ts'

async function ensureWallet(role: Role, fund: boolean): Promise<Wallet> {
  const client = await getClient()
  if (hasWallet(role)) {
    const w = loadWallet(role)
    if (fund && Number(await xrpBalance(w.classicAddress)) === 0) {
      await client.fundWallet(w, { faucetHost: network().faucetHost })
      console.log(`  funded ${role} ${w.classicAddress}`)
    }
    return w
  }
  const w = Wallet.generate()
  saveWallet(role, w)
  if (fund) await client.fundWallet(w, { faucetHost: network().faucetHost })
  console.log(`  created ${role} ${w.classicAddress}${fund ? ' (funded from faucet)' : ''}`)
  return w
}

async function ensureTrustLine(role: Role, wallet: Wallet, txLabel: string): Promise<void> {
  if (await rlusdTrustLine(wallet.classicAddress)) return
  const out = await setRlusdTrustLine(wallet)
  if (!out.success) throw new Error(`TrustSet for ${role} failed: ${out.result} ${out.message ?? ''}`)
  console.log(`  RLUSD trust line for ${role}: ${out.explorerUrl}`)
  updateDeployment((d) => {
    d.txs[txLabel] = out.hash
  })
}

async function main() {
  const net = network()
  const asset = stablecoin()
  console.log(`Harmattan setup on ${net.name} (${net.wss})`)
  console.log(`Stablecoin ${asset.symbol} issuer ${asset.issuer} (source: ${asset.source})\n`)

  console.log('Accounts')
  const treasury = await ensureWallet('treasury', true)
  const agent = await ensureWallet('agent', true)
  const limits = await ensureWallet('limits', false)
  const operator = await ensureWallet('operator', false)

  updateDeployment((d) => {
    d.network = net.name
    d.stablecoin = asset
    d.accounts = {
      treasury: treasury.classicAddress,
      agent: agent.classicAddress,
      limits: limits.classicAddress,
      operator: operator.classicAddress,
    }
  })

  console.log('\nTreasury trust line')
  await ensureTrustLine('treasury', treasury, 'treasuryTrustSet')

  console.log('\nTreasury signer list (agent 1 + limits 1 + operator 2, quorum 2)')
  const wanted = [
    { role: 'agent', account: agent.classicAddress, weight: 1 },
    { role: 'limits', account: limits.classicAddress, weight: 1 },
    { role: 'operator', account: operator.classicAddress, weight: 2 },
  ]
  const current = await getSignerList(treasury.classicAddress)
  const matches =
    current?.quorum === 2 &&
    wanted.every((w) => current.entries.some((e) => e.account === w.account && e.weight === w.weight)) &&
    current.entries.length === wanted.length
  if (!matches) {
    const out = await setSignerList(treasury, wanted, 2)
    if (!out.success) throw new Error(`SignerListSet failed: ${out.result}`)
    console.log(`  installed: ${out.explorerUrl}`)
    updateDeployment((d) => {
      d.txs.treasurySignerListSet = out.hash
    })
  } else {
    console.log('  already installed')
  }
  updateDeployment((d) => {
    d.signerList = { quorum: 2, entries: wanted }
  })

  console.log('\nPayees')
  for (const p of DEMO_PAYEES) {
    const role = `payee-${p.id}` as const
    const w = await ensureWallet(role, true)
    await ensureTrustLine(role, w, `payee-${p.id}TrustSet`)
    updateDeployment((d) => {
      d.payees[p.id] = { ...p, address: w.classicAddress }
    })
  }

  console.log('\nDone. Treasury:', accountUrl(treasury.classicAddress))
  console.log('Next: fund the treasury with RLUSD (pnpm status shows how), then run `pnpm agent`.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(disconnect)
