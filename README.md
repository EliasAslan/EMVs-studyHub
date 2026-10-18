# EMVs Study Hub

This project is a local-first study dashboard imported from the attached Study folder. It tracks modules, learning objectives, resources, sessions, exams, and weekly reviews in the browser via `localStorage`.

## Run locally

```bash
npm start
```

Then open http://localhost:8080.

## Supabase Auth foundation (Phase 5.1)

This phase adds email/password authentication only. Study data continues to use
browser `localStorage`; signing in does not upload, download, overwrite, or
delete any study data.

### Configure the browser client

1. Open the Supabase project dashboard.
2. Go to **Project Settings → API Keys**.
3. Copy the **publishable key** (or the legacy anon/public key if that is what
   the dashboard exposes). Never use a `service_role` key or database password
   in browser code.
4. Replace `PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE` in
   `js/services/supabaseClient.js` with that public key.
5. Deploy/run the app over HTTP(S), then open **Einstellungen → Konto / Supabase**.

The Supabase JavaScript client is loaded from `esm.sh` on demand, so no npm
package/build step is needed. Authentication requires an internet connection.

### Scope and safety

- Email/password sign-in, account creation, session restore, and sign-out are
  available in Settings.
- If email confirmation is enabled, account creation may ask the user to confirm
  the email before signing in.
- Auth sessions are stored separately by the Supabase client. Study data stays
  in the existing EMVS localStorage keys.
- Signing in alone does not sync study data. Manual upload/download is available under **Einstellungen → Konto / Supabase** after signing in.
- Upload upserts the signed-in user's rows, verifies uploaded values by reading them back, and never deletes cloud rows. Demo-seed records are excluded unless required as parents of real records.
- Download replaces the current local dataset after confirmation when data could be lost; export a JSON backup first. There is no automatic sync or merge.
- Account-mismatch safeguards, row mapping, and sync status/error guidance are implemented in the manual workflow.

## Navigation styles

Settings → App-Einstellungen → Navigation offers ten styles. The choice applies
instantly, is saved in `settings.navLayout`, and on phones every style falls
back to the mobile shell (bottom bar + contextual header + drawer).

| Style | Idea |
| --- | --- |
| Rail | Slim icon rail (default) |
| Arbeitsbereich | Icon rail + contextual module panel |
| Baum | Subjects → chapters → topics, keyboard-navigable tree |
| Mega-Menü | Top bar with grouped mega menus |
| Dock | Floating pill with the main destinations |
| Mobil | Phone-first shell, also on desktop |
| Kontext | Lernen / Üben / Planen / Wiederholen |
| Befehl | Search-first bar + command palette + shortcuts |
| Bento | Launchpad of cards (subjects, tests, activity, tools) |
| Fokus | Navigation hidden; handle, `M`, or the left screen edge |

Shortcuts: `1`–`8` destinations, `Strg/⌘+K` or `/` palette, `?` cheat sheet,
`G` launchpad (Bento), `M` menu (Fokus). The palette can also switch the style
(“Navigation: …”), so Fokus can never lock you out.

Code map: `js/utils/navigation.js` (destinations, context modes, mega menu),
`js/utils/navLayout.js` (registry), `js/utils/navData.js` (tree + bento data),
`js/components/nav/` (one file per style).
