import 'server-only'
import { network, readDeployment, rlusdBalance, toCents, xrpBalance } from '../../ledger/src/index.ts'
import { loadPayables } from '../../agent/src/payables.ts'
import { OperatorConsole } from './console.ts'
import type { DashboardState } from './types.ts'

let console_: OperatorConsole | null = null
export function operator(): OperatorConsole {
  console_ ??= new OperatorConsole()
  return console_
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
  const [view, approvals, decisions, balances] = await Promise.all([
    op.view(),
    op.approvals(),
    op.decisions(300),
    treasuryBalances(treasury).catch(() => null),
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
  }
}
