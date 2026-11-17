# Code context, validation and repair

CIFuse 0.2 adds inspectable code checks to log triage. It extracts relative TypeScript, compiler and Python source locations, verifies the file and line against supplied source, and shows a redacted snippet. Commit links require a matching, unmodified Git checkout and a full SHA. The original log location remains separate.

Relative JavaScript/TypeScript imports are checked against supplied filenames, with special handling for emitted `.js` imports in TypeScript. Case mismatches, ambiguous candidates and unresolved supplied paths are reported. This is bounded static inspection, not a full compiler, AST resolver or proof of root cause. Path aliases, generated files, comments containing import-like text and monorepo resolution may need manual review.

The root `package.json` contributes package-manager and Node requirements, plus whether a missing JS package is declared. Workflow paths identify setup files to inspect. These facts complement diagnostic patterns; CIFuse does not install missing packages or claim to resolve version compatibility.

## Local source and test validation

```sh
node bin/cifuse.js build.log --repo /path/to/project --lang pt-BR
node bin/cifuse.js build.log --repo /path/to/project \
  --repository owner/repo --commit FULL_40_CHARACTER_SHA --format json
node bin/cifuse.js build.log --repo /path/to/trusted-project \
  --validate '["node","--test"]' --format json
```

`--validate` accepts an argv JSON array, without a shell. It executes the chosen command, so use a trusted checkout. A nonzero test result produces exit code 1; input errors use 2. Standalone validation runs in the selected checkout and can have the normal effects of your test command. It does not claim that any fix occurred.

## Reproduce → patch → validate

```sh
node bin/cifuse.js build.log --repo /path/to/trusted-project \
  --fix --validate '["node","--test"]' --patch /tmp/cifuse.patch --format json
```

Current automatic repair scope: **unambiguous relative JS/TS import casing mismatches referenced by a missing-module diagnostic**. Other errors receive investigation checks. CIFuse does not invent patches for arbitrary exceptions or compiler errors.

1. Require a clean checkout and create a detached temporary Git worktree at HEAD.
2. Identify a unique tracked filename matching the import by case.
3. Run the explicit validation command before editing; require an ordinary nonzero exit.
4. Apply the narrowly scoped change and rerun the same command.
5. Require zero exit, unchanged proposed contents and no unrelated tracked modifications.
6. Export a patch and before/after test results. Remove the temporary worktree in `finally`.

Statuses: `unsupported`, `not-reproduced`, `validation-error`, `failed`, `validated`. Only `validated` counts as success. A failing patch can still be exported for inspection; it cannot open a PR. A passing command establishes only that command's result, not universal correctness or absence of flaky tests.

Worktrees do not copy ignored files or existing `node_modules`. Choose a self-contained test or an explicit trusted preparation-and-test script. Git submodules and LFS content are not prepared automatically. On a filesystem that ignores filename casing, the original mismatch may not reproduce; CIFuse then refuses to call it fixed. Validation has a 120-second timeout and 1 MiB output buffer per run. The GitHub token environment variables are removed from validation subprocesses; this is not an OS sandbox or complete secret isolation.

To additionally push the validated repair and open a PR:

```sh
node bin/cifuse.js build.log --repo /path/to/trusted-project \
  --fix --validate '["node","--test"]' --patch /tmp/cifuse.patch \
  --repository owner/repo --open-pr
```

This explicit flag requires authenticated Git and GitHub CLI (`gh`). CIFuse checks the origin matches the named repository, pushes a dedicated `cifuse/repair-*` branch, and opens a PR. It never merges. If PR creation fails after pushing, the error names the pushed branch. Do not put `--open-pr` in workflows processing untrusted contributions.

## Import an execution and update a PR report

```sh
GITHUB_TOKEN=... node bin/cifuse.js --github-run owner/repo/123456 \
  --repo /path/to/checkout-at-run-head --format json
```

Uses GitHub's API to download failed jobs, with bounded logs and pagination. Token needs access to the selected run (`actions: read` for private runs). API failures are surfaced, not silently omitted. Source checkout HEAD must match the run SHA. Downloading is optional; ordinary local analysis remains offline.

Action inputs `repo`, `repository`, `commit`, `github-run`, `token`, `comment`, and `output` enable source context, remote runs, a marked PR report and a JSON artifact. Commenting is explicitly opt-in and requires a `pull_request` event plus `pull-requests: write`. CIFuse updates only a marked comment belonging to its authenticated identity; reruns reuse that report. The Action never executes repair or validation commands.

## Reproducible measurements

```sh
node scripts/capture-fixtures.js
npm run benchmark
npm test
```

The small corpus captures actual Node output from intentionally failing local commands, with command, exit status, tool version and capture date. It includes positive cases and successful negative controls. It is not production incident data and does not establish overall precision, recall or time savings. Add sanitized real incidents with provenance before making broader claims.
