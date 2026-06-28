ARCHITECTURE

Agos (007 Salary Grant Streaming). Per-second USDC and XLM salary and grant streaming on Stellar testnet, with on-chain linear vesting held in a Soroban smart contract.

STACK

1. Frontend. Next.js 16 App Router with React 19 and TypeScript strict mode. Tailwind CSS v4 for styling. next-intl for i18n, next-themes for theming, sonner for toasts, framer-motion for motion. Radix primitives plus shadcn-style components. React Hook Form 7 with zod resolvers handles all input. Pages live under app/[locale] and are fully browseable without a connected wallet.

2. Backend. Next.js route handlers under app/api. Thin controllers under src/server/controller wrap business logic in src/server/service. Service modules own all Stellar SDK calls and Soroban RPC invocations. Standard envelope helpers in src/server/lib/http (ok, created, fail). Middleware composition via withAuth, withError, and withRateLimit chained through compose.

3. Database. Drizzle ORM 0.45 with the postgres pg driver. Schema lives in src/server/db/schema and is applied directly via drizzle-kit push --force (no migration files checked in). DB is Supabase Postgres.

4. Blockchain. Stellar testnet (Test SDF Network ; September 2015). Horizon for classic ops (payments, changeTrust). Soroban RPC for AgosStream contract calls. The AgosStream contract is written in Rust with soroban-sdk 22, deployed at the address pinned in env vars.

5. Wallet. Freighter browser extension through @stellar/freighter-api v6. A hub wallet (server-held funded testnet key) acts as the on-chain payer and admin for XLM streams and is also the custodian for USDC hub-paid flows.

DIRECTORY LAYOUT

1. app/[locale]/. Next.js App Router pages. page.tsx is landing, dashboard/page.tsx lists streams you can see, streams/new/page.tsx hosts the create form, streams/[id]/page.tsx shows the stream detail with live drip counter, stats/page.tsx renders public Agos-in-numbers counters. app/layout.tsx wraps the locale segment with next-intl provider and global styles.

2. app/api/. Route handlers. auth subpath owns SEP-10 challenge, verify, me, logout. streams subpath owns list, create, detail, withdraw, cancel, and SSE drip. trustline/usdc handles changeTrust status and XDR build. stats returns the public counter payload.

3. src/server/controller/. HTTP request handlers. Today this houses auth.controller. Other endpoints are route handlers that delegate directly to service modules.

4. src/server/service/. Business logic. auth.service handles nonce and session lifecycle. stream.service owns create, list, withdraw, and cancel with full on-chain wiring. stats.service computes the public counters excluding demo and seed rows. earned.ts mirrors the on-chain linear vesting formula in TypeScript so the UI can preview accrued amounts without a contract round-trip.

5. src/server/stellar/. Stellar SDK helpers. network.ts exports testnet/passphrase constants. tx.ts builds and submits classic Horizon operations. soroban.ts is the typed AgosStream contract client (create_stream, withdraw, stop, plus read calls). federation.ts wraps account lookup helpers.

6. src/server/db/. Drizzle schema and Postgres pool. client.ts creates the pool. schema/ contains the four tables (authNonces, sessions, streams, withdrawals) and three enums (stream_status, asset_kind, withdrawal_status) exported from schema/index.ts.

7. src/ui/. Client code. components holds WalletConnect, CreateStreamForm, DripCounter, StreamCard, EnableUsdcButton, and layout/Navbar. hooks holds useWallet and useStreamSSE. ui/lib holds network constants and utility helpers.

8. contracts/agos-stream/. Soroban Rust contract. src/lib.rs is the contract entry points. src/types.rs and src/storage.rs define the on-chain Stream type and DataKey enum. src/error.rs defines Error variants. src/test.rs is the unit test suite. ts-client/agos-stream-client.ts ships typed JS bindings. scripts/deploy.sh handles deploy.

9. tests/. Vitest unit tests under tests/server/service and tests/ui. Playwright e2e under tests/e2e (main-flow, demo-video, prod-real). tests/setup.ts wires jest-dom matchers and the MediaQueryList polyfill.

10. docs/. Plain text submission set plus this architecture file.

DATA MODEL

Four tables plus three enums. All timestamps are timezone-aware.

1. auth_nonces. Single-use challenge records for SEP-10.
   1.1. nonce text primary key.
   1.2. public_key text not null.
   1.3. expires_at timestamptz not null.
   1.4. consumed_at timestamptz nullable.

