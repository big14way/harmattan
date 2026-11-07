import { dashboardState } from '@/lib/state'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return Response.json(await dashboardState())
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 503 })
  }
}
