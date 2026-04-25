const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');
const plantumlEncoder = require('plantuml-encoder');
const PexGeom = require('./public/pex-geom');

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const DIAGRAMS_DIR = path.join(DATA_DIR, 'diagrams');
fs.mkdirSync(DIAGRAMS_DIR, { recursive: true });

const PLANTUML_URL = (process.env.PLANTUML_URL || 'http://localhost:8080').replace(/\/$/, '');

async function renderSvg(source) {
  if (!source || !source.trim()) throw new Error('empty source');
  const encoded = plantumlEncoder.encode(source);
  const url = `${PLANTUML_URL}/svg/${encoded}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`render failed (${res.status}) at ${url}: ${body.slice(0, 200)}`);
  }
  return await res.text();
}

function applyLayout(svg, layout) {
  if (!layout || Object.keys(layout).length === 0) return svg;
  const $ = cheerio.load(svg, { xmlMode: true });
  for (const [nodeId, delta] of Object.entries(layout)) {
    const el = $(`#${cssEscape(nodeId)}`);
    if (el.length === 0) continue;
    const existing = (el.attr('transform') || '').trim();
    const add = `translate(${delta.dx}, ${delta.dy})`;
    el.attr('transform', existing ? `${existing} ${add}` : add);
  }
  $('g.link').each((_, el) => {
    const $el = $(el);
    const e1Id = $el.attr('data-entity-1');
    const e2Id = $el.attr('data-entity-2');
    const d1 = layout[e1Id] || { dx: 0, dy: 0 };
    const d2 = layout[e2Id] || { dx: 0, dy: 0 };
    if (!(d1.dx || d1.dy || d2.dx || d2.dy)) return;

    const e1G = $(`g[id="${e1Id}"]`).first();
    const e2G = $(`g[id="${e2Id}"]`).first();
    if (!e1G.length || !e2G.length) return;
    const b1 = entityBBox($, e1G);
    const b2 = entityBBox($, e2G);
    if (!b1 || !b2) return;

    const e1Box = { x: b1.x + d1.dx, y: b1.y + d1.dy, w: b1.w, h: b1.h };
    const e2Box = { x: b2.x + d2.dx, y: b2.y + d2.dy, w: b2.w, h: b2.h };
    const c1 = PexGeom.bboxCenter(e1Box);
    const c2 = PexGeom.bboxCenter(e2Box);
    const newStart = PexGeom.rectExit(c1, c2, e1Box);
    const newEnd = PexGeom.rectExit(c2, c1, e2Box);

    const firstPath = $el.find('path').first();
    const origD = firstPath.attr('d');
    const ctx = origD ? PexGeom.getPathContext(origD) : null;
    if (!ctx) return;

    const wasCurved = /[CQS]/i.test(origD);
    firstPath.attr('d', PexGeom.buildEdgePath(newStart, newEnd, wasCurved ? ctx : null));

    const newAngle = Math.atan2(newEnd.y - newStart.y, newEnd.x - newStart.x);
    const oldAngle = Math.atan2(ctx.end.y - ctx.start.y, ctx.end.x - ctx.start.x);

    $el.find('polygon').each((__, poly) => {
      const $poly = $(poly);
      const op = $poly.attr('points');
      if (!op) return;
      const nums = op.trim().split(/[\s,]+/).filter((s) => s.length).map(parseFloat);
      let cx = 0, cy = 0, n = 0;
      for (let i = 0; i + 1 < nums.length; i += 2) { cx += nums[i]; cy += nums[i + 1]; n++; }
      cx /= n; cy /= n;
      const dStart = (cx - ctx.start.x) ** 2 + (cy - ctx.start.y) ** 2;
      const dEnd = (cx - ctx.end.x) ** 2 + (cy - ctx.end.y) ** 2;
      const atStart = dStart < dEnd;
      const oldAnchor = atStart ? ctx.start : ctx.end;
      const newAnchor = atStart ? newStart : newEnd;
      $poly.attr('points', PexGeom.reorientPolygon(op, oldAnchor, newAnchor, newAngle - oldAngle));
    });

    const odx = ctx.end.x - ctx.start.x, ody = ctx.end.y - ctx.start.y;
    const olen2 = odx * odx + ody * ody;
    const ndx = newEnd.x - newStart.x, ndy = newEnd.y - newStart.y;
    const dAng = newAngle - oldAngle;
    const cosA = Math.cos(dAng), sinA = Math.sin(dAng);

    $el.find('text').each((__, t) => {
      const $t = $(t);
      const x0 = parseFloat($t.attr('x'));
      const y0 = parseFloat($t.attr('y'));
      if (Number.isNaN(x0) || Number.isNaN(y0)) return;
      const tp = olen2 > 0
        ? Math.max(0, Math.min(1, ((x0 - ctx.start.x) * odx + (y0 - ctx.start.y) * ody) / olen2))
        : 0.5;
      const projX = ctx.start.x + tp * odx;
      const projY = ctx.start.y + tp * ody;
      const offX = x0 - projX, offY = y0 - projY;
      const rotX = offX * cosA - offY * sinA;
      const rotY = offX * sinA + offY * cosA;
      $t.attr('x', String(newStart.x + tp * ndx + rotX));
      $t.attr('y', String(newStart.y + tp * ndy + rotY));
    });
  });
  expandViewBox($, layout);
  return $.xml();
}

