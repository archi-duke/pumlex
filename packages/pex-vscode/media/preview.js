// pumlex — VS Code Markdown preview script (inline mode)
//
// Companion of `markdownItPlugin.ts`: that plugin renders ```plantuml```
// blocks as inline SVG inside `<div class="pumlex-block" data-...>`. Here
// we attach PexInline overlays for in-place editing.
//
// CSP considerations:
//   - fetch is blocked (no connect-src) but we don't need it now: the
//     server-side plugin already inlined the SVG.
//   - vscode:// URIs work via real anchor clicks (markdown preview's
//     external link handler routes them to extension's UriHandler).

(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
  }

  function buildVscodeUri(path, params) {
    const qs = new URLSearchParams(params).toString();
    return 'vscode://archi-duke.pumlex' + path + '?' + qs;
  }

  // PlantUML emits `preserveAspectRatio="none"` for some diagram types
  // (use-case / description), which combined with `max-width:100%` from
  // markdown preview CSS squishes the diagram horizontally when the pane
  // is narrower than the SVG's natural width. Fix once per SVG by forcing
  // uniform scaling and stripping any inline width/height that overrides
  // CSS height:auto.
  function normalizeSvg(svg) {
    if (!svg) return;
    const par = svg.getAttribute('preserveAspectRatio');
    if (!par || par === 'none') {
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
    const style = (svg.getAttribute('style') || '')
      .replace(/width\s*:[^;]+;?/g, '')
      .replace(/height\s*:[^;]+;?/g, '');
    if (style.trim()) svg.setAttribute('style', style);
    else svg.removeAttribute('style');
  }

  // Decorate a `.pumlex-block` so the user can hover-trigger inline editing.
  function decorateBlock(blockEl) {
    if (blockEl.dataset.pumlexDecorated) return;
    if (blockEl.classList.contains('pumlex-loading')) return;
    const svg = blockEl.querySelector('svg');
    if (!svg) return;
    normalizeSvg(svg);
    blockEl.dataset.pumlexDecorated = '1';

    const blockIndex = parseInt(blockEl.dataset.blockIndex || '0', 10);
    const initialSource = decodeURIComponent(blockEl.dataset.blockSourceEncoded || '');

    let session = null;
    let currentSource = initialSource;
    let editBtn, commitBtn, cancelBtn;

    function enterView() {
      if (session) { try { session.deactivate(); } catch {} session = null; }
      blockEl.classList.remove('pumlex-editing');
      [commitBtn, cancelBtn].forEach((el) => el && el.remove());
      commitBtn = cancelBtn = null;
      ensureEditBtn();
    }

    function ensureEditBtn() {
      if (editBtn && blockEl.contains(editBtn)) { editBtn.style.display = ''; return; }
      editBtn = document.createElement('a');
      editBtn.className = 'pumlex-btn pumlex-edit-btn';
      editBtn.textContent = '✎ 편집';
      // href stays as the editor-uri so even programmatic blocking won't
      // matter — the user clicks this anchor directly. But here we use a
      // local handler to enter edit mode without leaving the preview;
      // clicking does not navigate (preventDefault).
      editBtn.href = '#';
      editBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        enterEdit();
      };
      blockEl.appendChild(editBtn);
    }

    function enterEdit() {
      if (typeof PexInline === 'undefined') {
        console.error('[pumlex] PexInline not loaded');
        return;
      }
      session = PexInline.activate(blockEl, {
        source: initialSource,
        useDrafts: false,        // VS Code Hot Exit handles recovery
        useDirtyBadge: false,    // VS Code's tab ● indicator handles dirty
        onSourceChange: (src) => {
          currentSource = src;
          if (commitBtn) commitBtn.href = buildVscodeUri('/commit', {
            blockIndex: String(blockIndex), source: src,
          });
        },
      });
      if (editBtn) editBtn.style.display = 'none';
      blockEl.classList.add('pumlex-editing');

      commitBtn = document.createElement('a');
      commitBtn.className = 'pumlex-btn pumlex-commit-btn';
      commitBtn.textContent = '✓ 적용';
      commitBtn.title = '편집 결과를 마크다운에 반영';
      commitBtn.href = buildVscodeUri('/commit', {
        blockIndex: String(blockIndex), source: currentSource,
      });
      // After commit click, VS Code will round-trip applyEdit; the file
      // change triggers a preview re-render, replacing this block. So we
      // don't need a manual deactivate here.
      blockEl.appendChild(commitBtn);

      cancelBtn = document.createElement('button');
      cancelBtn.className = 'pumlex-btn pumlex-cancel-btn';
      cancelBtn.textContent = '✗ 취소';
      cancelBtn.title = '편집 취소';
      cancelBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        enterView();
      };
      blockEl.appendChild(cancelBtn);
    }

    enterView();
  }

  function scan() {
    document.querySelectorAll('.pumlex-block').forEach(decorateBlock);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
