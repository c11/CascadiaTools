# OpenCode plugin release instructions

## Purpose and current status

Distribute CascadiaTools as a versioned npm package. Keep Git installation as an
alternative and local clones as the development workflow.

The package lives in [plugins/cascadia-tools](../plugins/cascadia-tools/), not at
the repository root. Its current name is `cascadia-tools`, with version `0.2.1`.
These instructions do not imply that this name is available on npm or that this
version has been published.

This document describes manual releases and a recommended GitHub Actions
workflow. It does not add a publishing workflow, configure npm authentication,
or publish a release.

## 1. Release format

Keep the current TypeScript-source distribution initially:

- [package.json](../plugins/cascadia-tools/package.json) exports `./src/index.ts`.
- OpenCode loads the TypeScript entrypoint directly.
- `npm run build` checks compilation and emits `dist/`, but the package currently
  neither exports nor includes that directory.
- This is a server-only plugin; it does not require a GUI bundle.

The npm package must include the complete toolkit, not just its entrypoint:

| Assets | Purpose |
|---|---|
| `src/`, `skills/` | Native integration, privacy guards, and skill definitions |
| `core/`, `scripts/` | R engine, launchers, and job runner |
| `modules/` | Analysis implementations, examples, configurations, and validation assets |
| `tools/`, `docs/`, `catalog.md` | Setup utilities, supporting documentation, and module discovery |
| `LICENSE`, `LICENSE-docs` | Code and documentation/example license notices |

Preserve this directory layout and executable launcher permissions. Runtime
paths are resolved relative to the installed package root.

Compiling to JavaScript is an optional future change. If adopted, update exports
to `./dist/index.js`, include `dist/` in the package, and build before packing.
Repeat installed-package testing after that change. Do not bundle the R toolkit
or skill assets into JavaScript.

## 2. One-time publishing setup

1. Confirm the npm package name and publishing authority. Check the registry and
   existing owners before using `cascadia-tools`. An authentication or network
   error is not evidence that a name is available.
2. If the name is unavailable, choose an authorized scope such as
   `@your-org/cascadia-tools`. Update the manifest, lockfile, and installation
   documentation consistently. The native plugin ID can remain `cascadia-tools`.
3. Confirm repository metadata points to `c11/CascadiaTools` and records
   `plugins/cascadia-tools` as the package directory. Preserve original
   authorship and both licenses.
4. Set up an npm maintainer account with two-factor authentication. Never commit
   credentials, tokens, or authenticated npm configuration.
5. For a new package, bootstrap its first validated release with interactive
   authentication as described below, then configure trusted publishing for
   subsequent CI releases.

Use the public npm registry explicitly:

```sh
npm view cascadia-tools versions --json --registry=https://registry.npmjs.org
```

The remaining commands read the actual package name from the manifest, so they
also support a scoped name.

## 3. Prepare the version and release notes

Use a clean release checkout containing the reviewed changes. Run the following
in Bash from the repository root, and keep the same shell for subsequent command
blocks:

```sh
set -euo pipefail
cd plugins/cascadia-tools
```

Choose an unused semantic version. The value below is an example, not a required
next version:

```sh
npm version 0.3.0 --no-git-tag-version
```

This updates the package manifest and lockfile without making a commit or tag.
Never reuse a published name/version pair, even if its package was unpublished.

Prepare release notes covering:

- Supported and actually tested OpenCode versions.
- Changes to skills, privacy behavior, modules, dependencies, and installation.
- Breaking changes and upgrade instructions, especially the Claude-to-OpenCode
  transition described in [the migration notes](opencode_migration.md).
- Known limitations and any accepted dependency-advisory risks.

Update the root and package READMEs with npm installation instructions for the
planned release, retaining local installation instructions for contributors.
Do not announce registry availability until publication succeeds.

## 4. Validate the source

Release prerequisites:

- Node.js 22.18 or newer, npm, and Bash.
- The OpenCode CLI on `PATH`; the migrated plugin was tested with OpenCode 2.2.0
  and pins `@opencode/plugin` to 2.2.0.
- R 4.5 or newer on the release runner, so the R-root regression test does not
  silently disappear from the release evidence.
- npm 11.5.1 or newer when using trusted publishing.

Pin the chosen Node/npm and OpenCode versions in CI. Do not install an unqualified
latest OpenCode release and treat that as evidence for every supported version.

