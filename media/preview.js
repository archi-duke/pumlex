// pumlex — VS Code Markdown preview script
//
// VS Code's markdown preview webview ships with a CSP that intentionally
// omits `connect-src`, so `fetch()` to localhost is blocked even after the
// "Allow insecure local content" setting. `img-src` however *does* allow
// `http://localhost:* http://127.0.0.1:*`, so we use an <img> tag pointing
// at plantumlEx's GET /render-with-layout?src=… endpoint.
//
// URL length cap: typical encoded source under 2 KB, ~8 KB practical limit.
// Diagrams that exceed this fall back to a clear error message.

(function () {
  'use strict';

  // TODO: pull from extension config (pumlex.serverUrl) via a body data
  // attribute injected by the extension host. Hardcoded default for now.
  const SERVER_URL = 'http://localhost:3030';
  const URL_LIMIT = 7800;

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
  }

  function renderBlock(codeEl) {
    if (codeEl.dataset.pumlexProcessed) return;
    codeEl.dataset.pumlexProcessed = '1';
    const source = codeEl.textContent || '';
    const pre = codeEl.parentElement;
    if (!pre) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'pumlex-block';

    const encoded = encodeURIComponent(source);
    if (encoded.length > URL_LIMIT) {
      wrapper.innerHTML =
        '<div class="pumlex-error">⚠ source가 너무 큼 ('
        + encoded.length + ' chars, max ' + URL_LIMIT + '). 풀 에디터에서 편집해주세요.</div>';
      pre.replaceWith(wrapper);
      return;
    }

    const url = SERVER_URL + '/render-with-layout?src=' + encoded;
    const img = document.createElement('img');
    img.alt = 'plantuml diagram';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.src = url;
    img.onerror = () => {
      wrapper.innerHTML =
        '<div class="pumlex-error">'
        + '<strong>⚠ pumlex 서버 도달 실패</strong><br>'
        + '<small>plantumlEx 서버가 ' + escapeHtml(SERVER_URL) + ' 에서 실행 중인지 확인하세요.</small>'
        + '</div>';
    };
    wrapper.appendChild(img);
    pre.replaceWith(wrapper);
  }

  function scan() {
    document.querySelectorAll('pre > code.language-plantuml').forEach(renderBlock);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
