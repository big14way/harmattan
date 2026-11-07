import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { dataDir } from '../../ledger/src/index.ts'
import { runWithClaude, runWithRules, type RunReport } from './planner.ts'
import { createAgentTools } from './tools.ts'

export type Trigger = 'cli' | 'dashboard' | 'schedule'
export type PlannerChoice = 'claude' | 'rules'

export interface RunRecord extends RunReport {
  id: string
  at: string
  durationMs: number
  trigger: Trigger
  instruction: string
}

export const DEFAULT_INSTRUCTION = 'Run the scheduled payout for today.'

function runsFile(): string {
  return path.join(dataDir('agent'), 'runs.jsonl')
}

export function readRuns(limit = 20): RunRecord[] {
  if (!existsSync(runsFile())) return []
  return readFileSync(runsFile(), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RunRecord)
    .filter((r) => r.id)
    .slice(-limit)
    .reverse()
}

/** Claude when a key is set (unless the rules planner is asked for), otherwise the rules planner. */
export function resolvePlanner(requested?: PlannerChoice): PlannerChoice {
  if (requested === 'rules') return 'rules'
  return process.env.ANTHROPIC_API_KEY ? 'claude' : 'rules'
}

/** One agent run: plan, pay through the limits service, log the run. */
export async function runAgent(opts: { instruction?: string; planner?: PlannerChoice; trigger: Trigger }): Promise<RunRecord> {
  const instruction = opts.instruction?.trim() || DEFAULT_INSTRUCTION
  const planner = resolvePlanner(opts.planner)
  const tools = createAgentTools()
  const started = Date.now()
  const report = planner === 'claude' ? await runWithClaude(tools, instruction) : await runWithRules(tools, instruction)
  const record: RunRecord = {
    id: randomUUID().slice(0, 8),
    at: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    trigger: opts.trigger,
    instruction,
    ...report,
  }
  appendFileSync(runsFile(), JSON.stringify(record) + '\n')
  return record
}
