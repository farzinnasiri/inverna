# Releases: three apps

Inverna ships as three iOS apps that install side by side. Each has its own app
ID, so each keeps its own data: testing in Dev never touches your real nights,
settings and scores.

| App | App ID | `APP_VARIANT` | Build profile | Who gets it | How |
|---|---|---|---|---|---|
| **Inverna Dev** | `com.oooflabs.inverna.dev` | `development` | `development-device` (`development` for the Simulator) | you | ad-hoc install from the build page; loads live code from Metro |
| **Inverna Beta** | `com.oooflabs.inverna.beta` | `beta` | `beta` (`preview` for an ad-hoc copy) | internal, then external testers | TestFlight |
| **Inverna** | `com.oooflabs.inverna` | `production` | `production` | everyone | App Review, then the App Store |

`app.config.ts` maps each variant to its name, app ID, link scheme
(`inverna-dev`, `inverna-beta`, `inverna`) and icons. On iOS each app has an
Icon Composer bundle (`assets/images/Inverna*.icon`): the mark as one glass
layer over a solid fill, which iOS 26 renders as default, dark, clear (Liquid
Glass) and tinted by itself. Dev is blue and Beta brown underneath, so they're
easy to tell apart. Android and the web use PNGs; there the Dev and Beta icons
carry a band with their name. All of it comes from one file,
`assets/brand/inverna-mark.svg`:

```bash
node scripts/brand-assets.cjs                             # .icon bundles, icon, splash, favicon, Android
uv run --with pillow python scripts/variant-icons.py      # Dev/Beta PNG bands
``` With `APP_VARIANT`
unset the config is production, so the web export and anything unconfigured
get the real app.

## Commands

```bash
make build-ios-dev       # Inverna Dev for your iPhone
make build-ios-beta      # Inverna Beta store build
make submit-beta         # upload the latest finished Inverna Beta to TestFlight
make build-ios-release   # Inverna for the App Store
make submit-release      # upload the latest finished Inverna to App Store Connect
```

If `submit-*` can't read the downloaded build (it arrives as a zip of the
IPA), unzip it and pass the `.ipa` to
`rnd submit -p ios -e <beta|production> --path <file>.ipa`.

## Build numbers

`appVersionSource` is `local`: build numbers live in `VARIANTS` in
`app.config.ts`. Each App Store Connect app counts its own builds, so raise the
variant's `buildNumber` before every upload of Inverna Beta or Inverna. A repeated
number is rejected on upload.

## Signing

Cloud builds (`.github/workflows/eas-build.yml`) sign with the distribution
certificate in the `EAS_IOS_DIST_P12` secret. Provisioning profiles are made
per app ID at build time with the App Store Connect API key secrets:

- ad hoc (Dev, preview): `rnd ad-hoc <app id>`, listing the registered devices;
- App Store (Beta, Inverna): `rnd app-store <app id>`.

So adding an app ID needs no new secrets. It does need the app ID registered
on the team (with the Push Notifications capability, which
`expo-notifications` asks for) and, for TestFlight or the App Store, its own
app record in App Store Connect. Apple's API can't create app records; that's
done by hand in App Store Connect under Apps → New App.

## Moving a build along

1. Inverna Dev: day-to-day work against Metro.
2. Inverna Beta: `make build-ios-beta`, then `make submit-beta`. Internal testers
   get it as soon as it's processed. Add it to an external group and Apple
   runs a beta review (the first one for each version takes longest).
3. Inverna: when a beta is ready to ship, build the same commit with
   `make build-ios-release`, `make submit-release`, and send it to App Review
   from App Store Connect.