function expandViewBox($, layout) {
  const svg = $('svg').first();
  const vb = (svg.attr('viewBox') || '').split(/\s+/).map(Number);
  if (vb.length !== 4) return;
  const [x, y, w, h] = vb;
  let minDx = 0, maxDx = 0, minDy = 0, maxDy = 0;
  for (const d of Object.values(layout)) {
    if (!d) continue;
    minDx = Math.min(minDx, d.dx);
    maxDx = Math.max(maxDx, d.dx);
    minDy = Math.min(minDy, d.dy);
    maxDy = Math.max(maxDy, d.dy);
  }
  const eL = Math.max(0, -minDx), eR = Math.max(0, maxDx);
  const eT = Math.max(0, -minDy), eB = Math.max(0, maxDy);
  const nx = x - eL, ny = y - eT, nw = w + eL + eR, nh = h + eT + eB;
  svg.attr('viewBox', `${nx} ${ny} ${nw} ${nh}`);
  svg.attr('width', `${nw}px`);
  svg.attr('height', `${nh}px`);
  const style = (svg.attr('style') || '')
    .replace(/width\s*:[^;]+;?/g, '')
    .replace(/height\s*:[^;]+;?/g, '');
  svg.attr('style', `width:${nw}px;height:${nh}px;${style}`);
}

function cssEscape(s) {
  return s.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

// Compute the bounding box of an entity by scanning its child shapes. Used as
// a server-side substitute for SVGGraphicsElement.getBBox().
function entityBBox($, $entity) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const consider = (x1, y1, x2, y2) => {
    if (x1 < minX) minX = x1; if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2; if (y2 > maxY) maxY = y2;
  };
  $entity.find('rect').each((_, el) => {
    const $el = $(el);
    const x = parseFloat($el.attr('x') || 0);
    const y = parseFloat($el.attr('y') || 0);
    const w = parseFloat($el.attr('width') || 0);
    const h = parseFloat($el.attr('height') || 0);
    consider(x, y, x + w, y + h);
  });
  $entity.find('ellipse').each((_, el) => {
    const $el = $(el);
    const cx = parseFloat($el.attr('cx') || 0);
    const cy = parseFloat($el.attr('cy') || 0);
    const rx = parseFloat($el.attr('rx') || 0);
    const ry = parseFloat($el.attr('ry') || 0);
    consider(cx - rx, cy - ry, cx + rx, cy + ry);
  });
  $entity.find('circle').each((_, el) => {
    const $el = $(el);
    const cx = parseFloat($el.attr('cx') || 0);
    const cy = parseFloat($el.attr('cy') || 0);
    const r = parseFloat($el.attr('r') || 0);
    consider(cx - r, cy - r, cx + r, cy + r);
  });
  $entity.find('polygon').each((_, el) => {
    const pts = ($(el).attr('points') || '').trim().split(/[\s,]+/).map(parseFloat);
    for (let i = 0; i + 1 < pts.length; i += 2) consider(pts[i], pts[i + 1], pts[i], pts[i + 1]);
  });
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

const diagramPath = (id) => path.join(DIAGRAMS_DIR, `${id}.json`);
const loadDiagram = (id) => {
  const p = diagramPath(id);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};
const saveDiagram = (id, data) => fs.writeFileSync(diagramPath(id), JSON.stringify(data, null, 2));

app.post('/render', async (req, res) => {
  try {
    const svg = await renderSvg(req.body.source || '');
    res.type('image/svg+xml').send(svg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/diagrams', (req, res) => {
  const id = crypto.randomBytes(6).toString('hex');
  const { name = 'Untitled', source = '' } = req.body || {};
  saveDiagram(id, { id, name, source, layout: {}, updatedAt: Date.now() });
  res.json({ id });
});

app.get('/diagrams/:id', (req, res) => {
  const d = loadDiagram(req.params.id);
  if (!d) return res.status(404).json({ error: 'not found' });
  res.json(d);
});

app.put('/diagrams/:id', (req, res) => {
  const d = loadDiagram(req.params.id) || { id: req.params.id, layout: {} };
  const { source, name } = req.body || {};
  if (source !== undefined) d.source = source;
  if (name !== undefined) d.name = name;
  d.updatedAt = Date.now();
  saveDiagram(req.params.id, d);
  res.json({ ok: true });
});

app.put('/layouts/:id', (req, res) => {
  const d = loadDiagram(req.params.id);
  if (!d) return res.status(404).json({ error: 'not found' });
  d.layout = (req.body && req.body.layout) || {};
  d.updatedAt = Date.now();
  saveDiagram(req.params.id, d);
  res.json({ ok: true });
});

async function composeFor(id) {
  const d = loadDiagram(id);
  if (!d) return null;
  const raw = await renderSvg(d.source || '');
  return { diagram: d, svg: applyLayout(raw, d.layout) };
}

app.get('/embed/:id.svg', async (req, res) => {
  try {
    const out = await composeFor(req.params.id);
    if (!out) return res.status(404).send('not found');
    res.type('image/svg+xml').send(out.svg);
  } catch (e) {
    res.status(500).send(`error: ${e.message}`);
  }
});

app.get('/embed/:id', async (req, res) => {
  try {
    const out = await composeFor(req.params.id);
    if (!out) return res.status(404).send('not found');
    const { diagram, svg } = out;
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(diagram.name)}</title>
<style>
  body { margin:0; padding:12px; font-family: system-ui, sans-serif; }
  .bar { position: fixed; top: 8px; right: 8px; }
  .bar a { padding: 4px 10px; background:#2563eb; color:#fff; text-decoration:none; border-radius:4px; font-size:12px; }
  svg { max-width: 100%; height: auto; }
</style></head><body>
<div class="bar"><a href="/edit/${diagram.id}" target="_top">Edit</a></div>
${svg}
</body></html>`);
  } catch (e) {
    res.status(500).send(`error: ${e.message}`);
  }
});

app.get('/edit/:id', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'edit.html')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'edit.html')));

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`plantumlEx listening on http://localhost:${PORT}`);
  console.log(`PLANTUML_URL = ${PLANTUML_URL}`);
});
