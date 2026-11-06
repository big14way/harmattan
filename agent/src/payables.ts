import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { dataDir } from '../../ledger/src/index.ts'

export const PayableSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,48}$/),
  payeeId: z.string(),
  amountCents: z.number().int().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(200),
  status: z.enum(['scheduled', 'paid', 'awaiting_approval', 'refused', 'failed']),
  txHash: z.string().optional(),
  explorerUrl: z.string().optional(),
  note: z.string().optional(),
  updatedAt: z.string(),
})
export type Payable = z.infer<typeof PayableSchema>

function file(): string {
  return path.join(dataDir('agent'), 'payables.json')
}

/** The operator's payment schedule. The operator adds payables; the agent only updates their status. */
export function loadPayables(): Payable[] {
  if (!existsSync(file())) return []
  return z.array(PayableSchema).parse(JSON.parse(readFileSync(file(), 'utf8')))
}

export function savePayables(list: Payable[]): void {
  writeFileSync(file(), JSON.stringify(list, null, 2) + '\n')
}

export function updatePayable(id: string, patch: Partial<Payable>): Payable | null {
  const list = loadPayables()
  const i = list.findIndex((p) => p.id === id)
  if (i < 0) return null
  const next = PayableSchema.parse({ ...list[i], ...patch, updatedAt: new Date().toISOString() })
  list[i] = next
  savePayables(list)
  return next
}

export function upsertPayable(p: Payable): void {
  const list = loadPayables().filter((x) => x.id !== p.id)
  list.push(PayableSchema.parse(p))
  savePayables(list)
}
