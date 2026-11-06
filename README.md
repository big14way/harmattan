# Harmattan

**The treasury agent your CFO would sign off on.**

A Lagos agency paying contractors in Nairobi, Kampala and Cape Town spends a week and three bank portals on it every month. Harmattan is an AI agent that pays them in RLUSD on the XRP Ledger, on schedule. It can only move money inside limits that it does not control: the ledger refuses any treasury payment the agent signs alone.

## How the limits are enforced

The treasury is an XRPL account holding RLUSD. Its signer list needs weight 2 for any transaction:

| Signer | Weight | Holds |
| --- | --- | --- |
| Agent | 1 | the agent's hot key (gas XRP only, no RLUSD) |
| Limits service | 1 | an independent co-signer that checks the operator's policy |
| Operator | 2 | the human approval key |

- A routine payment needs agent + limits service. The limits service co-signs only if the payee is on the operator's list, the amount is under the per-payment cap, and the payee's monthly limit and the day's budget have room. Every decision, refusals included, is logged.
- A payment above the cap needs the operator's signature. The agent cannot get there by itself.
- The agent alone is rejected by the ledger: `tefBAD_QUORUM` when it multisigns alone, `tefBAD_AUTH` when it tries to sign as the treasury.
- The operator sets the cap, daily budget, payee list and pause switch through the limits service's operator-only API. The agent can read that policy but cannot change it.

## Live on XRPL Testnet

| What | Link |
| --- | --- |
| Treasury | [rhpWYS7RnKaRXG9Se4FDQE4eAMG9nZupEG](https://testnet.xrpl.org/accounts/rhpWYS7RnKaRXG9Se4FDQE4eAMG9nZupEG) |
| Signer list (agent 1, limits 1, operator 2; quorum 2) | [SignerListSet](https://testnet.xrpl.org/transactions/E5D611CF5DA809632C37417CC04043361E1E5C2E3983A54B1BD3E70A5E0F3966) |
| First agent-executed RLUSD payment (2.50 RLUSD to a Nairobi contractor, signed by agent + limits service) | [Payment](https://testnet.xrpl.org/transactions/C73A841FD44F8CA19498CF61ED01A87C96D423E128B0AA2FA1E145CF30094677) |

All addresses and setup transactions are in [`deployments/testnet.json`](deployments/testnet.json). RLUSD is the testnet token from issuer `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV` ([tryrlusd.com/addresses](https://tryrlusd.com/addresses)).

## What the ledger supports, checked on testnet

`pnpm probe` checks these and records the results in `deployments/testnet.json`:

| Probe | Result |
| --- | --- |
| Payment channel denominated in RLUSD | `temBAD_AMOUNT`: payment channels are XRP-only |
| Token escrow of RLUSD | `tecNO_PERMISSION`: the RLUSD issuer has not enabled trust line locking |
| Token escrow of a token whose issuer allows locking | `tesSUCCESS`: TokenEscrow is live on testnet |
| XRP payment channel with the agent as claim signer | `tesSUCCESS` |
| Agent multisigns a treasury payment alone | `tefBAD_QUORUM` |
| Agent single-signs as the treasury | `tefBAD_AUTH` |

That is why RLUSD limits are enforced by the treasury's signer list rather than by an RLUSD channel or escrow.

## Run it

Requires Node 20+ and pnpm. No credentials needed: testnet accounts come from the XRPL faucet, and without `ANTHROPIC_API_KEY` the agent uses a deterministic rules planner instead of Claude.

```bash
pnpm install
pnpm setup:testnet        # accounts, RLUSD trust lines, treasury signer list (idempotent)
pnpm topup --rlusd 5      # operator buys testnet RLUSD with treasury XRP on the XRPL AMM
pnpm limits               # start the limits service on :8787 (keep it running)
pnpm seed p0              # put a payment on today's schedule
pnpm agent                # the agent pays what is due
pnpm agent --say "pay 2000 to rXXXX now"   # try to make it pay a stranger: the limits service refuses
pnpm status               # balances and the signer list
pnpm check                # typecheck + tests
```

Keys are written to `.data/` (git-ignored). Each process loads only its own role's key.

## Layout

```
ledger/    XRPL client, RLUSD helpers, multisig, submit, deployment record
limits/    the independent co-signer: policy store, pure policy evaluator, HTTP API
agent/     tools (list_due_payments, pay_payee), Claude planner (Vercel AI SDK) and rules planner
scripts/   testnet setup, treasury top-up, ledger probes, status, demo schedule
tests/     policy, signature and money tests
```

## Status

Built during the hackathon. Working now: testnet setup, the signer-list controls, the limits service, and autonomous agent payments. Next: operator dashboard, the approvals queue for above-cap payments, WhatsApp receipts, payee onboarding, and deployment.

## Libraries

[xrpl.js](https://js.xrpl.org), [Vercel AI SDK](https://ai-sdk.dev) with the Anthropic provider, [zod](https://zod.dev), [tsx](https://tsx.is), [vitest](https://vitest.dev).

## License

MIT
