import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { dataDir, readDeployment, toCents } from '../../ledger/src/index.ts'

export const PayeePolicySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,32}$/),
  name: z.string().min(1).max(80),
  address: z.string().regex(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/),
  country: z.string().length(2),
  city: z.string().max(60).default(''),
  /** Most the agent may pay this payee in one calendar month (operator time zone). */
  monthlyLimitCents: z.number().int().nonnegative(),
  active: z.boolean(),
  /** WhatsApp number for receipts, E.164. */
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
  /** Joined through an invite link; inactive until the operator confirms the address. */
  pendingConfirmation: z.boolean().optional(),
})
export type PayeePolicy = z.infer<typeof PayeePolicySchema>

export const PolicySchema = z.object({
  version: z.number().int().nonnegative(),
  paused: z.boolean(),
  /** Anything above this needs a human signature. */
  perPaymentCapCents: z.number().int().nonnegative(),
  /** Total the agent may move per calendar day (operator time zone). */
  dailyBudgetCents: z.number().int().nonnegative(),
  timezone: z.string().min(1),
  payees: z.record(z.string(), PayeePolicySchema),
  updatedAt: z.string(),
  updatedBy: z.string(),
})
export type Policy = z.infer<typeof PolicySchema>

/** What the operator may send; version and timestamps are set by the service. */
export const PolicyUpdateSchema = PolicySchema.omit({ version: true, updatedAt: true, updatedBy: true }).partial()
export type PolicyUpdate = z.infer<typeof PolicyUpdateSchema>

function policyFile(): string {
  return path.join(dataDir('limits'), 'policy.json')
}

export function defaultPolicy(): Policy {
  const d = readDeployment()
  const payees: Record<string, PayeePolicy> = {}
  for (const p of Object.values(d.payees)) {
    payees[p.id] = {
      id: p.id,
      name: p.name,
      address: p.address,
      country: p.country,
      city: p.city,
      monthlyLimitCents: toCents('30'),
      active: true,
    }
  }
  return {
    version: 1,
    paused: false,
    perPaymentCapCents: toCents('15'),
    dailyBudgetCents: toCents('50'),
    timezone: 'Africa/Lagos',
    payees,
    updatedAt: new Date().toISOString(),
    updatedBy: 'default',
  }
}

export function loadPolicy(): Policy {
  const file = policyFile()
  if (!existsSync(file)) {
    const p = defaultPolicy()
    savePolicy(p)
    return p
  }
  return PolicySchema.parse(JSON.parse(readFileSync(file, 'utf8')))
}

export function savePolicy(p: Policy): void {
  writeFileSync(policyFile(), JSON.stringify(PolicySchema.parse(p), null, 2) + '\n')
}

export function applyPolicyUpdate(current: Policy, update: PolicyUpdate, by: string): Policy {
  const next: Policy = {
    ...current,
    ...update,
    payees: update.payees ?? current.payees,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  }
  return PolicySchema.parse(next)
}
