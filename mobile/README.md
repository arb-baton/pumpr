# Pump Fun Remastered Mobile

Android-first Expo app for Pump-r.fun.

## Run Locally

```bash
cd mobile
npm install
npm run start -- --clear
```

Open on Android with Expo Go for UI/API testing, or run:

```bash
npm run android
```

If Expo Go ever sits on a white screen, stop Metro with `Ctrl+C` and restart with:

```bash
npm run start -- --clear
```

## Production Android Build

```bash
cd mobile
npm install -g eas-cli
eas login
eas build --platform android --profile production
```

## Required Production Setup

- Replace `extra.eas.projectId` in `app.json`.
- Configure Android signing in EAS.
- Add WalletConnect project ID before enabling real EVM wallet transactions.
- Add Solana wallet deep link allowlist for Phantom/Solflare production flows.
- Add Firebase/APNs credentials for push notifications.

The app reads live data from `https://pump-r.fun` and falls back to local demo data if the API is temporarily unavailable.
