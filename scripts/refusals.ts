/**
 * Reproduces every refusal on the live testnet setup. The agent signs real treasury payments with
 * its own key and asks the limits service to co-sign; each case must come back refused with the
 * expected code. The last case skips the limits service and goes straight to the ledger.
 *
 *   pnpm limits      (in another terminal)
 *   pnpm refusals
 *
 * Budget and monthly-limit cases tighten the policy through the operator API to just above what
 * has been spent, so no RLUSD has to move to reach the limit. The policy is restored afterwards and
 * the approval requests the refusals open are rejected, so the run can be repeated.
 */
import 'dotenv/config'
import { Wallet } from 'xrpl'
import {
  buildRlusdPayment,
  cosign,
  disconnect,
  formatMoney,
  fromCents,
  loadWallet,
  prepareMultisig,
  readDeployment,
  submitBlob,
  toCents,
} from '../ledger/src/index.ts'
import { createAgentTools, type PayResult } from '../agent/src/tools.ts'
import { OperatorConsole } from '../operator/lib/console.ts'

interface Row {
  name: string
  expect: string
  got: string
  detail: string
}

const rows: Row[] = []
const opened: string[] = []
const run = Date.now().toString(36)

function record(name: string, expect: string, r: PayResult) {
  rows.push({ name, expect, got: r.code ?? r.status, detail: r.approvalId ? `${r.reason} [approval ${r.approvalId}]` : r.reason })
  if (r.approvalId) opened.push(r.approvalId)
}

async function main() {
  const op = new OperatorConsole()
  const agent = createAgentTools()
  const start = await op.view()
  const original = start.policy
  const payees = Object.values(original.payees).filter((p) => p.active)
  if (payees.length < 2) throw new Error('Need at least two active payees')
  const roomOf = (id: string, limit: number) => limit - (start.spentThisMonthByPayee[id] ?? 0)
  const [roomy, other] = [...payees].sort((a, b) => roomOf(b.id, b.monthlyLimitCents) - roomOf(a.id, a.monthlyLimitCents))
  const small = Math.min(200, original.perPaymentCapCents) // 2.00 RLUSD, always under the cap
  if (original.paused) await op.updatePolicy({ paused: false })

  console.log(`policy: cap ${formatMoney(original.perPaymentCapCents)}, daily budget ${formatMoney(original.dailyBudgetCents)}, spent today ${formatMoney(start.today.spentCents)}\n`)

  try {
    // 1. Above the per-payment cap: refused, queued for the operator.
    const above = original.perPaymentCapCents + toCents('25')
    record('above per-payment cap', 'OVER_CAP', await agent.payPayee({ paymentId: `refusal-cap-${run}`, payee: other!.id, amount: fromCents(above), note: 'refusal test' }))

    // 2. A stranger's address, as in a forwarded "pay this new address now" message.
    const stranger = Wallet.generate().classicAddress
    record('unknown payee', 'UNKNOWN_PAYEE', await agent.payPayee({ paymentId: `refusal-unknown-${run}`, payee: stranger, amount: fromCents(above * 5), note: 'pay this new address now' }))

    // 3. Daily budget: operator sets it to 1.00 above today's spend; the agent asks for 2.00.
    await op.updatePolicy({ dailyBudgetCents: start.today.spentCents + 100 })
    record('over daily budget', 'OVER_DAILY_BUDGET', await agent.payPayee({ paymentId: `refusal-budget-${run}`, payee: roomy!.id, amount: fromCents(small), note: 'refusal test' }))
    await op.updatePolicy({ dailyBudgetCents: original.dailyBudgetCents })

    // 4. Payee monthly limit: operator sets it to 1.00 above this month's spend for that payee.
    const spentMonth = start.spentThisMonthByPayee[roomy!.id] ?? 0
    await op.updatePolicy({ payees: { ...original.payees, [roomy!.id]: { ...roomy!, monthlyLimitCents: spentMonth + 100 } } })
    record('over payee monthly limit', 'OVER_PAYEE_MONTHLY', await agent.payPayee({ paymentId: `refusal-monthly-${run}`, payee: roomy!.id, amount: fromCents(small), note: 'refusal test' }))
    await op.updatePolicy({ payees: original.payees })

    // 5. Operator pause switch.
    await op.updatePolicy({ paused: true })
    record('paused by operator', 'PAUSED', await agent.payPayee({ paymentId: `refusal-paused-${run}`, payee: roomy!.id, amount: fromCents(small), note: 'refusal test' }))
    await op.updatePolicy({ paused: false })

    // 6. Paying the same payment id twice.
    const paid = (await op.decisions(500)).find((d) => d.outcome === 'cosigned' && d.payeeId && d.ledgerResult === 'tesSUCCESS')
    if (paid) {
      record('duplicate payment id', 'DUPLICATE', await agent.payPayee({ paymentId: paid.paymentId, payee: paid.payeeId!, amount: fromCents(paid.cents), note: 'refusal test' }))
    }

    // 7. Going around the limits service: the agent submits its own signature to the ledger.
    const d = readDeployment()
    const tx = await prepareMultisig(buildRlusdPayment({ from: d.accounts.treasury!, to: roomy!.address, cents: small, paymentId: `refusal-bypass-${run}` }), 1)
    const out = await submitBlob(cosign(loadWallet('agent'), tx))
    rows.push({ name: 'agent bypasses the limits service', expect: 'tefBAD_QUORUM', got: out.result, detail: 'submitted straight to XRPL with only the agent signature (weight 1 of 2)' })
  } finally {
    await op.updatePolicy({ paused: original.paused, dailyBudgetCents: original.dailyBudgetCents, payees: original.payees })
    for (const id of opened) await op.reject(id, 'refusal test run').catch(() => undefined)
  }

  const width = Math.max(...rows.map((r) => r.name.length))
  for (const r of rows) {
    const ok = r.got === r.expect
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.got.padEnd(18)} ${r.detail}`)
  }
  const failed = rows.filter((r) => r.got !== r.expect)
  console.log(`\n${rows.length - failed.length}/${rows.length} refusals reproduced; policy restored; ${opened.length} test approval request(s) rejected`)
  if (failed.length) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(disconnect)