```sh
node --version
npm --version
opencode --version
npm ci
npm run typecheck
npm test
npm run build
npm run test:opencode
```

Require successful checks and no skipped release tests. The R-root regression
test can skip when R is absent; that is acceptable for some developer machines,
but not for this release validation.

The [native smoke test](../plugins/cascadia-tools/test/opencode-smoke.ts) starts
an isolated OpenCode server, waits for plugin activation, verifies all 14 skills
and selected privacy hooks, and cleans up its server and temporary project.
It does not call a model or require provider credentials.

Review runtime dependency advisories, for example with `npm audit --omit=dev`,
and resolve or explicitly document them under the project's release policy.
Do not hide audit failures or run forced dependency upgrades as a release
shortcut.

These checks do not recertify every scientific model. Changes to analysis code
also require the affected modules' scientific validation; describe the actual
scope of testing in the release notes.

## 5. Pack and test the distributable

Create the archive outside the checkout. Run `npm pack` from the plugin directory,
not the repository root:

```sh
PACKAGE_NAME="$(node -p 'require("./package.json").name')"
VERSION="$(node -p 'require("./package.json").version')"
ARCHIVE_NAME="$(node -p 'require("./package.json").name.replace(/^@/, "").replace("/", "-")')"
RELEASE_DIR="$(mktemp -d)"

npm pack --pack-destination "$RELEASE_DIR"
TARBALL="$RELEASE_DIR/$ARCHIVE_NAME-$VERSION.tgz"
test -f "$TARBALL"
tar -tvzf "$TARBALL"
```

Review the archive listing against the manifest's `files` allowlist. Verify the
entrypoint, every runtime/support asset group listed above, README, both
licenses, and launcher permissions. Exclude credentials, private research data,
generated analysis output, obsolete integration files, `node_modules/`, and
development tests. With the current source distribution, `dist/` is also
excluded. Do not freeze a file-count threshold; required assets can legitimately
change between releases.

Install this exact archive into a separate project, not a workspace link:

```sh
mkdir "$RELEASE_DIR/install"
(
  cd "$RELEASE_DIR/install"
  npm init -y
  npm install --no-audit --no-fund \
    --registry=https://registry.npmjs.org "$TARBALL"
)

INSTALLED_PLUGIN="$RELEASE_DIR/install/node_modules/$PACKAGE_NAME"
test -f "$INSTALLED_PLUGIN/src/index.ts"
test -x "$INSTALLED_PLUGIN/scripts/Rscript"
CASCADIA_TEST_PLUGIN_ROOT="$INSTALLED_PLUGIN" npm run test:opencode
shasum -a256 "$TARBALL"
```

The smoke-test runner remains in the source checkout, but
`CASCADIA_TEST_PLUGIN_ROOT` makes OpenCode load the separately installed package.
This tests installed skill paths, package-root resolution, and privacy behavior
without relying on unpublished source assets.

Retain the archive, checksum, check results, and tested tool versions as release
evidence. If any distributed file changes after packing, create and validate a
new archive. Do not publish a freshly repacked directory instead of the archive
that passed these checks.

## 6. Commit, tag, and publish

Commit the reviewed version, lockfile, documentation, and release-note changes.
Confirm the worktree is clean and the release commit is on the intended release
branch. Push that commit before pushing its version tag.

Use an annotated tag matching the package version:

```sh
git status --short
git tag -a "v$VERSION" -m "Release $PACKAGE_NAME $VERSION"
git push origin "v$VERSION"
```

Only push the tag when ready to release: a future tag-triggered CI workflow will
start publishing at that point. Choose exactly one publication path below;
do not manually publish a version that CI is also publishing.

### Manual publication or first-release bootstrap

Authenticate interactively and publish the exact tested archive:

```sh
npm login --registry=https://registry.npmjs.org
npm publish "$TARBALL" --access public --tag latest \
  --registry=https://registry.npmjs.org
```

Use `--tag next` instead of `--tag latest` for a prerelease, and use a prerelease
version such as `0.3.0-rc.1`. Do not accidentally move `latest` to a prerelease.
Never record authentication responses or one-time passwords in release logs.

### Recommended GitHub Actions publication

Implement a workflow such as `.github/workflows/release.yml` with these gates:

1. Trigger on pushed version tags such as `v*`; verify the tag is exactly
   `v` plus the manifest version and points to an approved release commit.
2. Check out that tag on a GitHub-hosted runner. Pin action revisions and tool
   versions, and install the chosen OpenCode CLI plus R 4.5 or newer.
