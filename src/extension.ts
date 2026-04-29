import * as vscode from 'vscode';

// Step 1 — minimal extension that activates when a markdown file is opened.
// Subsequent steps will add the markdown-preview script + the
// `pumlex.updateBlock` command that writes edited source back into the file
// via `WorkspaceEdit.applyEdit`.

export function activate(context: vscode.ExtensionContext) {
  console.log('pumlex: activated');

  const hello = vscode.commands.registerCommand('pumlex.hello', () => {
    const cfg = vscode.workspace.getConfiguration('pumlex');
    const serverUrl = cfg.get<string>('serverUrl') || '(unset)';
    vscode.window.showInformationMessage(`pumlex active. server: ${serverUrl}`);
  });
  context.subscriptions.push(hello);
}

export function deactivate() { /* no-op */ }
