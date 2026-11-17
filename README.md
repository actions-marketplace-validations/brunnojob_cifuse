# CIFuse

**From failing CI to source evidence, contextual diagnostics and tested repair patches.**

[Try the workbench](https://brunnojob.github.io/cifuse/) · [Português](README.pt-BR.md) · [Contribute](CONTRIBUTING.md) · [Limitations](docs/LIMITATIONS.md)

![CIFuse introduction](site/demo.gif)

[![CI](https://github.com/brunnojob/cifuse/actions/workflows/ci.yml/badge.svg)](https://github.com/brunnojob/cifuse/actions/workflows/ci.yml)
[![Pages](https://github.com/brunnojob/cifuse/actions/workflows/pages.yml/badge.svg)](https://github.com/brunnojob/cifuse/actions/workflows/pages.yml)

A failed build often means scrolling through the same errors, copying evidence into an issue, and checking whether the failure happened before. CIFuse automates that triage in your terminal, browser or GitHub job summary.

## Quick start

Run the bundled example with Node.js 22+ and Git:

```sh
npx --yes github:brunnojob/cifuse --demo
```

Requires Node.js 22+ and Git for the GitHub install. The initial install downloads source; local log analysis makes no network requests. Optional GitHub imports use the API. No npm registry release is required.

```sh
npx --yes github:brunnojob/cifuse build.log --format json > report.json
npx --yes github:brunnojob/cifuse next.log --baseline report.json --fail-on new
```

- Groups repeated diagnostics with separate log and verified code locations.
- Inspects relative imports, dependency declarations and project setup context.
- Reproduces supported failures, generates a repair patch and checks tests before/after.
- Optionally imports failed GitHub jobs, updates a PR report or opens a validated repair PR.
- Recognizes 12 pattern families across dependencies, compilers, tests and infrastructure.
- Compares reports for new, existing and resolved signatures.
- Exports JSON and Markdown; supports English and Brazilian Portuguese.
- Runs offline after loading. No backend, account, AI key or runtime dependencies.
- Redacts common credential formats from reports, including surrounding context. This is best effort, **not a secret scanner**.

## What it actually does

The included illustrative fixture contains 8 matching lines grouped into 5 signals. Open the workbench and click **Load example**, or run `npm run demo`. Expand any result to inspect its original context.

CIFuse combines deterministic patterns with bounded source inspection. It suggests an investigation starting point and identifies possible exit-status consequences; neither proves causality. Supported import-casing repairs can be validated against an explicit test command. It does not identify flaky tests or replace your test exit status. Compared with `grep`, it adds grouping, source locations, baseline comparison and portable reports. Compared with an LLM tool, it needs no model or external log submission. See [design and tradeoffs](docs/ARCHITECTURE.md).

## Analyze code and validate a repair

```sh
node bin/cifuse.js build.log --repo /path/to/trusted-project --lang en
node bin/cifuse.js build.log --repo /path/to/trusted-project \
  --fix --validate '["node","--test"]' --patch /tmp/cifuse.patch --format json
```

Source context verifies referenced lines and inspects JS/TS relative imports, dependency declarations, Node requirements and package-manager configuration. Browser users can select a source folder for the same static checks, processed locally.

Repair currently handles unambiguous relative import casing mismatches. It uses a temporary Git worktree, requires failing validation before the patch and passing validation after it, and preserves the original checkout. `--open-pr --repository owner/repo` additionally pushes and opens a PR using authenticated Git/`gh`. Validation executes trusted project code; the browser never executes your tests.

See [the complete workflow, statuses and limits](docs/REPAIR.md). Run `npm run benchmark` for the small, reproducible tool-diagnostic corpus, including successful negative controls.

## GitHub Action

Capture an existing command's output and keep its original failure status. Run CIFuse afterwards:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: '22'
  - name: Test and capture log
    shell: bash
    run: |
      set -o pipefail
      npm test 2>&1 | tee build.log
  - name: Summarize failure evidence
    if: ${{ !cancelled() && hashFiles('build.log') != '' }}
    uses: brunnojob/cifuse@main
    with:
      log: build.log
      lang: en
```

The Action appends the report to the job summary. By default it reads one local text file. Optional `github-run: owner/repo/run-id` downloads failed job logs using `token`; optional `comment: true` updates its report on the current PR. These require `actions: read` and `pull-requests: write` respectively. Pin a reviewed commit SHA in production instead of the moving `main` branch. `baseline` accepts a previous JSON report; `fail-on` accepts `findings` or `new` (the latter requires a baseline). Local reporting needs only the checkout's `contents: read`. The Action never executes tests or repairs.

### Source context and a persistent PR report

```yaml
permissions:
  contents: read
  pull-requests: write
steps:
  - uses: actions/checkout@v4
    with:
      ref: ${{ github.event.pull_request.head.sha }}
  # Run your existing test step and capture build.log first.
  - uses: brunnojob/cifuse@main
    if: ${{ !cancelled() && hashFiles('build.log') != '' }}
    with:
      log: build.log
      repo: .
      repository: ${{ github.repository }}
      commit: ${{ github.event.pull_request.head.sha }}
      token: ${{ github.token }}
      comment: 'true'
      output: cifuse-report.json
```

Use this in a `pull_request` job. Fork tokens may lack comment permission; use reporting only in that case. Do not switch to `pull_request_target` to run untrusted code. Keep the JSON output as an artifact with `actions/upload-artifact` if desired.

## CLI

```sh
node bin/cifuse.js build.log another.log --lang pt-BR
cat build.log | node bin/cifuse.js - --format json
node bin/cifuse.js build.log --fail-on findings
```

Exit codes: **0** analysis completed, **1** selected threshold matched, **2** invalid arguments or input. Default behavior is reporting only. Explicit validation or repair returns 1 if validation fails or the repair is not validated. Limits: 100 files / 5 MiB combined, 10 retained locations per group. Analysis uses in-memory text logs, not ZIP archives. Large or compressed logs must be split or decoded first.

## Run and contribute

```sh
git clone https://github.com/brunnojob/cifuse.git
cd cifuse
npm test
npm run build
```

Serve `dist/` with any static server to try the website locally. Both browser and CLI import `src/engine.js`; the website defaults to English and offers a persistent PT-BR language switch. Only the language preference is stored; logs, source files and reports are not persisted by the application.

Start with [CONTRIBUTING.md](CONTRIBUTING.md), the [rule catalog](docs/RULES.md), or issues labelled `good first issue`. Sanitized real-world fixtures are especially useful. [Launch material](docs/LAUNCH.md) is ready to adapt for a community post.

Created by [Brunno](https://github.com/brunnojob). MIT licensed. If this saves you time, a star helps others find it.