3. Set the command working directory to `plugins/cascadia-tools`.
4. Run all source checks from section 4, then pack, inspect, and test the archive
   as in section 5. Automate the required-asset checks rather than relying on
   someone reading a tar listing in CI.
5. Require approval through a protected release environment, where available.
   Ensure only one publish job runs for a given version.
6. Publish the exact validated archive using npm trusted publishing. Grant
   `contents: read` and, on the publish job, `id-token: write`. Do not provide a
   long-lived npm publish token.
7. Preserve the archive, checksum, test results, and version information as
   workflow artifacts. Publish GitHub release notes only after npm succeeds.

If validation and publication use separate jobs, transfer the tested archive as
an artifact and verify its checksum after download; do not rebuild it.

In the npm package's trusted-publisher settings, configure:

| Setting | Value |
|---|---|
| Provider | GitHub Actions |
| Organization or user | `c11` |
| Repository | `CascadiaTools` |
| Workflow filename | `release.yml`, or the actual chosen filename |
| Environment | Exact protected environment name, if used by the job |
| Allowed actions | Enable direct `npm publish` for the workflow described here |

The workflow must exist in the repository. Match npm's settings to the actual
workflow and environment, use a supported npm CLI, and complete the initial
trusted publish within npm's current configuration-expiry window. Trusted
publishing generates provenance automatically on supported GitHub Actions
releases; verify it is present.

## 7. Verify and announce the release

Confirm registry metadata and the intended distribution tag:

```sh
npm view "$PACKAGE_NAME@$VERSION" version dist.integrity dist.tarball --json \
  --registry=https://registry.npmjs.org
npm view "$PACKAGE_NAME" dist-tags --json \
  --registry=https://registry.npmjs.org
```

In a disposable research project with no local clone configured, install the
released version through OpenCode:

```sh
opencode plugin add "$PACKAGE_NAME@$VERSION"
opencode plugin list
```

Restart OpenCode if necessary and allow initialization to finish. Confirm the
plugin becomes active, its skills are discoverable, and `cascadia-start` can
locate the installed module catalog. An initially empty plugin listing is not
sufficient evidence of failure or success; initialization can be asynchronous.
Remove the temporary global plugin entry afterward with
`opencode plugin remove "$PACKAGE_NAME@$VERSION"`.

Publish release notes containing the npm name/version, Git tag, supported and
tested runtimes, validation scope, known limitations, and exact installation
command. R, Bash, scientific R packages, and optional Python engines remain
separate prerequisites; npm distribution does not bundle an R installation.
Direct users to `cascadia-setup` for analysis dependency setup.

Keep the release evidence before removing the exact temporary directory printed
by `printf '%s\n' "$RELEASE_DIR"`. Inspect its path and contents first; do not use
broad cleanup commands against the checkout or a shared temporary root.

## 8. Git distribution alternative

Once the migrated implementation and its tag have been pushed, users can install
from this repository's plugin subdirectory:

```sh
opencode plugin add 'github:c11/CascadiaTools#<release-tag>::path:plugins/cascadia-tools'
```

Replace `<release-tag>` with a real release tag; the placeholder is not an
installable version. A full commit hash provides a stronger immutable pin.
Keep published tags immutable.

OpenCode accepts npm and Git package targets, but `opencode plugin add` does not
accept raw tarball targets. The npm tarball above is a packaging/test artifact
and a publication input, not a direct OpenCode installation command.

## Release checklist

- [ ] Package name, registry ownership, authorship, and licenses confirmed.
- [ ] New version, lockfile, installation guidance, and release notes reviewed.
- [ ] Source typecheck, tests without skips, build, and native smoke test passed.
- [ ] Dependency advisories reviewed; affected scientific checks completed.
- [ ] Archive contents inspected and separately installed archive tested.
- [ ] Release commit, version tag, and published package version agree.
- [ ] Exact tested archive published once with the intended npm distribution tag.
- [ ] Registry metadata, provenance where applicable, and OpenCode installation verified.
- [ ] Release notes and evidence retained; temporary fixtures cleaned up safely.

## References

- [OpenCode plugin installation and management](https://opencode.ai/docs/plugins/)
- [OpenCode plugin packaging and publication](https://opencode.ai/docs/build/plugins/#publish)
- [OpenCode CLI installation](https://opencode.ai/docs/)
- [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
