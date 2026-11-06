/**
 * Operator-side treasury top-up: buys RLUSD with XRP on the XRPL testnet AMM (XRP/RLUSD pool),
 * signed with the treasury master key. The agent never holds this key.
 *
 *   pnpm topup --rlusd 5                    buy 5 RLUSD with treasury XRP
 *   pnpm topup --rlusd 20 --faucet-xrp 3    first sweep 3 faucet-funded throwaway accounts into the treasury
 *
 * The RLUSD faucet at tryrlusd.com is the other route (10 RLUSD per 24h, GitHub sign-in).
 */
import 'dotenv/config'
import { parseArgs } from 'node:util'
import { Wallet, dropsToXrp, xrpToDrops, type Payment } from 'xrpl'
import {
  disconnect,
  getClient,
  loadWallet,
  network,
  rlusd,
  rlusdBalance,
  signAndSubmit,
  stablecoin,
  toCents,
  updateDeployment,
  xrpBalance,
} from '../ledger/src/index.ts'

const RESERVE_KEEP_XRP = 10

async function sweepFaucet(treasury: string, count: number) {
  const client = await getClient()
  for (let i = 0; i < count; i++) {
    const w = Wallet.generate()
    await client.fundWallet(w, { faucetHost: network().faucetHost })
    const bal = Number(await xrpBalance(w.classicAddress))
    const send = Math.floor((bal - 1.1) * 1e6) / 1e6
    const out = await signAndSubmit(w, {
      TransactionType: 'Payment',
      Account: w.classicAddress,
      Destination: treasury,
      Amount: xrpToDrops(send),
    })
    console.log(`  swept ${send} XRP from faucet account ${w.classicAddress}: ${out.result}`)
  }
}

async function quoteXrpForRlusd(rlusdWanted: number): Promise<number> {
  const client = await getClient()
  const asset = stablecoin()
  const res = await client.request({
    command: 'amm_info',
    asset: { currency: 'XRP' },
    asset2: { currency: asset.currency, issuer: asset.issuer },
    ledger_index: 'validated',
  })
  const amm = res.result.amm
  const xrpPool = Number(dropsToXrp(amm.amount as string))
  const rlPool = Number((amm.amount2 as { value: string }).value)
  const fee = amm.trading_fee / 100_000
  if (rlusdWanted >= rlPool) throw new Error('Pool too small')
  const xrpIn = (rlusdWanted * xrpPool) / (rlPool - rlusdWanted) / (1 - fee)
  console.log(`  AMM ${amm.account}: ${xrpPool.toFixed(0)} XRP / ${rlPool.toFixed(2)} RLUSD, fee ${(fee * 100).toFixed(3)}%`)
  return xrpIn
}

async function main() {
  const { values } = parseArgs({
    options: { rlusd: { type: 'string' }, 'faucet-xrp': { type: 'string', default: '0' } },
  })
  if (!values.rlusd) throw new Error('Pass --rlusd <amount>')
  const cents = toCents(values.rlusd)
  const treasury = loadWallet('treasury')

  const sweeps = Math.min(Number(values['faucet-xrp']), 10)
  if (sweeps > 0) {
    console.log(`Sweeping ${sweeps} faucet accounts into the treasury`)
    await sweepFaucet(treasury.classicAddress, sweeps)
  }

  const quote = await quoteXrpForRlusd(cents / 100)
  const sendMax = Math.ceil(quote * 1.02 * 1e6) / 1e6
  const available = Number(await xrpBalance(treasury.classicAddress)) - RESERVE_KEEP_XRP
  console.log(`  buying ${values.rlusd} RLUSD for at most ${sendMax} XRP (treasury spendable ${available.toFixed(2)} XRP)`)
  if (sendMax > available) throw new Error(`Not enough XRP. Add --faucet-xrp ${Math.ceil((sendMax - available) / 98)}`)

  const tx: Payment = {
    TransactionType: 'Payment',
    Account: treasury.classicAddress,
    Destination: treasury.classicAddress,
    Amount: rlusd(cents),
    SendMax: xrpToDrops(sendMax),
  }
  const out = await signAndSubmit(treasury, tx)
  console.log(`  ${out.result} ${out.explorerUrl}`)
  if (!out.success) throw new Error(`Swap failed: ${out.result}`)
  updateDeployment((d) => {
    d.txs[`treasuryTopup-${new Date().toISOString()}`] = out.hash
  })
  console.log(`Treasury RLUSD balance: ${await rlusdBalance(treasury.classicAddress)}`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(disconnect)
