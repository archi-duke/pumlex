import * as vscode from 'vscode';
import { findNthPlantumlBlock } from './markdownUtils';
import { openEditorPanel } from './editorPanel';
import {
  createMarkdownItPlugin,
  clearPumlexCache,
  clearPumlexErrors,
  refreshActiveMarkdownPreview,
  getPumlexCacheSize,
  getPumlexInFlightCount,
  getRefreshAttemptCount,
} from './markdownItPlugin';

// pumlex extension host.
//
// Why the URI scheme:
//   `command:` URIs in `markdown.previewScripts` contexts are restricted to
//   built-in markdown commands and we can't extend that allowlist as a
//   third-party. The supported channel from a markdown preview script to an
//   extension host is the `vscode://<publisher>.<ext>/...` URI scheme via
//   `window.registerUriHandler`. preview.js navigates to such a URI; this
//   handler parses the query string and runs the same business logic.

interface EditBlockArgs {
  blockIndex: number;
  source: string;
}

async function handleEditBlock(context: vscode.ExtensionContext, args: EditBlockArgs) {
  if (typeof args.blockIndex !== 'number' || typeof args.source !== 'string') {
    vscode.window.showErrorMessage('pumlex: invalid edit args');
    return;
  }
  // Find the markdown document that contains this block. Two-stage match:
  //   1) Strict: prefer a document whose Nth block content equals args.source.
  //      (Handles multiple markdown files open; picks the right one.)
  //   2) Lenient: if no strict match (preview img cached against an older
  //      source after a prior write-back, edited markdown text vs a stale
  //      preview, etc.), fall back to ANY visible markdown doc that has an
  //      Nth block — use the doc's CURRENT block text rather than args.source
  //      so the editor reflects what's actually on disk.
  const candidates: vscode.TextDocument[] = [];
  for (const ed of vscode.window.visibleTextEditors) {
    if (ed.document.languageId === 'markdown') candidates.push(ed.document);
  }
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === 'markdown' && !candidates.includes(doc)) candidates.push(doc);
  }

  let target: vscode.TextDocument | undefined;
  let sourceForEditor = args.source;

  // Stage 1: strict match
  target = candidates.find((doc) => {
    const r = findNthPlantumlBlock(doc, args.blockIndex);
    return r && doc.getText(r.range).trim() === args.source.trim();
  });

  // Stage 2: lenient — fall back to first candidate that has the Nth block
  if (!target) {
    for (const doc of candidates) {
      const r = findNthPlantumlBlock(doc, args.blockIndex);
      if (r) {
        target = doc;
        sourceForEditor = doc.getText(r.range);
        break;
      }
    }
  }

  if (!target) {
    vscode.window.showWarningMessage(
      `pumlex: 마크다운 문서에서 블록 #${args.blockIndex + 1}을 찾지 못했습니다. 문서가 열려있는지 확인하세요.`,
    );
    return;
  }
  const cfg = vscode.workspace.getConfiguration('pumlex');
  const serverUrl = cfg.get<string>('serverUrl') || 'http://localhost:3030';
  openEditorPanel(context, {
    serverUrl,
    source: sourceForEditor,
    targetUri: target.uri,
    blockIndex: args.blockIndex,
  });
}