2. sessions. Active login sessions.
   2.1. id uuid primary key default random.
   2.2. public_key text not null.
   2.3. created_at timestamptz default now not null.
   2.4. expires_at timestamptz not null.

3. streams. One row per created salary or grant stream.
   3.1. id uuid primary key default random.
   3.2. employer_pubkey text not null, indexed.
   3.3. employee_pubkey text not null, indexed.
   3.4. employee_name text not null.
   3.5. title text not null.
   3.6. asset asset_kind enum, default XLM. Values XLM or USDC.
   3.7. rate_per_second_minor text not null. 6-decimal minor units per second.
   3.8. funded_amount_minor text not null. Total deposited in minor units.
   3.9. withdrawn_amount_minor text not null default 0. Running total paid out.
   3.10. is_demo boolean not null default false. Excluded from public stats.
   3.11. contract_stream_id text nullable. On-chain Soroban id for XLM streams.
   3.12. create_tx_hash text nullable. Explorer hash of the create call.
   3.13. status stream_status enum, default active. Values active, cancelled, completed, paused. Indexed.
   3.14. version integer not null default 0. Optimistic concurrency counter.
   3.15. started_at, cancelled_at, completed_at, created_at, updated_at timestamptz.
   3.16. last_withdraw_tx_hash text nullable.

4. stream_withdrawals. One row per withdrawal attempt.
   4.1. id uuid primary key default random.
   4.2. stream_id uuid not null, references streams(id) on delete cascade.
   4.3. employee_pubkey text not null.
   4.4. amount_minor text not null.
   4.5. tx_hash text nullable.
   4.6. status withdrawal_status enum, default pending. Values pending, submitted, confirmed, failed.
   4.7. requested_at timestamptz default now not null.
   4.8. confirmed_at timestamptz nullable.
   4.9. error_message text nullable.

STELLAR INTEGRATION

1. SEP-10 style auth. Network-pinned. POST /api/auth/challenge issues a manageData challenge transaction bound to the testnet passphrase. The user signs with Freighter. POST /api/auth/verify validates the signed challenge, mints a session row, and sets an HttpOnly session cookie with a 7-day TTL. GET /api/auth/me restores the session. POST /api/auth/logout clears it. Nonces live in auth_nonces with 5-minute expiry.

2. Soroban contract invocation. The AgosStream contract is invoked through Soroban RPC via the typed client in src/server/stellar/soroban.ts. The hub wallet signs all server-side invocations; the contract is the custodian of escrowed XLM.

3. Classic Horizon operations. changeTrust is built and submitted from the connected wallet via /api/trustline/usdc to enable USDC. USDC stream create, withdraw, and stop use classic payment operations from the hub wallet.

4. Server-Sent Events. /api/streams/[id]/sse pushes the growing accrued balance to the client without polling. Heartbeat is configurable via SSE_HEARTBEAT_MS.

5. Federation. account lookup helpers live in src/server/stellar/federation.ts and are used to resolve friendly addresses where supported.

6. Contract entry points (AgosStream on testnet CDMSQ2YYSDBUUJNEF5SBZZLBY5QT52XAJVUBVGU4WILJ3VKD2KW4EL7D).
   6.1. initialize(admin, token). Admin and XLM SAC set once at deploy. Admin role required.
   6.2. create_stream(payer, recipient, total_amount, start_time, end_time). Locks full deposit from payer into contract custody. Auth: payer. Role: employer or hub payer.
   6.3. withdraw(stream_id). Pays vested-minus-already-withdrawn to recipient. Permissionless poke; funds always go to recipient. Role: anyone (typically the recipient).
   6.4. stop(stream_id). Settles vested to recipient, reclaims unvested remainder to payer. Auth: payer. Role: employer.
   6.5. Views. get_stream, vested_amount, withdrawable, total_streams, is_paused, get_admin, get_token. Read-only.
   6.6. Admin. pause, unpause, set_admin, upgrade (Wasm replacement). Auth: admin.

