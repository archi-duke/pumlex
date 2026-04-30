#!/usr/bin/env node
/* Regenerate ./docs/ from the canonical sources for GitHub Pages.
 *
 * Sources:
 *   packages/pex-server/public/demo-host.html → docs/index.html
 *   packages/pex-core/{geom,meta,inline}.js   → docs/pex-core/*.js
 *
 * The HTML is patched while copying:
 *   - rewrite `/pex-core/*.js` script srcs to `./pex-core/*.js`
 *   - replace `const PLANTUMLEX = location.origin;` with a runtime
 *     resolver (?server= → localStorage → http://localhost:3030)
 *   - inject a setup banner the demo's bootstrap script will toggle on
 *     if the page is hosted somewhere other than the resolved server.
 *
 * Idempotent: running again on already-patched HTML is a no-op.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_HTML = path.join(ROOT, 'packages/pex-server/public/demo-host.html');
const SRC_CORE_DIR = path.join(ROOT, 'packages/pex-core');
const DST_DIR = path.join(ROOT, 'docs');
const DST_HTML = path.join(DST_DIR, 'index.html');
const DST_CORE_DIR = path.join(DST_DIR, 'pex-core');

const CORE_FILES = ['geom.js', 'meta.js', 'inline.js'];

const PLANTUMLEX_RESOLVER = `function resolvePlantumlEx() {
  const qp = new URLSearchParams(location.search).get('server');
  if (qp) {
    try { localStorage.setItem('pumlex_server', qp); } catch {}
    return qp.replace(/\\/+$/, '');
  }
  let saved = null;
  try { saved = localStorage.getItem('pumlex_server'); } catch {}
  return (saved || 'http://localhost:3030').replace(/\\/+$/, '');
}
const PLANTUMLEX = resolvePlantumlEx();`;

const SETUP_BANNER_HTML = `  <div id="setupBanner" style="display:none; margin: 12px 0; padding: 10px 14px; background: #fff7ed; border: 1px solid #fdba74; border-radius: 4px; font-size: 13px;">
    <strong>로컬 plantumlEx 서버가 필요합니다.</strong>
    이 페이지는 GitHub Pages 의 정적 호스팅이라 PlantUML 렌더링은 직접 못 합니다.
    <br>
    <code>npm run start:server</code> 또는
    <code>node packages/pex-server/server.js</code> 로 <code>:3030</code> 에 서버를 띄워 주세요
    (<a href="https://github.com/archi-duke/pumlex#readme" target="_blank" rel="noopener">설치 안내</a>).
    <span style="display:inline-flex; gap: 6px; margin-left: 8px; align-items: center;">
      서버 URL:
      <input id="serverUrlInput" type="text" style="font: 12px ui-monospace, Menlo, monospace; padding: 2px 6px; width: 220px;" />
      <button id="serverUrlSave" style="padding: 2px 10px; cursor: pointer;">저장 + 새로고침</button>
    </span>
  </div>

`;

const SETUP_BANNER_BOOTSTRAP = `
// ---- Setup banner (GitHub Pages: server URL config) --------------------
(function () {
  const onSameOrigin = (() => {
    try { return new URL(PLANTUMLEX).origin === location.origin; }
    catch { return false; }
  })();
  if (onSameOrigin) return;
  const banner = $('setupBanner');
  if (!banner) return;
  banner.style.display = 'block';
  const input = $('serverUrlInput');
  input.value = PLANTUMLEX;
  $('serverUrlSave').onclick = () => {
    const v = (input.value || '').trim().replace(/\\/+$/, '');
    if (!v) return;
    try { localStorage.setItem('pumlex_server', v); } catch {}
    location.reload();
  };
})();

`;

function patchHtml(html) {
  // (1) script src paths
  html = html
    .replace('<script src="/pex-core/geom.js"></script>', '<script src="./pex-core/geom.js"></script>')
    .replace('<script src="/pex-core/meta.js"></script>', '<script src="./pex-core/meta.js"></script>')
    .replace('<script src="/pex-core/inline.js"></script>', '<script src="./pex-core/inline.js"></script>');

  // (2) PLANTUMLEX assignment
  html = html.replace(/const PLANTUMLEX = location\.origin;/, PLANTUMLEX_RESOLVER);

  // (3) Setup banner — insert before .host-bar
  if (!html.includes('id="setupBanner"')) {
    html = html.replace(/(  <div class="host-bar">)/, SETUP_BANNER_HTML + '$1');
  }

  // (4) Banner bootstrap before "// Initial render"
  if (!html.includes('Setup banner (GitHub Pages')) {
    html = html.replace(/(\/\/ Initial render)/, SETUP_BANNER_BOOTSTRAP + '$1');
  }
  return html;
}

function main() {
  fs.mkdirSync(DST_CORE_DIR, { recursive: true });

  const srcHtml = fs.readFileSync(SRC_HTML, 'utf8');
  const patched = patchHtml(srcHtml);
  fs.writeFileSync(DST_HTML, patched);
  process.stdout.write(`wrote ${path.relative(ROOT, DST_HTML)}\n`);

  for (const f of CORE_FILES) {
    fs.copyFileSync(path.join(SRC_CORE_DIR, f), path.join(DST_CORE_DIR, f));
    process.stdout.write(`copied ${path.relative(ROOT, path.join(SRC_CORE_DIR, f))} -> ${path.relative(ROOT, path.join(DST_CORE_DIR, f))}\n`);
  }
}

main();
