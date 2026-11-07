import { appendFileSync } from 'node:fs'
import path from 'node:path'
import { isValidClassicAddress } from 'xrpl'
import {
  buildRlusdPayment,
  cosign,
  dataDir,
  formatMoney,
  fromCents,
  loadWallet,
  prepareMultisig,
  readDeployment,
  rlusdBalance,
  toCents,
} from '../../ledger/src/index.ts'
import { LimitsClient, type CosignResponse } from '../../limits/src/client.ts'
import { sendPaymentReceipts } from '../../receipts/src/index.ts'
import { calendarKeys } from '../../limits/src/decisions.ts'
import { loadPayables, updatePayable } from './payables.ts'

export interface DuePayment {
  paymentId: string
  payeeId: string
  payeeName: string
  amount: string
  description: string
  dueDate: string
}

export interface PayResult {
  status: CosignResponse['status'] | 'error'
  paymentId: string
  payee: string
  amount: string
  code?: string
  reason: string
  needsApproval?: boolean
  /** Approval request the operator sees in the dashboard, when the payment needs a human. */
  approvalId?: string
  /** Receipt delivery for a paid payment: sent on WhatsApp, or logged when WhatsApp is not configured. */
  receipts?: string
  txHash?: string
  explorerUrl?: string
}

export interface PayInput {
  /** Id of a scheduled payable, when paying one. */
  paymentId?: string
  /** Payee id from the operator's directory, or a raw XRPL address. */
  payee: string
  /** Decimal RLUSD amount, e.g. "120.50". */
  amount: string
  note?: string
}

function log(event: Record<string, unknown>) {
  appendFileSync(path.join(dataDir('agent'), 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n')
}

/**
 * The agent's tools. The agent holds one key (weight 1 on the treasury signer list) and a read-only
 * view of the policy. It can propose and sign; it cannot complete a payment on its own.
 */
export function createAgentTools(limits = new LimitsClient()) {
  const deployment = readDeployment()
  const treasury = deployment.accounts.treasury
  if (!treasury) throw new Error('No treasury in deployment record. Run `pnpm setup:testnet`.')
  const agent = loadWallet('agent')

  async function listDuePayments() {
    const view = await limits.policy()
    const { day } = calendarKeys(new Date(), view.policy.timezone)
    const due: DuePayment[] = loadPayables()
      .filter((p) => p.status === 'scheduled' && p.dueDate <= day)
      .map((p) => ({
        paymentId: p.id,
        payeeId: p.payeeId,
        payeeName: view.policy.payees[p.payeeId]?.name ?? p.payeeId,
        amount: fromCents(p.amountCents),
        description: p.description,
        dueDate: p.dueDate,
      }))
    const result = {
      today: day,
      treasuryBalance: `${await rlusdBalance(treasury!)} RLUSD`,
      dailyBudgetRemaining: formatMoney(view.today.remainingCents),
      perPaymentCap: formatMoney(view.policy.perPaymentCapCents),
      paused: view.policy.paused,
      due,
    }
    log({ tool: 'list_due_payments', due: due.length })
    return result
  }

  // Payments go out one at a time: each one is built on the treasury's next sequence number, so two
  // built in parallel would collide on the ledger (tefPAST_SEQ) even though both were allowed.
  let inFlight: Promise<unknown> = Promise.resolve()
  function payPayee(input: PayInput): Promise<PayResult> {
    const run = inFlight.then(() => payOne(input), () => payOne(input))
    inFlight = run.catch(() => undefined)
    return run
  }

  async function payOne(input: PayInput): Promise<PayResult> {
    const paymentId = input.paymentId ?? `adhoc-${Date.now().toString(36)}`
    const base = { paymentId, payee: input.payee, amount: input.amount }
    let cents: number
    try {
      cents = toCents(input.amount)
    } catch (err) {
      return { ...base, status: 'error', reason: (err as Error).message }
    }
    const view = await limits.policy()
    const known = view.policy.payees[input.payee]
    const destination = known?.address ?? (isValidClassicAddress(input.payee) ? input.payee : null)
    if (!destination) {
      return { ...base, status: 'error', reason: `"${input.payee}" is neither a payee id nor an XRPL address` }
    }

    // Build and sign the treasury payment with the agent's key only. Fee is sized for 2 signers.
    const tx = buildRlusdPayment({ from: treasury!, to: destination, cents, paymentId, memo: input.note })
    const prepared = await prepareMultisig(tx, 2)
    const agentSigned = cosign(agent, prepared)

    // The limits service decides. Without its signature (or the operator's) the ledger rejects the tx.
    const res = await limits.requestCosign(paymentId, agentSigned)
    const result: PayResult = {
      ...base,
      status: res.status,
      code: res.code,
      reason: res.reason,
      needsApproval: res.needsApproval,
      approvalId: res.approvalId,
      txHash: res.tx?.hash,
      explorerUrl: res.tx?.explorerUrl,
    }
    // Never downgrade a schedule entry that is already paid (e.g. a refused duplicate attempt).
    const current = input.paymentId ? loadPayables().find((p) => p.id === input.paymentId) : undefined
    if (current && current.status !== 'paid') {
      updatePayable(current.id, {
        status: res.status === 'paid' ? 'paid' : res.needsApproval ? 'awaiting_approval' : res.status === 'refused' ? 'refused' : 'failed',
        txHash: res.tx?.hash,
        explorerUrl: res.tx?.explorerUrl,
        note: res.approvalId ? `${res.reason} (approval ${res.approvalId})` : res.reason,
      })
    }
    if (res.status === 'paid' && res.tx) {
      const sent = await sendPaymentReceipts({
        paymentId,
        payeeId: known?.id ?? null,
        payeeName: known?.name ?? destination,
        payeePhone: known?.phone,
        cents,
        memo: input.note,
        txHash: res.tx.hash,
        explorerUrl: res.tx.explorerUrl,
        approvedBy: 'limits',
      })
      result.receipts = sent.map((r) => `${r.audience} ${r.status}`).join(', ')
    }
    log({ tool: 'pay_payee', ...result })
    return result
  }

  return { listDuePayments, payPayee, agentAddress: agent.classicAddress, treasury }
}

export type AgentTools = ReturnType<typeof createAgentTools>
