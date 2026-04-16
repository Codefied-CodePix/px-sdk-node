# Publishing `@pxcontrol/sdk` to npm

## One-time setup

1. **Create the npm org** (only once): <https://www.npmjs.com/org/create> → `pxcontrol`.
2. **Create an npm account** and enable 2FA (`Auto` level recommended).
3. **Generate an automation token** for CI (optional):
   <https://www.npmjs.com/settings/YOUR_USER/tokens> → *Granular* → scope to `@pxcontrol/*` → Publish.
4. Login locally: `npm login` (interactive, uses browser).

> **Note:** `@pxcontrol/sdk` is a **scoped** package. `publishConfig.access = "public"`
> is already set in `package.json`, so `npm publish` will publish it publicly.
> Scoped packages are **private by default**, so this flag is required.

## Before every release

1. Bump the version **in both** `package.json` and `src/version.ts`:
   ```bash
   npm version patch   # or minor / major — updates package.json
   # then edit src/version.ts to match
   ```
2. Update `CHANGELOG.md` with the new version and date.
3. Run the full quality gate:
   ```bash
   npm ci
   npm run lint          # tsc --noEmit
   npm run test          # vitest (skips if no tests)
   npm run build         # produces dist/
   npm pack --dry-run    # inspects what will ship
   ```
   The `prepublishOnly` hook re-runs `verify:version + lint + build` defensively.

## Publish

```bash
# Dry-run — see exactly what will be uploaded, nothing is pushed:
npm publish --dry-run

# Real publish (2FA prompt will pop up):
npm publish
```

Then push the tag:

```bash
git push && git push --tags
```

## Publishing from GitHub Actions (recommended long-term)

Add `NPM_TOKEN` (automation token) as a repo secret, then:

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
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

`--provenance` adds the verified supply-chain badge to the npm listing.

## Yanking a broken release

```bash
npm deprecate @pxcontrol/sdk@0.1.1 "Broken — please upgrade to 0.1.2"
# npm unpublish is heavily restricted; prefer deprecate + a new patch release.
```
