# NearestBooze

Find the nearest bottle shop — or bar, pub, nightclub or beer garden — and let a
live compass needle point you straight at it.

Built with Expo (React Native). No API keys, no backend, no accounts: venue data
comes from the free OpenStreetMap Overpass API and everything else runs on device.

## How it works

1. Asks for foreground location permission.
2. Gets a GPS fix (with a 15s timeout and a last-known-position fallback).
3. Queries the Overpass API for bars, pubs, nightclubs, beer gardens and
   alcohol/wine/beverage shops within 5 km.
4. Sorts by great-circle distance and points an animated needle at the selected
   venue using the device's true-north heading.

## Requirements

- Node.js 20+
- Expo SDK 56 toolchain (`npx expo`)
- iOS 15.1+ / Android 7+ for the built app

## Getting started

```bash
npm install
cp .env.example .env    # optional: add a Sentry DSN
npm start
```

Then open the project in Expo Go or a development build.

> The compass and location features need a physical device — simulators report a
> fixed or absent heading.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.js` | Entry point; initialises crash reporting, registers the root component |
| `App.js` | Screen state machine: permissions, location, venue list, error/banner UI |
| `components/Compass.js` | Animated compass ring + needle |
| `components/ErrorBoundary.js` | Catches render crashes and offers a restart |
| `components/PrivacyPolicyModal.js` | In-app privacy policy |
| `lib/overpass.js` | Overpass client: timeouts, retries, mirror failover |
| `lib/geo.js` | Haversine distance, true bearing, formatting |
| `lib/reporting.js` | Optional Sentry wiring |

## Configuration

Environment variables use Expo's `EXPO_PUBLIC_` convention and are inlined into
the bundle at build time — never put secrets in them. See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN. Empty disables crash reporting entirely. |

## Building for the stores

Build profiles live in `eas.json`.

```bash
npx eas init                  # one-time: links the project to your EAS account
npm run build:preview         # internal distribution build
npm run build:production      # store-ready build, auto-increments version
npm run submit                # upload to App Store Connect / Play Console
```

Before your first submission, fill in the placeholder values in the `submit`
section of `eas.json` (Apple ID, App Store Connect app ID, Apple team ID, and the
path to your Google Play service account key).

App version lives in `app.json` (`version`, `ios.buildNumber`,
`android.versionCode`); the production profile auto-increments the build numbers.

## Attribution

Venue data © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, available under the Open Database License (ODbL). The attribution
is surfaced in-app as required by the licence.

## Privacy

See [PRIVACY.md](./PRIVACY.md). Short version: no accounts, no analytics, no
server of ours — coordinates go only to the public Overpass API to look up
venues.

## Drink responsibly

This app is intended for users of legal drinking age. Never drink and drive.
