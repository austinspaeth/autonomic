# EAS Update (over-the-air updates) — setup

This app ships JavaScript/asset changes to installed builds **over the air** via
[EAS Update](https://docs.expo.dev/eas-update/introduction/). Merge to `main`
→ GitHub Actions publishes a new bundle → installed apps download it on next
launch. No App Store / Play Store release for JS-only changes.

**What OTA can and can't do**

| Change | Ships via |
| --- | --- |
| UI tweak, scoring threshold, HRV math, bug fix, copy | ✅ OTA update (`eas-update.yml`) |
| New/upgraded native module, new permission, Expo SDK bump | ❌ needs a native build (`eas-build.yml`) + store submit |

An OTA update only applies to a build whose **runtime** matches. This app uses
the `fingerprint` runtime-version policy, so EAS computes a hash of the native
layer and refuses to hand a JS bundle to a build that lacks the native code it
expects. That's the safety net — you can't brick an install with a bad OTA.

---

## One-time setup

These steps need your Expo account, so they can't be scripted in this repo. Run
them once from the `mobile/` folder, then commit the results.

1. **Install the client library** (writes the correct version + updates the lockfile):
   ```bash
   cd mobile
   npx expo install expo-updates
   ```

2. **Log in and link the project** (creates the EAS project and fills in the
   real `projectId` / `updates.url` — replaces the `your-eas-project-id`
   placeholders in `app.json`):
   ```bash
   npx eas login
   npx eas init
   ```

3. **Finish the updates config** (idempotent; confirms `runtimeVersion` +
   `updates.url` are wired):
   ```bash
   npx eas update:configure
   ```

4. **Commit** `app.json`, `package.json`, and `package-lock.json`.

5. **Add the CI secret.** Create an Expo access token at
   <https://expo.dev/accounts/[account]/settings/access-tokens>, then add it to
   this GitHub repo as a secret named **`EXPO_TOKEN`**
   (Settings → Secrets and variables → Actions → New repository secret).

6. **Create the first production build** so there's an installed app to receive
   updates. Either run the **EAS Build** workflow (Actions tab → EAS Build →
   platform `ios`, profile `production`) or locally:
   ```bash
   npx eas build --platform ios --profile production
   ```
   Install that build on your device / submit it to TestFlight. It's pinned to
   the `production` channel (see `eas.json`) and will pull `production` updates.

After that, every merge to `main` that touches `mobile/**` publishes an OTA
update automatically.

---

## How the pipeline works

- **`.github/workflows/eas-update.yml`** — on push to `main` (paths `mobile/**`),
  runs `eas update --branch production`. Also runnable manually with a custom
  branch via *workflow_dispatch*.
- **`.github/workflows/eas-build.yml`** — manual only. Kicks off a native build
  for a chosen platform/profile when native code changes.
- **`eas.json`** — maps build profiles to channels: `development` → dev client,
  `preview` → internal distribution, `production` → store build. A build's
  `channel` is linked to the update `branch` of the same name.

## Publishing manually / rolling back

```bash
# publish to a specific branch by hand
cd mobile && npx eas update --branch production --message "hotfix"

# roll a channel back to a previous update (re-points the branch)
npx eas update:rollback

# inspect what's live
npx eas update:list --branch production
npx eas channel:view production
```
