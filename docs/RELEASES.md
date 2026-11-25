# Releases: three apps

Lull ships as three iOS apps that install side by side. Each has its own app
ID, so each keeps its own data: testing in Dev never touches your real nights,
settings and scores.

| App | App ID | `APP_VARIANT` | Build profile | Who gets it | How |
|---|---|---|---|---|---|
| **Lull Dev** | `com.oooflabs.lull.dev` | `development` | `development-device` (`development` for the Simulator) | you | ad-hoc install from the build page; loads live code from Metro |
| **Lull Beta** | `com.oooflabs.lull.beta` | `beta` | `beta` (`preview` for an ad-hoc copy) | internal, then external testers | TestFlight |
| **Lull** | `com.oooflabs.lull` | `production` | `production` | everyone | App Review, then the App Store |

`app.config.ts` maps each variant to its name, app ID, link scheme
(`lull-dev`, `lull-beta`, `lull`) and icon. Dev and Beta icons carry a band
with their name; regenerate them from `assets/images/icon.png` with
`uv run --with pillow python scripts/variant-icons.py`. With `APP_VARIANT`
unset the config is production, so the web export and anything unconfigured
get the real app.

## Commands

```bash
make build-ios-dev       # Lull Dev for your iPhone
make build-ios-beta      # Lull Beta store build
make submit-beta         # upload the latest finished Lull Beta to TestFlight
make build-ios-release   # Lull for the App Store
make submit-release      # upload the latest finished Lull to App Store Connect
```

If `submit-*` can't read the downloaded build (it arrives as a zip of the
IPA), unzip it and pass the `.ipa` to
`rnd submit -p ios -e <beta|production> --path <file>.ipa`.

## Build numbers

`appVersionSource` is `local`: build numbers live in `VARIANTS` in
`app.config.ts`. Each App Store Connect app counts its own builds, so raise the
variant's `buildNumber` before every upload of Lull Beta or Lull. A repeated
number is rejected on upload.

## Signing

Cloud builds (`.github/workflows/eas-build.yml`) sign with the distribution
certificate in the `EAS_IOS_DIST_P12` secret. Provisioning profiles are made
per app ID at build time with the App Store Connect API key secrets:

- ad hoc (Dev, preview): `rnd ad-hoc <app id>`, listing the registered devices;
- App Store (Beta, Lull): `rnd app-store <app id>`.

So adding an app ID needs no new secrets. It does need the app ID registered
on the team (with the Push Notifications capability, which
`expo-notifications` asks for) and, for TestFlight or the App Store, its own
app record in App Store Connect. Apple's API can't create app records; that's
done by hand in App Store Connect under Apps → New App.

## Moving a build along

1. Lull Dev: day-to-day work against Metro.
2. Lull Beta: `make build-ios-beta`, then `make submit-beta`. Internal testers
   get it as soon as it's processed. Add it to an external group and Apple
   runs a beta review (the first one for each version takes longest).
3. Lull: when a beta is ready to ship, build the same commit with
   `make build-ios-release`, `make submit-release`, and send it to App Review
   from App Store Connect.
