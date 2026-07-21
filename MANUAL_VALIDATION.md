# Manual Validation

## Zed Hover Coexistence

- Status: Passed on 2026-07-21
- Zed version: 1.11.3
- Platform: Linux, Hyprland/Wayland

The local bootstrap installed `code-translate-lsp@0.1.0` into Zed's extension work directory, and `zed: install dev extension` successfully compiled and loaded `packages/zed`.

- Rust: `calculate_user_count` displayed the offline translation alongside rust-analyzer's function signature in a minimal Cargo project.
- TypeScript: `calculateUserCount` displayed the offline translation alongside VTSLS's function signature.
- Python: `calculate_user_count` displayed the offline translation alongside basedpyright's function signature.
- Markdown: `calculate_user_count` displayed the offline translation in inline code.
- Compound identifiers rendered the matched `calculate`, `user`, and `count` entries with phonetics and Chinese translations.
- `zed: open log` showed the server launching through Zed's managed Node.js path and the bootstrapped `dist/server.js`. No persistent installation, protocol, crash, or restart-loop errors were attributable to Code Translate.

An initial standalone Rust fixture produced an unrelated rust-analyzer workspace-discovery error; repeating the check inside a minimal Cargo project confirmed coexistence. Zed also logged one unrelated capability-unregistration error while stopping another language server.

These checks are manual results and remain outside the automated validation suite.
