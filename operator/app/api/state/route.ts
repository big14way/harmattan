import { isOperator, publicDemo } from '@/lib/access'
import { demoStatus } from '@/lib/demo'
import { dashboardState, publicView } from '@/lib/state'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const signedIn = await isOperator(req.headers)
    const state = await dashboardState({ operator: signedIn, demo: null })
    if (publicDemo()) state.viewer.demo = await demoStatus(state.view.policy.timezone)
    return Response.json(signedIn ? state : publicView(state))
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 503 })
  }
}
