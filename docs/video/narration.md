# Demo video narration

Length 2:57.7, 1920x1080. Recorded from the live local dashboard and the XRPL testnet explorer with Playwright; narration by edge-tts (en-US-AndrewMultilingualNeural, +20%); no music.
Recorded transactions: agent payment 642E31D161CDE86266800AE7EA070EC6F54B1111A9F27D95CCA20CD85188DDD9, operator-approved payment 9197A0677C2406870FB32EF5D5FE15D359B31298C406CC4B60BD2C5E0A44CC75. The terminal scene replays a real `pnpm refusals` run (schedules/refusals.log).

To re-cut: record the clips listed in `scenes.json` into `clips/`, then build `demo.json` with the same toolchain (ffmpeg, Pillow, edge-tts).

| Scene | Starts | On screen | Narration |
| --- | --- | --- | --- |
| t0 | 0:00 | The treasury agent your CFO would sign off on. | Harmattan is an AI agent that pays a business's contractors in RLUSD on the XRP Ledger. It can only move money inside limits it does not control. |
| p1 | 0:08 | A Lagos agency pays contractors in Nairobi, Kampala and Cape Town. | A Lagos agency pays a designer in Nairobi, a developer in Kampala and an editor in Cape Town. Today that takes three bank portals and most of a week. An agent could do it in seconds, but no CFO hands it the treasury unless the limits hold when it is wrong. |
| p2 | 0:23 | Every payment needs two signatures. The agent holds one. | So every treasury payment needs two signatures on the XRP Ledger, and the agent holds one. The second comes from an independent limits service, only inside the operator's policy. Above a limit, only the operator's own key can sign. |
| s1 | 0:36 | The operator sets the limits | This is the operator's console. A fifteen dollar cap per payment, a fifty dollar daily budget, and a monthly limit for each contractor. The agent can read these limits. It cannot change them. |
| s2 | 0:49 | The agent pays what is due | Three payments are due. The agent, on Claude Haiku, signs each with its own key and asks the limits service to co-sign. Twelve dollars to Nairobi and nine fifty to Kampala clear in seconds. Forty to Cape Town is over the cap, so it waits. |
| s3 | 1:03 | Two signatures, on the ledger | On the ledger, that payment carries two signatures, the agent's and the limits service's, against a treasury that needs both. The fee was thirty-six millionths of an XRP. |
| s4 | 1:14 | Above the cap, a human signs | The forty waits for a human. The operator sees which checks passed, and approves with the operator key. The limits service checks that the signature covers exactly this payment before it reaches the ledger. |
| s5 | 1:25 | Told to pay a stranger, it is refused | Now the attack. The operator is told to pay two hundred dollars to a new address, right now, and passes it to the agent. The agent tries. The limits service refuses: not on the payee list. With no second signature, it never reaches the ledger. |
| s6 | 1:40 | Every limit, reproduced live | Every limit holds the same way: the cap, the daily budget, a contractor's monthly limit, the pause switch, a duplicate. And when the agent skips the limits service and submits alone, the XRP Ledger rejects it. |
| s7 | 1:53 | The contractor sees it land | In Nairobi, Wanjiru's page shows the RLUSD arriving and every payment she has received, read straight from the ledger, each with its transaction link. |
| s8 | 2:02 | New contractors join from a link | New contractors join from a link: a wallet with an RLUSD trust line in about ten seconds, or their own. They stay switched off until the operator confirms the address. |
| p3 | 2:11 | The limit lives in the account, not in application code. | Why the XRP Ledger? Signer lists put the limit in the account itself, enforced by every validator, not by application code. RLUSD lands straight in the contractor's wallet, in seconds, for a fraction of a cent. |
| p4 | 2:24 | Sold to agencies that pay contractors across the continent. | Harmattan sells to agencies in Lagos and Accra paying contractors across the continent, for under one percent of volume. On testnet it has made seventeen payments, none signed by the agent alone. Next: a cash-out partner in each corridor, then mainnet. |
| p5 | 2:39 | Would your CFO sign off? | The track asks one question: would your CFO sign off? Here the agent executes the payments, the ledger and an independent service enforce the limits, and the operator sets them from outside the agent. |
| e0 | 2:49 | Two signatures. The agent holds one. | Harmattan. Two signatures, and the agent holds one. The code and every transaction are linked below. |