export function activate(context: vscode.ExtensionContext) {
  console.log('pumlex: activated');

  const cfg = vscode.workspace.getConfiguration('pumlex');
  const serverUrl = cfg.get<string>('serverUrl') || 'http://localhost:3030';

  // Configuration changes invalidate the cache (server URL may have changed
  // → previously fetched SVGs are stale).
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('pumlex.serverUrl')) {
        clearPumlexCache();
        refreshActiveMarkdownPreview();
      }
    }),
  );

  // Build the markdown-it plugin once. The same instance is returned on each
  // `extendMarkdownIt` call from VS Code (which happens whenever a markdown
  // document needs to be rendered).
  const mdPlugin = createMarkdownItPlugin({
    serverUrl,
    onCacheUpdate: () => refreshActiveMarkdownPreview(),
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('pumlex.hello', () => {
      const cfg = vscode.workspace.getConfiguration('pumlex');
      const serverUrl = cfg.get<string>('serverUrl') || '(unset)';
      vscode.window.showInformationMessage(`pumlex active. server: ${serverUrl}`);
    }),
    vscode.commands.registerCommand('pumlex.clearCache', () => {
      const before = getPumlexCacheSize();
      clearPumlexCache();
      refreshActiveMarkdownPreview();
      vscode.window.showInformationMessage(
        `pumlex: cache cleared (${before} entries removed). 미리보기를 새로고침합니다.`,
      );
    }),
    vscode.commands.registerCommand('pumlex.showStatus', async () => {
      const cfg = vscode.workspace.getConfiguration('pumlex');
      const url = cfg.get<string>('serverUrl') || '(unset)';
      let serverStatus = '?';
      try {
        const r = await fetch(url + '/');
        serverStatus = r.ok ? `OK (HTTP ${r.status})` : `HTTP ${r.status}`;
      } catch (e: any) { serverStatus = `unreachable: ${e?.message || e}`; }
      const lines = [
        `serverUrl: ${url}`,
        `server reachable: ${serverStatus}`,
        `cache entries: ${getPumlexCacheSize()}`,
        `in-flight fetches: ${getPumlexInFlightCount()}`,
        `refresh attempts: ${getRefreshAttemptCount()}`,
      ];
      vscode.window.showInformationMessage('pumlex status:\n' + lines.join('\n'), { modal: true });
    }),
    // Internal command (palette-hidden via enablement: false). Useful for
    // direct testing — same code path that the URI handler uses.
    vscode.commands.registerCommand('pumlex.editBlock', (args: EditBlockArgs) => handleEditBlock(context, args)),
    // The actual entry point from the markdown preview: the preview script
    // navigates to `vscode://archi-duke.pumlex/edit?blockIndex=N&source=…`.
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri) {
        if (uri.path === '/edit') {
          const params = new URLSearchParams(uri.query);
          const blockIndex = parseInt(params.get('blockIndex') || '-1', 10);
          const source = params.get('source') || '';
          if (Number.isNaN(blockIndex) || blockIndex < 0 || !source) {
            vscode.window.showErrorMessage('pumlex: invalid edit URI parameters');
            return;
          }
          handleEditBlock(context, { blockIndex, source });
          return;
        }
        if (uri.path === '/retry') {
          const removed = clearPumlexErrors();
          refreshActiveMarkdownPreview();
          vscode.window.showInformationMessage(
            removed > 0
              ? `pumlex: ${removed}개의 오류 캐시 제거 → 재시도`
              : 'pumlex: 재시도할 오류 항목 없음',
          );
          return;
        }
        if (uri.path === '/commit') {
          const params = new URLSearchParams(uri.query);
          const blockIndex = parseInt(params.get('blockIndex') || '-1', 10);
          const source = params.get('source') || '';
          if (Number.isNaN(blockIndex) || blockIndex < 0 || !source) {
            vscode.window.showErrorMessage('pumlex: invalid commit URI parameters');
            return;
          }
          commitInlineEdit(context, { blockIndex, source });
          return;
        }
        vscode.window.showWarningMessage(`pumlex: unknown URI path ${uri.path}`);
      },
    }),
  );

  // Returning this object enables the markdown extension's
  // `markdown.markdownItPlugins: true` contribution. VS Code calls
  // extendMarkdownIt() with a markdown-it instance for our plugin to mutate.
  // MUST return the (mutated) `md` so downstream code (language server,
  // preview engine) can chain on it; returning undefined causes
  // "Cannot read properties of undefined (reading 'block')" upstream.
  return {
    extendMarkdownIt(md: any) {
      try { return mdPlugin(md); }
      catch (e) { console.error('pumlex extendMarkdownIt failed', e); return md; }
    },
  };
}

// Round-trip when user clicks ✓ on the inline editor: locate the matching
// markdown block by blockIndex and replace its body with the new source.
async function commitInlineEdit(
  _context: vscode.ExtensionContext,
  args: EditBlockArgs,
) {
  // Same lookup logic as handleEditBlock — find a markdown document that
  // has an Nth plantuml block, prefer visible editors first.
  const candidates: vscode.TextDocument[] = [];
  for (const ed of vscode.window.visibleTextEditors) {
    if (ed.document.languageId === 'markdown') candidates.push(ed.document);
  }
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === 'markdown' && !candidates.includes(doc)) candidates.push(doc);
  }
  let target: vscode.TextDocument | undefined;
  for (const doc of candidates) {
    if (findNthPlantumlBlock(doc, args.blockIndex)) { target = doc; break; }
  }
  if (!target) {
    vscode.window.showWarningMessage(
      `pumlex: 마크다운 문서에서 블록 #${args.blockIndex + 1}을 찾지 못했습니다.`,
    );
    return;
  }
  const block = findNthPlantumlBlock(target, args.blockIndex);
  if (!block) return;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(target.uri, block.range, args.source.replace(/\n+$/, ''));
  const ok = await vscode.workspace.applyEdit(edit);
  if (ok) {
    // applyEdit changes the document text, which itself triggers VS Code's
    // markdown extension to re-render the preview. Calling our own
    // refreshActiveMarkdownPreview() on top of that double-fires the
    // refresh and can cause unchanged blocks to briefly flash a
    // placeholder during DOM swap. Trust the natural re-render.
    //
    // Cache is intentionally NOT cleared: the changed block has a new
    // source-hash that auto-fetches; unchanged blocks keep cache hits.
    vscode.window.showInformationMessage(
      `pumlex: 블록 #${args.blockIndex + 1} 갱신됨. Cmd+S로 저장하세요.`,
    );
  } else {
    vscode.window.showErrorMessage('pumlex: WorkspaceEdit 실패');
  }
}

export function deactivate() { /* no-op */ }
