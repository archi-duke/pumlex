import * as vscode from 'vscode';
import { findNthPlantumlBlock } from './markdownUtils';

// Spawns a WebviewPanel containing an iframe to plantumlEx /edit?embed=1.
// Bridges postMessage between the iframe and the extension host:
//
//   iframe (plantumlEx editor)  ⇄  panel webview  ⇄  extension host
//
// Editor protocol (defined by plantumlEx):
//   pex-ready              editor → host: ready to receive source
//   pex-load { source }    host  → editor: source to edit
//   pex-source-updated { source }
//                          editor → host: user clicked ✓ 적용 후 닫기
//   pex-cancel             editor → host: editor closed without commit

export interface OpenEditorPanelOpts {
  serverUrl: string;
  source: string;
  targetUri: vscode.Uri;
  blockIndex: number;
}

export function openEditorPanel(
  _context: vscode.ExtensionContext,
  opts: OpenEditorPanelOpts,
): vscode.WebviewPanel {
  // Open the editor in the same column the user clicked from (the markdown
  // preview's column) rather than splitting beside it. When the user closes
  // the editor, the previous tab in that column (the markdown preview) is
  // restored automatically — no extra column shuffling.
  const panel = vscode.window.createWebviewPanel(
    'pumlex.editor',
    `pumlex: 블록 #${opts.blockIndex + 1}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  panel.webview.html = buildPanelHtml(opts.serverUrl, opts.source);

  // Round-trip: when the iframe sends a `pex-source-updated`, the bridging
  // script in the panel forwards it via vscode.postMessage. We resolve the
  // current block range from `targetUri` (it may have shifted if the user
  // edited the markdown elsewhere meanwhile) and apply a WorkspaceEdit.
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'pex-source-updated' && typeof msg.source === 'string') {
      const doc = await vscode.workspace.openTextDocument(opts.targetUri);
      const block = findNthPlantumlBlock(doc, opts.blockIndex);
      if (!block) {
        vscode.window.showWarningMessage(
          `pumlex: 블록 #${opts.blockIndex + 1}을 다시 찾지 못했습니다. 변경 사항이 반영되지 않았습니다.`,
        );
        return;
      }
      const edit = new vscode.WorkspaceEdit();
      // The plantumlEx editor returns source-with-meta as-is (no trailing
      // newline). The block range we compute spans body lines exclusive of
      // both fences. Replacing the range preserves the surrounding fences.
      edit.replace(opts.targetUri, block.range, msg.source.replace(/\n+$/, ''));
      const ok = await vscode.workspace.applyEdit(edit);
      if (ok) {
        vscode.window.showInformationMessage(
          `pumlex: 블록 #${opts.blockIndex + 1} 갱신됨. Cmd+S로 저장하세요.`,
        );
        panel.dispose();
      } else {
        vscode.window.showErrorMessage('pumlex: WorkspaceEdit 실패');
      }
    } else if (msg.type === 'pex-cancel') {
      // user closed the editor without committing — leave panel open or close it
      // (closing here so the user gets a clean state)
    }
  });

  return panel;
}

function buildPanelHtml(serverUrl: string, initialSource: string): string {
  // CSP: allow framing the plantumlEx server. `script-src 'unsafe-inline'`
  // is required for the small bridging script we inline below; using a
  // nonce would be cleaner but adds complexity for a PoC.
  const csp = [
    `default-src 'none'`,
    `frame-src ${serverUrl}`,
    `script-src 'unsafe-inline'`,
    `style-src 'unsafe-inline'`,
  ].join('; ');

  // JSON-encode source for safe inlining as a JS string literal.
  const sourceLiteral = JSON.stringify(initialSource);
  const iframeSrc = `${serverUrl}/edit?embed=1`;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>pumlex editor</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100vh; overflow: hidden; background: #fff; }
    iframe { border: 0; width: 100%; height: 100%; }
    .pumlex-msg { padding: 8px 12px; font: 12px system-ui, sans-serif; background: #fffbe8; border-bottom: 1px solid #fde68a; color: #7c2d12; display: none; }
    .pumlex-msg.shown { display: block; }
  </style>
</head>
<body>
  <div id="msg" class="pumlex-msg"></div>
  <iframe id="ed" src="${iframeSrc}"></iframe>
  <script>
    (function () {
      const vscode = acquireVsCodeApi();
      const iframe = document.getElementById('ed');
      const msgEl = document.getElementById('msg');
      const SOURCE = ${sourceLiteral};

      function showMsg(text) {
        msgEl.textContent = text;
        msgEl.classList.add('shown');
      }

      window.addEventListener('message', (e) => {
        const d = e.data;
        if (!d || typeof d !== 'object') return;
        if (d.type === 'pex-ready') {
          // Editor reports it loaded and is ready to receive source
          iframe.contentWindow.postMessage({ type: 'pex-load', source: SOURCE }, '*');
          showMsg('편집 후 우상단 ✓ 적용 후 닫기를 누르면 마크다운 파일에 자동 반영됩니다.');
        } else if (d.type === 'pex-source-updated' && typeof d.source === 'string') {
          vscode.postMessage({ type: 'pex-source-updated', source: d.source });
        } else if (d.type === 'pex-cancel') {
          vscode.postMessage({ type: 'pex-cancel' });
        }
      });

      // Server-can't-reach fallback: if the iframe's plantumlEx editor never
      // sends pex-ready within 5s, surface a warning.
      setTimeout(() => {
        if (!msgEl.classList.contains('shown')) {
          showMsg('⚠ plantumlEx 서버(${serverUrl})에서 응답이 없습니다. 서버가 실행 중인지 확인하세요.');
        }
      }, 5000);
    })();
  </script>
</body>
</html>`;
}
