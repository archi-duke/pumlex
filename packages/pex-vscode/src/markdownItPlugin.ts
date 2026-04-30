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

type CacheEntry =
  | { type: 'svg'; content: string; ts: number }
  | { type: 'render-error'; content: string; ts: number }       // PlantUML syntax / source issue
  | { type: 'connection-error'; content: string; ts: number };  // plantumlEx server unreachable

const cache = new Map<string, CacheEntry>();
// Track the timestamp (ms since epoch) when each in-flight fetch started, so
// the loading placeholder can show a stable elapsed-time count even though
// the preview re-renders every 120ms while waiting.
const inFlight = new Map<string, number>();

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

// Placeholder shown while a fetch is in flight. The spinner is pure SVG
// (animateTransform) so it animates without preview.js — useful in the
// brief window before the webview script has bound. preview.js then
// updates the .pumlex-elapsed tspan from the wrapping block's
// data-pumlex-loading-start attribute, so the elapsed counter survives
// the 120ms refresh loop.
function placeholderSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="40" viewBox="0 0 260 40">`
    + `<rect width="260" height="40" fill="#f6f8fa" stroke="#d0d7de"/>`
    + `<g>`
    + `<circle cx="20" cy="20" r="8" fill="none" stroke="#9ca3af" stroke-width="2" stroke-dasharray="6 6">`
    + `<animateTransform attributeName="transform" type="rotate" from="0 20 20" to="360 20 20" dur="1s" repeatCount="indefinite"/>`
    + `</circle>`
    + `</g>`
    + `<text x="40" y="24" font-family="system-ui" font-size="12" fill="#666">`
    + `렌더링 중… <tspan class="pumlex-elapsed">0.0s</tspan>`
    + `</text>`
    + `</svg>`;
}

function renderErrorSvg(msg: string): string {
  const safe = escapeAttr(msg);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="60" viewBox="0 0 500 60">`
    + `<rect width="500" height="60" fill="#fef2f2" stroke="#fecaca"/>`
    + `<text x="10" y="24" font-family="system-ui" font-size="13" fill="#b91c1c" font-weight="bold">⚠ pumlex 렌더링 오류</text>`
    + `<text x="10" y="44" font-family="ui-monospace,Menlo,monospace" font-size="11" fill="#7f1d1d">${safe.slice(0, 100)}</text>`
    + `</svg>`;
}

// HTML (not SVG) so we can include a real <a> retry button. Returned
// in place of the diagram when plantumlEx server is unreachable.
function connectionErrorHtml(serverUrl: string): string {
  return `<div class="pumlex-conn-error">`
    + `<div class="pumlex-conn-title">⚠ plantumlEx 서버에 연결할 수 없습니다</div>`
    + `<div class="pumlex-conn-url"><code>${escapeAttr(serverUrl)}</code></div>`
    + `<div class="pumlex-conn-hint">`
    + `다음 명령으로 서버를 시작하세요:<br>`
    + `<code>cd plantumlEx &amp;&amp; PORT=3030 PLANTUML_URL=http://localhost:8080 node server.js</code><br>`
    + `(<code>pumlex.serverUrl</code> 설정으로 다른 주소를 가리킬 수 있음)`
    + `</div>`
    + `<a href="vscode://archi-duke.pumlex/retry" class="pumlex-retry-btn">↻ 재시도</a>`
    + `</div>`;
}

