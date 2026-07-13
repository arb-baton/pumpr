# Pump-r.Fun

Pump-r.Fun is a mobile-first Solana launchpad and crypto-native social rewards app.

The project started as a Pump.fun-style launch experience and has grown into a broader platform for launches, communities, referrals, airdrops, creator rewards, alpha, GO bounties, AI agents, and Android/Seeker distribution.

- Live app: https://pump-r.fun
- Android APK page: https://pump-r.fun/android
- Airdrop history: https://pump-r.fun/airdrop
- Skill file: https://pump-r.fun/skill.md
- Android package: `fun.pumpr.app`
- Official Pump-r mint: `C64Fr3nt6S9mmbehCS66Y1HYLnwBdMeUCdTimfmvpump`

## What Pump-r Does

Pump-r is built around one idea: launches should reward the people who actually help them grow.

The current app includes:

- Pump.fun-style Solana token launches through connected Solana wallets.
- Persistent home cards for launched tokens with market-cap syncing from live sources.
- No-vamp checks to block duplicate token names and tickers.
- Token holder gating for launches and reward eligibility.
- Weighted holder airdrops with public proof, Solscan transaction links, and historical drop records.
- Referral links, editable referral names, QR codes, and beta referral tracking.
- Pump-r Social beta with profiles, posts, replies, likes, image uploads, and wallet-linked identity.
- Communities per token with comments and post flows.
- Alpha Tips for posting and rewarding useful alpha.
- GO bounties and Pump.fun open bounty syncing.
- Agent registry using `SKILL.md` for bounty/launch-support agents.
- PUMPR Card waitlist page for the upcoming crypto-native card concept.
- Android APK/TWA build and Seeker dApp Store submission support.
- Terms and Privacy pages for store/compliance submissions.
- Legacy EVM launch contracts and factory support for Ethereum/Base/Robinhood-style chains.

## Product Pages

The frontend lives in `frontend/` and is served by the Express backend.

Main pages:

- `/` - home/explore feed and token cards
- `/create` - token launch flow
- `/token` - token details
- `/profile` - wallet/social profile
- `/communities` - token communities
- `/go` - GO bounties
- `/alpha` - alpha tips
- `/agents` - agent registry and SKILL.md onboarding
- `/airdrop` - PUMPR holder and outreach airdrop history
- `/referrals` - referral beta
- `/social` - Pump-r Social beta
- `/pumpr-card` - PUMPR Card waitlist
- `/android` - Android APK download and package/compliance details
- `/terms` - public Terms of Use
- `/privacy` - public Privacy Policy
- `/skill.md` - agent skill file

## Architecture

Pump-r uses a simple production architecture:

```text
Browser / Android TWA / Seeker
        |
        v
Frontend HTML/CSS/JS in frontend/
        |
        v
Node.js + Express backend on Vercel
        |
        +--> Supabase storage/database objects
        +--> Solana RPC / Pump.fun SDK / Token-2022
        +--> Dexscreener / GeckoTerminal / Pump.fun APIs
        +--> X OAuth / email-social auth helpers
        +--> OpenAI-powered agent and bounty drafting
        +--> Legacy EVM factories through ethers/Hardhat artifacts
```

Runtime persistence is a mix of Supabase-backed stores in production and local JSON/cache files during local development. Production data such as profiles, launches, social posts, referrals, support messages, waitlists, Pump.fun sessions, and Pump.fun launch records should be backed by Supabase environment variables.

## Tech Stack

- Node.js + Express
- Vanilla HTML/CSS/JavaScript frontend
- Solana Web3.js
- Pump.fun SDK
- SPL Token / Token-2022
- Supabase storage and REST tables
- Vercel production deployment
- Hardhat + Solidity for legacy EVM launch factories
- Android Trusted Web Activity / PWA wrapper
- OpenAI API for agent and bounty draft helpers
- Dexscreener, GeckoTerminal, Pump.fun, Jupiter-related market data integrations

## Local Development

Install dependencies:

```bash
npm install
```

Start the local app:

```bash
npm run app
```

Open:

```text
http://localhost:4173
```

The backend serves both API routes and frontend pages from `backend/server.js`.

Useful local routes:

```text
http://localhost:4173/create
http://localhost:4173/airdrop
http://localhost:4173/referrals
http://localhost:4173/social
http://localhost:4173/android
```

## Environment

Copy `.env.example` to `.env` and fill in the services you need.

Minimum useful local setup:

```env
SOLANA_RPC_URL=https://your-solana-rpc.example
PUMPFUN_SOLANA_RPC_URL=https://your-solana-rpc.example
PUMPR_TOKEN_ADDRESS=C64Fr3nt6S9mmbehCS66Y1HYLnwBdMeUCdTimfmvpump
PUMPR_TOKEN_CHAIN_ID=101
PUMPR_HOLDER_GATE_REQUIRED=0
```

