import { isOperator } from '@/lib/access'
import { findInvite, updateInvite } from '@/lib/invites'

export const dynamic = 'force-dynamic'

/** Operator revokes an open invite link. */
export async function DELETE(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!(await isOperator(req.headers))) return Response.json({ error: 'Operator sign-in required' }, { status: 401 })
  const { token } = await ctx.params
  const invite = findInvite(token)
  if (!invite) return Response.json({ error: 'No such invite' }, { status: 404 })
  if (invite.status !== 'open') return Response.json({ error: `Invite already ${invite.status}` }, { status: 409 })
  return Response.json({ invite: updateInvite(token, { status: 'revoked' }) })
}
