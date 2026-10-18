# Navigation update — what changed

## The ten styles
Rail, Workspace, Tree, Mega, Dock, Mobile, Context, Command, Bento, Focus.
Old ids migrate automatically: `full` → Tree, `topbar` → Mega (stored settings are read, never rewritten).

## Bugs fixed
1. **Context layout destroyed the rail.** It overwrote `#nav-global`, so after switching to any other layout the + / ⋯ / module buttons were gone until reload. Context now has its own container.
2. **More sheet ignored Escape** (focus-trap `onClose` was empty). Now closes and returns focus.
3. **Wrong shortcut labels in the palette** (Schwachstellen showed `2`, real key is `3`); "Module" was missing from the palette. Shortcuts now come from one registry used by menus, palette and key handler.
4. **Shortcuts fired behind open dialogs** (e.g. `S` started a timer under a modal). Now suppressed while a dialog, the More sheet or the launchpad is open.
5. **Closed drawers were still tabbable** (phone drawer, Focus). Now `inert` until opened.
6. **Dark theme: module accent overrode the theme tints**, giving light-on-light highlights. Tints are now theme-aware and follow theme switches.
7. **Mobile back button was hidden on module pages.** Now shown; falls back to the Module overview when there is no history.
8. **`#/modul//ziele`** (no current module) was parsed as module id "ziele". Hardened.
9. **Dead/duplicated code** removed (overflow logic that could never run, a copy-pasted block in the context renderer).
10. `package.json` is now `"type": "module"` (silences Node's reparse warning); the CommonJS server is `server.cjs`.

## Added
- Palette searches learning objectives, notes and material; ARIA combobox wiring; focus restore; shortcut hints; `?` cheat sheet; "Navigation: …" commands.
- Contextual mobile header (title, back, ▶ session on module pages, launchpad button for Bento).
- 13 new unit tests (`tests/nav-styles.test.mjs`) and rewritten layout tests.

## Files
Changed: `css/main.css`, `index.html`, `js/app.js`, `js/components/{palette,sidebar,tabbar}.js`, `js/utils/{navLayout,navigation}.js`, `js/views/{router,settings}.js`, `package.json`, `tests/{mobile-nav,nav-layout}.test.mjs`, `README.md`.
New: `js/components/nav/*`, `js/utils/navData.js`, `tests/nav-styles.test.mjs`, `server.cjs`.
Removed: `server.js` (renamed to `server.cjs`).
