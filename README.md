# Code Translate for Zed

Code Translate adds offline identifier translation to Zed Hover. Move the pointer over a code identifier and the language server shows Chinese translations for the dictionary matches in that identifier. Matching components are linked to Google Translate for optional follow-up lookup; the extension itself does not call an online translation API.

The project is an independent Zed implementation. The original VS Code plugin, humps, and ECDICT sources are credited in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md); those upstream authors and projects do not participate in or endorse this extension.

## Supported Languages

The `code-translate` language server is registered for exactly:

- Rust
- Python
- Go
- JavaScript
- TypeScript
- Markdown

JSX and TSX are not registered. Other languages are outside the current release.

## Behavior

- Hovering an identifier uses the text document and the cursor position to find the complete identifier.
- CamelCase, PascalCase, acronyms, underscores, and hyphens can be split into lookup components.
- Only dictionary matches are shown. Unknown words and unmatched components are omitted.
- A partial match can produce a partial Hover; an identifier with no matches produces no translation Hover.
- Pure numbers, text with no ASCII English letters, punctuation, and positions outside an identifier produce no translation Hover.
- Dictionary data is read locally and lazily from the packaged files. Code content is not sent to a translation service.
- The extension is an additional language server, so existing language-server Hover information is intended to remain available alongside translation Hover.

Zed cannot provide arbitrary editor selections to this generic Hover language-server interface. The release therefore translates identifiers under the cursor, not arbitrary selected text.

## Explicit Limitations

The current extension does not provide:

- arbitrary selection translation
- selection replacement
- command-palette or editor commands
- status-bar indicators or other status UI
- custom panels, popups, or other custom UI
- online translation APIs

Clicking a dictionary match can open its Google Translate URL in a browser. That browser action is separate from the extension's offline dictionary operation.

## Architecture

The repository contains two cooperating packages:

1. `packages/zed` is the Rust/Wasm Zed extension wrapper. It registers the language server for the supported languages, requests the Node.js runtime managed by Zed, and resolves the packaged server entry at `node_modules/code-translate-lsp/dist/server.js`.
2. `packages/lsp` is the Node.js Language Server Protocol service. It receives documents over stdio, handles UTF-16 positions and Hover ranges, splits identifiers, and lazily reads the two-letter dictionary partitions.

End users install the Zed extension after the npm language-server package is published. They do not run the local bootstrap workflow or install a separate Node.js runtime.

## Development

Prerequisites are Node.js with npm and Rust with the `wasm32-wasip2` target. Install dependencies from the repository root:

```sh
npm install
```

Run the Node checks and build:

```sh
npm test
npm run lint
npm run format
npm run build
```

Run the Zed wrapper checks:

```sh
npm run format:zed
npm run check:zed
npm run check:zed:wasm
```

### Local unpublished package

Before `code-translate-lsp` exists in npm, bootstrap installs the local `npm pack` artifact into Zed's private extension work directory. This is a development-only workflow for maintainers and is not required by end users:

```sh
npm run bootstrap
```

The command builds and packs `packages/lsp`, then installs the tarball at the layout expected by the wrapper:

```text
<Zed data directory>/extensions/work/code-translate/
  node_modules/code-translate-lsp/dist/server.js
```

To test without writing to real Zed data, set `ZED_EXTENSION_WORK_DIR` to the extension work directory or pass `--work-dir`:

```sh
ZED_EXTENSION_WORK_DIR="$(mktemp -d)" npm run bootstrap
npm run bootstrap -- --work-dir /tmp/code-translate-zed-work
```

On PowerShell:

```powershell
$env:ZED_EXTENSION_WORK_DIR = (Join-Path $env:TEMP "code-translate-zed-work")
npm run bootstrap
```

The bootstrap is idempotent for an already installed package version. It is intended for local pre-publication validation only.

### Install the development extension

After bootstrap completes, open this repository in Zed and run `zed: install dev extension` from the command palette. Select the `packages/zed` directory. Open a Rust, TypeScript, Python, or Markdown file and use the pending checklist in [MANUAL_VALIDATION.md](MANUAL_VALIDATION.md) to verify Hover behavior and coexistence with the native language server.

### Logs

Use `zed: open log` from the command palette while validating the development extension. Check for persistent language-server restart, protocol, or installation errors. The manual coexistence check is intentionally recorded as pending until it is run in Zed; it is not represented as an automated test result.

## Release Workflow

Release validation must pass from a clean checkout before publication:

1. Run the Node tests, lint, production build, and format checks.
2. Run Rust formatting, locked native checks, and the locked `wasm32-wasip2` check.
3. Run the structured extension manifest validation and npm package dry-run.
4. Confirm the package contains the built `dist/server.js`, exactly 674 dictionary files, and the required license and provenance notices.
5. Complete the manual Zed Hover and coexistence checklist separately.

The npm package and Zed extension are released in separate steps. After the package is genuinely ready for publication and its package metadata permits publication, publish the language server from the workspace:

```sh
npm publish --workspace packages/lsp
```

This repository does not publish the package automatically from local development and does not submit a Registry change as part of the npm release. After npm publication, prepare the later Zed Extensions Registry PR using the monorepo subdirectory path `packages/zed`. The extension ID is `code-translate`; once submitted to the Registry, that ID is immutable and must not be renamed.

See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for the original plugin, humps, and ECDICT notices and provenance evidence.