7. Soroban client internals (src/server/stellar/soroban.ts).
   7.1. invokeSigned builds, prepares, signs with the hub key, submits, then polls the RPC for confirmation. It retries up to nine times on transient errors like TxBadSeq, fetch failures, TRY_AGAIN_LATER, and the StreamNotFound error that occurs right after create due to RPC read-lag.
   7.2. simulate is the read-only path for view methods and only retries transient fetch and Contract #6 errors.
   7.3. Type marshalling uses nativeToScVal with explicit u64, i128, and Address conversions. Stream ids and amounts are bigints end to end to avoid precision loss.
   7.4. sorobanEnabled returns true only when both SOROBAN_STREAM_CONTRACT_ID and HUB_STELLAR_SECRET are configured; absent either, XLM flows degrade to a non-on-chain path.

KEY FLOWS

1. Connect wallet (SEP-10).
   1.1. User clicks WalletConnect in the Navbar. useWallet calls Freighter requestAccess.
   1.2. Client POSTs to /api/auth/challenge with the public key. Server generates a nonce, stores it in auth_nonces with a 5-minute TTL, and returns a base64 manageData challenge transaction pinned to the testnet passphrase.
   1.3. Client hands the challenge XDR to Freighter for signing via signTransaction.
   1.4. Client POSTs the signed XDR to /api/auth/verify. Server verifies the signature against the nonce, marks the nonce consumed, inserts a sessions row, and sets the agos_session HttpOnly cookie (7-day TTL).
   1.5. Subsequent requests restore via GET /api/auth/me. Logout POSTs to /api/auth/logout which deletes the session row and clears the cookie.

2. Create stream.
   2.1. Authenticated user opens /streams/new. CreateStreamForm collects recipient address, employee name, title, asset (XLM default or USDC), rate per second, and total funded amount.
   2.2. Form validates with zod. On submit, POST /api/streams with the payload.
   2.3. stream.service.create inserts a streams row in pending state (status active after settlement).
   2.4. For XLM streams the server invokes AgosStream.create_stream through Soroban RPC using the hub wallet as payer. The full grant is transferred from hub into the contract. The on-chain id is written back as contract_stream_id and the create tx hash as create_tx_hash.
   2.5. For USDC streams the server schedules a classic payment from the hub wallet to the recipient address on the agreed schedule, recorded in the same row.
   2.6. The stream row is now live; the UI redirects to /streams/[id] which opens an SSE subscription for live drip.

3. Withdraw vested funds.
   3.1. Recipient (or anyone) hits Withdraw on the stream page.
   3.2. POST /api/streams/[id]/withdraw inserts a stream_withdrawals row in pending state.
   3.3. For XLM streams the server invokes AgosStream.withdraw via Soroban RPC. The contract pays vested-minus-already-withdrawn to the recipient on-chain.
   3.4. For USDC streams the server submits a classic payment from the hub wallet to the employee for the accrued amount.
   3.5. The withdrawal row updates to confirmed with the tx hash, and the stream's withdrawn_amount_minor and last_withdraw_tx_hash are updated atomically with a version bump.

4. Stop or cancel a stream.
   4.1. Employer hits Stop on their dashboard.
   4.2. POST /api/streams/[id]/cancel invokes AgosStream.stop on Soroban for XLM streams. The contract settles the vested portion to the recipient and reclaims the unvested remainder to the payer.
   4.3. For USDC the server reverses the remaining hub payment schedule.
   4.4. The stream row updates to cancelled with cancelled_at set.

5. Live drip counter via SSE.
   5.1. Client opens EventSource to /api/streams/[id]/sse.
   5.2. Server emits a snapshot of accrued balance derived from earned.ts (rate * elapsed seconds, clamped to funded) every tick.
   5.3. Heartbeat is sent on SSE_HEARTBEAT_MS interval to keep the connection alive through proxies.

6. Stats.
   6.1. GET /api/stats queries the streams table excluding is_demo and seed rows.
   6.2. stats.service counts active streams, total funded, total withdrawn, and completed streams.
   6.3. /stats renders the counts with sonner toasts disabled. No wallet required to view.

ENVIRONMENT VARIABLES

