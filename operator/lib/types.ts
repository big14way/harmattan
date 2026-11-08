/** Shapes the dashboard API returns. Type-only imports, so client components can use them. */
import type { Payable } from '../../agent/src/payables.ts'
import type { RunRecord } from '../../agent/src/runner.ts'
import type { Approval } from '../../limits/src/approvals.ts'
import type { PolicyView } from '../../limits/src/client.ts'
import type { DecisionRecord } from '../../limits/src/decisions.ts'
import type { ReceiptRecord } from '../../receipts/src/index.ts'
import type { Invite } from './invites.ts'

export type { Approval, DecisionRecord, Invite, Payable, ReceiptRecord, RunRecord }

export interface AgentStatus {
  running: { startedAt: string; trigger: string; instruction: string } | null
  schedule: string | null
  planner: 'claude' | 'rules'
  runs: RunRecord[]
}

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
  /** Null when the agent service is not reachable. */
  agent: AgentStatus | null
  receipts: ReceiptRecord[]
  whatsapp: boolean
  invites: Invite[]
  /** A fresh random address that is not on the payee list, for the injection example. */
  strangerAddress: string
  viewer: Viewer
}

/** What a public-demo visitor may still do today (HARMATTAN_PUBLIC_DEMO=1). */
export interface DemoStatus {
  /** Largest payment a visitor may approve with the operator key. */
  approvalMaxCents: number
  /** Most the treasury may pay out in a day before visitors are stopped (operator time zone). */
  dailyCents: number
  /** What the treasury paid today, read from the ledger; null when the ledger could not be read. */
  paidTodayCents: number | null
  runsLeft: number
  timezone: string
}

export interface Viewer {
  /** False for a public-demo visitor: limits, payees and invites are read-only for them. */
  operator: boolean
  /** Set when the public demo is on, for visitors and the operator alike. */
  demo: DemoStatus | null
}
