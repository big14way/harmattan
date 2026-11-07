export const dynamic = 'force-dynamic'

async function up(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2000) })).ok
  } catch {
    return false
  }
}

/** Public liveness for the host: the dashboard, and whether it can reach the limits and agent services. */
export async function GET() {
  const [limits, agent] = await Promise.all([up(`${process.env.LIMITS_URL ?? 'http://localhost:8787'}/health`), up(`${process.env.AGENT_URL ?? 'http://localhost:8788'}/health`)])
  return Response.json({ ok: true, limits, agent }, { status: limits ? 200 : 503 })
}
