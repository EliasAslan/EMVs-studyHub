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

