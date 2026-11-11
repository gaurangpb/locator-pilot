# Releasing

`package.json` holds the version. `npm version` copies it into `manifest.json`
([scripts/sync-version.mjs](scripts/sync-version.mjs)), and the build refuses to run
if the two ever disagree.

## Cut a release

1. Make sure `master` is green in CI and `CHANGELOG.md`'s **Unreleased** section
   describes what's shipping.
2. On an up-to-date `master`:

   ```bash
   npm version patch   # or minor / major
   ```

   This bumps `package.json`, syncs `manifest.json`, turns **Unreleased** into
   `## [x.y.z] — date` in `CHANGELOG.md`, commits all three, and creates the tag
   `vx.y.z`.
3. Push the commit and the tag:

   ```bash
   git push --follow-tags
   ```

4. [.github/workflows/release.yml](.github/workflows/release.yml) then:
   - checks the tag matches both version files;
   - re-runs typecheck, unit tests, build, and the Playwright e2e suite;
   - creates a GitHub Release with `locator-pilot.zip` and the changelog notes;
   - in the `chrome-web-store` environment, uploads the zip to the store item and
     submits it for review ([scripts/publish-store.mjs](scripts/publish-store.mjs)).

Chrome Web Store review usually takes from a few hours to a few days. The new
version goes live automatically once it's approved. Each upload needs a higher
`manifest.json` version than the last one, so a rejected version needs a new bump.

## One-time Chrome Web Store API setup

The store item already exists: ID `mlbblliaikkmocgelpinldnnbjdgkpje`. The API can
only update an existing item. It can't create one.

1. **Google Cloud project.** In <https://console.cloud.google.com>, create a project
   and enable the **Chrome Web Store API**.
2. **OAuth consent screen.** Choose External and add your own Google account (the one
   that owns the store item) as a test user.
3. **OAuth client.** Create an OAuth client ID of type *Web application*, with
   `https://developers.google.com/oauthplayground` as an authorized redirect URI.
4. **Refresh token.** In the [OAuth Playground](https://developers.google.com/oauthplayground),
   go to settings (gear icon), tick *Use your own OAuth credentials*, and enter the
   client ID and secret. Authorize the scope
   `https://www.googleapis.com/auth/chromewebstore` while signed in as the store
   owner, then exchange the code for tokens and copy the **refresh token**.
5. **Publisher ID.** In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   go to Publisher → Settings.
6. **GitHub secrets.** In the repo, go to Settings → Secrets and variables → Actions
   and add `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` and
   `CWS_PUBLISHER_ID`.
7. **Optional approval gate.** Under Settings → Environments → `chrome-web-store`,
   add yourself as a required reviewer. The store upload then waits for your
   click after the GitHub Release is created.

A refresh token for an app in the consent screen's *Testing* state expires after 7
days. To keep it long-lived, set the consent screen to *In production*. It works
without Google verifying the app.

## Manual fallback

```bash
npm run pack                               # builds dist/ and locator-pilot.zip
CWS_UPLOAD_ONLY=1 npm run publish:store    # needs the CWS_* env vars; uploads a draft only
```

You can also skip the API entirely: upload `locator-pilot.zip` on the item's
**Package** tab in the Developer Dashboard and click **Submit for review**.
