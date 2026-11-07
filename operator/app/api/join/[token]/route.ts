import { Wallet, isValidClassicAddress } from 'xrpl'
import { z } from 'zod'
import { getClient, network, rlusdTrustLine, setRlusdTrustLine, stablecoin } from '../../../../../ledger/src/index.ts'
import { findInvite, payeeFromInvite, payeeIdFor, updateInvite } from '@/lib/invites'
import { operator } from '@/lib/state'

export const dynamic = 'force-dynamic'

const Body = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('create') }),
  z.object({ mode: z.literal('address'), address: z.string().trim() }),
])

// One join at a time per server: faucet funding and policy writes should not interleave.
let busy = false

/**
 * Public: the payee behind an invite link registers an address. The new directory entry is
 * inactive until the operator confirms it, so this route can never authorise a payment.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const invite = findInvite(token)
  if (!invite || invite.status === 'revoked') return Response.json({ error: 'This link is not valid. Ask for a new one.' }, { status: 404 })
  if (invite.status === 'joined') return Response.json({ error: 'This link has already been used.' }, { status: 409 })
  if (busy) return Response.json({ error: 'Busy, try again in a few seconds.' }, { status: 429 })
  busy = true
  try {
    const body = Body.parse(await req.json())
    const asset = stablecoin()
    let address: string
    let seed: string | undefined
    if (body.mode === 'create') {
      const wallet = Wallet.generate()
      await (await getClient()).fundWallet(wallet, { faucetHost: network().faucetHost })
      const trust = await setRlusdTrustLine(wallet)
      if (!trust.success) throw new Error(`Could not open the RLUSD trust line: ${trust.result}`)
      address = wallet.classicAddress
      seed = wallet.seed
    } else {
      if (!isValidClassicAddress(body.address)) return Response.json({ error: 'That is not an XRPL address (it starts with r).' }, { status: 400 })
      const line = await rlusdTrustLine(body.address)
      if (!line) {
        return Response.json(
          { error: `This wallet cannot receive ${asset.symbol} yet. Add a trust line for ${asset.symbol} (issuer ${asset.issuer}) in your wallet app, then try again.`, needsTrustLine: true },
          { status: 422 },
        )
      }
      address = body.address
    }
    const op = operator()
    const { policy } = await op.view()
    if (Object.values(policy.payees).some((p) => p.address === address)) {
      return Response.json({ error: 'This address is already in the payee list.' }, { status: 409 })
    }
    const id = payeeIdFor(invite.name, policy)
    await op.updatePolicy({ payees: { ...policy.payees, [id]: payeeFromInvite(invite, id, address) } })
    updateInvite(token, { status: 'joined', payeeId: id, address, joinedAt: new Date().toISOString() })
    return Response.json({ payeeId: id, address, seed, explorerUrl: `${network().explorer}/accounts/${address}` })
  } catch (err) {
    const msg = err instanceof z.ZodError ? 'Invalid request' : (err as Error).message
    return Response.json({ error: msg }, { status: 500 })
  } finally {
    busy = false
  }
}