1. NODE_ENV. development or production.
2. NEXT_PUBLIC_APP_NAME. Agos.
3. NEXT_PUBLIC_APP_URL. http://localhost:3004 in dev, production URL in prod.
4. DRIZZLE_DATABASE_URL. Postgres connection string (Supabase).
5. STELLAR_NETWORK. testnet.
6. NEXT_PUBLIC_STELLAR_NETWORK. testnet.
7. STELLAR_HORIZON_URL. Horizon endpoint.
8. STELLAR_NETWORK_PASSPHRASE. Pinned testnet passphrase.
9. SOROBAN_RPC_URL. Soroban RPC endpoint.
10. SOROBAN_STREAM_CONTRACT_ID. AgosStream deployed contract id (server-only).
11. NEXT_PUBLIC_SOROBAN_STREAM_CONTRACT_ID. Public mirror for client reads.
12. XLM_SAC_CONTRACT_ID. Native XLM Stellar Asset Contract id.
13. HUB_STELLAR_SECRET. Funded testnet secret used as payer and admin. Required for real on-chain settlement.
14. SESSION_SECRET. Server-side session signing secret, at least 32 chars.
15. SESSION_COOKIE_NAME. agos_session.
16. SESSION_TTL_SECONDS. 604800 (7 days).
17. NONCE_TTL_SECONDS. 300 (5 minutes).
18. USDC_ASSET_CODE. USDC.
19. USDC_ASSET_ISSUER_TESTNET. Testnet USDC issuer.
20. USDC_ASSET_ISSUER_PUBLIC. Public USDC issuer (mainnet placeholder).
21. SSE_HEARTBEAT_MS. 15000.
22. DEMO_MODE. false in prod.
23. ENABLE_BACKGROUND_JOBS. false on serverless.
24. NEXT_PUBLIC_SUPPORTED_LOCALES. en.
25. NEXT_PUBLIC_DEFAULT_LOCALE. en.
26. NEXT_PUBLIC_LOCALE_PREFIX. as-needed.

DEPLOY

