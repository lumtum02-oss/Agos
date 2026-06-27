# Agos — Payday is every second

> **Agos** means *flow* in Filipino. It turns salaries and grants into a live stream of money on Stellar: a recipient earns by the second, and withdraws real funds whenever they want.

**Live app:** https://agos-flame.vercel.app
**Network:** Stellar testnet (Test SDF Network ; September 2015)
**Track:** Savings & DeFi — Stellar APAC Hackathon

---

## What Agos is

An employer (or grant maker) connects a Stellar wallet and opens a **salary stream** for a recipient: a per-second rate plus a total funded amount. From that moment, earnings accrue **every second**. There is no payday — money is always flowing.

- **XLM streams are escrowed in a Soroban smart contract** (`AgosStream`). The payer funds the full grant into the contract with a `start → end` schedule; vesting is computed **on-chain from ledger time**. There is **no server timer** and **no transaction per second** — the chain itself is the clock.
- When the recipient withdraws, Agos calls the contract's `withdraw` and the vested XLM is paid out **on-chain** to the recipient; the real transaction hash is shown.
- The employer can stop a stream anytime: the contract settles the vested portion to the recipient and **reclaims the unvested remainder** to the payer.
- USDC streams (opt-in) settle via classic Horizon payments from the hub wallet.

Browsing the landing page, public stats, and stream pages works **without connecting a wallet**. A wallet is only required to *sign* (create, withdraw, cancel, or enable USDC).

---

## How it works

```
1. CONNECT      Employer connects Freighter (SEP-10 challenge / response)
2. CREATE       Opens a stream: recipient + per-second rate + funded total + asset.
                XLM streams are funded INTO the AgosStream Soroban contract.
3. EARN         Vesting accrues by the second — computed on-chain from ledger time,
                mirrored live in the UI via SSE (no server timer)
4. WITHDRAW     Recipient pulls vested funds -> contract.withdraw -> REAL on-chain tx hash
5. STOP/CANCEL  Employer stops -> contract settles vested to recipient + reclaims the rest
```

