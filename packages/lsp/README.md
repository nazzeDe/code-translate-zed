# code-translate-lsp

`code-translate-lsp` is the Node.js language server used by the
[Code Translate extension for Zed](https://github.com/nazzeDe/code-translate-zed).
It provides offline Chinese translations for identifier components through
Language Server Protocol Hover responses.

The Zed extension installs and starts this package automatically. The server
uses the local dictionary files included in the npm package and does not send
source code to an online translation service.

## Usage

The server communicates over standard input and output:

```sh
node node_modules/code-translate-lsp/dist/server.js --stdio
```

For supported languages, behavior, development instructions, and release
information, see the
[project repository](https://github.com/nazzeDe/code-translate-zed).

## License

The package is distributed under the MIT License. Dictionary and upstream
attribution are documented in `THIRD_PARTY_LICENSES.md`.
