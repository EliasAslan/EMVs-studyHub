# CDN Vendoring Decision

**Decision: Keep external CDNs (first run needs internet).**

The app uses three external CDN dependencies, all allowed by CSP:

1. **Google Fonts** (fonts.googleapis.com, fonts.gstatic.com) — Instrument Serif, Inter, JetBrains Mono. Critical for the app's distinctive typography. No local fallback needed; system fonts will render if blocked.

2. **@supabase/supabase-js via esm.sh** — Loaded lazily only when user signs in to Supabase. The publishable key is public by design. If blocked, cloud sync is unavailable but local-only mode works fully.

3. **pdf.js via jsDelivr** (cdn.jsdelivr.net/npm/pdfjs-dist@4) — Loaded lazily only when importing a PDF. If blocked, PDF import shows a friendly error (`pdfjs-load`) and the rest of the app is unaffected.

**Rationale:** Vendoring would add ~5 MB of font files and ~2 MB of JS bundles to the repo, increasing clone size and requiring manual version updates. The app is designed to degrade gracefully: all three CDN features are optional enhancements (sync, PDF import, custom fonts), and the core study-management workflow works offline after first load. Users who need fully offline operation can host the static files locally and proxy the three domains.

**CSP matches this decision:** connect-src allows `https://*.supabase.co` and `http://localhost:11434`; style-src/font-src allow Google Fonts; script-src allows esm.sh and jsDelivr.