/**
 * Starts the limits service, the agent service and the operator dashboard in one container (the
 * hosted demo on a single free web service). Each child gets only the secrets its role needs:
 * the agent process never sees the operator key or token, the limits service never sees the agent
 * or operator key, and the dashboard never sees the agent or limits key.
 *
 *   node scripts/start-all.ts        (PORT is the public port, for the dashboard)
 *
 * Node runs the TypeScript directly (type stripping), with no compiler process beside each role:
 * the free instance has 512 MB for all three.
 *
 * HARMATTAN_DEMO_SCHEDULE=demo puts today's demo payouts on the schedule when the schedule is
 * empty. A free host wipes the disk on every restart and sleep, so the hosted demo would otherwise
 * wake up with nothing to pay. This only writes the schedule; nothing is paid until someone runs it.
 * The dashboard gets it too, to offer "Run the demo again" once a demo is finished.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'

const PORT = process.env.PORT ?? '3400'
const LIMITS_PORT = process.env.LIMITS_PORT ?? '8787'
const AGENT_PORT = process.env.AGENT_PORT ?? '8788'
// A 2 MB young generation instead of the default 16 MB per process. Measured locally with page
// loads and an agent run, it takes the peak for all three roles from about 500 MB to about 430 MB.
const LEAN = ['--max-semi-space-size=2']
const internal = { LIMITS_URL: `http://127.0.0.1:${LIMITS_PORT}`, AGENT_URL: `http://127.0.0.1:${AGENT_PORT}` }

const SHARED = ['PATH', 'HOME', 'NODE_ENV', 'TZ', 'XRPL_NETWORK', 'HARMATTAN_DATA_DIR', 'HARMATTAN_COMPANY_NAME', 'HARMATTAN_PUBLIC_URL', 'RENDER_EXTERNAL_URL']
const RECEIPTS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'HARMATTAN_OPERATOR_WHATSAPP']
const PUBLIC_DEMO = ['HARMATTAN_PUBLIC_DEMO', 'HARMATTAN_PUBLIC_APPROVAL_MAX', 'HARMATTAN_PUBLIC_DAILY_RLUSD']

function envFor(keys: string[], extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const k of [...SHARED, ...keys]) if (process.env[k] !== undefined) env[k] = process.env[k]
  // Receipts link to the payee page on the public URL; Render provides RENDER_EXTERNAL_URL.
  if (!env.HARMATTAN_PUBLIC_URL && env.RENDER_EXTERNAL_URL) env.HARMATTAN_PUBLIC_URL = env.RENDER_EXTERNAL_URL
  return { ...env, ...extra }
}

// A one-off process, so the supervisor never loads the ledger library and stays small.
const demo = process.env.HARMATTAN_DEMO_SCHEDULE
if (demo) {
  const seeded = spawnSync('node', ['scripts/seed-payables.ts', demo, '--if-empty'], { env: envFor([], {}), stdio: 'inherit' })
  if (seeded.status !== 0) console.error(`[start] could not put the ${demo} payouts on the schedule (exit ${seeded.status})`)
}

const roles: Array<{ name: string; cmd: string[]; env: NodeJS.ProcessEnv }> = [
  {
    name: 'limits',
    cmd: ['node', ...LEAN, 'limits/src/server.ts'],
    env: envFor(['HARMATTAN_LIMITS_SEED', 'HARMATTAN_OPERATOR_TOKEN'], { LIMITS_PORT }),
  },
  {
    name: 'agent',
    cmd: ['node', ...LEAN, 'agent/src/server.ts'],
    env: envFor(['HARMATTAN_AGENT_SEED', 'HARMATTAN_AGENT_TRIGGER_TOKEN', 'ANTHROPIC_API_KEY', 'HARMATTAN_MODEL', 'HARMATTAN_AGENT_SCHEDULE', ...RECEIPTS], { AGENT_PORT, LIMITS_URL: internal.LIMITS_URL }),
  },
  {
    name: 'dashboard',
    cmd: ['node', ...LEAN, 'node_modules/next/dist/bin/next', 'start', '-p', PORT, '-H', '0.0.0.0'],
    env: envFor(['HARMATTAN_OPERATOR_SEED', 'HARMATTAN_OPERATOR_TOKEN', 'HARMATTAN_AGENT_TRIGGER_TOKEN', 'HARMATTAN_DASHBOARD_PASSWORD', 'HARMATTAN_DEMO_SCHEDULE', ...PUBLIC_DEMO, ...RECEIPTS], { ...internal, PORT }),
  },
]

const children: ChildProcess[] = []
let stopping = false

function stop(code: number) {
  if (stopping) return
  stopping = true
  for (const c of children) c.kill('SIGTERM')
  setTimeout(() => process.exit(code), 3000).unref()
}

for (const role of roles) {
  const cwd = role.name === 'dashboard' ? 'operator' : '.'
  const child = spawn(role.cmd[0]!, role.cmd.slice(1), { cwd, env: role.env, stdio: ['ignore', 'pipe', 'pipe'] })
  const prefix = (line: string) => `[${role.name}] ${line}`
  child.stdout?.on('data', (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach((l) => console.log(prefix(l))))
  child.stderr?.on('data', (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach((l) => console.error(prefix(l))))
  // If any role dies, take the container down so the host restarts all three together.
  child.on('exit', (code) => {
    console.error(prefix(`exited with ${code}`))
    stop(code ?? 1)
  })
  children.push(child)
}

process.on('SIGTERM', () => stop(0))
process.on('SIGINT', () => stop(0))
