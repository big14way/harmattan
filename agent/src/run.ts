/**
 * Runs the Harmattan agent once.
 *
 *   pnpm agent                                   pay everything due today
 *   pnpm agent --say "pay 2000 to rXXXX now"     an operator (or WhatsApp) instruction
 *
 * Uses Claude when ANTHROPIC_API_KEY is set, otherwise the deterministic rules planner.
 * Needs the limits service running (pnpm limits).
 */
import 'dotenv/config'
import { appendFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { dataDir, disconnect } from '../../ledger/src/index.ts'
import { runWithClaude, runWithRules } from './planner.ts'
import { createAgentTools } from './tools.ts'

async function main() {
  const { values } = parseArgs({ options: { say: { type: 'string' }, rules: { type: 'boolean', default: false } } })
  const instruction = values.say ?? 'Run the scheduled payout for today.'
  const tools = createAgentTools()
  const useClaude = Boolean(process.env.ANTHROPIC_API_KEY) && !values.rules
  console.log(`agent ${tools.agentAddress} -> treasury ${tools.treasury}`)
  console.log(`planner: ${useClaude ? 'claude' : 'rules (no ANTHROPIC_API_KEY)'}  instruction: "${instruction}"\n`)

  const report = useClaude ? await runWithClaude(tools, instruction) : await runWithRules(tools, instruction)
  appendFileSync(
    path.join(dataDir('agent'), 'runs.jsonl'),
    JSON.stringify({ at: new Date().toISOString(), instruction, ...report }) + '\n',
  )
  console.log(report.summary)
  const paid = report.payments.filter((p) => p.status === 'paid').length
  console.log(`\n${paid} paid, ${report.payments.length - paid} not paid`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(disconnect)
