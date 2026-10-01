# Closet

A free, open wardrobe app in the spirit of Fitted, with every paid feature included and no subscriptions or credits:

- **Digital closet.** Photograph clothes and the background is removed on your device. The AI then tags colour, fabric, fit, formality, warmth and layering.
- **Laundry tracking.** Items can be clean, dirty or in the wash. Logging a wear counts toward each item's "wears before wash" limit, and the item moves to the dirty pile when it hits it. Outfits are only ever built from clean clothes.
- **Style-theory outfits, not random ones.** Each outfit is scored on:
  - colour harmony: neutrals, analogous, complementary and triadic colours, 60/30/10 proportions, light/dark contrast
  - formality
  - pattern mixing
  - proportion
  - texture
  - weather
  - your style profile
  - rotation (how recently you wore each piece)

  Every outfit card lists the reasons behind its score.
- **Layering.** The engine knows which pieces work as base, mid or outer layers, and which necklines can sit under which. A collared shirt under a crewneck knit is rewarded and the board shows the collar peeking out. A shirt under a hoodie is rejected. Thin layers have to go under thick ones.
- **Weather on or off.** You can dress for the forecast, or for a day that's mostly inside with a short trip out. You can also ignore the weather completely (indoors at about 21 °C); on a cold day you then get a separate "commute layer" suggestion.
- **AI stylist chat** (Groq). It knows your clothes, the weather and what's in the wash. It only recommends outfits the style engine has already checked.
- **Other features:**
  - manual outfit builder (drag, resize and layer pieces, with a live rating)
  - saved outfits and collections
  - calendar for planning outfits and logging what you wore
  - trip planner with the destination forecast, an outfit per day and a packing list
  - recreating a look from an inspiration photo
  - stats: closet value, cost per wear, unworn items
  - "what to buy next" gap analysis
  - public profiles, follows, likes and a feed
  - marketplace with messages
  - report and block
  - data export and account deletion
- Installable on your phone's home screen (PWA), and you stay signed in.

There's no build step. It's plain JavaScript modules, so GitHub Pages serves the folder as it is.

## Try it right now (demo mode)

With `js/config.js` left empty, the app runs in **demo mode**: everything is stored in your browser and there are no accounts. Open the app and tap **Try with a sample closet**. To use the AI in demo mode, paste a free Groq key in Settings.

To run it locally:

```bash
cd ~/Downloads/closet && python3 -m http.server 8000
```

Then open http://localhost:8000.

## Setup with accounts (free, about 15 minutes)

### 1. Supabase (sign-in, database, photo storage)
1. Create a free project at https://supabase.com.
2. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. Open **Project Settings → API Keys** and copy the **Project URL** and either the **anon** key (Legacy API keys tab) or the **publishable** key (`sb_publishable_…`) into [`js/config.js`](js/config.js). Both are meant to be public; the security rules in the schema protect the data. **Never** use the secret or `service_role` key there.

### 2. Groq (free AI)
1. Create an API key at https://console.groq.com/keys.
2. In Supabase open **Edge Functions → Deploy a new function → Via editor**. Name it `api`, paste [`supabase/functions/api/index.ts`](supabase/functions/api/index.ts) and deploy.
3. In the left sidebar open **Edge Functions → Secrets** tab (not Project Settings → API Keys, which makes Supabase's own keys). Under **Add new secret**, set the name to `GROQ_API_KEY` and the value to the `gsk_…` key from Groq, then click **Save**.

   The key lives only on the server; the browser never sees it. Each user can make 200 AI calls per day, which you can change with an `AI_DAILY_LIMIT` secret. Models can be overridden with the `GROQ_VISION_MODEL`, `GROQ_TEXT_MODEL` and `GROQ_FAST_MODEL` secrets. Check https://console.groq.com/docs/models if Groq retires one.

### 3. GitHub Pages
1. Create a repo and push this folder to it.
2. Open **Settings → Pages**, choose **Deploy from a branch**, then `main` and `/ (root)`.
3. Your app is at `https://<you>.github.io/<repo>/`.
4. Back in Supabase, open **Authentication → URL Configuration**. Set **Site URL** to that address and add it under **Redirect URLs** too. Email links and Google sign-in need this.

### 4. Google sign-in (optional)
In Supabase open **Authentication → Providers → Google** and follow the steps there. You'll need a Google Cloud OAuth client, which is free.

## Tests

The style engine has unit tests. Open `/tests/` in the browser, or on a Mac run:

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/engine.test.js
```

## Where things are

| Path | What |
|---|---|
| `js/styling/engine.js` | Outfit generation and scoring: colour, formality, patterns, proportion, weather, rotation, trips, gap analysis |
| `js/styling/layering.js` | Layering rules: base/mid/outer, necklines, thickness, sleeves, what shows |
| `js/styling/color.js` | Colour theory helpers and palette extraction |
| `js/styling/taxonomy.js` | Clothing types with sensible defaults |
| `js/styling/laundry.js` | Clean/dirty state changes |
| `js/lib/` | Data layer (Supabase or local), AI, weather (Open-Meteo), image processing |
| `js/views/` | Screens |
| `supabase/` | Database schema, security rules and the AI proxy function |

## Notes
- Photos are stored in a public Supabase bucket under random file names. Anyone with the exact link can view a photo, but photos can't be listed or browsed.
- The marketplace doesn't handle payments. Buyers and sellers arrange that between themselves in messages.
- Background removal uses `@imgly/background-removal` (AGPL), which runs entirely in the browser.
