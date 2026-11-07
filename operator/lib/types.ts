/** Shapes the dashboard API returns. Type-only imports, so client components can use them. */
import type { Payable } from '../../agent/src/payables.ts'
import type { Approval } from '../../limits/src/approvals.ts'
import type { PolicyView } from '../../limits/src/client.ts'
import type { DecisionRecord } from '../../limits/src/decisions.ts'

export type { Approval, DecisionRecord, Payable }

export interface DashboardState {
  now: string
  network: string
  explorer: string
  treasury: { address: string; rlusdCents: number; xrp: number } | null
  signerListTx: string | null
  view: PolicyView & { spentThisMonthByPayee: Record<string, number> }
  approvals: Approval[]
  decisions: DecisionRecord[]
  payables: Payable[]
}
