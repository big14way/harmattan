/**
 * The operator's side of Harmattan, shared by the dashboard and the operator CLI. It holds what the
 * agent never gets: the operator token for the limits service's policy and approval routes, and the
 * operator key (weight 2 on the treasury signer list) that signs approved payments.
 */
import {
  buildRlusdPayment,
  cosign,
  loadWallet,
  operatorToken,
  prepareMultisig,
  readDeployment,
  type TxOutcome,
} from '../../ledger/src/index.ts'
import { updatePayable } from '../../agent/src/payables.ts'
import type { Approval } from '../../limits/src/approvals.ts'
import type { PolicyView } from '../../limits/src/client.ts'
import type { DecisionRecord } from '../../limits/src/decisions.ts'
import type { PolicyUpdate } from '../../limits/src/policy.ts'

export interface ApproveResult {
  status: 'paid' | 'failed'
  approval: Approval
  tx: TxOutcome
}

export class OperatorConsole {
  constructor(
    private readonly baseUrl = process.env.LIMITS_URL ?? 'http://localhost:8787',
    private readonly token = operatorToken(),
  ) {}

  private async call<T>(method: string, route: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${route}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
    const json = (await res.json()) as T | { error: string }
    if (!res.ok && json && typeof json === 'object' && 'error' in json) throw new Error(json.error)
    return json as T
  }

  view(): Promise<PolicyView & { spentThisMonthByPayee: Record<string, number> }> {
    return this.call('GET', '/policy')
  }

  updatePolicy(update: PolicyUpdate): Promise<PolicyView> {
    return this.call('PUT', '/policy', update)
  }

  approvals(status?: Approval['status']): Promise<Approval[]> {
    return this.call('GET', `/approvals${status ? `?status=${status}` : ''}`)
  }

  decisions(limit = 100): Promise<DecisionRecord[]> {
    return this.call('GET', `/decisions?limit=${limit}`)
  }

  /**
   * Approves a queued payment: signs a fresh treasury payment for exactly the requested payee,
   * amount and payment id with the operator key, and hands it to the limits service to check,
   * submit and log. The agent's original signature has expired by now (LastLedgerSequence).
   */
  async approve(id: string): Promise<ApproveResult> {
    const approval = (await this.approvals()).find((a) => a.id === id)
    if (!approval) throw new Error(`No approval ${id}`)
    if (approval.status !== 'pending') throw new Error(`Approval ${id} is already ${approval.status}`)
    const treasury = readDeployment().accounts.treasury
    if (!treasury) throw new Error('No treasury in deployment record')
    const tx = buildRlusdPayment({
      from: treasury,
      to: approval.destination,
      cents: approval.cents,
      paymentId: approval.paymentId,
      memo: approval.memo,
    })
    const signed = cosign(loadWallet('operator'), await prepareMultisig(tx, 1))
    const result = await this.call<ApproveResult | { error: string }>('POST', `/approvals/${id}/approve`, { txBlob: signed })
    if ('error' in result) throw new Error(result.error)
    if (result.status === 'paid') {
      updatePayable(approval.paymentId, {
        status: 'paid',
        txHash: result.tx.hash,
        explorerUrl: result.tx.explorerUrl,
        note: 'Approved by operator',
      })
    }
    return result
  }

  async reject(id: string, note?: string): Promise<Approval> {
    const approval = await this.call<Approval>('POST', `/approvals/${id}/reject`, { note })
    updatePayable(approval.paymentId, { status: 'refused', note: note ? `Rejected by operator: ${note}` : 'Rejected by operator' })
    return approval
  }
}
