# Publishing `pxcontrol-sdk` to npm

`pxcontrol-sdk` is an **unscoped** package, so no npm org or
`publishConfig.access` is required — unscoped packages are public by
default.

## One-time setup

1. Create an npm account at <https://www.npmjs.com/signup> and enable 2FA.
2. Confirm the name is still free:
   ```bash
   npm view pxcontrol-sdk        # should print "E404 Not Found"
   ```
3. Login locally:
   ```bash
   npm login
   ```

## Before every release

1. Bump the version **in both** `package.json` and `src/version.ts`:
   ```bash
   npm version patch              # updates package.json (creates a git tag)
   # then edit src/version.ts to match the new number
   ```
2. Update `CHANGELOG.md` with the new version and date.
3. Run the full quality gate:
   ```bash
   npm ci
   npm run lint                   # tsc --noEmit
   npm run test                   # vitest (skips if no tests)
   npm run build                  # produces dist/
   npm pack --dry-run             # inspect exactly what will ship
   ```
   The `prepublishOnly` hook re-runs `verify:version + lint + build`
   defensively, so a broken build can never reach the registry.

## Publish

```bash
# Dry-run — see the exact HTTP upload, no side effects:
npm publish --dry-run

# Real publish (2FA prompt will pop up):
npm publish
```

Push the tag that `npm version` created:

```bash
git push && git push --tags
```

Verify on the registry:

```bash
npm view pxcontrol-sdk
# open https://www.npmjs.com/package/pxcontrol-sdk
```

## Publishing from GitHub Actions (recommended long-term)

Add an **automation** token (`npm token create --type automation`) as the
`NPM_TOKEN` repo secret:

```yaml
# .github/workflows/publish.yml
name: Publish to npm
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions: { contents: read, id-token: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm publish --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

`--provenance` adds the verified supply-chain badge to the npm listing
and requires `id-token: write`.

## Yanking a broken release

```bash
# Preferred: flag the bad version but leave it installable for pinned users.
npm deprecate pxcontrol-sdk@0.1.1 "Broken — please upgrade to 0.1.2"

# npm unpublish is heavily restricted (only within 72h, and once un-
# published the name is blocked for 24h). Prefer deprecate + patch release.
```
