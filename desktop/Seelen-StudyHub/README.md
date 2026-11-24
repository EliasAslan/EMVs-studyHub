# StudyHub — Seelen UI widget

A compact desktop sidebar for StudyHub. The collapsed view keeps your next task, exam countdown and focus timer visible. Expand it for the current priority, a short deadline list and Pomodoro controls.

## What it shows

- **Collapsed:** next task, next exam countdown and timer.
- **Expanded:** Start Here, open homework count, next exam, up to three deadlines and the focus timer.
- **Timer:** independent 25-minute focus / 5-minute break timer. Its state is saved locally and a running session resumes after the widget restarts.
- **Pin:** keeps the panel expanded when Escape is pressed. The close button always closes and unpins it.

The widget is read-only. Completing tasks still happens in the main StudyHub app.

## Data connection

The widget imports the version 1 JSON snapshot exported by StudyHub. It deliberately does not connect directly to Neon or read the app's private database. The snapshot is intended to contain only the sanitized desktop view.

1. Open StudyHub.
2. Go to **Einstellungen → Widgets**.
3. Choose **Export JSON für Desktop-Widget**.
4. Expand the Seelen widget, choose **Import JSON**, and select the exported file.

The snapshot is stored in the widget's own local storage and checked periodically using the configured refresh interval. To see newer StudyHub data, export and import a fresh snapshot. Automatic cross-window sync is not implemented: Seelen widgets run in an isolated webview and cannot read the app's local storage directly.

## Install and build locally

1. Install Seelen UI and make sure it is running.
2. Install the Seelen CLI (`slu`) as described in the Seelen UI documentation.
3. From the repository root, run:

   ```powershell
   cd .\desktop\Seelen-StudyHub
   npm install
   npm run build
   cd ..\..
   slu resource load widget .\desktop\Seelen-StudyHub
   ```

4. Open Seelen UI settings and enable **StudyHub Card**.
5. Place the widget where you want it on the desktop. Seelen's Desktop preset saves its position; the widget also resizes its window when switching between compact and expanded states.

To unload during development:

```powershell
slu resource unload widget .\desktop\Seelen-StudyHub
```

## Controls

- Click the task row to expand or collapse the panel.
- Press **Escape** to collapse an unpinned panel.
- Use **Pin** to keep the panel expanded while working elsewhere.
- Use **Close** to collapse and unpin.
- Use **Tab**, **Enter** and **Space** to navigate and activate controls.

## Settings

- **StudyHub app URL:** target opened by Open StudyHub.
- **Accent colour:** used sparingly for highlights and primary actions.
- **Show upcoming deadlines:** toggles the deadline list.
- **Refresh interval:** how often the widget checks its locally imported snapshot.

## Notes and limitations

- The Pomodoro timer is independent from StudyHub's in-app focus timer.
- The widget does not automatically appear based on the active Windows application.
- Click-outside dismissal and global keyboard shortcuts are not implemented.
- Windows may hide desktop widgets when using **Win + D**, depending on Seelen UI's desktop handling.
- The widget uses Seelen's `@seelen-ui/lib` lifecycle and Tauri window sizing APIs.
