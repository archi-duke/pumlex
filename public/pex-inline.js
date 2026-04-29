// pex-inline.js
// Reusable in-place layout-editing overlay for a PlantUML SVG. Hosts (markdown
// viewers, the full editor UI shell, VS Code webviews) call `PexInline.activate`
// on a container that already has a rendered <svg>; the module wires entity
// drag, edge selection, edge-type toggle, and curve handles directly on the SVG
// and reports layout changes via callback.
//
// Dependencies: PexGeom (geometry math), PexMeta (only used by callers, not by
// this module — but we expect callers to embed/extract meta around us).
//
// Multi-instance safe: each activate() call has its own closure state.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./pex-geom'));
  } else {
    root.PexInline = factory(root.PexGeom);
  }
})(typeof self !== 'undefined' ? self : this, function (PexGeom) {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---- Stylesheet (injected once per document) -----------------------------
  const STYLE_ID = 'pex-inline-styles';
  const STYLES = `
    .pex-inline-host { position: relative; }
    .pex-inline-host g.entity { cursor: grab; }
    .pex-inline-host g.entity:hover > rect,
    .pex-inline-host g.entity:hover > polygon,
    .pex-inline-host g.entity:hover > ellipse,
    .pex-inline-host g.entity:hover > path {
      stroke: #2563eb !important; stroke-width: 2 !important;
    }
    .pex-inline-host g.pex-selected > rect,
    .pex-inline-host g.pex-selected > polygon,
    .pex-inline-host g.pex-selected > ellipse,
    .pex-inline-host g.pex-selected > path {
      stroke: #ef4444 !important; stroke-width: 2.5 !important;
    }
    .pex-inline-host g.link { cursor: pointer; }
    .pex-inline-host g.link.pex-edge-selected > path {
      stroke: #2563eb !important; stroke-width: 2.5 !important;
    }
    .pex-handle { fill: #2563eb; stroke: white; stroke-width: 1.5; cursor: grab; }
    .pex-handle:active { cursor: grabbing; }
    .pex-anchor { fill: white; stroke: #2563eb; stroke-width: 1.5; cursor: grab; }
    .pex-anchor:active { cursor: grabbing; }
    .pex-handle-guide { stroke: #2563eb; stroke-width: 1; stroke-dasharray: 4 3; pointer-events: none; opacity: 0.7; }
    .pex-edge-toolbar {
      position: absolute; z-index: 10;
      display: none; gap: 4px; align-items: center;
      padding: 4px 6px; background: white; border: 1px solid #d0d7de; border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      font: 12px system-ui, sans-serif;
      transform: translate(-50%, -100%);
    }
    .pex-edge-toolbar.shown { display: inline-flex; }
    .pex-edge-toolbar .label { color: #666; padding: 0 4px 0 2px; }
    .pex-edge-toolbar button {
      padding: 3px 9px; font-size: 12px;
      background: white; border: 1px solid #d0d7de; border-radius: 4px; cursor: pointer;
    }
    .pex-edge-toolbar button:hover { background: #f6f8fa; }
    .pex-edge-toolbar button.active { background: #2563eb; color: white; border-color: #2563eb; }
  `;
  function ensureStylesInjected(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = STYLES;
    doc.head.appendChild(s);
  }

  // ---- Helpers (pure / self-contained) -------------------------------------
  function entityQname(g) { return g.getAttribute('data-qualified-name') || g.id; }

  function edgeKeyForLink(svg, linkG) {
    const e1G = svg.querySelector(`g[id="${linkG.getAttribute('data-entity-1')}"]`);
    const e2G = svg.querySelector(`g[id="${linkG.getAttribute('data-entity-2')}"]`);
    if (!e1G || !e2G) return null;
    return `${entityQname(e1G)}__${entityQname(e2G)}`;
  }

  function normalizeLayout(raw) {
    if (!raw) return { nodes: {}, edges: {} };
    if (raw.nodes !== undefined || raw.edges !== undefined) {
      return { nodes: raw.nodes || {}, edges: raw.edges || {} };
    }
    return { nodes: raw, edges: {} };
  }

  function clientToSvg(e, svg) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  // ---- The actual activation logic ----------------------------------------
  function activate(container, opts) {
    if (!container) throw new Error('PexInline.activate: container required');
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('PexInline.activate: container has no <svg>');
    const doc = container.ownerDocument || document;
    ensureStylesInjected(doc);
    container.classList.add('pex-inline-host');

    const state = {
      layout: normalizeLayout((opts && opts.layout) || null),
      selected: null,
      selectedEdge: null,
      dragging: null,
      draggingHandle: null,
    };
    const onLayoutChange = (opts && opts.onLayoutChange) || (() => {});
    const fire = () => { try { onLayoutChange(state.layout); } catch (e) { /* host */ } };

    // ---- ViewBox bookkeeping -----------------------------------------------
    function adjustViewBox() {
      let orig = svg.getAttribute('data-pex-original-viewbox');
      if (!orig) {
        orig = svg.getAttribute('viewBox') || '';
        svg.setAttribute('data-pex-original-viewbox', orig);
      }
      const vb = orig.split(/\s+/).map(Number);
      if (vb.length !== 4) return;
      const [x, y, w, h] = vb;
      let minDx = 0, maxDx = 0, minDy = 0, maxDy = 0;
      for (const d of Object.values(state.layout.nodes)) {
        if (!d) continue;
        minDx = Math.min(minDx, d.dx); maxDx = Math.max(maxDx, d.dx);
        minDy = Math.min(minDy, d.dy); maxDy = Math.max(maxDy, d.dy);
      }
      const eL = Math.max(0, -minDx), eR = Math.max(0, maxDx);
      const eT = Math.max(0, -minDy), eB = Math.max(0, maxDy);
      const nw = w + eL + eR, nh = h + eT + eB;
      svg.setAttribute('viewBox', `${x - eL} ${y - eT} ${nw} ${nh}`);
      svg.setAttribute('width', `${nw}px`);
      svg.setAttribute('height', `${nh}px`);
      const style = (svg.getAttribute('style') || '')
        .replace(/width\s*:[^;]+;?/g, '')
        .replace(/height\s*:[^;]+;?/g, '');
      svg.setAttribute('style', `width:${nw}px;height:${nh}px;${style}`);
    }

    // ---- Edge follow geometry ----------------------------------------------
    function applyEdgeFollow() {
      svg.querySelectorAll('g.link').forEach((g) => {
        g.removeAttribute('transform');
        const e1Id = g.getAttribute('data-entity-1');
        const e2Id = g.getAttribute('data-entity-2');
        const e1G = svg.querySelector(`g[id="${e1Id}"]`);
        const e2G = svg.querySelector(`g[id="${e2Id}"]`);
        const q1 = e1G ? entityQname(e1G) : e1Id;
        const q2 = e2G ? entityQname(e2G) : e2Id;
        const d1 = state.layout.nodes[q1] || { dx: 0, dy: 0 };
        const d2 = state.layout.nodes[q2] || { dx: 0, dy: 0 };
        const eKey = `${q1}__${q2}`;
        const edgeOverride = state.layout.edges[eKey];
        const moved = d1.dx || d1.dy || d2.dx || d2.dy;
        const hasOverride = !!edgeOverride;

        const firstPath = g.querySelector('path');
        if (!firstPath) return;
        let origD = firstPath.getAttribute('data-pex-orig-d');
        if (!origD) { origD = firstPath.getAttribute('d'); firstPath.setAttribute('data-pex-orig-d', origD); }
        g.querySelectorAll('polygon').forEach((poly) => {
          if (!poly.getAttribute('data-pex-orig-points')) {
            poly.setAttribute('data-pex-orig-points', poly.getAttribute('points'));
          }
        });
        g.querySelectorAll('text').forEach((t) => {
          if (t.getAttribute('data-pex-orig-x') === null) {
            t.setAttribute('data-pex-orig-x', t.getAttribute('x'));
            t.setAttribute('data-pex-orig-y', t.getAttribute('y'));
          }
        });

        if ((!moved && !hasOverride) || !e1G || !e2G) {
          g.querySelectorAll('path').forEach((p) => {
            const o = p.getAttribute('data-pex-orig-d'); if (o) p.setAttribute('d', o);
          });
          g.querySelectorAll('polygon').forEach((poly) => poly.setAttribute('points', poly.getAttribute('data-pex-orig-points')));
          g.querySelectorAll('text').forEach((t) => {
            t.setAttribute('x', t.getAttribute('data-pex-orig-x'));
            t.setAttribute('y', t.getAttribute('data-pex-orig-y'));
          });
          return;
        }

        const b1 = e1G.getBBox();
        const b2 = e2G.getBBox();
        const e1Box = { x: b1.x + d1.dx, y: b1.y + d1.dy, w: b1.width, h: b1.height };
        const e2Box = { x: b2.x + d2.dx, y: b2.y + d2.dy, w: b2.width, h: b2.height };
        const c1c = PexGeom.bboxCenter(e1Box);
        const c2c = PexGeom.bboxCenter(e2Box);
        const newStart = (edgeOverride && edgeOverride.startAnchor)
          ? PexGeom.pointOnBboxBorder(e1Box, edgeOverride.startAnchor)
          : PexGeom.rectExit(c1c, c2c, e1Box);
        const newEnd = (edgeOverride && edgeOverride.endAnchor)
          ? PexGeom.pointOnBboxBorder(e2Box, edgeOverride.endAnchor)
          : PexGeom.rectExit(c2c, c1c, e2Box);

        const ctx = PexGeom.getPathContext(origD);
        if (!ctx) return;

        let tipExtStart = 0, tipExtEnd = 0;
        const polyInfo = [];
        g.querySelectorAll('polygon').forEach((poly) => {
          const o = poly.getAttribute('data-pex-orig-points');
          const nums = o.trim().split(/[\s,]+/).filter((s) => s.length).map(parseFloat);
          let cx = 0, cy = 0, n = 0;
          for (let i = 0; i + 1 < nums.length; i += 2) { cx += nums[i]; cy += nums[i + 1]; n++; }
          cx /= n; cy /= n;
          const dStart = (cx - ctx.start.x) ** 2 + (cy - ctx.start.y) ** 2;
          const dEnd = (cx - ctx.end.x) ** 2 + (cy - ctx.end.y) ** 2;
          const atStart = dStart < dEnd;
          const origAnchor = atStart ? ctx.start : ctx.end;
          const outwardAng = atStart ? ctx.startTangent + Math.PI : ctx.endTangent;
          const ext = PexGeom.polygonOutwardExtent(o, origAnchor, outwardAng);
          if (atStart) tipExtStart = Math.max(tipExtStart, ext);
          else tipExtEnd = Math.max(tipExtEnd, ext);
          polyInfo.push({ poly, atStart, origAnchor });
        });

        const ndx = newEnd.x - newStart.x, ndy = newEnd.y - newStart.y;
        const nLen = Math.hypot(ndx, ndy) || 1;
        const fwd = { x: ndx / nLen, y: ndy / nLen };
        const newPathStart = { x: newStart.x + tipExtStart * fwd.x, y: newStart.y + tipExtStart * fwd.y };
        const newPathEnd   = { x: newEnd.x   - tipExtEnd   * fwd.x, y: newEnd.y   - tipExtEnd   * fwd.y };

        const wasCurved = /[CQS]/i.test(origD);
        const edgeType = (edgeOverride && edgeOverride.type) || (wasCurved ? 'curve' : 'straight');
        const built = PexGeom.buildEdgePath(newPathStart, newPathEnd, {
          type: edgeType,
          ctx: edgeType === 'curve' ? ctx : null,
          u1: edgeOverride && edgeOverride.u1,
          u2: edgeOverride && edgeOverride.u2,
        });
        g._pexBuilt = { ...built, newStart, newEnd, pathStart: newPathStart, pathEnd: newPathEnd, type: edgeType };

        g.querySelectorAll('path').forEach((p, idx) => {
          const o = p.getAttribute('data-pex-orig-d');
          p.setAttribute('d', idx === 0 ? built.d : (o || ''));
        });

        const oldStartAngle = ctx.startTangent, oldEndAngle = ctx.endTangent;
        polyInfo.forEach(({ poly, atStart, origAnchor }) => {
          const o = poly.getAttribute('data-pex-orig-points');
          const newAnchor = atStart ? newPathStart : newPathEnd;
          const oldAng = atStart ? oldStartAngle : oldEndAngle;
          const newAng = atStart ? built.startTangent : built.endTangent;
          poly.setAttribute('points', PexGeom.reorientPolygon(o, origAnchor, newAnchor, newAng - oldAng));
        });

        const odx = ctx.end.x - ctx.start.x, ody = ctx.end.y - ctx.start.y;
        const olen2 = odx * odx + ody * ody;
        const oldLineAngle = Math.atan2(ody, odx);
        const newLineAngle = Math.atan2(ndy, ndx);
        const dAng = newLineAngle - oldLineAngle;
        const cosA = Math.cos(dAng), sinA = Math.sin(dAng);
        g.querySelectorAll('text').forEach((t) => {
          const x0 = parseFloat(t.getAttribute('data-pex-orig-x'));
          const y0 = parseFloat(t.getAttribute('data-pex-orig-y'));
          const tp = olen2 > 0
            ? Math.max(0, Math.min(1, ((x0 - ctx.start.x) * odx + (y0 - ctx.start.y) * ody) / olen2))
            : 0.5;
          const projX = ctx.start.x + tp * odx;
          const projY = ctx.start.y + tp * ody;
          const offX = x0 - projX, offY = y0 - projY;
          const rotX = offX * cosA - offY * sinA;
          const rotY = offX * sinA + offY * cosA;
          t.setAttribute('x', newStart.x + tp * ndx + rotX);
          t.setAttribute('y', newStart.y + tp * ndy + rotY);
        });
      });
      if (state.selectedEdge) renderHandles();
    }

    // ---- Selection + handle layer ------------------------------------------
    function selectNode(g) {
      if (state.selected) state.selected.classList.remove('pex-selected');
      state.selected = g;
      if (g) g.classList.add('pex-selected');
    }
    function selectEdge(g) {
      if (state.selectedEdge) state.selectedEdge.classList.remove('pex-edge-selected');
      state.selectedEdge = g;
      if (g) {
        g.classList.add('pex-edge-selected');
        const eKey = edgeKeyForLink(svg, g);
        if (eKey && !state.layout.edges[eKey]) {
          const pathD = g.querySelector('path').getAttribute('data-pex-orig-d') || g.querySelector('path').getAttribute('d') || '';
          const wasCurved = /[CQS]/i.test(pathD);
          state.layout.edges[eKey] = { type: wasCurved ? 'curve' : 'straight' };
        }
        applyEdgeFollow();
        showEdgeToolbar();
      } else {
        hideEdgeToolbar();
        clearHandles();
      }
    }
    function ensureHandleLayer() {
      let layer = svg.querySelector('g.pex-handle-layer');
      if (!layer) {
        layer = doc.createElementNS(SVG_NS, 'g');
        layer.setAttribute('class', 'pex-handle-layer');
        svg.appendChild(layer);
      }
      return layer;
    }
    function clearHandles() {
      const layer = svg.querySelector('g.pex-handle-layer');
      if (layer) layer.innerHTML = '';
    }
    function renderHandles() {
      const layer = ensureHandleLayer();
      const eg = state.selectedEdge;
      if (!eg || !eg._pexBuilt) { layer.innerHTML = ''; return; }
      const built = eg._pexBuilt;
      const ensure = (selector, factory) => {
        let el = layer.querySelector(selector);
        if (!el) { el = factory(); layer.appendChild(el); }
        return el;
      };
      const setAttrs = (el, attrs) => { for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); };

      const a1 = ensure('.pex-anchor[data-role="start"]', () => {
        const e = doc.createElementNS(SVG_NS, 'circle');
        e.setAttribute('class', 'pex-anchor'); e.setAttribute('data-role', 'start'); e.setAttribute('r', 5);
        e.addEventListener('pointerdown', (ev) => startHandleDrag(ev, 'start'));
        return e;
      });
      setAttrs(a1, { cx: built.newStart.x, cy: built.newStart.y });

      const a2 = ensure('.pex-anchor[data-role="end"]', () => {
        const e = doc.createElementNS(SVG_NS, 'circle');
        e.setAttribute('class', 'pex-anchor'); e.setAttribute('data-role', 'end'); e.setAttribute('r', 5);
        e.addEventListener('pointerdown', (ev) => startHandleDrag(ev, 'end'));
        return e;
      });
      setAttrs(a2, { cx: built.newEnd.x, cy: built.newEnd.y });

      if (built.type !== 'curve' || !built.c1 || !built.c2) {
        layer.querySelectorAll('.pex-handle, .pex-handle-guide').forEach((el) => el.remove());
        return;
      }
      const ps = built.pathStart || built.newStart;
      const pe = built.pathEnd || built.newEnd;
      const g1 = ensure('.pex-handle-guide[data-role="g1"]', () => {
        const e = doc.createElementNS(SVG_NS, 'line');
        e.setAttribute('class', 'pex-handle-guide'); e.setAttribute('data-role', 'g1');
        return e;
      });
      setAttrs(g1, { x1: ps.x, y1: ps.y, x2: built.c1.x, y2: built.c1.y });
      const g2 = ensure('.pex-handle-guide[data-role="g2"]', () => {
        const e = doc.createElementNS(SVG_NS, 'line');
        e.setAttribute('class', 'pex-handle-guide'); e.setAttribute('data-role', 'g2');
        return e;
      });
      setAttrs(g2, { x1: pe.x, y1: pe.y, x2: built.c2.x, y2: built.c2.y });
      const h1 = ensure('.pex-handle[data-which="c1"]', () => {
        const e = doc.createElementNS(SVG_NS, 'circle');
        e.setAttribute('class', 'pex-handle'); e.setAttribute('data-which', 'c1'); e.setAttribute('r', 6);
        e.addEventListener('pointerdown', (ev) => startHandleDrag(ev, 'c1'));
        return e;
      });
      setAttrs(h1, { cx: built.c1.x, cy: built.c1.y });
      const h2 = ensure('.pex-handle[data-which="c2"]', () => {
        const e = doc.createElementNS(SVG_NS, 'circle');
        e.setAttribute('class', 'pex-handle'); e.setAttribute('data-which', 'c2'); e.setAttribute('r', 6);
        e.addEventListener('pointerdown', (ev) => startHandleDrag(ev, 'c2'));
        return e;
      });
      setAttrs(h2, { cx: built.c2.x, cy: built.c2.y });
    }

    // ---- Floating edge-style toolbar ---------------------------------------
    const tb = doc.createElement('div');
    tb.className = 'pex-edge-toolbar';
    tb.innerHTML = '<span class="label">선:</span>'
      + '<button data-type="straight">직선</button>'
      + '<button data-type="curve">곡선</button>'
      + '<button data-type="ortho">꺾은선</button>';
    container.appendChild(tb);
    tb.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-type]');
      if (!b) return;
      e.stopPropagation();
      setEdgeType(b.dataset.type);
    });

    function showEdgeToolbar() {
      const eg = state.selectedEdge;
      if (!eg) { hideEdgeToolbar(); return; }
      const eKey = edgeKeyForLink(svg, eg);
      const ov = state.layout.edges[eKey];
      const wasCurved = /[CQS]/i.test(eg.querySelector('path').getAttribute('data-pex-orig-d') || '');
      const curType = (ov && ov.type) || (wasCurved ? 'curve' : 'straight');
      tb.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.type === curType));
      // Position the toolbar above the path's midpoint, in container coordinates.
      const path = eg.querySelector('path');
      const len = path.getTotalLength();
      const mid = path.getPointAtLength(len / 2);
      // Convert mid (svg user units) → screen → container-local
      const ctm = svg.getScreenCTM();
      const screen = svg.createSVGPoint();
      screen.x = mid.x; screen.y = mid.y;
      const sp = screen.matrixTransform(ctm);
      const cRect = container.getBoundingClientRect();
      tb.style.left = (sp.x - cRect.left) + 'px';
      tb.style.top  = (sp.y - cRect.top - 4) + 'px';
      tb.classList.add('shown');
    }
    function hideEdgeToolbar() { tb.classList.remove('shown'); }
    function setEdgeType(type) {
      const eg = state.selectedEdge;
      if (!eg) return;
      const eKey = edgeKeyForLink(svg, eg);
      if (!eKey) return;
      const cur = state.layout.edges[eKey] || {};
      const next = { ...cur, type };
      if (type !== 'curve') { delete next.u1; delete next.u2; }
      state.layout.edges[eKey] = next;
      applyEdgeFollow();
      adjustViewBox();
      showEdgeToolbar();
      fire();
    }

    // ---- Drag handlers (entity + handles) ----------------------------------
    function startDrag(e, g) {
      e.preventDefault();
      selectNode(g);
      const pt = clientToSvg(e, svg);
      const q = entityQname(g);
      const existing = state.layout.nodes[q] || { dx: 0, dy: 0 };
      state.dragging = {
        g, q,
        startX: pt.x, startY: pt.y,
        originDx: existing.dx, originDy: existing.dy
      };
      g.setPointerCapture(e.pointerId);
      g.addEventListener('pointermove', onDrag);
      g.addEventListener('pointerup', endDrag);
      g.addEventListener('pointercancel', endDrag);
    }
    function onDrag(e) {
      const d = state.dragging;
      if (!d) return;
      const pt = clientToSvg(e, svg);
      const dx = Math.round(d.originDx + (pt.x - d.startX));
      const dy = Math.round(d.originDy + (pt.y - d.startY));
      d.g.setAttribute('transform', `translate(${dx}, ${dy})`);
      state.layout.nodes[d.q] = { dx, dy };
      applyEdgeFollow();
      adjustViewBox();
    }
    function endDrag(e) {
      const d = state.dragging;
      if (!d) return;
      d.g.removeEventListener('pointermove', onDrag);
      d.g.removeEventListener('pointerup', endDrag);
      d.g.removeEventListener('pointercancel', endDrag);
      try { d.g.releasePointerCapture(e.pointerId); } catch {}
      state.dragging = null;
      fire();
    }
    function startHandleDrag(e, which) {
      e.stopPropagation(); e.preventDefault();
      const eg = state.selectedEdge;
      if (!eg) return;
      const eKey = edgeKeyForLink(svg, eg);
      if (!eKey) return;
      const target = e.currentTarget;
      state.draggingHandle = { which, eKey, target };
      target.setPointerCapture(e.pointerId);
      target.addEventListener('pointermove', onHandleDrag);
      target.addEventListener('pointerup', endHandleDrag);
      target.addEventListener('pointercancel', endHandleDrag);
    }
    function onHandleDrag(e) {
      const h = state.draggingHandle;
      if (!h) return;
      const eg = state.selectedEdge;
      if (!eg || !eg._pexBuilt) return;
      const pt = clientToSvg(e, svg);
      const built = eg._pexBuilt;
      const cur = state.layout.edges[h.eKey] || { type: 'curve' };
      if (h.which === 'c1' || h.which === 'c2') {
        if (h.which === 'c1') {
          cur.u1 = { x: pt.x - built.newStart.x, y: pt.y - built.newStart.y };
          if (!cur.u2) cur.u2 = built.u2 || { x: 0, y: 0 };
        } else {
          cur.u2 = { x: built.newEnd.x - pt.x, y: built.newEnd.y - pt.y };
          if (!cur.u1) cur.u1 = built.u1 || { x: 0, y: 0 };
        }
        cur.type = 'curve';
      } else if (h.which === 'start' || h.which === 'end') {
        const entityId = eg.getAttribute(h.which === 'start' ? 'data-entity-1' : 'data-entity-2');
        const entityG = svg.querySelector(`g[id="${entityId}"]`);
        if (!entityG) return;
        const q = entityQname(entityG);
        const delta = state.layout.nodes[q] || { dx: 0, dy: 0 };
        const b = entityG.getBBox();
        const bbox = { x: b.x + delta.dx, y: b.y + delta.dy, w: b.width, h: b.height };
        const snapped = PexGeom.nearestBboxBorder(bbox, pt);
        cur[h.which === 'start' ? 'startAnchor' : 'endAnchor'] = { side: snapped.side, t: snapped.t };
      }
      state.layout.edges[h.eKey] = cur;
      applyEdgeFollow();
    }
    function endHandleDrag(e) {
      const h = state.draggingHandle;
      if (!h) return;
      h.target.removeEventListener('pointermove', onHandleDrag);
      h.target.removeEventListener('pointerup', endHandleDrag);
      h.target.removeEventListener('pointercancel', endHandleDrag);
      try { h.target.releasePointerCapture(e.pointerId); } catch {}
      state.draggingHandle = null;
      fire();
    }

    // ---- Wire SVG ----------------------------------------------------------
    const entityHandlers = []; // { g, fn } — for cleanup
    const linkHandlers = [];
    const onSvgClick = () => { selectNode(null); selectEdge(null); };

    svg.querySelectorAll('g.entity').forEach((g) => {
      const d = state.layout.nodes[entityQname(g)];
      if (d) g.setAttribute('transform', `translate(${d.dx}, ${d.dy})`);
      const fnDown = (e) => startDrag(e, g);
      const fnClick = (e) => { e.stopPropagation(); selectNode(g); };
      g.addEventListener('pointerdown', fnDown);
      g.addEventListener('click', fnClick);
      entityHandlers.push({ g, fnDown, fnClick });
    });
    svg.querySelectorAll('g.link').forEach((g) => {
      const fnClick = (e) => { e.stopPropagation(); selectEdge(g); };
      g.addEventListener('click', fnClick);
      linkHandlers.push({ g, fnClick });
    });
    svg.addEventListener('click', onSvgClick);

    applyEdgeFollow();
    adjustViewBox();

    // Reposition the floating toolbar on scroll/resize so it tracks the edge.
    const onReposition = () => { if (state.selectedEdge) showEdgeToolbar(); };
    const win = doc.defaultView || window;
    win.addEventListener('scroll', onReposition, true);
    win.addEventListener('resize', onReposition);

    // ---- Public API --------------------------------------------------------
    return {
      getLayout() { return state.layout; },
      setLayout(layout) {
        state.layout = normalizeLayout(layout);
        applyEdgeFollow();
        adjustViewBox();
      },
      deactivate() {
        // Detach all listeners
        entityHandlers.forEach(({ g, fnDown, fnClick }) => {
          g.removeEventListener('pointerdown', fnDown);
          g.removeEventListener('click', fnClick);
        });
        linkHandlers.forEach(({ g, fnClick }) => g.removeEventListener('click', fnClick));
        svg.removeEventListener('click', onSvgClick);
        win.removeEventListener('scroll', onReposition, true);
        win.removeEventListener('resize', onReposition);
        // Clean up overlays + classes
        clearHandles();
        const layer = svg.querySelector('g.pex-handle-layer');
        if (layer) layer.remove();
        if (state.selected) state.selected.classList.remove('pex-selected');
        if (state.selectedEdge) state.selectedEdge.classList.remove('pex-edge-selected');
        tb.remove();
        container.classList.remove('pex-inline-host');
      },
    };
  }

  return { activate, normalizeLayout };
});
