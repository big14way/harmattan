/** Prints balances, the treasury's signer list and how to top up RLUSD. */
import 'dotenv/config'
import {
  accountUrl,
  disconnect,
  getClient,
  getSignerList,
  readDeployment,
  rlusdBalance,
  stablecoin,
  xrpBalance,
} from '../ledger/src/index.ts'

async function main() {
  const d = readDeployment()
  const client = await getClient()
  const info = await client.request({ command: 'server_info' })
  const vl = info.result.info.validated_ledger
  console.log(`network ${d.network}  ledger ${vl?.seq}  reserve base ${vl?.reserve_base_xrp} XRP, owner ${vl?.reserve_inc_xrp} XRP`)
  const rows: Array<[string, string | undefined]> = [
    ['treasury', d.accounts.treasury],
    ['agent', d.accounts.agent],
    ['limits', d.accounts.limits],
    ['operator', d.accounts.operator],
    ...Object.values(d.payees).map((p) => [`payee ${p.id}`, p.address] as [string, string]),
  ]
  for (const [label, addr] of rows) {
    if (!addr) continue
    const [xrp, rl] = await Promise.all([xrpBalance(addr), rlusdBalance(addr)])
    console.log(`${label.padEnd(16)} ${addr}  ${xrp.padStart(10)} XRP  ${rl.padStart(12)} ${stablecoin().symbol}`)
  }
  if (d.accounts.treasury) {
    const sl = await getSignerList(d.accounts.treasury)
    console.log(`\ntreasury signer list: ${sl ? `quorum ${sl.quorum}, ` + sl.entries.map((e) => `${e.account}:${e.weight}`).join(', ') : 'none'}`)
    console.log(accountUrl(d.accounts.treasury))
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(disconnect)
