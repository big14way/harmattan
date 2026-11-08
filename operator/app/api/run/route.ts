import { z } from 'zod'
import { isOperator, publicDemo } from '@/lib/access'
import { invalidateDemoSpend, takeDemoRun } from '@/lib/demo'
import { agentClient, invalidateBalances, operator } from '@/lib/state'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const Body = z.object({ instruction: z.string().max(1000).optional(), planner: z.enum(['claude', 'rules']).optional() })

/** Starts an agent run on the agent service (which holds the agent key; the dashboard does not). */
export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json())
    if (!(await isOperator(req.headers))) {
      if (!publicDemo()) return Response.json({ error: 'Operator sign-in required' }, { status: 401 })
      const refusal = await takeDemoRun((await operator().view()).policy.timezone)
      if (refusal) return Response.json({ error: refusal }, { status: 429 })
    }
    const run = await agentClient().run(body.instruction, body.planner)
    invalidateBalances()
    invalidateDemoSpend()
    return Response.json(run)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
