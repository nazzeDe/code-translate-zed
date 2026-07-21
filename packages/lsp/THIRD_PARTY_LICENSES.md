# Third-Party Licenses and Provenance

This file is shipped with the npm language-server package so published dictionary data carries its required notices. The named upstream authors and projects are not participants in, and do not endorse, this Zed extension.

## New implementation code

Copyright (c) 2026 nazzeDe. New implementation code in this package is licensed under the MIT License in `LICENSE`.

## Original Code Translate VS Code plugin

The original plugin is <https://github.com/w88975/code-translate-vscode>. Its `LICENSE` identifies w88975's original code as MIT licensed:

```text
MIT License

Copyright (c) [2020] [w88975]

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## humps identifier splitting source

The inspected original plugin includes the following humps notice:

```text
humps is copyright © 2012+ Dom Christie
Released under the MIT license.
```

The upstream project is <https://github.com/domchristie/humps>. The Zed package contains a new splitter implementation; this attribution remains because the splitting behavior was adapted from the original plugin's humps-based behavior.

## ECDICT dictionary data

The transformed dictionary data originates from <https://github.com/skywind3000/ECDICT>. Its authoritative license is <https://github.com/skywind3000/ECDICT/blob/master/LICENSE>. ECDICT documents the `ecdict.csv` fields `word`, `phonetic`, `definition`, and `translation`; this package transforms relevant values into 674 two-letter JSON files. For an auditable example, ECDICT's `abandon` row maps to `dict/ab.json` as the `abandon` key with `p` and `t` values.

The ECDICT notice is retained here:

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

The original plugin README's “340 万+” dictionary description is recorded as source-project provenance, not as an independently verified count claim by this package. ECDICT and its maintainers are not represented as participating in or endorsing this project.