**AgosStream contract (testnet):** `CDMSQ2YYSDBUUJNEF5SBZZLBY5QT52XAJVUBVGU4WILJ3VKD2KW4EL7D`
([view on stellar.expert](https://stellar.expert/explorer/testnet/contract/CDMSQ2YYSDBUUJNEF5SBZZLBY5QT52XAJVUBVGU4WILJ3VKD2KW4EL7D)) —
source, tests, and deploy notes in [`contracts/`](contracts/).

---

## Asset model — XLM by default, USDC opt-in

Agos does **not** require any particular token to get started.

- **XLM (native)** is the default settlement asset. It needs no trustline and works for any funded testnet wallet. The new-stream form has an asset selector with **XLM pre-selected**.
- **USDC is opt-in.** A one-tap **Enable USDC** button builds, signs, and submits a `changeTrust` operation to the USDC issuer directly from the connected wallet. Once the trustline exists, USDC becomes selectable for new streams.

USDC testnet issuer: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`

---

## Highlights

- **On-chain vesting, zero per-second cost.** The amount available is derived from ledger time inside the `AgosStream` Soroban contract — no timer, no transaction per second.
- **Real contract settlement.** XLM withdrawals and stops are genuine Soroban contract invocations with explorer-linked tx hashes; the contract custodies the funds, not a backend ledger.
- **Network-pinned signing.** The challenge is pinned to the app's testnet passphrase, so connecting works even if the wallet is set to Mainnet.
- **Live drip counter.** Server-Sent Events push the growing balance to the stream page in real time.
- **Public, honest stats.** `/stats` ("Agos in numbers") shows real interaction counts; demo and seed records are excluded.
- **Browse without a wallet.** Landing, stats, and stream pages render unconnected.

---

## Screenshots

| | |
|---|---|
| ![Landing](../screen-shot/01-landing.jpg) | ![Connect](../screen-shot/02-connect-popup.jpg) |
| Landing — "Payday is every second" | Connect — Freighter wallet popup |
| ![New stream](../screen-shot/04-new-stream.jpg) | ![Active stream](../screen-shot/05-stream-active.jpg) |
| New stream — asset selector, XLM pre-selected | Active stream — live drip counter |
| ![Withdraw success](../screen-shot/06-withdraw-success.jpg) | ![Stats](../screen-shot/07-stats.jpg) |
| Withdraw — real tx hash, explorer link | Agos in numbers |

![Mobile](../screen-shot/08-mobile.jpg)

*Mobile view*

---

## Tech stack

- **Next.js 16** (App Router), **React 19**, **TypeScript** (strict)
- **Drizzle ORM** on **PostgreSQL** (Supabase)
- **Tailwind CSS v4**, **next-themes**, **next-intl** (i18n), **sonner** toasts
- **@stellar/stellar-sdk** + **@stellar/freighter-api v6**
- **Server-Sent Events** for the live drip counter
- **Soroban smart contract** (`AgosStream`, Rust / `soroban-sdk` 22) for XLM stream escrow + on-chain vesting

---

## Stellar integration

- **SEP-10 style auth.** `requestAccess` → `POST /api/auth/challenge` returns a `manageData` challenge transaction → wallet signs → `POST /api/auth/verify` → HttpOnly session cookie (7-day TTL). Session restores via `GET /api/auth/me`. The signing passphrase is pinned to the app's testnet. See the [Stellar SEP-10 spec](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md).
- **Soroban contract (AgosStream).** XLM streams are funded into the contract (`create_stream`), withdrawn from it (`withdraw`), and stopped on it (`stop`) — all real on-chain invocations via Soroban RPC. The server signs with the hub key; the contract is the fund custodian and vesting is computed on-chain from ledger time. Source + tests in [`contracts/`](contracts/).
- **Native XLM SAC.** The streamed token is the native XLM Stellar Asset Contract `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` — no trustline required.
- **changeTrust trustline.** "Enable USDC" builds and submits a `changeTrust` op to the USDC issuer from the connected wallet; USDC streams settle via classic Horizon payments.
- **Live updates.** SSE streams the accruing balance to the client.

---

## Quick start

Requires Node, **pnpm**, and a PostgreSQL database (Supabase works well).

```bash
pnpm install

# configure environment (database URL, hub wallet secret, network, etc.)
cp .env.example .env.local   # then fill in values

pnpm db:push                 # apply the Drizzle schema
pnpm dev                     # http://localhost:3004
```

Other scripts:

```bash
pnpm build        # production build
pnpm start        # run the production build
pnpm lint         # lint
pnpm test         # unit tests (vitest)
pnpm test:e2e     # end-to-end tests (playwright)
pnpm db:generate  # generate migrations
pnpm db:migrate   # run migrations
pnpm seed         # load demo data
```

> Background jobs are **off** on serverless (gated behind `ENABLE_BACKGROUND_JOBS`); streamed amounts are computed on read, so the app stays correct with no worker running.

---

## Project structure

```
source-code/
├── app/
│   ├── [locale]/
│   │   ├── page.tsx              # /            landing
│   │   ├── dashboard/            # /dashboard   your streams
│   │   ├── streams/new/          # /streams/new create a stream
│   │   ├── streams/[id]/         # /streams/[id] stream detail + live drip
│   │   └── stats/                # /stats       Agos in numbers
│   └── api/
│       ├── auth/                 # challenge, verify, me, logout
│       ├── streams/              # list/create, [id], withdraw, cancel, sse
│       ├── trustline/usdc/       # changeTrust status + XDR build
│       └── stats/                # public interaction counts
├── src/
│   ├── server/                   # config, controller, service, db, lib, stellar/*, middleware
│   │   └── stellar/              # network, tx (Horizon), soroban (AgosStream client), federation
│   └── ui/                       # components, hooks, lib
├── contracts/                    # AgosStream Soroban contract (Rust): src, tests, deploy, ts-client
├── messages/                     # next-intl translations
├── docs/                         # SUBMISSION, design, technical-flow, description (plain text)
└── screen-shot/                  # live-app captures
```

---

## API endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/challenge` | issue SEP-10 challenge tx |
| POST | `/api/auth/verify` | verify signature, set session cookie |
| GET | `/api/auth/me` | restore session |
| POST | `/api/auth/logout` | clear session |
| GET | `/api/streams` | list streams |
| POST | `/api/streams` | create a stream |
| GET | `/api/streams/[id]` | stream detail |
| POST | `/api/streams/[id]/withdraw` | withdraw earned funds (on-chain) |
| POST | `/api/streams/[id]/cancel` | cancel + refund unearned (on-chain) |
| GET | `/api/streams/[id]/sse` | live drip counter (Server-Sent Events) |
| GET | `/api/trustline/usdc` | USDC trustline status |
| POST | `/api/trustline/usdc` | build changeTrust XDR |
| GET | `/api/stats` | public interaction counts |

---

Built for the Stellar APAC Hackathon · Savings & DeFi · testnet only.
