import * as vscode from 'vscode';
import { hashSource } from './hash';

// Locate the Nth ```plantuml``` block in a markdown document and return the
// range of its body content (the lines between the opening and closing
// fences, exclusive of the fence lines themselves). Returns `null` if the
// document doesn't have that many plantuml blocks.
//
// Block fences supported: ```plantuml, ```puml (case-insensitive). The
// closing fence is the next line that starts with ``` regardless of any
// trailing language tag.
export interface PlantumlBlockRange {
  /** Range covering the body lines (between the opening and closing fences). */
  range: vscode.Range;
  /** Line index of the opening ```plantuml fence. */
  openLine: number;
  /** Line index of the closing ``` fence. */
  closeLine: number;
}

const FENCE_OPEN = /^[ \t]*```\s*(plantuml|puml)\b/i;
const FENCE_CLOSE = /^[ \t]*```\s*$/;

function bodyRangeFromFences(
  doc: vscode.TextDocument,
  openLine: number,
  closeLine: number,
): vscode.Range {
  const start = new vscode.Position(openLine + 1, 0);
  const bodyEnd = closeLine > openLine + 1
    ? new vscode.Position(closeLine - 1, doc.lineAt(closeLine - 1).text.length)
    : start;
  return new vscode.Range(start, bodyEnd);
}

export function findNthPlantumlBlock(
  doc: vscode.TextDocument,
  index: number,
): PlantumlBlockRange | null {
  let n = 0;
  let openLine = -1;
  for (let i = 0; i < doc.lineCount; i++) {
    const text = doc.lineAt(i).text;
    if (openLine === -1) {
      if (FENCE_OPEN.test(text)) openLine = i;
    } else if (FENCE_CLOSE.test(text)) {
      if (n === index) {
        return { range: bodyRangeFromFences(doc, openLine, i), openLine, closeLine: i };
      }
      n++;
      openLine = -1;
    }
  }
  return null;
}

// Walk every ```plantuml``` fence in the document and return the first whose
// body hashes to `sourceHash`. Used by commit-side lookup so the right fence
// is picked even when the user has multiple .md files open and the previewed
// one isn't in `visibleTextEditors`. The plugin (`markdownItPlugin.ts`)
// stamps the hash into `data-source-hash`; the preview script forwards it on
// the commit URI; this function inverts that mapping.
export function findPlantumlBlockBySourceHash(
  doc: vscode.TextDocument,
  sourceHash: string,
): PlantumlBlockRange | null {
  let openLine = -1;
  for (let i = 0; i < doc.lineCount; i++) {
    const text = doc.lineAt(i).text;
    if (openLine === -1) {
      if (FENCE_OPEN.test(text)) openLine = i;
    } else if (FENCE_CLOSE.test(text)) {
      const lines: string[] = [];
      for (let j = openLine + 1; j < i; j++) lines.push(doc.lineAt(j).text);
      if (hashSource(lines.join('\n')) === sourceHash) {
        return { range: bodyRangeFromFences(doc, openLine, i), openLine, closeLine: i };
      }
      openLine = -1;
    }
  }
  return null;
}
