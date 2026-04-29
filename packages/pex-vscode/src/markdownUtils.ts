import * as vscode from 'vscode';

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

export function findNthPlantumlBlock(
  doc: vscode.TextDocument,
  index: number,
): PlantumlBlockRange | null {
  let n = 0;
  let openLine = -1;
  for (let i = 0; i < doc.lineCount; i++) {
    const text = doc.lineAt(i).text;
    if (openLine === -1) {
      if (FENCE_OPEN.test(text)) {
        openLine = i;
      }
    } else {
      if (FENCE_CLOSE.test(text)) {
        if (n === index) {
          // Body range: lines (openLine + 1) .. (i - 1) inclusive.
          // Use Position(openLine + 1, 0) → Position(i, 0) so a replacement
          // doesn't include the fence lines themselves and keeps trailing \n
          // formatting consistent with how the source was extracted.
          const start = new vscode.Position(openLine + 1, 0);
          const end = new vscode.Position(i, 0);
          // Trim the trailing newline of the body so getText(range) matches
          // the source as the preview script saw it (without the final \n
          // that bumps the cursor onto the closing fence line).
          // Strategy: use range that ends at end of previous line.
          const bodyEnd = i > openLine + 1
            ? new vscode.Position(i - 1, doc.lineAt(i - 1).text.length)
            : start;
          return { range: new vscode.Range(start, bodyEnd), openLine, closeLine: i };
        }
        n++;
        openLine = -1;
      }
    }
  }
  return null;
}
