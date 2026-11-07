import 'server-only'
import { Wallet } from 'xrpl'
import { agentTriggerToken, network, readDeployment, rlusdBalance, toCents, xrpBalance } from '../../ledger/src/index.ts'
import { loadPayables } from '../../agent/src/payables.ts'
import type { RunRecord } from '../../agent/src/runner.ts'
import { readReceipts, twilioConfigured } from '../../receipts/src/index.ts'
import { OperatorConsole } from './console.ts'
import { loadInvites } from './invites.ts'
import type { AgentStatus, DashboardState } from './types.ts'

let console_: OperatorConsole | null = null
export function operator(): OperatorConsole {
  console_ ??= new OperatorConsole()
  return console_
}

/** The dashboard's view of the agent service: start runs, read run history. Never the agent key. */
export function agentClient() {
  const base = process.env.AGENT_URL ?? 'http://localhost:8788'
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${agentTriggerToken()}` }
  return {
    async status(): Promise<AgentStatus | null> {
      try {
        const res = await fetch(`${base}/runs?limit=8`, { headers, cache: 'no-store', signal: AbortSignal.timeout(3000) })
        return res.ok ? ((await res.json()) as AgentStatus) : null
      } catch {
        return null
      }
    },
    async run(instruction?: string, planner?: 'claude' | 'rules'): Promise<RunRecord> {
      const res = await fetch(`${base}/run`, { method: 'POST', headers, body: JSON.stringify({ instruction, planner }), cache: 'no-store' }).catch(() => {
        throw new Error('The agent service is not running. Start it with `pnpm agent:serve`.')
      })
      const json = (await res.json()) as RunRecord | { error: string }
      if ('error' in json) throw new Error(json.error)
      return json
    },
  }
}

// Ledger balances change only when a payment lands; a short cache keeps polling cheap.
let balanceCache: { at: number; value: DashboardState['treasury'] } | null = null
async function treasuryBalances(address: string): Promise<DashboardState['treasury']> {
  if (balanceCache && Date.now() - balanceCache.at < 8_000) return balanceCache.value
  const [rlusd, xrp] = await Promise.all([rlusdBalance(address), xrpBalance(address)])
  const value = { address, rlusdCents: toCents(Number(rlusd).toFixed(2)), xrp: Number(xrp) }
  balanceCache = { at: Date.now(), value }
  return value
}

export function invalidateBalances(): void {
  balanceCache = null
}

export async function dashboardState(): Promise<DashboardState> {
  const op = operator()
  const deployment = readDeployment()
  const treasury = deployment.accounts.treasury
  if (!treasury) throw new Error('No treasury in the deployment record. Run `pnpm setup:testnet`.')
  const [view, approvals, decisions, balances, agent] = await Promise.all([
    op.view(),
    op.approvals(),
    op.decisions(300),
    treasuryBalances(treasury).catch(() => null),
    agentClient().status(),
  ])
  return {
    now: new Date().toISOString(),
    network: network().name,
    explorer: network().explorer,
    treasury: balances,
    signerListTx: deployment.txs.treasurySignerListSet ?? null,
    view,
    approvals,
    decisions,
    payables: loadPayables().sort((a, b) => (a.dueDate === b.dueDate ? a.id.localeCompare(b.id) : b.dueDate.localeCompare(a.dueDate))),
    agent,
    receipts: readReceipts(200),
    whatsapp: twilioConfigured(),
    invites: loadInvites().filter((i) => i.status === 'open').reverse(),
    strangerAddress: Wallet.generate().classicAddress,
  }
}
