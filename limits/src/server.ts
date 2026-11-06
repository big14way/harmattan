/**
 * Harmattan limits service: the independent co-signer on the treasury.
 *
 * The treasury's signer list needs weight 2. The agent holds weight 1, this service holds weight 1,
 * the operator holds weight 2. So an agent payment only reaches the ledger if this service checks
 * it against the operator's policy and adds its signature. The agent has no write access to policy.
 *
 *   GET  /health
 *   GET  /policy                 policy + today's remaining budget (read-only, anyone)
 *   PUT  /policy                 operator only (Bearer token)
 *   POST /cosign                 { paymentId, txBlob } agent-signed Payment -> checked, co-signed, submitted
 *   GET  /decisions?limit=50     ledger log, refusals included
 */
import 'dotenv/config'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { z } from 'zod'
import { decode, type Payment } from 'xrpl'
import {
  combineSignatures,
  cosign,
  dataDir,
  loadWallet,
  readDeployment,
  stablecoin,
  submitBlob,
} from '../../ledger/src/index.ts'
import { appendDecision, calendarKeys, readDecisions, summarize, type DecisionRecord } from './decisions.ts'
import { evaluatePayment } from './evaluate.ts'
import { applyPolicyUpdate, loadPolicy, PolicyUpdateSchema, savePolicy } from './policy.ts'
import { hasOnlyValidSignatureFrom } from './verify.ts'

const PORT = Number(process.env.LIMITS_PORT ?? process.env.PORT ?? 8787)

/** Operator bearer token: env in deployment, else generated once into the git-ignored data dir. */
function operatorToken(): string {
  if (process.env.HARMATTAN_OPERATOR_TOKEN) return process.env.HARMATTAN_OPERATOR_TOKEN
  const file = path.join(dataDir('keys'), 'operator-token')
  if (!existsSync(file)) writeFileSync(file, randomBytes(24).toString('hex') + '\n', { mode: 0o600 })
  return readFileSync(file, 'utf8').trim()
}

const deployment = readDeployment()
const treasury = deployment.accounts.treasury
const agentAddress = deployment.accounts.agent
if (!treasury || !agentAddress) throw new Error('No deployment record. Run `pnpm setup:testnet` first.')
const signer = loadWallet('limits')
const asset = stablecoin()
const token = operatorToken()

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
  })
  res.end(JSON.stringify(body, null, 2))
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > 64_000) throw new Error('Body too large')
    chunks.push(c as Buffer)
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

function isOperator(req: IncomingMessage): boolean {
  const h = req.headers.authorization ?? ''
  const given = Buffer.from(h.replace(/^Bearer\s+/i, ''))
  const want = Buffer.from(token)
  return given.length === want.length && timingSafeEqual(given, want)
}

function policyView() {
  const policy = loadPolicy()
  const spend = summarize(readDecisions(), new Date(), policy.timezone)
  return {
    policy,
    treasury,
    asset,
    signers: { agent: agentAddress, limits: signer.classicAddress, operator: deployment.accounts.operator ?? null },
    today: {
      ...calendarKeys(new Date(), policy.timezone),
      spentCents: spend.spentTodayCents,
      remainingCents: Math.max(0, policy.dailyBudgetCents - spend.spentTodayCents),
    },
    spentThisMonthByPayee: spend.spentThisMonthByPayee,
  }
}

const CosignRequest = z.object({ paymentId: z.string().min(1).max(64), txBlob: z.string().regex(/^[0-9A-Fa-f]+$/) })

// Co-sign requests are handled one at a time so two payments can never both fit the same budget.
let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

async function handleCosign(body: unknown) {
  const { paymentId, txBlob } = CosignRequest.parse(body)
  const policy = loadPolicy()
  const now = new Date()
  const spend = summarize(readDecisions(), now, policy.timezone)
  const tx = decode(txBlob) as unknown as Payment
  const decision = evaluatePayment({
    policy,
    spend,
    tx,
    paymentId,
    treasury: treasury!,
    asset,
    agentSignatureValid: hasOnlyValidSignatureFrom(txBlob, agentAddress!),
  })
  const base: DecisionRecord = {
    id: randomUUID(),
    at: now.toISOString(),
    ...calendarKeys(now, policy.timezone),
    paymentId,
    payeeId: decision.payeeId,
    destination: String(tx.Destination ?? ''),
    cents: decision.cents,
    outcome: 'refused',
    code: decision.code,
    reason: decision.reason,
    approvedBy: null,
  }
  if (!decision.ok) {
    appendDecision(base)
    return { status: 403, body: { status: 'refused', code: decision.code, reason: decision.reason, needsApproval: decision.needsApproval } }
  }

  const { Signers: _agentSigners, ...unsigned } = tx as Payment & { Signers?: unknown }
  const mine = cosign(signer, unsigned as Payment)
  const combined = combineSignatures([txBlob, mine])
  const outcome = await submitBlob(combined)
  const record: DecisionRecord = {
    ...base,
    outcome: outcome.success ? 'cosigned' : 'failed',
    code: outcome.success ? 'OK' : decision.code,
    reason: outcome.success ? 'Within policy; co-signed and validated' : `Ledger rejected: ${outcome.result}`,
    approvedBy: 'limits',
    txHash: outcome.hash,
    ledgerResult: outcome.result,
    explorerUrl: outcome.explorerUrl,
  }
  appendDecision(record)
  return {
    status: outcome.success ? 200 : 502,
    body: { status: outcome.success ? 'paid' : 'failed', code: record.code, reason: record.reason, tx: outcome },
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method === 'OPTIONS') return send(res, 204, {})
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, treasury, signer: signer.classicAddress })
    }
    if (req.method === 'GET' && url.pathname === '/policy') return send(res, 200, policyView())
    if (req.method === 'PUT' && url.pathname === '/policy') {
      if (!isOperator(req)) return send(res, 401, { error: 'Operator token required' })
      const update = PolicyUpdateSchema.parse(await readJson(req))
      savePolicy(applyPolicyUpdate(loadPolicy(), update, 'operator'))
      return send(res, 200, policyView())
    }
    if (req.method === 'POST' && url.pathname === '/cosign') {
      const body = await readJson(req)
      const out = await serialized(() => handleCosign(body))
      return send(res, out.status, out.body)
    }
    if (req.method === 'GET' && url.pathname === '/decisions') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 500)
      return send(res, 200, readDecisions().slice(-limit).reverse())
    }
    send(res, 404, { error: 'Not found' })
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : (err as Error).message
    send(res, 400, { error: msg })
  }
})

server.listen(PORT, () => {
  console.log(`limits service on :${PORT}  co-signer ${signer.classicAddress}  treasury ${treasury}`)
})
