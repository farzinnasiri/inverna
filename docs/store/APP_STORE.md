# App Store listing and review (draft for Farzin)

What's already set in App Store Connect (app 6839721977, version 1.0):
support URL, marketing URL and privacy policy URL (inverna.app),
and the in-app purchase `com.oooflabs.inverna.unlock` (non-consumable,
$9.99 US, Family Sharing on). Beta has `com.oooflabs.inverna.beta.unlock`.

Still to do by hand (each needs your say or your details):

1. **App Privacy:** choose "Data Not Collected". Inverna sends nothing: no
   analytics, no crash reporting of its own, no account. (`src/ui/log.ts`
   has no sink.)
2. **Description:** the first two lines say it's a one-time purchase, so the
   paywall is never a surprise (App Review 2.3.1 and the research's top
   risk). Draft below; change the voice where it isn't yours.
3. **Review notes and contact:** the draft below, plus your name, email and
   phone in App Review Information.
4. **Attach the in-app purchase** to the 1.0 submission (it needs a review
   screenshot of the paywall: take one from a Beta build).
5. **Regional prices** (the research suggests about 75%, 50% and 35–40% of
   the US price by region): part of the pricing talk we're having later.

## Description (draft)

> Inverna is a one-time purchase after a short setup. No subscription.
>
> Made for busy minds and night owls. Inverna gives the hour before bed
> something gentler than scrolling: calm games, soft sound and warm light
> that slow down as bedtime gets closer.
>
> QUIET GAMES
> Thirteen slow games with nothing to lose: no timers, no streaks, no
> leaderboards. A koi pond, colour gradients, a quiet sudoku, falling blocks
> that never rush you, and more. As bedtime nears, they get gentler.
>
> SOUND FOR SLEEP
> Rain, waves, fire, wind and soft noise, with held chords underneath, all
> made on your phone. Make your own in the Composer. A sleep timer fades it
> out at the end of your usual sleep time.
>
> WIND DOWN
> Start a wind down and the screen warms and dims, the sound slows, and
> everything fades out at your bedtime. An optional reminder an hour before
> bed asks how your day was and sets up your night.
>
> NOTHING ELSE
> Works offline. No account, no ads, and nothing you do leaves your phone.
>
> Inverna is made to help you relax before bed. It isn't a medical device
> and doesn't diagnose or treat sleep problems.

## Review notes (draft)

> Inverna is an offline wind-down app: 13 quiet games, sound generated on the
> device, and a warm night palette. No account or network is needed.
>
> It's a free download with one non-consumable in-app purchase
> (com.oooflabs.inverna.unlock) after onboarding. To reach it, tap "See how
> it works" and then Skip on the onboarding pages; the purchase screen
> follows. It shows the price from StoreKit, Restore Purchases, the Privacy
> Policy and Terms of Use (Apple's standard EULA). Buying with a sandbox
> account opens the app; Restore Purchases on a second device unlocks it too.
>
> To hear background audio: Sounds tab, tap the orb, then lock the phone.
> The sound keeps playing with Lock Screen controls and fades out with the
> sleep timer. Inverna never records audio and has no microphone permission.
>
> Bedtime reminders are local notifications, off until turned on, and every
> feature works without them. Settings has the reminder switch, the privacy
> policy, help and support, and Erase all data.
>
> Inverna is a relaxation app, not a medical device.
