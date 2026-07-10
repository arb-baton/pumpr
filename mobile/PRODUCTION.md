# Android Production Checklist

## What Is Implemented

- Pump.fun-style Android UI with dark theme, green accents, bottom action rail, deposit sheet, create sheet, token detail page, chart surface, buy/sell practice flow, communities, GO, Alpha, wallet/profile, notifications/settings.
- Live API loading from `https://pump-r.fun` for home launches, Alpha, and GO bounties.
- Local fallbacks so the app still opens when the API is unavailable.
- Android package config: `fun.pumpr.app`.
- EAS build profiles for internal APK and production AAB.

## What Needs External Credentials Before Store Release

- EAS project id in `app.json`.
- Android signing key configured in EAS.
- Firebase push credentials for Android notifications.
- WalletConnect project id for production EVM wallet sessions.
- Phantom/Solflare deep link allowlisting for Solana signing.
- Google Play privacy policy and data safety answers.

## Real Transaction Flow

The current mobile client has the UI and API shell. Production signing should be wired through:

- EVM: WalletConnect v2 session, then call existing Pump-r contract methods.
- Solana/Pump.fun: Phantom/Solflare deeplink signing and Pump.fun SDK backend finalize flow.
- X OAuth: use `pumpr://x/callback` as the mobile redirect and keep `https://pump-r.fun/api/x/*` for server-side token exchange.

Until those credentials are added, the buy/sell and create flows run in safe practice mode inside the app.