Production storage/session features need Supabase:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=uploads
SUPABASE_PROFILE_TABLE=user_profiles
SUPABASE_FOLLOW_TABLE=user_follows
```

X auth needs:

```env
X_CLIENT_ID=your-x-oauth-client-id
X_CLIENT_SECRET=your-x-oauth-client-secret
X_CALLBACK_URL=https://pump-r.fun/api/x/oauth/callback
```

AI agent/bounty helpers need:

```env
OPENAI_API_KEY=your-openai-api-key
OPENAI_AGENT_MODEL=gpt-4.1-mini
OPENAI_IMAGE_MODEL=gpt-image-1
```

Pump.fun live bounty sync:

```env
ENABLE_PUMPFUN_BOUNTIES=1
PUMPFUN_BOUNTIES_URL=https://pump.fun/go
PUMPFUN_LIVESTREAM_API_URL=https://livestream-api.pump.fun
```

X mention launch intake:

```env
PUMPR_X_USERNAME=pumpr_fun
TWEXAPI_BEARER_TOKEN=your-twexapi-token
PUMPR_TWEX_X_COOKIE=your-pumpr-fun-x-cookie
OPENAI_API_KEY=your-openai-api-key
X_LAUNCH_SOLANA_PRIVATE_KEY=store-only-as-a-secret
X_LAUNCH_AUTOPILOT_ENABLED=true
X_LAUNCH_ALLOW_PUBLIC=true
X_LAUNCH_ALLOWED_USERNAMES=
X_LAUNCH_LOOP_INTERVAL_SECONDS=30
```

GitHub Actions schedules can only start roughly every five minutes, so the scheduled `X launch intake` workflow runs a bounded loop and checks public mentions every 30 seconds while the job is active. For always-on intake, run `npm run x:launch-intake:loop` on a worker host with the same secrets; set `X_LAUNCH_LOOP_RUNS=0` for continuous polling.

For a fuller list, see `.env.example`.

## Solana / Pump.fun Launch Flow

At a high level:

1. User connects a Solana wallet.
2. Create page validates token name, ticker, image, social links, and duplicate/vamp checks.
3. Metadata is hosted through the configured storage path.
4. Pump.fun launch transaction is prepared.
5. User signs with Phantom or another compatible Solana wallet.
6. Backend records the launch and keeps it visible on the home page.
7. Market cap and token card data sync from live data sources after launch.
8. Optional post-launch creator/KOL/community distribution logic can run through separate transfer tooling.

Holder gating can be turned on/off with:

```env
PUMPR_HOLDER_GATE_REQUIRED=1
```

For local testing without requiring token holdings:

```env
PUMPR_HOLDER_GATE_REQUIRED=0
```

## Airdrops And Rewards

The airdrop page is backed by static JSON records in:

```text
frontend/data/
```

Operational scripts and local audit records live in:

```text
work/
```

The system has been used for:

- PUMPR holder airdrops
- weighted 0.5%+ holder rewards
- KOL/outreach drops
- Ansem Black Bull holder outreach
- one-off PUMPR sends

Execution scripts should never commit private keys. Use environment variables only in the local shell and clear them after use.

## Android / Seeker

The project includes Android-focused support:

- APK download page: `/android`
- TWA package name: `fun.pumpr.app`
- Terms: `/terms`
- Privacy: `/privacy`
- Android source/config under `mobile/`
- TWA wrapper under `mobile/twa/pumpr-twa/`

Mobile app notes are in:

```text
mobile/README.md
mobile/PRODUCTION.md
mobile/twa/README.md
```

## Legacy EVM Contracts

This repo still includes the earlier EVM launchpad contracts and Hardhat setup:

- `MemeLaunchFactory`
- `MemeToken`
- `MemePool`
- local test router and deployment scripts

Useful commands:

```bash
npm run compile
npm test
npm run node
npm run deploy:local
```

EVM deployment scripts exist for Ethereum, Base, Monad-style config, Robinhood chain config, and GO escrow/factory experiments. These are secondary to the current Pump-r Solana/Pump.fun product.

## Production Deployment

Production is deployed to Vercel.

```bash
npm run deploy:prod
```

That runs:

```bash
node scripts/vercel-production-deploy.js
```

The deployment script builds the Vercel output, deploys it, aliases `pump-r.fun`, and verifies the production domain.

## Important Safety Notes

- Do not commit `.env`, private keys, wallet seed phrases, session cookies, or API bearer tokens.
- The PUMPR dev wallet key must only be passed through a temporary shell environment variable when running local operational scripts.
- Airdrops and token transfers are real on-chain actions. Always dry-run, validate recipients, and verify finalized signatures.
- This code is not financial advice and does not guarantee token performance, rewards, or eligibility.

## Project Status

Pump-r is an active prototype/product build. The app is live, Android/Seeker-ready, and under fast iteration. Some features are beta and intentionally labeled as such in the UI, including referrals and Pump-r Social.
