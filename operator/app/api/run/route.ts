import { z } from 'zod'
import { agentClient, invalidateBalances } from '@/lib/state'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const Body = z.object({ instruction: z.string().max(1000).optional(), planner: z.enum(['claude', 'rules']).optional() })

/** Starts an agent run on the agent service (which holds the agent key; the dashboard does not). */
export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json())
    const run = await agentClient().run(body.instruction, body.planner)
    invalidateBalances()
    return Response.json(run)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
