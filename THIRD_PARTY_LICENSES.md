# Third-Party Licenses and Provenance

The Zed extension and its npm language-server package contain new implementation code, adapted identifier-splitting behavior, and transformed dictionary data. These notices preserve the relevant licenses and distinguish those sources. The named upstream authors and projects are not participants in, and do not endorse, this Zed extension.

## New implementation code

Copyright (c) 2026 nazzeDe. New implementation code in this repository is licensed under the MIT License in `LICENSE`.

## Original Code Translate VS Code plugin

The original plugin is published at <https://github.com/w88975/code-translate-vscode>. Its upstream [LICENSE](https://github.com/w88975/code-translate-vscode/blob/master/LICENSE) and [README](https://github.com/w88975/code-translate-vscode/blob/master/README.md) identify the original copyright holder as w88975 and describe the project as MIT licensed.

The original notice is retained here:

```text
MIT License

Copyright (c) [2020] [w88975]

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

The original plugin README describes its offline dictionary as containing “340 万+” entries. That statement is retained as provenance for the original plugin's description, not as an independent count claim by this project.

## humps identifier splitting source

The inspected original plugin includes `src/humps.js`, whose header states:

```text
humps is copyright © 2012+ Dom Christie
Released under the MIT license.
```

The upstream project is <https://github.com/domchristie/humps>, whose package metadata identifies Dom Christie as author and MIT as the license. The related original `src/format.js` uses humps for camel-case, Pascal-case, underscore, and hyphen splitting. The Zed implementation is a new implementation of its own splitter, but this attribution remains with the adapted splitting behavior.

## ECDICT dictionary data

The dictionary data source is <https://github.com/skywind3000/ECDICT>, specifically its `ecdict.csv` and MIT license at <https://github.com/skywind3000/ECDICT/blob/master/LICENSE>. The license currently states:

```text
MIT License

Copyright (c) 2025 Linwei

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

ECDICT documents the CSV schema as `word`, `phonetic`, `definition`, `translation`, and related fields. This repository transforms the relevant word, phonetic, and translation values into 674 two-letter JSON files under `packages/lsp/dict`. For example, ECDICT's `abandon` row maps to `packages/lsp/dict/ab.json` as the `abandon` key with `p` (phonetic) and `t` (translation) values. The 674 partition files in this repository match the corresponding 674 files in the inspected original plugin, which provides the provenance link between the original plugin's dictionary and ECDICT's documented schema.

This notice records source and transformation evidence; it does not claim that ECDICT maintainers participated in or endorse this project.
