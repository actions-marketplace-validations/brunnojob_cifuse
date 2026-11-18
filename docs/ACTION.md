# CIFuse GitHub Action

CIFuse CI log triage groups repeated failure diagnostics, preserves log evidence, optionally verifies code references, and compares reports. Free, MIT licensed, no model or API key needed for local analysis.

## Complete installation

Save this workflow as `.github/workflows/ci.yml`, adapting installation and tests to your project:

```yaml
name: Test with CIFuse
on:
  push:
  pull_request:
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - name: Test and capture log
        shell: bash
        run: |
          set -o pipefail
          npm test 2>&1 | tee build.log
      - name: Explain CI evidence
        id: cifuse
        if: ${{ !cancelled() && hashFiles('build.log') != '' }}
        uses: brunnojob/cifuse@v0.2.1
        with:
          log: build.log
          repo: .
          repository: ${{ github.repository }}
          commit: ${{ github.sha }}
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() && hashFiles('cifuse-report.json') != '' }}
        with:
          name: cifuse-report
          path: cifuse-report.json
```

CIFuse's success does not override a failed test step. `pipefail` preserves the original test failure. For pull-request source links, `github.sha` corresponds to the checked-out merge commit above; when explicitly checking out `pull_request.head.sha`, pass that SHA instead.

The version tag selects the tested release. For immutable production use, replace `@v0.2.1` with the full SHA shown on that release. The composite Action sets Node.js 22 through `actions/setup-node`; source/test steps run before it in this example. No package installation is required by CIFuse itself. Supported runners: GitHub-hosted Linux, macOS and Windows, with Bash and Git available.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `log` | empty | Existing UTF-8 text log; supply exactly one of `log` or `github-run`. |
| `github-run` | empty | `owner/repo/run-id`; downloads failure and timed-out job logs. |
| `lang` | `en` | `en` or `pt-BR`. |
| `repo` | empty | Optional trusted source Git checkout path. |
| `repository` | empty | `owner/repo` for commit links. |
| `commit` | empty | Exact 40-character source checkout SHA. |
| `baseline` | empty | Previous CIFuse v1-schema JSON report path. |
| `fail-on` | empty | `findings` or `new`; `new` requires baseline. |
| `token` | empty | Only needed for authenticated log download or comments. |
| `comment` | `false` | `true` updates its marked report comment on the current PR. |
| `output` | `cifuse-report.json` | JSON report path; parent directories are created. Empty disables the file. |

## Outputs

| Output | Meaning |
| --- | --- |
| `report` | JSON file path, or unset if file output disabled. |
| `groups` | Number of distinct failure signatures. |
| `signals` | Matched diagnostic lines, including repeated occurrences. |
| `new` | Signatures absent from baseline; empty without baseline. |
| `resolved` | Baseline signatures absent from supplied logs; empty without baseline. |

Read these as `steps.cifuse.outputs.groups` and similar. Numeric values are strings in workflow expressions. “Resolved” does not mean independently verified fixed. Compare equivalent jobs with comparable log coverage.

Reports and outputs are emitted even if a selected threshold returns exit code 1. Invalid inputs return a failed step without a report. Job summaries are truncated at about 900 KiB; the JSON artifact retains the bounded full report.

## Permissions and fork PRs

Local analysis needs no token; checkout needs `contents: read`. `github-run` for private runs needs `actions: read` on the selected repository. PR reports need a `pull_request` event, `pull-requests: write`, and `token: ${{ github.token }}`. No permissions are broadened by CIFuse.

Fork PRs normally receive a read-only token. Leave `comment: false` there and use the job summary/artifact. Example guard for comment mode:

```yaml
comment: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository }}
```

Do not move untrusted checkout/test execution to `pull_request_target` to obtain write permission. The Action never runs CLI repair or validation commands. Optional comments can expose diagnostic evidence in the PR; review redaction limits before enabling them for private source.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No report after failed tests | Add the `!cancelled()` / existing-log condition shown above; ensure the log exists. |
| `Provide either log or github-run` | Select one source; don't pass both. |
| Source checkout mismatch | Use the exact SHA corresponding to the checked-out code and logs. |
| Missing source snippet | Source may be omitted by size/type limits, generated, absolute or outside the supplied checkout. |
| GitHub 403/404 | Check token permissions, repository access, event type and fork restrictions. |
| JSON artifact absent | Check `output`, the threshold/input result and the upload step condition. |
| No signals | Inspect original logs; unsupported formats and clean logs both produce no signals. |

Log limits: 100 files / 5 MiB combined; 10 retained locations per group. Source limits: 500 tracked files / 4 MiB combined / 128 KiB per file. Dependency/build directories and symlinks are skipped. Source checks and investigation ranking are heuristic, not a full language server or proof of causality. Best-effort credential redaction is not a secret scanner.

[Repair and validation CLI](REPAIR.md) · [Limitations](LIMITATIONS.md) · [Security reporting](../SECURITY.md)
