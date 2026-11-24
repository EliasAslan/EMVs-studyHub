# StudyHub Card — Seelen UI widget

A floating, single-card desktop companion for StudyHub. It shows the next action, open homework count, next exam countdown and up to three deadlines. It also includes an independent Pomodoro timer.

## Current data connection

The widget consumes the version 1 JSON snapshot exported by StudyHub. It deliberately does not connect directly to Neon or read the app's private database. The snapshot contains only the sanitized desktop view (no notes, grades, account details, IDs or attachment data).

1. Open StudyHub.
2. Go to Einstellungen → Widgets.
3. Export JSON für Desktop-Widget.
4. In the Seelen widget, choose Import JSON and select that file.

The imported snapshot is stored in the widget's own local storage. Use the refresh button to reload the saved copy; export and import again after changing your StudyHub data. Automatic cross-window sync is not wired up yet because Seelen widgets run in an isolated webview and cannot read the app's local storage directly.

## Install locally

1. Install Seelen UI and make sure it is running.
2. Install the Seelen CLI (slu) as described in the Seelen UI documentation.
3. From the repository root, run:

   powershell
   slu resource load widget .\desktop\Seelen-StudyHub

   Use the full path if your terminal is not at the repository root.
4. Open Seelen UI settings and enable StudyHub Card.
5. Move the card to the right side of the desktop once. The Desktop preset remembers its last position and size.

To unload during development:

   slu resource unload widget .\desktop\Seelen-StudyHub

## Notes

- The widget is read-only with respect to StudyHub. Completing tasks still happens in the main app.
- The Pomodoro timer is independent from StudyHub's in-app focus timer in this first version.
- The app URL and accent colour can be changed in Seelen's widget settings.
- This resource uses Seelen's @seelen-ui/lib lifecycle API.
