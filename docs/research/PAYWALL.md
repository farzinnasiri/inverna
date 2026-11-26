# Inverna Paywall Research & Strategy

> **Scope:** Independent paywall, App Review compliance, conversion pattern, copy, and pricing research for **Inverna** — an offline-first, iOS 26 Liquid Glass wind-down app monetized via a **hard paywall immediately after onboarding** backed by a single **StoreKit non-consumable one-time purchase** (no subscription, no free tier).

---

## 1. Apple App Review Rules & Rejection Risks

A **free download + onboarding + hard paywall + non-consumable one-time purchase** is permitted by Apple, but it sits in one of the most closely scrutinized corners of App Review ([Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)). Because the App Store listing says **"Get"** (free) while 100% of the core app sits behind an immediate payment gate with no free trial, reviewers apply strict checks across billing, metadata honesty, health claims, and quality.

### Relevant Guidelines

| Guideline | What It Governs | How It Applies to Inverna |
| :--- | :--- | :--- |
| **[3.1.1 — In-App Purchase](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)** | All digital unlocks inside the app must use StoreKit; no external checkouts, license keys, or QR unlocks. Restorable purchases must have an explicit restore flow. | Inverna's offline feature set (13 games, procedural audio, composer, dim screen) is a textbook fit for a **non-consumable IAP** because there are no ongoing server or API costs ([Apple Guidelines 3.1.1](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)). Must include a visible **Restore Purchases** button on the paywall itself calling StoreKit 2 `AppStore.sync()` — never rely solely on silent launch checks ([Apple HIG: In-App Purchase](https://developer.apple.com/design/human-interface-guidelines/in-app-purchase)). |
| **[3.1.2 — Subscriptions](https://developer.apple.com/app-store/review/guidelines/#subscriptions)** | Governs auto-renewable subscriptions (3.1.2(a) ongoing value, 3.1.2(c) disclosure of price, duration, billing terms, Privacy Policy & Terms links). | Legally applies to subscriptions, not non-consumables, **but** App Review routinely checks hard paywalls against the same disclosure checklist: localized StoreKit `product.displayPrice`, clear description of what is unlocked, explicit "one-time purchase" wording so users never confuse it with a subscription, and working **Privacy Policy** and **Terms of Use** links ([Apple HIG: In-App Purchase](https://developer.apple.com/design/human-interface-guidelines/in-app-purchase)). |
| **[5.6 — Developer Code of Conduct](https://developer.apple.com/app-store/review/guidelines/#developer-code-of-conduct)** | Covers truthful identity/offerings (5.6.2), anti-manipulation (5.6.3), and **App Quality (5.6.4)** — where high refund rates, complaints, and 1-star reviews are treated as conduct/quality flags. | Also catches deceptive UI or hidden behavior between review and production. A "Get" app that surprises users with a hard paywall after onboarding can trigger 1-star "bait-and-switch" reviews and elevated refunds, risking **5.6.4** scrutiny ([Apple Guidelines 5.6](https://developer.apple.com/app-store/review/guidelines/#developer-code-of-conduct)). |
| **[1.4.1 — Physical Harm / Health Claims](https://developer.apple.com/app-store/review/guidelines/#physical-harm)** | Medical/health apps making clinical or diagnostic claims require peer-reviewed methodology, regulatory clearance, and medical disclaimers. | Sleep apps are heavily scrutinized. Avoid clinical claims ("cures insomnia", "fixes sleep", "boosts melatonin", "proven brainwave entrainment"). Frame Inverna strictly around evening wind-down and relaxation, and include a brief non-medical disclaimer ([Apple Guidelines 1.4.1](https://developer.apple.com/app-store/review/guidelines/#physical-harm)). |
| **[2.1 — App Completeness](https://developer.apple.com/app-store/review/guidelines/#app-completeness) & [4.2 — Minimum Functionality](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)** | Reviewers must be able to test the full app without crashes, broken IAPs, or dead-end screens. | If the IAP fails to load in Sandbox or is not attached to the first binary submission in App Store Connect, the reviewer sees a dead end and rejects under 2.1 or 3.1.1 ([Apple Guidelines 2.1](https://developer.apple.com/app-store/review/guidelines/#app-completeness)). |
| **[2.3.1 / 2.3.2 — Accurate Metadata](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata)** | App Store description, subtitle, and screenshots must accurately reflect paid gates and functionality. | **Critical for Inverna:** Because there is no free tier, the App Store description must state clearly upfront (above the fold) that a one-time purchase is required to unlock the app after setup ([Apple Guidelines 2.3](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata)). |
| **[5.1.1(i) — Privacy](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage)** | Requires an accessible Privacy Policy link both in App Store Connect and inside the app — even when zero data is collected. | Place a working **Privacy Policy** link directly on the paywall footer (and in Settings once unlocked). Even a plain static page stating "Inverna collects no data and works 100% offline" satisfies 5.1.1(i). |
| **[Family Sharing (StoreKit 2)](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/turn-on-family-sharing-for-in-app-purchases/)** | Non-consumables can optionally support Apple Family Sharing. | Turning Family Sharing **on** in App Store Connect is a **one-way permanent switch** (it cannot be turned off later for that product ID). If enabled, Apple requires indicating Family Sharing support in UI via `Product.isFamilyShareable` and respecting `revocationDate` via `Transaction.currentEntitlements` / `Transaction.updates` ([Apple StoreKit Docs](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/turn-on-family-sharing-for-in-app-purchases/)). |

### Required Elements on Inverna's Paywall Screen

- **Localized price pulled dynamically from StoreKit 2** (`product.displayPrice`) — never hardcoded (`$9.99`).
- **Explicit purchase type:** clearly states **"One-time purchase"** (not a subscription, no auto-renewal).
- **Clear summary of what is unlocked:** the 13 quiet games, sleep sounds, sound composer, timed wind-down, and warm night screen.
- **Visible `Restore Purchases` button** directly on the paywall screen, wired to `AppStore.sync()` with clear user feedback (success, "no prior purchase found", or error state).
- **Working links to Privacy Policy and Terms of Use** (Apple's standard EULA link or a hosted custom Terms page) accessible *before* purchase.
- **Brief non-medical note** (e.g., in small print or Privacy/Terms: designed for evening relaxation, not a medical device or sleep disorder treatment).
- **Family Sharing badge** *only if* enabled in App Store Connect (`product.isFamilyShareable`).

### What Commonly Gets Hard-Paywall One-Time Apps Rejected

1. **"Bait-and-switch" metadata (2.3.1 / 2.3.2):** Listing as Free ("Get") with marketing copy that never mentions a mandatory purchase, then locking 100% of the app right after onboarding.
2. **Missing or hidden Restore button (3.1.1):** Relying on automatic `Transaction.currentEntitlements` on launch without a tappable Restore button on the paywall, or hiding Restore inside a menu reviewers cannot reach.
3. **Unattached / unapproved IAP on first submission (2.1 / 3.1.1):** Submitting the app binary without attaching the non-consumable IAP item in App Store Connect, resulting in a blank price or unresponsive CTA for the reviewer.
4. **Missing Sandbox instructions in Review Notes (2.1 / 3.1.1):** Reviewers hitting the paywall without clear instructions on how to reach and test the StoreKit 2 purchase and restore flow.
5. **Overstated sleep/health claims (1.4.1):** Copy claiming to treat insomnia, balance circadian hormones, or clinically improve sleep latency without regulatory backing.
6. **"No free evaluation" pushback (2.1 / 3.1.1 / 4.2):** Individual reviewers occasionally push back when a free-listed app offers zero preview before asking for an irreversible non-consumable purchase. **Mitigation:** state the one-time purchase transparently in the top two lines of the App Store description, let onboarding preview Inverna's actual dim night atmosphere and an ambient sound sample *during* onboarding (before the paywall lands), and include a short Review Note + screen recording showing the StoreKit 2 purchase and restore flow.

---

## 2. High-Converting Paywall Patterns (Data vs. Opinion)

Most published mobile paywall data comes from **trial-backed subscription apps**, not **no-trial one-time purchase apps**. Separating empirical data from design judgment is essential so Inverna does not optimize for the wrong funnel.

### A. Patterns Backed by Empirical Data / A/B Studies

| Pattern / Finding | Evidence & Numbers | Source | Implication for Inverna |
| :--- | :--- | :--- | :--- |
| **Hard paywall vs. freemium conversion (subscriptions)** | Median Day-35 download-to-paid is **10.7%** for hard paywalls vs. **2.1%** for freemium (~5x); Day-60 Revenue Per Install is **$3.09 vs. $0.38** (~8x). | [RevenueCat State of Subscription Apps](https://www.revenuecat.com/state-of-subscription-apps/) | Hard paywalls dramatically outperform passive freemium on early revenue — **but** note the caveat below on no-trial one-time purchases. |
| **No-trial one-time (non-consumable) hard paywall reality** | Without a free trial safety net, hard-gated one-time unlocks convert at roughly **1%–4%** on general traffic and **4%–7%** on high-intent organic traffic, with **50%–70% higher refund rates** than trial/freemium flows. | [Adapty / Airbridge / Indie benchmarks](https://adapty.io/state-of-in-app-subscriptions-report/) | Expect conversion in the **2%–5%** band, not 10.7%. Every element of the paywall must reduce buyer's remorse and clarify exactly what is inside. |
| **Day-0 / onboarding placement dominance** | **93% of first purchases happen on Day 0**; paywalls shown at the end of onboarding convert nearly **4x better** than paywalls triggered later in the app. | [Adapty State of In-App Subscriptions](https://adapty.io/state-of-in-app-subscriptions-report/) | Showing the paywall immediately at the end of onboarding matches peak user intent. |
| **Health & Fitness willingness to pay upfront** | Health & Fitness has the highest median 1-year install LTV (**$1.21 globally**), and **65%–68%** of Health & Fitness subscribers pick **annual upfront** plans over monthly. | [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps/) & [Adapty](https://adapty.io/state-of-in-app-subscriptions-report/) | Sleep and wellbeing users are already comfortable paying a lump sum upfront rather than tiny monthly payments. |
| **Onboarding drop-off ceiling** | Health & Fitness onboarding completion averages **65.1%** (lower than utilities because of lengthy quizzes). | [Adapty Onboarding Benchmarks](https://adapty.io/state-of-in-app-subscriptions-report/) | Keep Inverna's onboarding short and restful (3–5 gentle questions, <45 seconds) so users reach the paywall calm rather than fatigued. |
| **Quiz personalization before paywall** | **46%** of top-grossing flows ask personalization questions before the paywall; **34%** use a tailored "building your plan" transition. | [Adapty Onboarding Benchmarks](https://adapty.io/state-of-in-app-subscriptions-report/) | Reflecting the user's onboarding answers on the paywall creates a sense of ownership (*endowment effect*), provided it feels genuine rather than gimmicky. |
| **Radical transparency lifts conversion & cuts refunds** | Blinkist's transparent paywall redesign (removing billing ambiguity upfront) produced **+23% trial starts, +4% paid conversion, and -55% support/refund complaints**. | [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps/) / [Purchasely Blinkist Study](https://www.purchasely.com) | For a one-time purchase, radical honesty ("Pay once. No subscription. No renewal. Works offline.") plays the exact same anxiety-removing role. |
| **Offer & price beat pure visual polish** | Across Superwall and Adapty A/B tests, **pricing, offer framing, and placement** move revenue far more than cosmetic tweaks; CTA micro-copy tests yield **5%–15% lift**, while authentic social proof lifts conversion **10%–30%**. | [Superwall](https://superwall.com) & [Adapty](https://adapty.io/state-of-in-app-subscriptions-report/) | Invest effort in price clarity, honest framing, and specific CTA copy before over-animating the screen. |
| **Growing consumer appetite for one-time / lifetime** | Roughly **35% of subscription apps** now offer a lifetime or one-time purchase option alongside subscriptions to capture subscription-fatigued buyers. | [RevenueCat State of Subscription Apps](https://www.revenuecat.com/state-of-subscription-apps/) | "Pay once, own it" is now a distinct, recognized differentiator — especially in sleep apps where Calm and Headspace charge ~$69.99/year. |

### B. Craft & Design Opinion (Not A/B-Proven for Non-Consumable Sleep Apps)

These recommendations are grounded in UX craft, consumer psychology, and Inverna's specific night-time context rather than published A/B experiments:

1. **Above-the-fold single-screen discipline (for 11:00 PM bed scrolling):**
   - Most users will open Inverna in a dark room. A bright white sheet, loud badges, or long scrolling marketing page breaks the exact calm Inverna promises.
   - Everything essential should fit on a standard iPhone screen without scrolling: quiet header/icon or subtle ambient visual, headline + 1–2 line body, 3–4 scannable benefit lines (or a compact personalized evening summary), price + trust line, warm brass (`#C2A15F`) primary CTA button, and understated footer (`Restore Purchases · Privacy · Terms`).
   - Use iOS 26 Liquid Glass tinting gently over near-black (`#0A0A0C` / `#0E0E11`) surfaces so the paywall *feels* like the product itself.
2. **Honest onboarding personalization (no fake "AI Sleep Score"):**
   - Many wellness apps run a 3-second fake progress bar claiming to compute a personalized clinical plan. That clashes sharply with Inverna's honest, minimalist voice.
   - Instead, mirror back **real app settings** configured from their onboarding answers: e.g., *"Set up for your evenings: 30-minute wind-down · Rain & warm chords · Quiet puzzles · Warm dim screen."* It proves the app actually listened and is ready to use the moment they tap unlock.
3. **Social proof without fake numbers (cold-start launch strategy):**
   - Never fabricate user counts ("Join 50,000+ sleepers") or invent star ratings at v1.0.
   - At launch, replace vanity numbers with **verifiable product proof**: concrete scope (*"13 quiet games, procedural soundscapes, and a custom sound composer"*), privacy proof (*"100% offline. No account. Nothing leaves your phone."*), and optionally a 1-line maker note.
   - Once real App Store reviews accumulate (e.g., 25+ ratings at 4.7+), add a single restrained line with real, verbatim reviewer wording.
4. **Trust lines that do real work:**
   - For a no-trial hard paywall, the buyer's two biggest fears are: *"Will this silently bill me every month?"* and *"Will it nag me with accounts, ads, and upsells after I pay?"*
   - A single calm trust line directly under or above the CTA neutralizes both: **"Pay once, own it. No subscription, no ads, no account."**
5. **CTA wording:**
   - Avoid vague CTAs (`Continue`, `Get Started`) which feel sneaky on a paid gate, and avoid salesy CTAs (`Claim My Offer`, `Sleep Better Tonight!`).
   - Put the exact action and localized price right on the button: **`Unlock Inverna — $9.99`** or **`Buy Once — $9.99`**. Putting the price on the button eliminates surprise when the Apple Pay / StoreKit sheet slides up and lowers refund regret.
6. **Price framing & anchoring (without fake discounts or decoys):**
   - Inverna has only one purchase option, so there is no annual-vs-monthly decoy matrix.
   - Instead, anchor gently against the **category norm** (sleep subscriptions typically cost $5–$12/month or $40–$70/year) in a single plain sentence — e.g., *"One payment, less than two months of most sleep apps — yours to keep."* Never use fake crossed-out prices (`~~$39.99~~ $9.99`) or countdown timers; those destroy trust in a calm, premium app.

---

## 3. Inspiration: 8 Real Paywalls & Monetization Benchmarks

The apps below span sleep, ambient sound, meditation, holistic wellbeing, and calm indie games/utilities. Each offers specific lessons on what to borrow and what to leave behind for Inverna.

| App | Category & Model | What Its Paywall / Pricing Does Well | What Fits Inverna | What Does **Not** Fit Inverna |
| :--- | :--- | :--- | :--- | :--- |
| **[Dark Noise](https://darknoise.app)** | Ambient sleep sounds. Freemium + Pro sub or **$49.99 Lifetime** ([MacRumors](https://www.macrumors.com), [Dark Noise](https://darknoise.app)). | Dark-mode-first native iOS polish, subtle motion, concise feature list, clean native StoreKit/RevenueCat footer layout ([RevenueCat](https://www.revenuecat.com)). Feels crafted by an indie developer who respects iOS design. | Dark aesthetic, native iOS restraint, crisp list of included sounds/tools, zero hype. | Multi-tier subscription matrix (Inverna's single one-time option is simpler and cleaner). |
| **[Portal](https://portal.app)** | Nature sleep/focus escapes. Sub + **$99.00 Lifetime** ([Portal](https://portal.app)). | **Experiential paywall:** shows rich atmospheric visuals and sound ambiance right on the paywall screen so the user *feels* the calm before paying ([Portal](https://portal.app)). | Letting a gentle ambient sound (e.g., quiet rain or warm chord) and Inverna's warm dim night UI run softly *behind* the paywall glass. | High-ticket $99 lifetime anchor built to push users toward recurring subscriptions. |
| **[Endel](https://endel.io)** | Generative sleep & focus soundscapes. Sub + **~$124.99 Lifetime** ([Endel](https://endel.io)). | Ultra-minimal dark typography, reactive abstract visual backdrop, utility-first positioning rather than guru/wellness clichés ([Endel](https://endel.io)). | Minimalist dark typography, procedural/generative craft framing, subtle reactive visual on near-black background. | Biometric/neuroscience "patented circadian science" claims (too close to Guideline 1.4.1 and clashes with Inverna's plain honesty) and aggressive dynamic promo pricing. |
| **[Loóna](https://loona.app)** | Interactive bedtime wind-down "sleepscapes". Subscription ([Loóna](https://loona.app)). | Strong emotional framing around the **transition from evening scrolling/stress to bed** rather than generic "meditation" ([Loóna](https://loona.app)). | Framing the product around the *last hour before sleep* and calming tactile interaction rather than "sleep optimization." | Cliffhanger paywall triggered mid-story when the user is most vulnerable at bedtime; fairy-tale illustration style. |
| **[Waking Up](https://www.wakingup.com)** | Secular mindfulness. Subscription + no-questions-asked scholarship ([Waking Up](https://www.wakingup.com)). | Text-forward, deeply honest, anti-dark-pattern tone. Disarms consumer cynicism by speaking to the user like an intelligent adult ([Waking Up](https://www.wakingup.com)). | Respectful, adult, plain-English copy; zero urgency tricks; explicit anti-manipulation stance. | Long philosophical prose (Inverna's paywall should be much tighter and easier to scan at night). |
| **[Calm](https://www.calm.com)** | Sleep stories & meditation. **$69.99/yr** sub + **$399.99 Lifetime** ([Calm](https://www.calm.com)). | Low-glare night gradients safe for dark rooms; strong onboarding-to-paywall continuity that ties answers directly to the unlock screen ([Superwall](https://superwall.com)). | Eye-safe low-contrast dark palette and tying onboarding answers cleanly into the paywall header/summary. | Aggressive annual-vs-monthly decoy anchoring, persistent upsells, celebrity narration positioning, and $69.99/yr recurring lock-in. |
| **[Gentler Streak](https://gentler.app)** | Holistic wellbeing & activity tracker. Sub + **~$69.99–$85** promo Lifetime ([Gentler Streak](https://gentler.app)). | Warm, guilt-free anti-hustle voice ("rest days belong here") that rejects punitive gamification ([Gentler Streak](https://gentler.app)). | **Tone soul-mate:** explicitly rejecting streaks, pressure, and noisy gamification as a core product value on the paywall. | Dense feature-comparison tables and health-metric charts (Inverna has no tracking or telemetry). |
| **[AutoSleep](https://tantsissa.com/autosleep)** & **[Things 3](https://culturedcode.com/things/)** | Pure one-time iOS classics: AutoSleep **$9.99** (sleep), Things 3 **$9.99** iPhone (tasks) ([AutoSleep](https://tantsissa.com/autosleep), [Things 3](https://culturedcode.com/things/)). | Prove iOS users happily pay **$9.99 once** for well-crafted, private, zero-subscription utilities without needing a recurring ecosystem. | The exact mental shelf Inverna wants to occupy: *"I paid $10 once for a quiet, beautifully built iPhone app and it never bothered me again."* | Paid-upfront App Store wall (no onboarding before purchase), whereas Inverna uses free download + onboarding + hard non-consumable IAP. |

*(Bonus calm-game reference: **[Knotwords](https://apps.apple.com)** charges **$11.99** for its one-time Pro unlock, **[Good Sudoku](https://apps.apple.com)** charges **$4.99** for its full unlock, and **[Monument Valley 3](https://www.ustwogames.co.uk)** uses a single in-app purchase to unlock the full game — showing strong iOS familiarity with single-unlock calm puzzle games.)*

---

## 4. Three Complete Paywall Copy Drafts for Inverna

All three drafts follow strict constraints: **warm, plain, honest voice; zero exclamation marks; no hype; no medical or sleep-cure claims ("helps", never "fixes" or "cures"); no melatonin or brainwave claims.** Prices shown use `$9.99` as a placeholder (dynamically replaced by StoreKit's `product.displayPrice` in production).

---

### Version A — "Quiet Honest Product" (Craft & Anti-Subscription)

> **Headline:** A quieter last hour before sleep.
>
> **Body:** Inverna is a calm place to put your phone down to, instead of scrolling into the night. Buy it once and keep it on your phone, offline and uninterrupted.
>
> **What's inside:**
> - **13 quiet classic games** — gentle puzzles, matching, and calm arcade play with no timers, streaks, or scores to chase.
> - **Sleep sounds and a sound composer** — rain, fire, waves, soft noise, and slow chords you can shape and save.
> - **Timed wind-down and warm night screen** — dims smoothly as you settle in, then stops on its own.
> - **Private and offline** — no account, no ads, and nothing ever leaves your phone.
>
> **Trust line:** One-time purchase. No subscription, no renewal, ever.
>
> **CTA Button:** `Unlock Inverna — $9.99`
>
> **Small print / footer:**
> `Restore Purchases` · `Privacy Policy` · `Terms of Use`
> *One-time payment charged to your Apple Account. Designed to help you wind down at night; not a medical device or sleep treatment.*

**What Version A is betting on:**
Subscription fatigue and adult discernment. It bets that Inverna's target user — someone already tired of noisy apps, streaks, feeds, and $70/year wellness subscriptions — converts best when the paywall reads like a quiet, well-made book jacket rather than a growth funnel. Best fit for word-of-mouth, editorial/App Store feature traffic, and craft-conscious iOS buyers.

---

### Version B — "Your Evening, Ready" (Honest Onboarding Personalization)

> **Headline:** Your evening is set up.
>
> **Body:** Based on what you shared, Inverna is ready for tonight. Unlock the full app once to start winding down at your own pace.
>
> **Ready for tonight** *(populated dynamically from onboarding answers)*:
> - **Wind-down:** 30-minute timer with a warm, dim screen
> - **Sounds:** Rain and soft chords, plus the composer to save your own mixes
> - **Quiet play:** 13 slow, no-pressure games to replace late-night scrolling
> - **Nothing in the way:** Works completely offline, with no account, no ads, and no streaks
>
> **Trust line:** Pay once, own it. No subscription or recurring charges.
>
> **CTA Button:** `Unlock Inverna — $9.99`
>
> **Small print / footer:**
> `Restore Purchases` · `Privacy Policy` · `Terms of Use`
> *One-time non-consumable purchase via your Apple Account. Built to help you relax before bed, not to diagnose or treat sleep conditions.*

**What Version B is betting on:**
The **endowment effect** from onboarding, executed without gimmicks. Because the user just answered 3–4 short questions about their evenings, showing those exact preferences already configured makes the app feel *theirs* before they pay — while staying 100% truthful (it reflects actual app defaults, not a fabricated "sleep score"). Best fit for cold App Store search traffic and general users who need to connect their own bedtime habit to what Inverna actually does.

---

### Version C — "Own It Once" (Gentle Category Anchor & Habit Reframe)

> **Headline:** Trade the late-night scroll for something calmer.
>
> **Body:** Most sleep apps ask for a subscription every year. Inverna is yours with a single payment — built to help your mind slow down before bed, completely offline.
>
> **Everything included:**
> - **13 calm, classic-style games** designed for quiet hands and a slower pace.
> - **Procedural sleep sounds and mixer** with rain, fire, waves, noise colors, soft chords, and a slow rhythmic pulse.
> - **Gentle wind-down timer** paired with a warm, dim night screen.
> - **Yours to keep** — no accounts, no ads, no leaderboards, and nothing leaves your phone.
>
> **Anchor & trust line:** One payment of $9.99 — less than two months of most sleep apps. No subscription, ever.
>
> **CTA Button:** `Pay Once — $9.99`
>
> **Small print / footer:**
> `Restore Purchases` · `Privacy Policy` · `Terms of Use`
> *One-time purchase billed through your Apple Account. Intended for evening relaxation and general wellbeing, not medical care.*

**What Version C is betting on:**
**Price anchoring and contrast.** Many people hesitate to pay $9.99–$14.99 upfront for an iPhone app because mobile games conditioned them to expect "$0 or $3.99." Gently reminding them that sleep apps normally charge recurring monthly/annual bills resets the mental reference point from "cheap mobile game" to "sleep app I never have to pay for again." Best fit if Inverna is priced at **$9.99 or above** ($12.99–$14.99) where price objection is the main conversion blocker.

---

## 5. Independent Pricing Research & Options

### A. Real US App Store Comparables

| Segment | App | Model | US Price (One-Time / Reference) | Source |
| :--- | :--- | :--- | :--- | :--- |
| **Pure One-Time Sleep & Wellbeing** | **AutoSleep** | Upfront paid, no sub | **$9.99** (raised from $5.99) | [AutoSleep](https://tantsissa.com/autosleep) |
| | **Streaks** | Upfront paid, no sub | **$5.99** | [Streaks](https://streaks.app) |
| | **Forest** | Upfront paid (+ optional Plus) | **$3.99** | [App Store / Forest](https://apps.apple.com) |
| | **White Noise Pro** (TMSOFT) | Upfront paid, no sub | **$2.99** | [TMSOFT](https://www.tmsoft.com) |
| | **Things 3** (iPhone benchmark) | Upfront paid, no sub | **$9.99** (iPhone) | [Cultured Code](https://culturedcode.com/things/) |
| **Sleep / Sound Apps (Lifetime IAPs)** | **Dark Noise** | Freemium + sub / Lifetime | **$49.99** lifetime | [Dark Noise](https://darknoise.app) |
| | **Portal** | Freemium + sub / Lifetime | **$99.00** lifetime | [Portal](https://portal.app) |
| | **BetterSleep** | Freemium + sub / Lifetime | **$39.99–$69.99/yr** (up to **$99.99** lifetime) | [Sensor Tower / App Store](https://sensortower.com) |
| | **Endel** | Freemium + sub / Lifetime | **~$124.99** lifetime | [Endel](https://endel.io) |
| | **Calm** | Sub / Lifetime | **$69.99/yr** · **$399.99** lifetime | [Calm](https://www.calm.com) |
| **Wellbeing Utilities (Lifetime IAPs)** | **Gentler Streak** | Freemium + sub / promo Lifetime | **~$69.99–$85.00** promo lifetime | [Gentler Streak](https://gentler.app) |
| | **Structured** | Freemium + sub / Lifetime | **$99.99** lifetime | [Structured](https://structured.app) |
| **Calm / Meditative iOS Games** | **Monument Valley 1 & 2** | Upfront paid | **$3.99** each | [ustwo games](https://www.ustwogames.co.uk) |
| | **Alto's Odyssey** | Upfront paid | **$4.99** | [App Store](https://apps.apple.com) |
| | **Mini Metro** | Upfront paid | **$3.99** | [App Store](https://apps.apple.com) |
| | **Gris** | Upfront paid | **$4.99** | [App Store](https://apps.apple.com) |
| | **Prune** | Upfront paid | **$3.99–$4.99** | [App Store](https://apps.apple.com) |
| | **Good Sudoku** | Free + one-time full unlock | **$4.99** unlock | [App Store](https://apps.apple.com) |
| | **Knotwords** | Free + sub or one-time unlock | **$11.99** one-time unlock | [App Store](https://apps.apple.com) |

**What the market map shows:**
- **Single calm games** cluster tightly at **$3.99–$4.99** (and up to **$11.99** for deep daily puzzle suites like Knotwords).
- **Pure one-time craft utilities/sleep apps** cluster at **$5.99–$9.99** (Streaks, AutoSleep, Things 3).
- **Lifetime unlocks inside subscription apps** jump dramatically to **$49.99–$399.99** — **not** because cold users pay $99 blind, but because those apps offer a free tier or 7-day trial first *and* use the high lifetime price to anchor their annual subscription ([RevenueCat](https://www.revenuecat.com/state-of-subscription-apps/)).
- **Crucial insight for Inverna:** Because Inverna has **no free tier and no free trial**, pricing it like a subscription app's lifetime tier ($29.99–$49.99) would crush conversion on cold traffic and spike refunds. Yet pricing it at $3.99–$4.99 undervalues a bundle containing **13 games + a procedural sound engine + a custom sound composer + timed night mode**. Inverna's natural territory is the **$6.99–$14.99** zone.

### B. Regional Pricing (Purchasing Power Parity)

Apple offers **900 price points across 44 currencies and ~175 storefronts** ([Apple App Store Connect Pricing Docs](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/set-a-price-for-an-in-app-purchase/)). Left on automatic FX equalization, a US $9.99 price translates directly via exchange rates plus local VAT/GST, making it feel like a $30–$50 purchase in emerging markets and tanking conversion. Localized PPP pricing routinely yields **12%–40%+ revenue lift** in price-sensitive regions ([Apple / Indie PPP Benchmarks](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/set-a-price-for-an-in-app-purchase/)).

*Operational note:* Once you manually override a country's price in App Store Connect, Apple stops automatically updating that storefront for FX changes, so review overrides every 6–12 months.

| PPP Tier | % of US Base | Example Regions | Example at $9.99 US Base |
| :--- | :--- | :--- | :--- |
| **Tier 1 (Full)** | 100% | US, UK, Canada, Western/Northern Europe, Australia, NZ, Switzerland, Singapore, Japan, South Korea, Gulf States | **$9.99** (equiv. £9.99 / €9.99–€10.99) |
| **Tier 2 (Moderate)** | ~75% | Poland, Czechia, Romania, Portugal, Greece, China, Malaysia, Chile, Taiwan | **~$7.49** local equivalent |
| **Tier 3 (Emerging)** | ~50% | Brazil, Mexico, India, Türkiye, Indonesia, Philippines, Vietnam, Colombia, South Africa | **~$4.99** local equivalent |
| **Tier 4 (Low-Income)** | ~35–40% | Pakistan, Egypt, Nigeria, Bangladesh, parts of LATAM / Central Asia | **~$3.49–$3.99** local equivalent |

### C. Three Independent Price Options for Inverna

*Illustrative model below uses realistic non-consumable hard-paywall conversion assumptions (**1%–5%** range, falling as price rises) and Apple's Small Business Program **15% commission** (85% net proceeds; at 30% standard commission, multiply net by 0.824). These are analytical estimates, not empirical Inverna data.*

| Option | US Price | Positioning & Anchoring | Illustrative Conversion (per 1,000 paywall views) | Gross / Net (85%) per 1,000 Views | Pros & Cons |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Option 1: Accessible Craft** | **$6.99** | Just above a single indie game ($4.99) and Streaks ($5.99). Easy impulse buy at 11 PM with minimal buyer's remorse. | ~4.0%–5.0% (45 buyers) | **$315 gross** / **~$267 net** | **Pro:** Highest conversion, lowest refund rate, strongest word-of-mouth volume. **Con:** Leaves money on the table from high-intent sleep buyers; harder to justify paid acquisition later. |
| **Option 2: Sweet Spot** | **$9.99** | Matches **AutoSleep ($9.99)** and **Things 3 iPhone ($9.99)**. Stays under the psychological **$10 ceiling** while anchoring effortlessly as "less than two months of most sleep apps." | ~3.0%–4.0% (35 buyers) | **$350 gross** / **~$297 net** | **Pro:** Best balance of revenue per install and conversion; signals serious craft without triggering "too expensive to buy sight unseen" hesitation. **Con:** Slightly more friction on casual App Store browsers than $6.99. |
| **Option 3: Premium Craft** | **$14.99** *(or $9.99 launch → $14.99 regular)* | Above Knotwords ($11.99), positioned squarely as a full sleep + calm-game suite replacing a $60+/yr subscription. | ~1.8%–2.5% (21 buyers) | **$315 gross** / **~$268 net** | **Pro:** High revenue per buyer and strong anchor once Inverna has 4.8-star reviews and press proof. **Con:** On a **no-trial hard paywall at launch (0 reviews)**, crossing $10 significantly raises hesitation and refund risk. |

**Launch price vs. normal price:**
- Avoid fake perpetual discounts or countdown timers — they violate Inverna's calm, honest tone and can trigger Guideline 2.3/5.6 scrutiny.
- A **real, calm launch strategy** works well if you want price flexibility: launch cleanly at **$9.99** (no "sale" badge needed) while building App Store ratings, reviews, and organic proof. If conversion holds above 4% and refund rates stay low after 60–90 days, test moving to **$12.99 or $14.99** for new buyers. Alternatively, if you want an explicit launch gesture, frame it plainly in App Store release notes or launch posts as an **"Introductory v1.0 price ($7.99 before moving to $9.99)"** — never with a ticking clock on the paywall.

---

## 6. Recommendation & Key Risks

### Picked Paywall: **Version B ("Your Evening, Ready")** + Version C's Gentle Anchor Line

Pick **Version B** as the launch paywall, borrowing one quiet anchor sentence from Version C in the trust line:
- **Why Version B wins:** Inverna already runs a short onboarding flow asking about the user's evenings and sleep. If the paywall ignores those answers (Version A), onboarding feels disconnected from the purchase gate. Version B turns onboarding into immediate, honest utility (*"Your evening is set up"*) without resorting to fake clinical scoring.
- **One refinement to add from Version C:** Pair Version B's trust line with a subtle anchor: **"One payment of $9.99 — less than two months of most sleep apps. No subscription, ever."**
- **Sensory touch (borrowed from Portal & Endel):** Let Inverna's warm dim background and a gentle, muted-by-default-or-softly-audible sample soundscape (e.g., quiet rain behind Liquid Glass) set the mood *during* onboarding and stay alive behind the paywall so the user experiences Inverna's calm craftsmanship before paying.

### Picked Price: **$9.99 US** (with 4-Tier PPP Regional Pricing)

- **$9.99** sits cleanly below the $10 psychological threshold, matches the gold-standard one-time iOS sleep/craft benchmarks (**AutoSleep $9.99**, **Things 3 $9.99**), feels deeply fair for 13 quiet games + procedural audio + composer, and avoids the steep conversion drop and refund spike of charging $14.99–$19.99 sight unseen on a no-trial hard paywall.
- Pair **$9.99** in Tier 1 markets with the 4-tier PPP ladder (~75% / ~50% / ~35–40%) from day one so non-US traffic is not priced out.

### Key Risks & Mitigations

| Risk | Severity | Why It Happens | Practical Mitigation |
| :--- | :--- | :--- | :--- |
| **1. App Review rejection on "Free" + Hard Non-Consumable Paywall** | **High** | Reviewers sometimes flag free-listed apps that block 100% of functionality with no free tier or trial (Guidelines 2.1, 2.3.1, 3.1.1). | State clearly in the first two lines of the App Store description: *"Inverna requires a single one-time purchase to unlock after setup. No subscription."* Attach the IAP to the submission, include explicit Sandbox testing steps + a short video in Review Notes, and put a prominent `Restore Purchases`, `Privacy Policy`, and `Terms of Use` footer on the paywall. |
| **2. 1-Star "Thought It Was Free" Reviews & Refund Spikes (Guideline 5.6.4)** | **High** | Users tapping "Get" on the App Store expect free access; no-trial hard paywalls see 50%–70% higher refunds and angry reviews if the paywall feels like a surprise. | Lead with radical transparency in the App Store subtitle/description and on the very first onboarding screen (e.g., a subtle line: *"One-time purchase after setup — no subscription"*). Putting the exact price on the CTA button (`Unlock Inverna — $9.99`) prevents accidental Apple Pay taps. |
| **3. Low Cold-Traffic Conversion Without a Trial or Preview** | **Medium–High** | Asking for $9.99 before the user has played a single game or heard a soundscape creates natural hesitation, especially at launch with 0 reviews. | Make onboarding itself an **experiential preview**: let users hear 2–3 real soundscapes and feel the warm dim screen *inside* onboarding so they have felt Inverna's quality before hitting the paywall. Show clean visual previews (or animated subtle cards) of the 13 games and composer in App Store screenshots and onboarding. |
| **4. Health / Medical Claim Flag (Guideline 1.4.1)** | **Low–Medium** | Sleep category apps attract extra automated and human review for clinical claims. | Keep every word on the App Store listing, onboarding, and paywall strictly in relaxation/wind-down language ("helps you wind down"), never diagnostic/curative language, and keep the plain non-medical note in the paywall footer. |
| **5. One-Time Revenue Ceiling vs. Paid Acquisition** | **Medium** | With no recurring revenue, LTV is capped at ~$8.49 net per US buyer (at 15% Apple commission) and ~$0.25–$0.35 net RPI at 3%–4% conversion — usually too low for profitable paid social ads. | Plan growth around organic channels suited to one-time craft apps: App Store editorial pitching (iOS 26 Liquid Glass + Apple Design craft angle), ASO, Reddit/indie communities, press/newsletters, and word-of-mouth. |
| **6. Family Sharing Irreversibility** | **Low** | Enabling Family Sharing on the non-consumable IAP cannot be undone later for that product ID. | Decide intentionally before v1.0 launch: enabling it is generous and aligns well with Inverna's honest, anti-subscription ethos (couples often share a bedroom and a Family Sharing group), and makes a quiet trust bonus (`Supports Family Sharing`) — just verify `Product.isFamilyShareable` UI handling in StoreKit 2 first. |

---

## Sources

1. Apple Developer — [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (Sections 1.4.1, 2.1, 2.3.1, 2.3.2, 3.1.1, 3.1.2, 4.2, 5.1.1, 5.6)
2. Apple Developer — [Human Interface Guidelines: In-App Purchase](https://developer.apple.com/design/human-interface-guidelines/in-app-purchase)
3. Apple Developer — [App Store Connect Help: Set a price for an In-App Purchase](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/set-a-price-for-an-in-app-purchase/)
4. Apple Developer — [App Store Connect Help: Turn on Family Sharing for In-App Purchases](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/turn-on-family-sharing-for-in-app-purchases/)
5. RevenueCat — [State of Subscription Apps Report Hub (2025/2026)](https://www.revenuecat.com/state-of-subscription-apps/)
6. Adapty — [State of In-App Subscriptions Report](https://adapty.io/state-of-in-app-subscriptions-report/)
7. Superwall — [Paywall Patterns, Onboarding & A/B Testing Blog](https://superwall.com)
8. Purchasely — [Mobile Paywall & Blinkist Transparency Case Study Resources](https://www.purchasely.com)
9. Dark Noise — [Official Site & Pro Pricing](https://darknoise.app)
10. Portal — [Official Site & Membership](https://portal.app)
11. Endel — [Official Site](https://endel.io)
12. Loóna — [Official Site](https://loona.app)
13. Waking Up — [Official Site](https://www.wakingup.com)
14. Calm — [Official Site](https://www.calm.com)
15. Gentler Streak — [Official Site](https://gentler.app)
16. Tantsissa — [AutoSleep Official Site](https://tantsissa.com/autosleep)
17. Crunchy Bagel — [Streaks Official Site](https://streaks.app)
18. Cultured Code — [Things 3 Official Site](https://culturedcode.com/things/)
19. ustwo games — [Monument Valley Official Site](https://www.ustwogames.co.uk)
20. Sensor Tower — [App Store Pricing & Category Intelligence](https://sensortower.com)
