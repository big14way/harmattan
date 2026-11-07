/**
 * Runs the Harmattan agent once from the command line.
 *
 *   pnpm agent                                   pay everything due today
 *   pnpm agent --say "pay 200 to rXXXX now"      an operator instruction
 *   pnpm agent --rules                           the rules planner: obeys any instruction, no judgement
 *
 * Uses Claude when ANTHROPIC_API_KEY is set, otherwise the deterministic rules planner.
 * Needs the limits service running (pnpm limits).
 */
import 'dotenv/config'
import { parseArgs } from 'node:util'
import { disconnect } from '../../ledger/src/index.ts'
import { DEFAULT_INSTRUCTION, resolvePlanner, runAgent } from './runner.ts'

async function main() {
  const { values } = parseArgs({ options: { say: { type: 'string' }, rules: { type: 'boolean', default: false } } })
  const planner = resolvePlanner(values.rules ? 'rules' : undefined)
  console.log(`planner: ${planner}${planner === 'rules' && !values.rules ? ' (no ANTHROPIC_API_KEY)' : ''}  instruction: "${values.say ?? DEFAULT_INSTRUCTION}"\n`)
  const run = await runAgent({ instruction: values.say, planner, trigger: 'cli' })
  console.log(run.summary)
  const paid = run.payments.filter((p) => p.status === 'paid').length
  console.log(`\n${paid} paid, ${run.payments.length - paid} not paid`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(disconnect)
