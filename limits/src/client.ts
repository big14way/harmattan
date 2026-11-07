import type { TxOutcome } from '../../ledger/src/submit.ts'
import type { DecisionCode } from './evaluate.ts'
import type { Policy } from './policy.ts'

export interface CosignResponse {
  status: 'paid' | 'refused' | 'failed'
  code: DecisionCode
  reason: string
  needsApproval?: boolean
  /** Set when the refusal was queued for the operator to approve. */
  approvalId?: string
  tx?: TxOutcome
}

export interface PolicyView {
  policy: Policy
  treasury: string
  signers: { agent: string; limits: string; operator: string }
  today: { day: string; month: string; spentCents: number; remainingCents: number }
  spentThisMonthByPayee: Record<string, number>
}

/** What the agent can do with the limits service: read policy, ask for a co-signature. Nothing else. */
export class LimitsClient {
  constructor(private readonly baseUrl = process.env.LIMITS_URL ?? 'http://localhost:8787') {}

  async policy(): Promise<PolicyView> {
    const res = await fetch(`${this.baseUrl}/policy`)
    if (!res.ok) throw new Error(`limits /policy ${res.status}`)
    return (await res.json()) as PolicyView
  }

  async requestCosign(paymentId: string, txBlob: string): Promise<CosignResponse> {
    const res = await fetch(`${this.baseUrl}/cosign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paymentId, txBlob }),
    })
    const body = (await res.json()) as CosignResponse | { error: string }
    if ('error' in body) throw new Error(`limits /cosign ${res.status}: ${body.error}`)
    return body
  }
}
