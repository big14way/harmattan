/**
 * Harmattan agent service: the agent as a long-running process with only its own key.
 *
 *   GET  /health
 *   POST /run      { instruction?, planner? }   start a run (trigger token required)
 *   GET  /runs     recent runs with their summaries (trigger token required)
 *
 * HARMATTAN_AGENT_SCHEDULE=09:00 runs the scheduled payout once a day at that time in the
 * operator's time zone. Unset, the agent only runs when the operator starts it.
 */
import 'dotenv/config'
import { timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { z } from 'zod'
import { agentTriggerToken, dataDir, loadWallet } from '../../ledger/src/index.ts'
import { LimitsClient } from '../../limits/src/client.ts'
import { DEFAULT_INSTRUCTION, readRuns, resolvePlanner, runAgent, type RunRecord, type Trigger } from './runner.ts'

const PORT = Number(process.env.AGENT_PORT ?? 8788)
const SCHEDULE = process.env.HARMATTAN_AGENT_SCHEDULE?.match(/^([01]\d|2[0-3]):[0-5]\d$/) ? process.env.HARMATTAN_AGENT_SCHEDULE : null
const token = agentTriggerToken()
const agentAddress = loadWallet('agent').classicAddress
const limits = new LimitsClient()

let current: { id: string; startedAt: string; trigger: Trigger; instruction: string } | null = null

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body, null, 2))
}

function authorised(req: IncomingMessage): boolean {
  const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))
  const want = Buffer.from(token)
  return given.length === want.length && timingSafeEqual(given, want)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > 16_000) throw new Error('Body too large')
    chunks.push(c as Buffer)
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

/** One run at a time: payments build on the treasury's next sequence number. */
async function start(instruction: string | undefined, planner: 'claude' | 'rules' | undefined, trigger: Trigger): Promise<RunRecord> {
  if (current) throw Object.assign(new Error('The agent is already running'), { status: 409 })
  current = { id: 'pending', startedAt: new Date().toISOString(), trigger, instruction: instruction?.trim() || DEFAULT_INSTRUCTION }
  try {
    return await runAgent({ instruction, planner, trigger })
  } finally {
    current = null
  }
}

const RunRequest = z.object({
  instruction: z.string().max(1000).optional(),
  planner: z.enum(['claude', 'rules']).optional(),
})

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, agent: agentAddress, planner: resolvePlanner(), schedule: SCHEDULE, running: current })
    }
    if (!authorised(req)) return send(res, 401, { error: 'Agent trigger token required' })
    if (req.method === 'GET' && url.pathname === '/runs') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100)
      return send(res, 200, { running: current, schedule: SCHEDULE, planner: resolvePlanner(), runs: readRuns(limit) })
    }
    if (req.method === 'POST' && url.pathname === '/run') {
      const body = RunRequest.parse(await readJson(req))
      const run = await start(body.instruction, body.planner, 'dashboard')
      return send(res, 200, run)
    }
    send(res, 404, { error: 'Not found' })
  } catch (err) {
    const status = (err as { status?: number }).status ?? (err instanceof z.ZodError ? 400 : 500)
    const msg = err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : (err as Error).message
    send(res, status, { error: msg })
  }
})

// Daily schedule, evaluated each minute in the operator's time zone (read from the limits service).
const scheduleFile = path.join(dataDir('agent'), 'schedule.json')
function lastScheduledDay(): string | null {
  return existsSync(scheduleFile) ? (JSON.parse(readFileSync(scheduleFile, 'utf8')) as { lastDay: string }).lastDay : null
}
async function tick() {
  if (!SCHEDULE || current) return
  try {
    const { policy } = await limits.policy()
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: policy.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    const day = `${get('year')}-${get('month')}-${get('day')}`
    if (`${get('hour')}:${get('minute')}` < SCHEDULE || lastScheduledDay() === day) return
    writeFileSync(scheduleFile, JSON.stringify({ lastDay: day }) + '\n')
    const run = await start(undefined, undefined, 'schedule')
    console.log(`scheduled run ${run.id}: ${run.payments.length} payment(s)`)
  } catch (err) {
    console.error('scheduled run failed:', (err as Error).message)
  }
}
if (SCHEDULE) setInterval(() => void tick(), 60_000)

server.listen(PORT, () => {
  console.log(`agent service on :${PORT}  agent ${agentAddress}  planner ${resolvePlanner()}  schedule ${SCHEDULE ?? 'off (runs when started)'}`)
})
