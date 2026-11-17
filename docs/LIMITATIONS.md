# Scope and limitations

CIFuse 0.2 adds bounded source inspection and a narrow validated repair flow. Its small reproducible tool-output benchmark is not evidence of general accuracy, time savings or adoption.

- Rules detect line-level text patterns, not causality. They can produce false positives and miss unsupported formats. A clean report is not a successful build.
- One line is assigned to the first matching rule. Specific patterns precede the fallback. Repeated groups are not necessarily separate root causes.
- Signatures remove timestamps, normalize numeric tokens and whitespace, and preserve the remaining text. This can merge messages that differ only in numbers. Source location changes usually preserve a signature, but absolute path changes or wording changes may create a new one.
- Baseline comparison is set comparison of signatures, not an incident history. “Resolved” means absent from the provided logs, not verified fixed. Compare equivalent jobs and log coverage. The UI reports a resolved count, not the old evidence.
- Redaction covers common GitHub tokens, AWS access IDs, bearer tokens, named secret assignments, URL passwords and selected query parameters. Arbitrary credentials, private keys, personal data and secrets split across lines may remain. Review exports and job summaries before sharing.
- Up to 100 UTF-8 text logs and 5 MiB combined; 10 retained locations and 1,200 characters per evidence/context line. Counts still include all matched lines.
- Browser logs are held in memory, with language preference in localStorage. No analytics, remote fonts, application API calls or log uploads. Static hosting still receives ordinary page requests. Browser extensions and the hosting environment are outside this boundary.
- Node.js 22+ is required. The composite Action runs a separate Node child process with argument arrays and does not execute content from the logs. It changes the job's Node version to 22 using setup-node. The CLI accepts regular log files and stdin. Optional repository analysis reads at most 500 tracked text files / 4 MiB total / 128 KiB each, skipping symlinks and dependency/build directories; it may omit relevant files. The browser accepts a local source folder with the same size limits. It does not unpack archives.
- Source checks use textual import matching, not an AST or full language server. Unresolved imports may be generated or aliased. Only supported, unambiguous import casing changes are repaired. A passing selected command does not prove every behavior is correct. See [repair limits](REPAIR.md).
- Investigation priority is heuristic. Later exit-code messages are possible consequences, not a proven dependency graph.
- Optional GitHub operations make network requests; comments and repair PRs require explicit options and appropriate credentials.
- The project is independent of GitHub. GitHub Pro and Developer Program membership do not imply endorsement or additional capabilities in this tool.
