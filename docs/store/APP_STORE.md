# App Store listing and review (operational checklist)

Canonical positioning, Title, Subtitle, Keywords, full Description, Screenshots, Hero Banner, and Copy Bank live in [`../../DISTRIBUTION.md`](../../DISTRIBUTION.md). This file tracks what is configured in App Store Connect vs. what still needs Farzin's manual action.

## Already configured in App Store Connect (app `6839721977`, version `1.0`)
- Support URL, Marketing URL, and Privacy Policy URL (`inverna.app`, `support@inverna.app`).
- Non-consumable IAP `com.oooflabs.inverna.unlock` (Production) and `com.oooflabs.inverna.beta.unlock` (Beta, app `6839721993`) — Family Sharing **ON**.

## Still to update by hand before 1.0 submission
1. **Update IAP Price to `$6.99` US + 4-tier PPP:** Lower `com.oooflabs.inverna.unlock` from `$9.99` → `$6.99` US and set regional PPP overrides (~75%, ~50%, ~35–40% tiers). Keep Family Sharing ON.
2. **App Privacy:** Select **"Data Not Collected"**. Inverna sends nothing off-device (`src/ui/log.ts` has no sink).
3. **Metadata (copy verbatim from `DISTRIBUTION.md` §4):**
   - **Name:** `Inverna: Sleep Games & Sounds` (29/30)
   - **Subtitle:** `Quiet Puzzles & Brown Noise` (27/30)
   - **Primary Category:** `Health & Fitness` · **Secondary:** `Games → Puzzle`
   - **Keywords (100/100):** `bedtime,wind,down,calm,relax,cozy,night,light,dim,rain,pink,white,ambient,sudoku,2048,offline,scroll`
   - **Promotional Text, Description, and Review Notes:** Copy from `DISTRIBUTION.md` §4.
4. **Attach the In-App Purchase** (`com.oooflabs.inverna.unlock`) to the 1.0 submission with a review screenshot of the unlock sheet captured from an `Inverna Beta` build.
5. **Upload final App Store Screenshots (iPhone 6.9" + iPad 13") & Hero Banner** per `DISTRIBUTION.md` §6.
6. **Review Contact Info:** Confirm Farzin's name, email, and phone in App Review Information.
