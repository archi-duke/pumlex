import * as crypto from 'crypto';
import * as vscode from 'vscode';

// markdown-it plugin: replaces ```plantuml``` fenced blocks with an inline
// SVG fetched from plantumlEx /render-with-layout, so the SVG becomes part
// of the markdown preview's DOM (not sandboxed inside an <img>).
//
// Sync requirement: markdown-it's `renderer.rules.fence` must return a
// string immediately, but our render is async. Pattern:
//   1. cache hit  → return the cached SVG inline
//   2. cache miss → return a placeholder + kick off background fetch +
//      when fetch completes, trigger a markdown preview reload so the
//      next render swaps placeholder for SVG.

const cache = new Map<string, string>();    // sourceHash → SVG (or error svg)
const inFlight = new Set<string>();          // sourceHash currently being fetched

function hashSource(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function placeholderSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">`
    + `<rect width="200" height="40" fill="#f6f8fa" stroke="#d0d7de"/>`
    + `<text x="100" y="24" text-anchor="middle" font-family="system-ui" font-size="12" fill="#666">렌더링 중…</text>`
    + `</svg>`;
}

function errorSvg(msg: string): string {
  const safe = msg.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="60" viewBox="0 0 500 60">`
    + `<rect width="500" height="60" fill="#fef2f2" stroke="#fecaca"/>`
    + `<text x="10" y="24" font-family="system-ui" font-size="13" fill="#b91c1c" font-weight="bold">⚠ pumlex 렌더링 오류</text>`
    + `<text x="10" y="44" font-family="ui-monospace,Menlo,monospace" font-size="11" fill="#7f1d1d">${safe.slice(0, 100)}</text>`
    + `</svg>`;
}

async function fetchSvg(serverUrl: string, source: string): Promise<string> {
  const res = await fetch(serverUrl + '/render-with-layout', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: source,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 100)}`);
  }
  return await res.text();
}

export interface PluginOptions {
  serverUrl: string;
  /** Called whenever the cache gains a new entry — host should reload preview. */
  onCacheUpdate: () => void;
}

export function createMarkdownItPlugin(opts: PluginOptions) {
  // Returns a function compatible with `extendMarkdownIt(md)` from VS Code's
  // markdown extension contribution. Defensive throughout — if our rule
  // throws or md is in an unexpected shape, we fall back to delegating to
  // the original fence rule rather than letting the entire markdown engine
  // crash ("An unexpected error occurred while restoring the Markdown
  // preview" / Cannot read properties of undefined / etc.).
  return (md: any) => {
    if (!md || !md.renderer || !md.renderer.rules) return md;
    const origFence = md.renderer.rules.fence;
    const fallbackFence = (tokens: any, idx: number, _opt: any, _env: any, slf: any) => {
      // Delegate to the existing rule when present, else minimal default.
      if (origFence) return origFence(tokens, idx, _opt, _env, slf);
      const token = tokens[idx];
      const lang = (token.info || '').trim();
      const cls = lang ? ` class="language-${escapeAttr(lang)}"` : '';
      return `<pre><code${cls}>${escapeAttr(token.content)}</code></pre>\n`;
    };

    md.renderer.rules.fence = (tokens: any, idx: number, options: any, env: any, slf: any) => {
      try {
        const token = tokens[idx];
        if (!token || typeof token.info !== 'string') return fallbackFence(tokens, idx, options, env, slf);
        const lang = token.info.trim().toLowerCase();
        if (lang !== 'plantuml' && lang !== 'puml') {
          return fallbackFence(tokens, idx, options, env, slf);
        }
        const source = token.content;
        const hash = hashSource(source);

        env = env || {};
        env.__pumlexBlockIndex = (env.__pumlexBlockIndex || 0);
        const blockIndex = env.__pumlexBlockIndex++;

        const dataAttrs =
            ` data-source-hash="${hash}"`
          + ` data-block-index="${blockIndex}"`
          + ` data-block-source-encoded="${encodeURIComponent(source)}"`;

        if (cache.has(hash)) {
          const svg = cache.get(hash)!;
          return `<div class="pumlex-block"${dataAttrs}>${svg}</div>`;
        }

        if (!inFlight.has(hash)) {
          inFlight.add(hash);
          fetchSvg(opts.serverUrl, source)
            .then((svg) => { cache.set(hash, svg); })
            .catch((e) => { cache.set(hash, errorSvg(e?.message || String(e))); })
            .finally(() => {
              inFlight.delete(hash);
              try { opts.onCacheUpdate(); } catch { /* ignore */ }
            });
        }
        return `<div class="pumlex-block pumlex-loading"${dataAttrs}>${placeholderSvg()}</div>`;
      } catch (e) {
        console.error('pumlex fence rule error', e);
        return fallbackFence(tokens, idx, options, env, slf);
      }
    };
    return md;
  };
}

/** Invalidate cache entries — call on extension reactivation or settings change. */
export function clearPumlexCache() {
  cache.clear();
}

/** Trigger preview reload after a cache update. */
export function refreshActiveMarkdownPreview() {
  vscode.commands.executeCommand('markdown.api.reloadPlugins');
}
