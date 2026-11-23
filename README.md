# Overseer

Overseer is a local-first study and productivity workspace with native Android and responsive Web apps. Both versions share the same navy (`#131D44`), near-white (`#FDF8FF`), and lime (`#C1FF00`) identity and exchange records through versioned JSON backups. Data stays on the device unless a user exports and transfers a backup; there is no cloud account or automatic sync.

## Features

- Home dashboard with tasks, upcoming schedule, daily planning, and progress summaries
- Course library with lessons, completion tracking, and imported study materials
- Tasks with priorities, due dates, and course links
- Dated and weekly recurring schedule events
- Day planner blocks linked to tasks and courses
- Focus, short-break, and long-break sessions with recovery, history, and associations
- Progress summaries, profile settings, notifications, and keyboard-accessible Web navigation

Android keeps its five-item bottom navigation and opens expanded task, planner, lesson, focus-history, and progress views from relevant screens. Web keeps its responsive sidebar and all existing routes.

## Local development

Web:

```sh
cd web
npm install
npm run dev
```

Build the Web app with `npm run build`.

Android:

```sh
cd android
./gradlew assembleDebug testDebugUnitTest
```

Android builds require a configured JDK and Android SDK.

## Data transfer

Use **Profile & settings → Export workspace JSON** in Android or **Settings → Export application data** in Web. Import the JSON on the other platform and confirm the merge. Existing records are retained; identical IDs and records are deduplicated, conflicting IDs are preserved as separate records, and device-specific preferences and active timer state remain local. The file contains courses, lessons, materials, tasks, events, planner blocks, focus sessions, preferences, and timer state in a versioned `{"version":5,"data":...}` envelope. Legacy Web version 4 exports and Android SharedPreferences are migrated on load.

Imports add records instead of replacing the destination workspace. Reset is a separate, explicitly confirmed action.