1. Vercel project name. agos-flame (the live URL is https://agos-flame.vercel.app).
2. Vercel scope. personal account, no team.
3. Supabase database name. db_agos (project-specific Postgres instance).
4. Live URL. https://agos-flame.vercel.app.
5. AgosStream contract on Stellar testnet. CDMSQ2YYSDBUUJNEF5SBZZLBY5QT52XAJVUBVGU4WILJ3VKD2KW4EL7D.
6. Native XLM SAC. CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC.
7. Soroban RPC. https://soroban-testnet.stellar.org.
8. Horizon. https://horizon-testnet.stellar.org.
9. USDC testnet issuer. GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5.
10. Agent slot in this workspace. port 3004, database stellar_agent_d (per workspace CLAUDE.md).

EARNED AMOUNT MATH

1. Pure function calcEarned in src/server/service/earned.ts. Caller injects now; no Date.now calls inside.
2. earned = min(fundedAmount, floor(elapsedSeconds * ratePerSecond))
3. netEarned = max(0, earned - withdrawn)
4. remaining = max(0, funded - earned). This is what stop would refund for XLM.
5. percentComplete = floor(earned * 100 / funded), integer percent.
6. formatAmount renders 6-decimal minor units to a Stellar-valid decimal string with trailing zeros trimmed.
7. Mirrors the on-chain formula in AgosStream.vested_of so UI previews match what withdraw will actually pay.

LIMITATIONS PLUS KNOWN GAPS

1. No checked-in SQL migrations. Schema is applied via drizzle-kit push --force against the target database. This is convenient for a single-environment hackathon build but unsafe for production migrations. db:generate and db:migrate scripts exist but no migrations directory is populated.

2. drizzle/ directory is empty. All schema lives in src/server/db/schema and is the source of truth.

3. Only one locale. next-intl scaffolding is in place and routing is locale-prefixed, but only en.json is shipped in messages/.

4. Background jobs are disabled by default. ENABLE_BACKGROUND_JOBS is false on serverless. All streaming math is computed on read from contract ledger time plus a TS mirror in earned.ts, so correctness is preserved but no scheduled reconciler runs.

5. Hub wallet is a single point of failure. The hub key signs all Soroban invocations and pays USDC. There is no key rotation, no multisig, and no escrow beyond the on-chain contract for XLM.

6. USDC flow is not on-chain escrow. USDC streams settle via classic payments from the hub wallet; there is no equivalent Soroban escrow contract for USDC. Stop behavior is approximate compared to XLM.

7. Stream detail SSE has no resume token. A dropped connection re-fetches the latest snapshot and resumes from there; missed tick events are not replayed.

8. Public stats exclude demo and seed rows by is_demo flag only. There is no rate limit on /api/stats beyond the standard middleware.

9. Federation support is wired but minimal. Only account lookup helpers exist; no home domain resolution or memo validation.

10. No CI. Lint, test, and e2e are run manually. Playwright config exists for headless and headed runs but no GitHub Actions workflow is committed.

11. ts-client bindings for AgosStream are checked in under contracts/agos-stream/ts-client but are not regenerated by a build step in package.json. Drift between contract source and JS bindings is possible until a regeneration script is wired.

12. test:all script uses npm test plus npm run test:e2e rather than pnpm. Running it under pnpm will fail. Use pnpm test and pnpm test:e2e separately instead.

13. screen-shot/ directory is referenced by README but lives at the project root, not inside source-code. Some scripts assume a relative path that resolves only from the project root.

14. No production mainnet wiring. STELLAR_NETWORK is hardcoded to testnet across env files and the README; mainnet deployment requires a fresh contract id, new SAC address, and a freshly funded hub wallet.

15. Soroban client retries on testnet RPC lag. Up to nine attempts with backoff for transient TxBadSeq, timeout, and Contract #6 (StreamNotFound) errors. This works around a known testnet RPC read-lag pattern but would mask real outages if the RPC node is down.

16. No stream pause UI. The contract supports pause and unpause but the dashboard does not expose a button to invoke them; admin operations are reachable only via direct contract calls.

CONFIG AND BOOTSTRAP

1. Env validation. src/server/config/env.ts runs the entire process env through a zod schema at module load. Failure prints each issue and, outside test mode, throws. Required keys include DRIZZLE_DATABASE_URL and SESSION_SECRET (min 32 chars). Optional keys include HUB_STELLAR_SECRET and SOROBAN_STREAM_CONTRACT_ID; absence disables on-chain XLM settlement and falls back to off-chain tracking.

2. Public env. src/server/config/env.public.ts mirrors NEXT_PUBLIC_* values for client use. The app name, app URL, supported locales, default locale, locale prefix, network, and contract id are exposed read-only.

3. Stellar config. src/server/config/stellar.ts derives network constants from env and provides network passphrase, Horizon URL, Soroban RPC URL, USDC asset code, and USDC issuer helpers. USDC_ASSET_ISSUER_VALUE picks public or testnet issuer based on STELLAR_NETWORK.

4. Bootstrap. src/server/lib/bootstrap.ts performs one-time startup checks (DB connectivity, env sanity). Failures log and crash the process.

5. Cookies. src/server/lib/cookies.ts sets, reads, and clears the agos_session HttpOnly cookie with the configured TTL. Path is root, SameSite is lax, Secure follows NODE_ENV.

6. Logger. src/server/lib/logger.ts is a thin wrapper around console that supports structured fields and levels. Production logs are JSON, dev logs are pretty.

7. Event bus. src/server/lib/eventBus.ts is a tiny in-process emitter used by services to fan out stream lifecycle events to SSE handlers and audit loggers.

MIDDLEWARE

1. compose. src/server/middleware/compose.ts chains handler functions left to right and threads (req, ctx) through each.

2. withError. Wraps a handler and converts thrown AppError, ZodError, or unknown into the standard ApiEnvelope via fromError. Logs unhandled errors.

3. withAuth. Reads the agos_session cookie, looks up the matching sessions row, attaches the public key to context, and rejects with 401 if missing or expired.

4. withRateLimit. In-memory token bucket keyed by IP plus path. Defaults are conservative for a public testnet demo. No Redis backend.

API ENVELOPE

1. ok(data, init). 200 with { ok: true, data } body. Optional ResponseInit for headers or status override.

2. created(data). 201 with the same envelope shape.

3. fail(code, message, status, details). Error envelope { ok: false, error: { code, message, details } } at the given status (default 400).

4. AppError. Thrown by services to carry code, message, status, and optional details. Caught by withError and rendered via fail.

5. Error codes. INVALID_INPUT, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, ALREADY_EXISTS, INVALID_PUBLIC_KEY, RATE_LIMITED, CONFLICT, INTERNAL.

STREAM CREATE FLOW DETAILS

1. Validation. StrKey.isValidEd25519PublicKey checks the recipient address. Empty employee name or title is rejected. Rate and funded must be positive BigInts.

2. Asset selection. Asset is XLM by default. USDC is honored only if the request body explicitly says so.

3. Schedule derivation. durationSeconds = funded / rate. Minimum 1 second. startTime is Math.floor(Date.now() / 1000). endTime is startTime + duration. This matches the off-chain drip rate exactly so the contract and the UI agree.

4. Unit conversion. DB amounts are 6-decimal minor units. The native XLM SAC uses 7 decimals (stroops). totalStroops = funded * 10n.

5. Contract invocation. sorobanStream.createStream is called with payer (hub key, falling back to the connected employer if no hub is configured), recipient, totalStroops, startTime, and endTime. Returns streamId and txHash. Failures are caught and surfaced as a 502 AppError so the UI can prompt the user to top up the hub wallet and retry.

6. Row write. streams insert with contract_stream_id, create_tx_hash, started_at, and asset recorded. The remaining fields default to zero or active.

STREAM WITHDRAW FLOW DETAILS

1. Lock and lookup. streamService.withdraw loads the stream, confirms status is active, and computes accrued using calcEarned.

2. Insert withdrawal. A stream_withdrawals row is inserted in pending with amount_minor derived from netEarned.

3. XLM withdraw. Calls sorobanStream.withdraw(contractStreamId). The contract pays vested-minus-already-withdrawn to the recipient on-chain.

4. USDC withdraw. Submits a classic payment from the hub wallet to the employee pubkey for the accrued amount.

5. Stream update. On success, withdrawn_amount_minor and last_withdraw_tx_hash are updated in a single statement and version is bumped. On failure, the withdrawal row is marked failed with error_message.

STREAM CANCEL FLOW DETAILS

1. Lock and lookup. streamService.cancel loads the stream and asserts the caller is the employer pubkey from the session.

2. XLM stop. Calls sorobanStream.stop(contractStreamId). The contract settles the vested portion to the recipient and reclaims the unvested remainder to the payer in one atomic call.

3. USDC stop. Schedules a reversal via the hub wallet and marks the stream cancelled.

4. Row update. status set to cancelled, cancelled_at set to now, version bumped.

WHY ON-CHAIN VESTING MATTERS

1. No server timer. The contract reads env.ledger().timestamp() on every withdraw call, so the vested amount is always correct relative to chain time. The server cannot drift.

2. No per-second tx. Vesting is computed on demand. The recipient can withdraw whenever they want and always receives exactly what has vested.

3. Trust-minimized. The contract custodies funds. Even if the Agos server disappears, anyone can call withdraw on behalf of the recipient (the contract pays to the stream's fixed recipient regardless of caller).

4. Honest settlement. The contract settles and reclaims in stop, so an employer can halt a runaway grant cleanly without off-chain accounting.

PAGES AND ROUTES

1. /. Landing. Pitch, copy, links to docs and demo.

2. /dashboard. Streams where the connected wallet is employer or employee. Uses session public key to scope the query.

3. /streams/new. CreateStreamForm with XLM default and asset selector. Requires a connected wallet.

4. /streams/[id]. StreamCard detail with DripCounter live SSE, Withdraw button, Stop button (employer only), and explorer link to the create and withdraw tx hashes.

5. /stats. Public counters rendered from /api/stats. No wallet needed.

API ROUTE INVENTORY

1. POST /api/auth/challenge. Issue SEP-10 challenge tx.
2. POST /api/auth/verify. Verify signature, mint session, set cookie.
3. GET /api/auth/me. Restore session from cookie.
4. POST /api/auth/logout. Clear session and cookie.
5. GET /api/streams. List streams visible to caller (filtered by employer or employee).
6. POST /api/streams. Create a stream.
7. GET /api/streams/[id]. Fetch one stream.
8. POST /api/streams/[id]/withdraw. Trigger an on-chain withdraw.
9. POST /api/streams/[id]/cancel. Trigger an on-chain stop.
10. GET /api/streams/[id]/sse. Server-Sent Events drip stream.
11. GET /api/trustline/usdc. USDC trustline status for connected wallet.
12. POST /api/trustline/usdc. Build changeTrust XDR for USDC issuer.
13. GET /api/stats. Public interaction counters.

CONTRACT EVENT AND STORAGE NOTES

1. On-chain events. The contract emits symbol_short events for init, create, withdraw, stop, and pause. Indexers can subscribe to those topics.

2. Storage TTL. Instance storage is bumped on every state-changing call with INSTANCE_LIFETIME_THRESHOLD and INSTANCE_BUMP_AMOUNT. Per-stream persistent storage extends TTL on every save so a long salary schedule never expires out from under a pending withdraw.

3. Authorization model. create_stream and stop require payer signature. withdraw is permissionless but always pays to the stream's fixed recipient. Admin operations require the configured admin address.