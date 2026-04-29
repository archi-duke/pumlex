// pex-meta.js
// Embed/extract a JSON metadata block inside a PlantUML source so layout
// edits travel together with the diagram in a single file.
//
// Format (after `@enduml`, every line is a `'` comment so the PlantUML
// parser ignores the block even if it ever stops short of EOF):
//
//   ' @startmeta
//   ' {
//   '   "schema": 1,
//   '   "layout": { "nodes": {...}, "edges": {...} },
//   '   ...
//   ' }
//   ' @endmeta
//
// All helpers operate on plain strings; no IO.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PexMeta = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const META_START = "' @startmeta";
  const META_END = "' @endmeta";

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Remove any existing meta block (and surrounding blank lines) from `full`.
  function stripMeta(full) {
    if (!full) return full;
    const re = new RegExp(`\\n*${escapeRe(META_START)}[\\s\\S]*?${escapeRe(META_END)}\\s*$`, 'm');
    return full.replace(re, '').replace(/\s+$/, '') + '\n';
  }

  // Extract the meta JSON object from `full`. Returns null if absent or invalid.
  function extractMeta(full) {
    if (!full) return null;
    const i = full.indexOf(META_START);
    if (i === -1) return null;
    const j = full.indexOf(META_END, i + META_START.length);
    if (j === -1) return null;
    const block = full.slice(i + META_START.length, j);
    // Strip the leading `'` (and one optional space) from every line.
    const json = block.split('\n').map((l) => l.replace(/^\s*'\s?/, '')).join('\n').trim();
    if (!json) return null;
    try { return JSON.parse(json); } catch { return null; }
  }

  // Split `full` into the clean PlantUML source (no meta) and the parsed meta.
  function parseSource(full) {
    return { source: stripMeta(full || ''), meta: extractMeta(full || '') };
  }

  // Embed `meta` into the clean `source`, replacing any existing meta block.
  function embedMeta(source, meta) {
    const clean = stripMeta(source || '').replace(/\s+$/, '');
    if (!meta) return clean + '\n';
    const json = JSON.stringify(meta, null, 2);
    const commented = json.split('\n').map((l) => `' ${l}`.replace(/\s+$/, '')).join('\n');
    return `${clean}\n\n${META_START}\n${commented}\n${META_END}\n`;
  }

  return { embedMeta, extractMeta, parseSource, stripMeta, META_START, META_END };
});