function isConnectionError(e: any): boolean {
  const msg = String(e?.message ?? e ?? '');
  const code = e?.cause?.code ?? e?.code;
  return (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'EHOSTUNREACH' ||
    /fetch failed/i.test(msg) ||
    /Failed to fetch/i.test(msg) ||
    /ENETUNREACH/i.test(msg)
  );
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

export type FenceMatching = 'all' | 'marker';

export interface PluginOptions {
  serverUrl: string;
  /** Strategy for which ```plantuml fences this plugin claims. */
  fenceMatching: FenceMatching;
  /** Called whenever the cache gains a new entry — host should reload preview. */
  onCacheUpdate: () => void;
}

// Source already has a meta block that pumlex previously embedded — treat
// the fence as pumlex-owned regardless of fence-matching mode. Mirrors the
// presence check in pex-core/meta.js (extractMeta uses indexOf on this same
// literal). Robust to leading whitespace because the string is the meta
// block's own opening line.
function sourceHasPumlexMeta(source: string): boolean {
  return source.indexOf("' @startmeta") !== -1;
}

// Tokenize a fence info string. ` ```plantuml pumlex foo ` → ['plantuml','pumlex','foo'].
function tokenizeInfo(info: string): string[] {
  return info.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function createMarkdownItPlugin(opts: PluginOptions) {
  return (md: any) => {
    if (!md || !md.renderer || !md.renderer.rules) return md;
    const origFence = md.renderer.rules.fence;
    const fallbackFence = (tokens: any, idx: number, _opt: any, _env: any, slf: any) => {
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
        // Inspect only the first whitespace-separated token for the language;
        // ` ```plantuml pumlex ` should still match `plantuml`. Earlier the rule
        // compared the whole info string and silently rejected anything past
        // the first word.
        const infoTokens = tokenizeInfo(token.info);
        const lang = infoTokens[0] || '';
        if (lang !== 'plantuml' && lang !== 'puml') {
          return fallbackFence(tokens, idx, options, env, slf);
        }
        const source = token.content;

        // Coexistence gate: in 'marker' mode require an explicit signal that
        // this fence is pumlex's. Two signals, OR-combined:
        //   1. info string contains the `pumlex` token   (user opt-in)
        //   2. source already has a `' @startmeta` block (sticky after first
        //      pumlex edit — keeps already-edited fences working even after
        //      the user switches to marker mode for jebbs.plantuml coexistence)
        if (opts.fenceMatching === 'marker') {
          const markerOptIn = infoTokens.includes('pumlex') || sourceHasPumlexMeta(source);
          if (!markerOptIn) return fallbackFence(tokens, idx, options, env, slf);
        }

        const hash = hashSource(source);

        env = env || {};
        env.__pumlexBlockIndex = (env.__pumlexBlockIndex || 0);
        const blockIndex = env.__pumlexBlockIndex++;

        const dataAttrs =
            ` data-source-hash="${hash}"`
          + ` data-block-index="${blockIndex}"`
          + ` data-block-source-encoded="${encodeURIComponent(source)}"`;

        const entry = cache.get(hash);
        if (entry) {
          if (entry.type === 'svg') {
            return `<div class="pumlex-block"${dataAttrs}>${entry.content}</div>`;
          }
          // error variants — keep dataAttrs so retry can identify the block
          return `<div class="pumlex-block pumlex-error-block"${dataAttrs}>${entry.content}</div>`;
        }

        if (!inFlight.has(hash)) {
          inFlight.set(hash, Date.now());
          fetchSvg(opts.serverUrl, source)
            .then((svg) => {
              cache.set(hash, { type: 'svg', content: svg, ts: Date.now() });
            })
            .catch((e) => {
              const conn = isConnectionError(e);
              cache.set(hash, {
                type: conn ? 'connection-error' : 'render-error',
                content: conn ? connectionErrorHtml(opts.serverUrl) : renderErrorSvg(e?.message || String(e)),
                ts: Date.now(),
              });
            })
            .finally(() => {
              inFlight.delete(hash);
              try { opts.onCacheUpdate(); } catch { /* ignore */ }
            });
        }
        const loadingStart = inFlight.get(hash) ?? Date.now();
        return `<div class="pumlex-block pumlex-loading"${dataAttrs} data-pumlex-loading-start="${loadingStart}">${placeholderSvg()}</div>`;
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

/** Drop only error entries — used by the `/retry` URI handler so the next
 * render re-fetches them. SVG entries are preserved (no flicker). */
export function clearPumlexErrors() {
  let n = 0;
  for (const [k, v] of cache.entries()) {
    if (v.type !== 'svg') { cache.delete(k); n++; }
  }
  return n;
}

export function getPumlexCacheSize() { return cache.size; }
export function getPumlexInFlightCount() { return inFlight.size; }

let refreshTimer: NodeJS.Timeout | null = null;
let refreshAttempts = 0;
export function refreshActiveMarkdownPreview() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    refreshAttempts++;
    const tryCmd = async (id: string): Promise<boolean> => {
      try { await vscode.commands.executeCommand(id); return true; }
      catch (e) { console.warn(`pumlex: ${id} failed`, e); return false; }
    };
    const ok = (await tryCmd('markdown.preview.refresh'))
      || (await tryCmd('markdown.api.reloadPlugins'));
    if (!ok) {
      console.error('pumlex: no preview-refresh command worked.');
    }
  }, 120);
}

export function getRefreshAttemptCount() { return refreshAttempts; }
