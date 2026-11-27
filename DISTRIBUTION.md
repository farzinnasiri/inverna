# Inverna — Marketing, Positioning & Distribution

Single source of truth for Inverna's product positioning, App Store Connect metadata, pricing strategy, screenshot/banner playbook, icon architecture, and copywriting bank. Pull this file whenever working on onboarding copy, App Store assets, launch posts, or monetization.

See also: [`VISION.md`](VISION.md) (2027 Editors' Choice roadmap) · [`GLOSSARY.md`](GLOSSARY.md) (exact in-app vocabulary) · [`docs/store/APP_STORE.md`](docs/store/APP_STORE.md) (App Store Connect operational checklist).

---

## 1. Positioning Thesis (*Obviously Awesome* — April Dunford)

> **Discipline:** Treat this as a pre-launch **positioning thesis** — sharp enough to write unmistakable copy, open enough to refine once real v1.0 reviews show who pulls hardest. Don't confuse correlation with causation or extrapolate subscription-app stats to a one-time offline app.

| Step | Inverna's Answer |
| :--- | :--- |
| **1. Competitive alternatives** *(what happens at 11:30 PM without Inverna)* | 1. **Doomscrolling** TikTok / Instagram / X / YouTube until 1 AM *(#1 real competitor)*.<br>2. **Normal mobile games** (Sudoku, Block Blast, NYT Games) — bright, ad-filled, timers/streaks that pull you into *"just one more round."*<br>3. **Passive meditation / sleep stories** (Calm, Headspace, BetterSleep) — `$60–$80/yr` subscriptions that leave a racing mind alone in the dark.<br>4. **Direct sleep-game rivals** (*Loóna* `$40–$70/yr` cartoon fantasy; *Lunare* `$34.99/yr` subscription; *Sleepy Arcade* red retro UI + nightly streaks). |
| **2. Unique attributes** *(shipped today)* | • **13 classic games engineered for low arousal** (zero ads, zero timers, zero streaks; pace slows as bedtime nears).<br>• **Real-time synthesized sound + 7-layer Composer harmonically locked to the games** (12 offline presets; every tap plays in the soundscape's musical key; sound & optional α→θ→δ pulse slow toward bedtime).<br>• **True `#000000` OLED + Adaptive Warm Night Light** (reduces harsh 460–480 nm blue light toward candlelight).<br>• **100% offline, zero accounts, `Data Not Collected`, free taste → `$6.99` one-time unlock.** |
| **3. User-valued outcome** | Occupies restless hands and a wired mind with **something quiet enough to end** — turning your phone from a glowing slot machine into a dimming nightstand instrument, without a yearly subscription. |
| **4. Best-fit segment** | **"Tired-but-wired" evening phone scrollers** (including busy / ADHD-style racing minds) who hate sitting in silence, already suspect quiet puzzles help them unwind, fear the bright "one more round" loop, and are burned out on `$70/yr` subscriptions. |
| **5. Market category** | **Bedtime Wind-Down App** — App Store Primary: **`Health & Fitness`** (same shelf as *Loóna*, *Dark Noise*, *Endel*, *Lunare*, *Sleepy Arcade*); Secondary: **`Games → Puzzle`**. |

**Internal positioning statement:**
> For tired-but-wired people who keep doomscrolling in bed because empty silence makes their mind race, **Inverna** is a **bedtime wind-down app** that pairs low-arousal slowing games, real-time synthesized sleep sounds, and a warm dimming OLED screen — unlike bright ad-filled games or `$70/yr` meditation subscriptions — because it meets restless hands where they are and gently slows everything down until you're ready to put your phone down.

---

## 2. The 7 Core Differentiating Pillars

1. **Built for the wired-at-midnight gap:** Too restless for silent meditation; trying to escape bright doomscrolling and "one more round" mobile games.
2. **Engineered for low arousal (anti-hook):** Zero feeds, zero ads, zero streaks, zero timers — games physically slow down as bedtime approaches.
3. **Three quiet signals working together:** Visuospatial focus (quiet play) + acoustic descent (harmonically key-locked sound) + circadian-friendly `#000000` OLED warmth.
4. **Honest science, zero hype:** Cognitive offloading, 1/f brown/pink/white noise, 0.1 Hz breath pacing, low-blue optics — plainly explained, never claiming to cure or diagnose sleep disorders.
5. **100% synthesized on-device & offline:** Zero audio downloads, zero servers, works in airplane mode.
6. **Respectful monetization & privacy:** Free taste + `$6.99` one-time Full Unlock, no subscription, no account, Apple **`Data Not Collected`**.
7. **Made by a real person with a real story:** Built by Farzin for his own always-on ADHD brain at night — crafted like a watchmaker instrument, not a growth funnel.

---

## 3. v1.0 Monetization & Freemium Boundary

Reconciles earlier drafts in [`docs/research/PRICING.md`](docs/research/PRICING.md) (`$14.99` hard paywall) and [`docs/research/PAYWALL.md`](docs/research/PAYWALL.md) (`$9.99` hard paywall):

- **v1.0 Goal:** Build early users, 4.8★+ ratings, word-of-mouth, and honest feedback — not squeeze `$3` more from the first 20 strangers.
- **Model:** **Freemium ("Free Taste → Full Unlock")** backed by one StoreKit 2 non-consumable IAP (`com.oooflabs.inverna.unlock`, Family Sharing ON).
- **US Launch Price:** **`$6.99` once** (target; update App Store Connect SKU from `$9.99` → `$6.99` + apply 4-tier PPP regional pricing: 100% / ~75% / ~50% / ~35–40%). Revisit upward to `$9.99` sequentially once 50–100+ strong ratings exist.
- **What's Free Forever (`src/core/access.ts`):**
  - **4 Games** across every mood: **Pond** (Koi pond), **Hue** (Colour gradient), **Nine** (Sudoku), **Settle** (Falling blocks).
  - **4 Sounds** across every family + brown noise: **Theta rain**, **Nocturne**, **Lunar tide**, **Deep delta**.
  - **Sound Composer:** Build, play, edit, and save **1 custom sound** (`FREE_CUSTOM_SOUND_LIMIT = 1`).
  - **Core nightly ritual:** **Adaptive night light & colour**, **Wind-down**, **Sleep timer**, **Evening check-in**, and **Bedtime reminders**.
- **What Full Unlock Adds:**
  - All **13 games** (unlocks the other 9 classics: *Weave, Thread, Drift, Dim, Lanterns, Ember, Cascade, Chime, Rally*).
  - All **12 sound presets** (unlocks the other 8 presets).
  - **Unlimited custom sounds** saved in the Composer.
  - **Manual brightness & warmth** sliders in Settings (`Light & colour`).
- **Apple Privacy Label:** **`Data Not Collected`** (zero third-party analytics SDKs; measure conversion sequentially via App Store Connect App Analytics).

---

## 4. App Store Connect Submission Metadata (`en-US`)

Every field required for App Store submission (character limits verified; zero repeated tokens across Title, Subtitle, Keywords, and Primary Category; zero hardcoded prices per Apple §2.3.7; zero clinical claims per §1.4.1):

| Field | Value | Notes / Limit |
| :--- | :--- | :--- |
| **App Name** | `Inverna: Sleep Games & Sounds` | **29 / 30 chars.** Leads with `Sleep Games` (open niche wedge where direct rivals have 1 and 56 ratings; *Loóna* doesn't use it in Title). |
| **Subtitle** | `Quiet Puzzles & Brown Noise` | **27 / 30 chars.** Zero token overlap with Title. Unlocks cross-field combos (`quiet games`, `sleep puzzles`, `brown noise sleep`, `puzzles & sounds`). |
| **Primary Category** | `Health & Fitness` | Same shelf as *Loóna*, *Dark Noise*, *Endel*, *Lunare*, *Sleepy Arcade*. *(Note: Apple Review may occasionally ask hybrid game apps to move to `Games`.)* |
| **Secondary Category** | `Games` → `Puzzle` | Captures calm-puzzle browsers without fighting ad-heavy *Offline Games* (388k ratings) head-on. |
| **Keywords (100 chars)** | `bedtime,wind,down,calm,relax,cozy,night,light,dim,rain,pink,white,ambient,sudoku,2048,offline,scroll` | **100 / 100 chars.** Zero spaces after commas, zero duplicates, zero competitor trademarks, zero medical triggers. Validate real demand in Apple Ads after launch. |
| **Promotional Text** | `Swap late-night scrolling for quiet games, synthesized sleep sounds, and a warm OLED night light. Start free — one-time unlock, zero subscriptions, data not collected.` | **167 / 170 chars.** Updatable anytime without a build; not indexed. |
| **Age Rating** | `4+` | Answer all content-description questions `None`. |
| **App Privacy** | `Data Not Collected` | Zero tracking, zero analytics SDKs, zero accounts (`src/ui/log.ts` has no sink). |
| **Pricing (App)** | `Free` *(with In-App Purchase)* | Single non-consumable `com.oooflabs.inverna.unlock` (`$6.99` US, Family Sharing ON). |
| **Support URL** | `https://inverna.app/support` *(or `https://inverna.app`)* | Set in App Store Connect (`support@inverna.app`). |
| **Marketing URL** | `https://inverna.app` | Set in App Store Connect. |
| **Privacy Policy URL** | `https://inverna.app/privacy` | Must stay identical to `PRIVACY_URL` in `src/ui/links.ts`. |
| **Terms of Use** | Apple Standard EULA (`https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`) | Linked directly on the Paywall sheet. |
| **Copyright** | `© 2026 Farzin Nasiri` *(or `OOOF Labs` — match Apple Developer legal entity)* | — |

### App Store Description (`en-US`, problem-first + Q&A + founder story + honest science)

```text
Doomscrolling in bed again?

Normal mobile games and social feeds are too bright and stimulating for night — they pull you into "just one more round." Passive meditation and sleep stories do the opposite, leaving a racing mind alone in the dark.

Inverna sits quietly in between: 13 low-arousal classic games, real-time synthesized sleep sounds, and an adaptive warm OLED night light engineered to slow down with you until you're ready to put your phone down.

Start free with 4 games, 4 sleep sounds, 1 custom mix in the Composer, and the adaptive night light. Unlock everything with a single one-time purchase — no subscription, no ads, and no account.

WHY I BUILT INVERNA
I made Inverna because my always-on ADHD brain wouldn't switch off at night. Plain silence made my thoughts louder, and scrolling feeds kept me awake past midnight. Quiet puzzles paired with soft sound were the only thing that actually helped me unwind — so I built a calm home for both, without ads, streaks, or a yearly subscription.

SO, IT'S ANOTHER SLEEP APP?
Not quite. Inverna isn't a meditation lecture, a sleep tracker, or a loud arcade. It's an evening wind-down instrument built around three quiet signals:

• Visuospatial focus (Quiet play): Gentle spatial puzzles occupy the same working-memory bandwidth as racing thoughts, with zero timers, zero streaks, and zero failure stress. As bedtime nears, games physically slow down.
• Acoustic descent (Synthesized sound): 12 offline presets plus a 7-layer live Sound Composer (rain, ocean waves, hearth fire, wind, and 1/f brown, pink, and white noise, soft chords, and an optional slowing pulse). Every game tap plays softly in the same musical key as your sound.
• Circadian-friendly light: True #000000 OLED surfaces stay physically off while adaptive warmth dims harsh blue light toward candlelight.

13 QUIET CLASSICS, REBUILT FOR NIGHT
Koi pond (Pond) · Colour gradient (Hue) · Sudoku (Nine) · Falling blocks (Settle) · Nonogram (Weave) · 2048 (Ember) · Connect paths (Thread) · Lights out (Dim) · Sliding tiles (Drift) · Memory pairs (Lanterns) · Tile match (Cascade) · Brick breaker (Chime) · Table rally (Rally).

TRY FREE. OWN IT ONCE.
• Free forever: Pond, Hue, Nine, and Settle; Theta rain, Nocturne, Lunar tide, and Deep delta; 1 saved custom sound in the Composer; Adaptive night light, Wind-down, and Sleep timer.
• Full Unlock (one-time purchase, Family Sharing included): all 13 games, all 12 sound presets, unlimited custom sounds in the Composer, and manual brightness & warmth controls.

100% OFFLINE & PRIVATE
Everything is synthesized right on your iPhone and iPad. Zero tracking, zero cloud, zero data collected.

— Farzin

Inverna is designed to support an evening wind-down and relaxation habit. It is not a medical device and does not diagnose or treat sleep or medical conditions.
```

### App Review Notes (Freemium + StoreKit 2 Sandbox)

```text
Inverna is an offline evening wind-down app: 13 quiet games, real-time on-device sound synthesis, and a warm low-blue night light. No account, login, or network is needed.

MONETIZATION & TESTING (com.oooflabs.inverna.unlock)
Inverna is free to download and use with 4 free games (Pond, Hue, Nine, Settle), 4 free sleep sounds (Theta rain, Nocturne, Lunar tide, Deep delta), 1 saved custom sound in the Composer, Adaptive night light, Wind-down, and Sleep timer.

A single non-consumable in-app purchase (com.oooflabs.inverna.unlock, Family Sharing enabled) unlocks all 13 games, all 12 sound presets, unlimited custom sounds, and manual night light controls.

To test the purchase and restore flow:
1. Complete onboarding (final step shows Free vs. Full Unlock) or tap Start free / Skip to enter Play.
2. Tap any locked game tile (marked with a lock icon, e.g., Weave or Ember), any locked sound preset on Sounds, or Settings → "Unlock all of Inverna".
3. The unlock sheet displays the localized StoreKit 2 price, Family Sharing notice (when enabled), Restore Purchases button, and Privacy Policy link.
4. Complete the purchase with a Sandbox Apple Account to unlock all content immediately; on a second device, open Settings → Unlock all of Inverna → Restore Purchases (or Restore Purchases on onboarding's final step) to verify restore. If ownership has already synced via StoreKit 2, Settings shows the unlocked status directly.

BACKGROUND AUDIO & PERMISSIONS
- Sounds tab → tap the center orb → lock the device: synthesized audio continues in the background with Lock Screen controls and fades out automatically with the sleep timer.
- Inverna never records audio. NSMicrophoneUsageDescription is present solely because react-native-audio-api links AVAudioSession symbols; microphone permission is never requested.
- Bedtime reminders use local notifications only (off by default); all features work without notifications.

Inverna is a relaxation and wind-down app, not a medical device.
```

---

## 5. Marketing Slogans & Copywriting Bank

All lines grounded in real shipped mechanics — zero fake clinical claims, zero hype:

### Brand & Hero One-Liners
- *Doomscrolling in bed again?*
- *Something quieter than scrolling.*
- *Games designed to end, not hook you.*
- *Built to help you put your phone down.*
- *A paper puzzle book under a dim lamp — with rain in the background.*
- *The anti-doomscroll nightstand.*

### Anti-Hook Contrast Lines *(X, Reddit, Product Hunt, Landing Page)*
- *No feeds. No streaks. No ads. No "just one more round."*
- *Every other app on your phone fights to keep you awake. This one slows down until you put it down.*
- *Calm activity for a busy brain — without the bright screen, the timers, or the `$70/yr` subscription.*
- *Not meditation. Not a bright puzzle trap. Just quiet hands, slowing sound, and candlelight.*
- *When empty silence makes your brain louder, give it something gentle to hold.*
- *De-stress a wired mind — without turning your phone into a slot machine.*

### Honest Scientific Vocabulary *(pair technical clarity with plain English)*
- **Low-arousal play** — strips out timers, streaks, and variable-reward dopamine loops.
- **Visuospatial cognitive offloading** — gentle spatial puzzles occupy the same working-memory bandwidth as racing thoughts.
- **Acoustic descent** — sound and optional α → θ → δ pulse slow gently toward bedtime; every tap locks to your soundscape's musical key.
- **1/f brown & pink noise** — masks sudden room sounds without harsh hiss.
- **Circadian-friendly `#000000` OLED** — true black pixels stay physically off while adaptive warmth softens blue light.

### Founder Story Post Hook *(`r/ADHD`, `r/nosurf`, `r/iosgaming`, X)*
> *"My always-on ADHD brain hated lying in silence at midnight, so I'd doomscroll until 2 AM — or play Sudoku/2048 and get trapped in 'just one more round' on a bright screen. So I built Inverna: 13 quiet classic games that actually slow down toward bedtime, harmonically locked to real-time synthesized sleep sounds, on a true black OLED screen that warms to candlelight. Free to try, `$6.99` once if you want everything — no streaks, no ads, no subscription, 100% offline, zero data collected."*

---

## 6. App Store Screenshots, Hero Banner & Reference Pack

### Competitor Visual References (Saved in [`docs/distribution/references/`](docs/distribution/references/))
Inspect these before designing the final screenshot deck:
- **Craft & Atmospheric Depth:** [`comp-portal-1.jpg`](docs/distribution/references/comp-portal-1.jpg) (editorial typography, edge of Slide 2 peeking in to invite swiping) · [`comp-dark-noise-1.jpg`](docs/distribution/references/comp-dark-noise-1.jpg) (crisp 5-word headline, deep purple contrast behind black phone, clean widget showcase).
- **Direct Sleep-Game Comps (what to beat):** [`ref-loona-store.jpg`](docs/distribution/references/ref-loona-store.jpg) & [`comp-loona-1.jpg`](docs/distribution/references/comp-loona-1.jpg) (purple twilight cue + Q&A copy, but fairy-tale/over-animated) · [`comp-lunare-1.jpg`](docs/distribution/references/comp-lunare-1.jpg) (flat/empty dark screen) · [`comp-sleepy-arcade-1.jpg`](docs/distribution/references/comp-sleepy-arcade-1.jpg) & [`ref-sleepy-arcade-desc.jpg`](docs/distribution/references/ref-sleepy-arcade-desc.jpg) (strong problem-first copy, harsh red horror-arcade aesthetic) · [`ref-scroll-to-sleep.jpg`](docs/distribution/references/ref-scroll-to-sleep.jpg) (warm founder note + video previews, bright daytime visuals).
- **Tactile & Scientific Authority:** [`ref-energy-loops.jpg`](docs/distribution/references/ref-energy-loops.jpg) (gorgeous deep violet concentric radial texture behind luminous minimal lines — 8.4K ratings with almost zero text!) · [`ref-chromatic.jpg`](docs/distribution/references/ref-chromatic.jpg) (raw puzzle clarity — 4.7K ratings) · [`ref-endel-science.jpg`](docs/distribution/references/ref-endel-science.jpg) (`Before / With` diptych & crisp scientific framing — borrow the clarity, skip Endel's hyped `7x`/`71%` claims) · [`ref-noise-machine.jpg`](docs/distribution/references/ref-noise-machine.jpg) (deep midnight indigo + warm amber orb cue).

### Visual Language Rules for Inverna's Screenshots
1. **Canvas vs. Phone contrast:** Never drop a `#000000` phone onto a `#000000` canvas (edges melt into Apple's dark-mode App Store). Frame Inverna's true-black OLED device over a **deep twilight indigo-to-obsidian backdrop (`#1A1538 → #080712`)** with a **soft warm brass/candlelight halo (`#C2A15F`)** behind the phone — immediately signals *"sleep / calm"* on both Light and Dark App Store themes while preserving Inverna's Watchmaker Ink & Brass UI inside the phone.
2. **Panoramic continuity across Slides 1–3:** Flow a subtle low-contrast brass wave / ambient glow across the edges of Slides 1–3 (like *Portal*) so the first 3 search-result tiles read as one cohesive, quiet triptych.
3. **One benefit per slide, ≤ 7 words:** Readable at phone search-thumbnail size. Passes the hand test (cover the UI and read only the headlines).
4. **Apple policy compliance (§2.3.3 / §2.3.7):** All slides show **real current Inverna UI** (well above Apple's >50% requirement). **No hardcoded dollar prices** in screenshots, no `TestFlight` in status bars (`9:41`, full battery/signal), no unverifiable `#1` or Apple award badges.

### Recommended 8-Slide Storyboard (iPhone 6.9" + iPad 13")

| Slide | Role | Headline | Short Subline | Real UI Capture |
| :---: | :--- | :--- | :--- | :--- |
| **1** *(Search)* | **Pain → Outcome** | **Doomscrolling in bed again?** | Swap the feed for quiet games & sleep sounds. | **Play** screen in evening Wind-down state (countdown, glowing sound ribbon, calm game tiles). |
| **2** *(Search)* | **Pillar 1: Quiet Play** | **13 calm classics. Built to end.** | No timers, no ads, no streaks — pace slows for bed. | **Pond** (koi looping lotus buds) in Watchmaker Ink & Brass. |
| **3** *(Search)* | **Pillar 2: Sound** | **Shape the sound of your night.** | 12 offline sounds + a live 7-layer Composer. | **Sounds** Orb + **Composer** sheet (Rain, Fire, Brown/Pink noise, Soft chords). |
| **4** | **Before → With** | **Wired mind to candlelight.** | Games slow, sound softens, and blue light dims away. | Split / active **Wind-down** warm amber Night Light + Bedtime nudge (*"Put my phone down"*). |
| **5** | **Honest Science** | **Three quiet signals, working together.** | Visuospatial focus, acoustic descent, circadian OLED. | **How Inverna works** (`ScienceSheet` descent curve + 3 pillars). |
| **6** | **Personalization** | **Tuned to how tonight feels.** | Two-tap check-in picks tonight's games and sound. | **Check-in** sheet (*"How was your day?" / "How do you feel right now?"*) + Tonight's picks. |
| **7** | **Catalog Depth** | **From Sudoku to colour gradients.** | Nine, Hue, Weave, Settle, Ember, Thread & more. | Clean 4-board real UI showcase (**Hue**, **Nine**, **Weave**, **Settle**). |
| **8** | **Trust Closer** | **100% offline. Own it once.** | Start free. No subscription. Data not collected. | Clean Privacy / Free-taste summary + Settings view (no dollar price). |

### Product Page Hero Banner & Animated Video Specs (App Store Creative Assets)
- **Where:** App Store Connect → **Asset Library** (reviewed independently of binary releases!).
- **Static / Universal Master:** **16:9 PNG (`5244 × 2950`, NO alpha/transparency)** links across both Product Page Header and Search Results; or dedicated **21:9 Header (`3840 × 1646`)**.
- **Animated Video Header:** **5–15s seamless muted auto-loop** (H.264/HEVC, 30/60 fps) — ideal creative: Inverna's warm brass crest / koi ripple slowly breathing over deep twilight indigo.
- **App Preview Video (optional, Slot 1):** 15–30s muted raw screen recording of real UI only (§2.3.4 — no hands or mockups). Only add if a silent capture of *Pond* + Composer + dimming Night Light feels hypnotic on mute.

### Screenshot Pipeline Readiness (for Next Session)
- **Tooling installed/documented:** `asc-shots-pipeline` skill uses `asc screenshots frame` (pinned to `koubou==0.20.0`, supports `iphone-17-pro-max`, `iphone-air`, `ipad-pro-13`) and `asc screenshots upload`.
- **Prep steps before generating final shots:**
  1. Capture clean raw screens on **iPhone 17 Pro Max** (6.9" `1320×2868`) and **iPad Pro 13"** (`2064×2752`) with clean status bar (`9:41`, full signal/battery, no `TestFlight`).
  2. Composite over our twilight-indigo + brass-halo panoramic template (Koubou / HTML-to-PNG headless export) and run thumbnail legibility check at 120px width.
  3. Test Slide 1 headline later with Apple **Product Page Optimization (PPO)** (only call a winner at ≥90% confidence).

---

## 7. iOS 26 App Icon Architecture (`assets/images/Inverna.icon`)

How Apple handles your icon across App Store & iPhone Home Screen:
- **App Store & Home Screen (Default mode):** Uses the **Default** appearance in `assets/images/Inverna.icon/icon.json`. Putting a **rich deep twilight indigo/plum backdrop + warm antique brass crest** here immediately replaces the stark white-on-black "banking app" feel with an unmistakable nocturnal watchmaker/sleep emblem.
- **Home Screen (Dark mode):** Uses the `"appearance": "dark"` specialization in `icon.json` — deeper midnight obsidian ground + warm brass crest (never neon, never sterile white).
- **Home Screen (iOS 26 Clear Liquid Glass & Tinted mode):** Uses `"appearance": "tinted"` (`"value": "automatic"` background + monochrome glass layer `"glass": true` on `mark.png`). Apple automatically turns the background translucent glass and tints your crisp vector-clean crest — so a rich twilight-indigo Default icon **never** looks muddy or broken in Liquid Glass / Tinted mode!

---

## 8. Onboarding Pages 1–2 Notes (Next Design Pass)

- **Page 1 (`src/ui/copy.ts` — updated to VoC Pick A):**
  - Tagline: **`Doomscrolling in bed again?`**
  - Subline: **`Swap the feed for quiet games, soft sounds and warm light that slow down toward bedtime.`**
  - Footnote: **`Start free. One-time unlock, no subscription.`**
- **Next visual pass to explore with Farzin:**
  - Shift Page 1's ambient backdrop from bright orange fire (`hearth`) toward deep twilight indigo / starfield-plum so first impression screams *night / calm* instead of campfire.
  - Explore gentle organic brushstroke / Japanese ink-draw animation on `InvernaMark` + splash-to-onboarding handoff.
