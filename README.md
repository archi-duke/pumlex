# pumlex

VS Code extension for [plantumlEx](https://github.com/archi-duke/plantumlEx) — inline plantuml layout editing inside the built-in Markdown preview.

## Status

PoC scaffolding — Step 1: hello-world activation.

Roadmap:

1. ✅ Scaffold (this commit)
2. ⏳ Markdown preview script that scans ` ```plantuml ` blocks and renders via plantumlEx server
3. ⏳ Inline `PexInline.activate` overlay with ✎ / ✓ 완료 buttons
4. ⏳ `pumlex.updateBlock` command that round-trips edited source back into the markdown file via `WorkspaceEdit`

## Requirements

- A running plantumlEx server (default `http://localhost:3030`). See [archi-duke/plantumlEx](https://github.com/archi-duke/plantumlEx).
- VS Code 1.80+

## Settings

| Setting | Default | Description |
|---|---|---|
| `pumlex.serverUrl` | `http://localhost:3030` | plantumlEx server base URL. |

## Develop

```bash
npm install
npm run compile          # builds out/extension.js
# F5 in VS Code → launches an "Extension Development Host" window
```

In the dev host window: open any `.md` file, then run "**pumlex: Hello**" from the command palette to verify the extension loaded.
