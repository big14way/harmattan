/**
 * Operator CLI: the same actions as the dashboard, for scripting and quick checks.
 *
 *   pnpm operator policy                                  show policy and today's spend
 *   pnpm operator set --cap 15 --budget 50                change the per-payment cap / daily budget
 *   pnpm operator set --payee wanjiru --monthly 30        change a payee's monthly limit
 *   pnpm operator pause | resume                          stop or restart all agent payments
 *   pnpm operator approvals                               list pending approvals
 *   pnpm operator approve <id>                            sign with the operator key and pay
 *   pnpm operator reject <id> [note]
 */
import 'dotenv/config'
import { parseArgs } from 'node:util'
import { disconnect, formatMoney, toCents } from '../ledger/src/index.ts'
import { OperatorConsole } from '../operator/lib/console.ts'

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      cap: { type: 'string' },
      budget: { type: 'string' },
      payee: { type: 'string' },
      monthly: { type: 'string' },
    },
  })
  const [cmd = 'policy', arg, ...rest] = positionals
  const op = new OperatorConsole()

  switch (cmd) {
    case 'policy': {
      const v = await op.view()
      console.log(`paused ${v.policy.paused}  cap ${formatMoney(v.policy.perPaymentCapCents)}  daily budget ${formatMoney(v.policy.dailyBudgetCents)}`)
      console.log(`today ${v.today.day}: spent ${formatMoney(v.today.spentCents)}, remaining ${formatMoney(v.today.remainingCents)}`)
      for (const p of Object.values(v.policy.payees)) {
        const spent = v.spentThisMonthByPayee[p.id] ?? 0
        console.log(`  ${p.id.padEnd(10)} ${p.name.padEnd(16)} ${p.city.padEnd(10)} monthly ${formatMoney(spent)} / ${formatMoney(p.monthlyLimitCents)}${p.active ? '' : '  (inactive)'}`)
      }
      return
    }
    case 'set': {
      const v = await op.view()
      const update: Parameters<OperatorConsole['updatePolicy']>[0] = {}
      if (values.cap) update.perPaymentCapCents = toCents(values.cap)
      if (values.budget) update.dailyBudgetCents = toCents(values.budget)
      if (values.payee) {
        const p = v.policy.payees[values.payee]
        if (!p) throw new Error(`Unknown payee ${values.payee}`)
        if (!values.monthly) throw new Error('Pass --monthly <amount> with --payee')
        update.payees = { ...v.policy.payees, [p.id]: { ...p, monthlyLimitCents: toCents(values.monthly) } }
      }
      const next = await op.updatePolicy(update)
      console.log(`policy v${next.policy.version}: cap ${formatMoney(next.policy.perPaymentCapCents)}, budget ${formatMoney(next.policy.dailyBudgetCents)}`)
      return
    }
    case 'pause':
    case 'resume': {
      const next = await op.updatePolicy({ paused: cmd === 'pause' })
      console.log(next.policy.paused ? 'Agent payments paused' : 'Agent payments resumed')
      return
    }
    case 'approvals': {
      const list = await op.approvals('pending')
      if (!list.length) console.log('No pending approvals')
      for (const a of list) console.log(`${a.id}  ${formatMoney(a.cents).padStart(14)} to ${a.payeeId ?? a.destination}  ${a.code}  ${a.paymentId}${a.lastError ? `  last error: ${a.lastError}` : ''}`)
      return
    }
    case 'approve': {
      if (!arg) throw new Error('Pass an approval id')
      const r = await op.approve(arg)
      console.log(`${r.status}: ${formatMoney(r.approval.cents)} to ${r.approval.payeeId ?? r.approval.destination}  ${r.tx.result}  ${r.tx.explorerUrl}`)
      if (r.status !== 'paid') process.exitCode = 1
      return
    }
    case 'reject': {
      if (!arg) throw new Error('Pass an approval id')
      const a = await op.reject(arg, rest.join(' ') || undefined)
      console.log(`rejected ${a.id}: ${formatMoney(a.cents)} to ${a.payeeId ?? a.destination}`)
      return
    }
    default:
      throw new Error(`Unknown command "${cmd}"`)
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(disconnect)
