/**
 * Resets the testnet demo to a known starting point, so the full demo can run again:
 *
 *   - moves the decision log, approvals, schedule, runs, receipts and invites into
 *     .data/<network>/archive/<time>/ (nothing is deleted; the ledger keeps every payment anyway)
 *   - restores the demo policy: 15 RLUSD cap, 50 RLUSD daily budget, 30 RLUSD per payee per month,
 *     the three demo payees, not paused (WhatsApp numbers already set on them are kept)
 *   - puts today's demo schedule in place with fresh payment ids
 *   - checks the treasury holds enough RLUSD for one run
 *
 *   pnpm demo:reset            (the limits service can stay running; it reads the files per request)
 */
import 'dotenv/config'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import { dataDir, disconnect, formatMoney, readDeployment, rlusdBalance, toCents } from '../ledger/src/index.ts'
import { defaultPolicy, loadPolicy, savePolicy } from '../limits/src/policy.ts'
import { scenarioTotalCents, seedScenario } from './demo-schedule.ts'

const MOVE = [
  ['limits', 'decisions.jsonl'],
  ['limits', 'approvals.json'],
  ['agent', 'payables.json'],
  ['agent', 'events.jsonl'],
  ['agent', 'runs.jsonl'],
  ['agent', 'schedule.json'],
  ['receipts', 'outbox.jsonl'],
  ['operator', 'invites.json'],
] as const

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const archive = dataDir('archive', stamp)
  let moved = 0
  for (const [dir, file] of MOVE) {
    const from = path.join(dataDir(dir), file)
    if (!existsSync(from)) continue
    mkdirSync(path.join(archive, dir), { recursive: true })
    renameSync(from, path.join(archive, dir, file))
    moved++
  }
  console.log(`archived ${moved} file(s) to ${path.relative(process.cwd(), archive)}`)

  const previous = existsSync(path.join(dataDir('limits'), 'policy.json')) ? loadPolicy() : null
  const policy = defaultPolicy()
  for (const p of Object.values(policy.payees)) {
    const phone = previous?.payees[p.id]?.phone
    if (phone) p.phone = phone
  }
  policy.updatedBy = 'demo-reset'
  savePolicy(policy)
  console.log(`policy reset: cap ${formatMoney(policy.perPaymentCapCents)}, budget ${formatMoney(policy.dailyBudgetCents)}, ${Object.keys(policy.payees).length} payees`)

  const suffix = Date.now().toString(36).slice(-5)
  for (const p of seedScenario('demo', suffix)) console.log(`scheduled ${p.id}: ${formatMoney(p.amountCents)} to ${p.payeeId}`)

  const need = scenarioTotalCents('demo')
  const have = toCents(Number(await rlusdBalance(readDeployment().accounts.treasury!)).toFixed(2))
  console.log(`\ntreasury ${formatMoney(have)}; one demo run moves ${formatMoney(need)}`)
  if (have < need) {
    const missing = Math.ceil((need - have) / 100) + 5
    console.log(`not enough for a full run: pnpm topup --rlusd ${missing} --faucet-xrp ${Math.min(10, Math.ceil((missing * 13) / 98) + 1)}`)
    process.exitCode = 2
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(disconnect)
