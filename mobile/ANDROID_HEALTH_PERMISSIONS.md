# Pending: Health Connect workout permissions (needs a native build)

**Status: open.** The JS side ships; this part cannot go over the air.

## What's wrong

`READ_TYPES` in `src/lib/health/healthConnect.ts` asks Health Connect to read
`ExerciseSession` and `Distance`, but `app.json` → `expo.android.permissions`
does **not** declare `android.permission.health.READ_EXERCISE` or
`android.permission.health.READ_DISTANCE`.

A requested-but-undeclared permission is not an error. Health Connect lists it
in the consent sheet, the user taps Allow, and `getGrantedPermissions()` comes
back without it. Verified on a device (1.24.1, moto g play 2024): every declared
health permission reads `granted=true`, and those two appear nowhere in
`dumpsys package com.autonomic.journal`.

Consequences while it stands:

- **Android workout / distance import cannot work.** The reads have no grant, so
  `readWorkouts` sees nothing and `readAuthStatus('workouts')` is always
  `denied`.
- It caused a permission loop (the sheet re-opened on every launch and every
  "Add activity" tap). That symptom is fixed in JS — see `healthUngrantable` in
  `src/lib/health/askedAuth.ts`, which stops asking for anything still missing
  after the user has answered — but the underlying capability is still absent.

## The fix

1. Add both permissions to `app.json`:

   ```jsonc
   "android.permission.health.READ_EXERCISE",
   "android.permission.health.READ_DISTANCE",
   ```

   This changes the native fingerprint, so it needs a **new build + Play
   release**, not an EAS Update. (Adding it to the tree also moves the runtime
   version for everything else, which blocks OTAs to existing installs — that is
   why it was reverted out of the hotfix and parked here.)

2. **Play Console**: add the two data types to the app's Health Connect
   declaration form, or the release is rejected.

3. The `healthUngrantable` memory is keyed by permission set + app version, so
   the new version re-asks once on its own. No migration needed.

4. Verify on a device: grant everything, then

   ```bash
   adb shell dumpsys package com.autonomic.journal | grep -E "health\.[A-Z_]+:"
   ```

   both new permissions must appear with `granted=true`, and an "Add activity"
   tap must import a workout from Health Connect.
