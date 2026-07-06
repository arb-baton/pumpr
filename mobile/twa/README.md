# Pump-r Android / Solana Mobile Build Path

Pump-r's production web app should be packaged for Android as a Trusted Web Activity (TWA). Solana Mobile documents this path for publishing a PWA/web app to the dApp Store, and it is the safest route for Pump-r because the live site already owns wallet auth, Pump.fun launch, profile, referrals, airdrop, GO, and social flows.

## Why TWA Instead Of The Existing Expo Shell

The existing `mobile/` Expo app is a UI/API shell and its docs say real buy, sell, and create transactions still need wallet wiring. A TWA loads `https://pump-r.fun` in Chrome's trusted app surface, so production wallet flows, X/email auth, Supabase persistence, and all backend routes stay exactly aligned with the website.

## Local Requirements

This machine currently needs Android tooling before it can build the signed APK/AAB:

- JDK 17 or newer
- Android Studio / Android SDK
- Android build tools
- A release signing key
- Bubblewrap CLI

## Build Steps

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://pump-r.fun/manifest.webmanifest
bubblewrap build
```

After build, upload the signed APK through the Solana dApp Publisher Portal.

## Current Build Output

The generated TWA project lives in `mobile/twa/pumpr-twa`.

Built artifacts:

- `mobile/twa/pumpr-twa/app-release-signed.apk`
- `mobile/twa/pumpr-twa/app-release-bundle.aab`

The package id is `fun.pumpr.app`.

The local release keystore is intentionally ignored by git:

- `mobile/twa/pumpr-twa/pumpr-release.keystore`

To rebuild on this machine, set the keystore passwords in your shell and run:

```powershell
$env:BUBBLEWRAP_KEYSTORE_PASSWORD="..."
$env:BUBBLEWRAP_KEY_PASSWORD="..."
.\mobile\twa\build-pumpr-twa.ps1
```

## Required Before Final Submission

- Keep the generated signing certificate fingerprint live at `https://pump-r.fun/.well-known/assetlinks.json`.
- Test Phantom, Solflare, and Seed Vault / Mobile Wallet Adapter flows on Android.
- Test Pump.fun launch with dev buy and Manlet Mode off/on.
- Test X/email auth callback on Android.
- Prepare store assets: icon, screenshots, description, privacy policy, and support URL.

## Suggested Package

Use `fun.pumpr.app` unless a different package name has already been reserved.
