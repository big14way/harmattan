/**
 * Payee onboarding links. The operator creates an invite; the payee opens the link and either
 * creates a testnet wallet with an RLUSD trust line or brings their own XRPL address. Either way
 * the payee lands in the directory switched off, and the agent cannot pay them until the operator
 * confirms the address in the dashboard.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { dataDir } from '../../ledger/src/paths.ts'
import type { PayeePolicy, Policy } from '../../limits/src/policy.ts'

export const InviteSchema = z.object({
  token: z.string(),
  name: z.string().min(1).max(80),
  city: z.string().max(60),
  country: z.string().length(2),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
  monthlyLimitCents: z.number().int().nonnegative(),
  createdAt: z.string(),
  status: z.enum(['open', 'joined', 'revoked']),
  payeeId: z.string().optional(),
  address: z.string().optional(),
  joinedAt: z.string().optional(),
})
export type Invite = z.infer<typeof InviteSchema>

function file(): string {
  return path.join(dataDir('operator'), 'invites.json')
}

export function loadInvites(): Invite[] {
  if (!existsSync(file())) return []
  return z.array(InviteSchema).parse(JSON.parse(readFileSync(file(), 'utf8')))
}

function save(list: Invite[]): void {
  writeFileSync(file(), JSON.stringify(list, null, 2) + '\n')
}

export function createInvite(input: Pick<Invite, 'name' | 'city' | 'country' | 'phone' | 'monthlyLimitCents'>): Invite {
  const invite = InviteSchema.parse({ ...input, token: randomBytes(12).toString('base64url'), createdAt: new Date().toISOString(), status: 'open' })
  save([...loadInvites(), invite])
  return invite
}

export function findInvite(token: string): Invite | undefined {
  return loadInvites().find((i) => i.token === token)
}

export function updateInvite(token: string, patch: Partial<Invite>): Invite {
  const list = loadInvites()
  const i = list.findIndex((x) => x.token === token)
  if (i < 0) throw new Error('No such invite')
  list[i] = InviteSchema.parse({ ...list[i], ...patch })
  save(list)
  return list[i]!
}

/** A short directory id from the payee's first name, unique within the policy. */
export function payeeIdFor(name: string, policy: Policy): string {
  const base = (name.toLowerCase().normalize('NFKD').replace(/[^a-z]/g, ' ').trim().split(/\s+/)[0] || 'payee').slice(0, 20).padEnd(2, 'x')
  let id = base
  for (let n = 2; policy.payees[id]; n++) id = `${base}-${n}`
  return id
}

/** The directory entry an invite becomes: inactive until the operator confirms the address. */
export function payeeFromInvite(invite: Invite, id: string, address: string): PayeePolicy {
  return {
    id,
    name: invite.name,
    address,
    country: invite.country,
    city: invite.city,
    monthlyLimitCents: invite.monthlyLimitCents,
    active: false,
    pendingConfirmation: true,
    ...(invite.phone ? { phone: invite.phone } : {}),
  }
}
