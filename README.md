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
- A payment above the cap, over a payee's monthly limit or over the day's budget is queued for the operator, with the agent's signed request kept as evidence. The operator approves by signing exactly that payment (same payee, amount and payment id) with the operator key; the limits service checks the match, submits it and logs it. Payments the operator signs do not use up the agent's budget. The agent cannot get there by itself.
- The agent alone is rejected by the ledger: `tefBAD_QUORUM` when it multisigns alone, `tefBAD_AUTH` when it tries to sign as the treasury.
- The operator sets the cap, daily budget, payee list and pause switch through the limits service's operator-only API. The agent can read that policy but cannot change it.

## Live on XRPL Testnet

| What | Link |
| --- | --- |
| Treasury | [rhpWYS7RnKaRXG9Se4FDQE4eAMG9nZupEG](https://testnet.xrpl.org/accounts/rhpWYS7RnKaRXG9Se4FDQE4eAMG9nZupEG) |
| Signer list (agent 1, limits 1, operator 2; quorum 2) | [SignerListSet](https://testnet.xrpl.org/transactions/E5D611CF5DA809632C37417CC04043361E1E5C2E3983A54B1BD3E70A5E0F3966) |
| First agent-executed RLUSD payment (2.50 RLUSD to a Nairobi contractor, signed by agent + limits service) | [Payment](https://testnet.xrpl.org/transactions/C73A841FD44F8CA19498CF61ED01A87C96D423E128B0AA2FA1E145CF30094677) |
| Claude-planned payout: 12.00 RLUSD to Nairobi, agent + limits service | [Payment](https://testnet.xrpl.org/transactions/BBD3F6E3249AEC099E255833800915C15E05C10B23E1254686BF34250F1602E7) |
| Claude-planned payout: 9.50 RLUSD to Kampala, agent + limits service | [Payment](https://testnet.xrpl.org/transactions/CC90EAA5A4EC35D2A8711195DFBBFEA631E5C7C06553DCEA30CAEC964EB94A77) |
| 40.00 RLUSD to Cape Town, above the 15 RLUSD cap: queued, then signed by the operator key | [Payment](https://testnet.xrpl.org/transactions/227DD5A98B1398111815F90AE693C9AC37C1608D5AF244674A3DC50693A179C1) |

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
pnpm topup --rlusd 70 --faucet-xrp 10   # operator buys testnet RLUSD with faucet XRP on the XRPL AMM
pnpm limits               # start the limits service on :8787 (keep it running)
pnpm seed demo            # today's schedule: 12.00 to Nairobi, 9.50 to Kampala, 40.00 to Cape Town
pnpm agent                # the agent pays what is due; the 40.00 waits for the operator
pnpm operator approvals   # the operator's queue
pnpm operator approve <id>                 # sign with the operator key and pay
pnpm agent --say "pay 200 to rXXXX now"    # try to make it pay a stranger
pnpm refusals             # reproduce every refusal on testnet (cap, budget, monthly, unknown, paused, duplicate, bypass)
pnpm status               # balances and the signer list
pnpm check                # typecheck + tests
```

Demo amounts are small (15 RLUSD cap, 50 RLUSD daily budget, 30 RLUSD per payee per month) because testnet RLUSD is scarce: the faucet gives 10 RLUSD a day.

Keys are written to `.data/` (git-ignored). Each process loads only its own role's key.

`pnpm refusals` output on testnet:

```
PASS  above per-payment cap              OVER_CAP           40.00 RLUSD is above the per-payment cap of 15.00 RLUSD; an operator must approve it
PASS  unknown payee                      UNKNOWN_PAYEE      Destination rM38Yx… is not an approved payee
PASS  over daily budget                  OVER_DAILY_BUDGET  Only 1.00 RLUSD left of today's 1.00 RLUSD budget
PASS  over payee monthly limit           OVER_PAYEE_MONTHLY Okello Mugisha has 1.00 RLUSD left of a 1.00 RLUSD monthly limit
PASS  paused by operator                 PAUSED             The operator has paused all agent payments
PASS  duplicate payment id               DUPLICATE          Payment wanjiru-oct-illustrations-2026-11-06 was already made
PASS  agent bypasses the limits service  tefBAD_QUORUM      submitted straight to XRPL with only the agent signature (weight 1 of 2)
```

## Layout

```
ledger/    XRPL client, RLUSD helpers, multisig, submit, deployment record
limits/    the independent co-signer: policy store, pure policy evaluator, approvals queue, HTTP API
agent/     tools (list_due_payments, pay_payee), Claude planner (Vercel AI SDK) and rules planner
operator/  the operator's console: policy changes, approvals signed with the operator key
scripts/   testnet setup, treasury top-up, ledger probes, operator CLI, refusal run, status, demo schedule
tests/     policy, signature and money tests
```

## Status

Built during the hackathon. Working now: testnet setup, the signer-list controls, the limits service, autonomous agent payments planned by Claude, the operator approvals queue, and a reproducible refusal run. Next: operator dashboard, WhatsApp receipts, payee onboarding, and deployment.

## Libraries

[xrpl.js](https://js.xrpl.org), [Vercel AI SDK](https://ai-sdk.dev) with the Anthropic provider, [zod](https://zod.dev), [tsx](https://tsx.is), [vitest](https://vitest.dev).

## License

MIT
