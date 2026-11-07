#!/usr/bin/env node
// Generates src/map/geometry.ts from Martin Asal's "Diplomacy.svg"
// (Wikimedia Commons, CC BY-SA 3.0; see LICENSE-map.md).
//
//   node scripts/extract-map.mjs <path/to/diplomacy.svg> [out.ts]
//
// The SVG is treated purely as data: tags are matched with regular expressions
// and only path `d` strings, text ids and text transforms are read.
//
// What the generator does:
//   * maps each labelled province group to an engine province id;
//   * merges the two-piece provinces (Spain, St Petersburg, Bulgaria are drawn
//     as two adjacent shapes in the source) into one outline;
//   * keeps Switzerland, the background land and the small water inlets
//     (Bosporus, Danish straits, Kiel canal) as decor;
//   * finds every supply-centre marker and assigns it to its province;
//   * cuts the North Sea / Norwegian Sea underlays down to what is visible,
//     so no province path overlaps another;
//   * computes unit anchors: a spot with room for a unit (clear of the
//     outline, water inlets, the label and the supply-centre marker), as close
//     to the label as possible; split coasts trade room against closeness to
//     the sea that coast faces. A small override table below fixes the spots
//     where taste beats geometry.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")

// ---------------------------------------------------------------------------
// Rendering sizes the anchors are laid out for (also written into geometry.ts
// so the board component can draw at the same sizes).

const UNIT_RADIUS = 6.5 // half-size of a unit glyph
const SC_RADIUS = 3.5 // supply-centre marker radius
const LABEL_FONT_SIZE = 9 // province label font size (labels drawn centred)
const DISLODGED_OFFSET = { x: 8, y: -8 }

// Source label font metrics (Liberation Sans 13px, i.e. Arial metrics).
const CAP_HEIGHT = 0.716 // em
// Arial advance widths per 1000 em for the characters that appear in labels.
const ADVANCE = {
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, k: 500, l: 222, m: 833,
  n: 556, o: 556, p: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
}
const textWidth = (s, size) => [...s].reduce((w, ch) => w + (ADVANCE[ch] ?? 600), 0) * size / 1000

// ---------------------------------------------------------------------------
// Hand adjustments.

/** Source label ids that don't lower-case to an engine id. */
const LABEL_ALIASES = {}

/** Seas each split coast faces; the coast anchor is pulled towards them. */
const COAST_SEAS = {
  "spa/nc": ["mao"],
  "spa/sc": ["lyo", "wes"],
  "stp/nc": ["bar"],
  "stp/sc": ["bot"],
  "bul/ec": ["bla"],
  "bul/sc": ["aeg"],
}

/** Label centres placed by hand (normally computed: visual centre of the province). */
const LABEL_OVERRIDES = {}

/** Unit anchors placed by hand; everything else is computed. */
const ANCHOR_OVERRIDES = {
  // The computed spot is on the White Sea, wedged against Finland; put the
  // fleet on the Kola peninsula's Barents coast where players expect it.
  "stp/nc": { x: 432, y: 67 },
  // Computed spots were Galicia's corner and Gibraltar. Use the eastern Biscay
  // coast (Mid-Atlantic, next to Gascony) and the Valencia/Catalonia coast
  // (Gulf of Lyon / Western Med, next to Marseilles).
  "spa/nc": { x: 100, y: 404 },
  "spa/sc": { x: 122, y: 435 },
}

// ---------------------------------------------------------------------------
// Engine province list, read from the engine source so the two never drift.

function readEngineProvinces() {
  const src = fs.readFileSync(path.join(repoRoot, "src/engine/map/standard.ts"), "utf8")
  const re = /p\("([a-z]{3})",\s*"([^"]+)",\s*"([^"]+)",\s*"(inland|coastal|sea)"(?:,\s*\{([^}]*)\})?\)/g
  const out = []
  for (const m of src.matchAll(re)) {
    const extra = m[5] ?? ""
    out.push({
      id: m[1],
      abbr: m[2],
      name: m[3],
      kind: m[4],
      sc: /sc:\s*true/.test(extra) || /home:/.test(extra),
      coasts: [...(extra.match(/coasts:\s*\[([^\]]*)\]/)?.[1].matchAll(/"(\w+)"/g) ?? [])].map((c) => c[1]),
    })
  }
  if (out.length !== 75) throw new Error(`expected 75 engine provinces, parsed ${out.length}`)
  return out
}

// ---------------------------------------------------------------------------
// SVG reading.

function attr(attrs, name) {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1]
}

/** Parse the SVG into a list of top-level nodes: {type:"g", children} | {type:"path"} | {type:"text"}. */
function parseSvg(src) {
  const re = /<(\/?)(g|path|text)\b([^>]*?)(\/?)>/g
  const top = []
  const stack = []
  const add = (n) => (stack.length ? stack[stack.length - 1].children.push(n) : top.push(n))
  for (const m of src.matchAll(re)) {
    const [, close, tag, attrs, selfClose] = m
    if (tag === "g") {
      if (close) stack.pop()
      else {
        const g = { type: "g", id: attr(attrs, "id"), children: [] }
        add(g)
        if (!selfClose) stack.push(g)
      }
    } else if (tag === "path" && !close) {
      add({ type: "path", id: attr(attrs, "id"), cls: attr(attrs, "class"), d: attr(attrs, "d").trim() })
    } else if (tag === "text" && !close) {
      const style = attr(attrs, "style") ?? ""
      const t = /matrix\(\s*1\s*,\s*0\s*,\s*0\s*,\s*1\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(style)
      if (!t) throw new Error(`text without a plain translate transform: ${attrs}`)
      add({ type: "text", id: attr(attrs, "id"), x: +t[1], y: +t[2] })
    }
  }
  if (stack.length) throw new Error("unbalanced <g> tags")
  return top
}

// ---------------------------------------------------------------------------
// Path geometry.

/** Flatten an SVG path (M/L/H/V/C/Z, absolute or relative) into polygons; curves are sampled. */
function flatten(d, curveSteps = 8) {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []
  const polys = []
  let pts = null
  let i = 0, x = 0, y = 0, sx = 0, sy = 0, cmd = ""
  const num = () => {
    const v = parseFloat(toks[i++])
    if (Number.isNaN(v)) throw new Error(`bad number in path near token ${i}: ${d.slice(0, 40)}`)
    return v
  }
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++]
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0, oy = rel ? y : 0
    switch (cmd.toLowerCase()) {
      case "m": {
        x = ox + num(); y = oy + num(); sx = x; sy = y
        pts = [[x, y]]
        polys.push(pts)
        cmd = rel ? "l" : "L"
        break
      }
      case "l": x = ox + num(); y = oy + num(); pts.push([x, y]); break
      case "h": x = ox + num(); pts.push([x, y]); break
      case "v": y = oy + num(); pts.push([x, y]); break
      case "c": {
        const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num(), x3 = ox + num(), y3 = oy + num()
        for (let s = 1; s <= curveSteps; s++) {
          const t = s / curveSteps, u = 1 - t
          pts.push([
            u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          ])
        }
        x = x3; y = y3
        break
      }
      case "z":
        x = sx; y = sy
        pts = [[x, y]]
        polys.push(pts)
        break
      default:
        throw new Error(`unsupported path command "${cmd}"`)
    }
  }
  return polys.filter((p) => p.length > 2)
}

function pointInPolys(polys, px, py) {
  let inside = false
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j]
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

function edgeDist(polys, px, py) {
  let best = Infinity
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) best = Math.min(best, segDist(px, py, poly[j], poly[i]))
  }
  return best
}

function bbox(polys) {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const poly of polys) for (const [x, y] of poly) {
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y)
  }
  return b
}

function rectDist(px, py, r) {
  const dx = Math.max(r.x0 - px, 0, px - r.x1)
  const dy = Math.max(r.y0 - py, 0, py - r.y1)
  return Math.hypot(dx, dy)
}

const fmt = (v) => String(Math.round(v * 10) / 10)
const snap = ([x, y]) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`

function bboxOverlap(a, b) {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1
}

/** Parameters (0..1 along s) where segment t touches segment s: crossings, T-junctions, collinear overlaps. */
function splitParams([p, q], [r, s]) {
  const dx = q[0] - p[0], dy = q[1] - p[1], ex = s[0] - r[0], ey = s[1] - r[1]
  const len2 = dx * dx + dy * dy
  const den = dx * ey - dy * ex
  const out = []
  const onS = (pt) => {
    const t = ((pt[0] - p[0]) * dx + (pt[1] - p[1]) * dy) / len2
    if (t > 1e-9 && t < 1 - 1e-9 && segDist(pt[0], pt[1], p, q) < 1e-6) out.push(t)
  }
  if (Math.abs(den) < 1e-12) {
    onS(r)
    onS(s)
  } else {
    const t = ((r[0] - p[0]) * ey - (r[1] - p[1]) * ex) / den
    const u = ((r[0] - p[0]) * dy - (r[1] - p[1]) * dx) / den
    if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) out.push(t)
  }
  return out
}

/**
 * Outline of an arbitrary region given as an inside-test plus the edges that
 * can bound it. Edges are split wherever they meet; a piece is kept when the
 * region lies on exactly one side of it, oriented with the region on its left,
 * and the kept pieces are chained into rings. Used to merge the two-piece
 * provinces and to cut the sea underlays down to what is actually visible.
 */
function regionOutline(inside, polys) {
  const segs = []
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    if (snap(p) !== snap(q)) segs.push([p, q])
  }
  const boxes = segs.map((s) => bbox([s]))
  const pieces = new Map()
  segs.forEach((seg, i) => {
    const ts = [0, 1]
    segs.forEach((other, j) => {
      if (i !== j && bboxOverlap(boxes[i], boxes[j])) ts.push(...splitParams(seg, other))
    })
    ts.sort((a, b) => a - b)
    const [p, q] = seg
    const at = (t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
    for (let k = 0; k + 1 < ts.length; k++) {
      const a = at(ts[k]), b = at(ts[k + 1])
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 1e-6) continue
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
      const eps = Math.min(0.05, len / 4)
      const nx = (-(b[1] - a[1]) / len) * eps, ny = ((b[0] - a[0]) / len) * eps
      const left = inside(mx + nx, my + ny), right = inside(mx - nx, my - ny)
      if (left === right) continue
      const [from, to] = left ? [a, b] : [b, a]
      pieces.set(`${snap(from)}>${snap(to)}`, [from, to])
    }
  })
  const byStart = new Map()
  for (const pc of pieces.values()) {
    const k = snap(pc[0])
    if (!byStart.has(k)) byStart.set(k, [])
    byStart.get(k).push(pc)
  }
  const rings = []
  const used = new Set()
  for (const start of pieces.values()) {
    if (used.has(start)) continue
    const ring = [start[0]]
    let cur = start
    while (!used.has(cur)) {
      used.add(cur)
      ring.push(cur[1])
      const next = (byStart.get(snap(cur[1])) ?? []).find((pc) => !used.has(pc))
      if (!next) break
      cur = next
    }
    if (snap(ring[ring.length - 1]) !== snap(ring[0])) throw new Error("region outline did not close")
    ring.pop()
    rings.push(simplify(ring))
  }
  return rings
}

/** Drop repeated and collinear vertices. */
function simplify(ring) {
  const out = []
  for (let i = 0; i < ring.length; i++) {
    const a = out.length ? out[out.length - 1] : ring[ring.length - 1]
    const b = ring[i], c = ring[(i + 1) % ring.length]
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) continue
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < 1e-6 && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) > 0) continue
    out.push(b)
  }
  return out
}

const ringsToPath = (rings) =>
  rings.map((r) => `M${fmt(r[0][0])} ${fmt(r[0][1])}L` + r.slice(1).map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(" ") + "Z").join("")

// ---------------------------------------------------------------------------

function main() {
  const [svgPath, outArg] = process.argv.slice(2)
  if (!svgPath) {
    console.error("usage: node scripts/extract-map.mjs <diplomacy.svg> [out.ts]")
    process.exit(1)
  }
  const outPath = outArg ? path.resolve(outArg) : path.join(repoRoot, "src/map/geometry.ts")
  const svg = fs.readFileSync(svgPath, "utf8")
  const viewBox = /viewBox="([^"]*)"/.exec(svg)?.[1].trim().split(/[\s,]+/).map(Number)
  if (!viewBox || viewBox.join(" ") !== "0 0 610 560") throw new Error(`unexpected viewBox ${viewBox}`)

  const engine = readEngineProvinces()
  const engineById = new Map(engine.map((p) => [p.id, p]))
  const top = parseSvg(svg)

  const provinces = new Map() // id -> { pieces: [d], label, water: [d] }
  const decor = []
  const orphans = []
  const scPaths = []
  const unmapped = []
  const drawOrder = [] // every shape in paint order: { d, owner } (owner filled in for orphans later)

  for (const node of top) {
    if (node.type === "path") {
      decor.push({ id: "background", kind: "land", d: node.d })
      continue
    }
    if (node.type !== "g") continue
    const paths = node.children.filter((c) => c.type === "path")
    const text = node.children.find((c) => c.type === "text")
    for (const g of node.children.filter((c) => c.type === "g")) {
      if (g.id === "sc") scPaths.push(...g.children.filter((c) => c.type === "path").map((p) => p.d))
      // Groups "A" / "F" are the starting-position unit glyphs; ignored.
    }
    if (!paths.length) continue
    const [main, ...extra] = paths
    if (!text) {
      const entry = { d: main.d, owner: null }
      orphans.push(entry)
      drawOrder.push(entry)
      continue
    }
    const id = LABEL_ALIASES[text.id] ?? text.id.toLowerCase()
    if (text.id === "Swi") {
      decor.push({ id: "switzerland", kind: "impassable", d: main.d })
      continue
    }
    if (!engineById.has(id)) {
      unmapped.push(text.id)
      continue
    }
    if (provinces.has(id)) throw new Error(`duplicate province ${id}`)
    drawOrder.push({ d: main.d, owner: id })
    const water = []
    for (const p of extra) {
      if (p.cls !== "s1") throw new Error(`unexpected extra path in ${id}`)
      water.push(p.d)
      decor.push({ id: `water-${id}`, kind: "water", d: p.d })
    }
    provinces.set(id, { pieces: [main.d], label: { x: text.x, y: text.y, id: text.id }, water })
  }
  if (unmapped.length) throw new Error(`unmapped labels: ${unmapped.join(", ")}`)

  // Attach unlabelled pieces to the split-coast province they share the most vertices with.
  const splitIds = engine.filter((p) => p.coasts.length).map((p) => p.id)
  const notes = []
  for (const orphan of orphans) {
    const verts = new Set(flatten(orphan.d)[0].map(snap))
    let best = null, bestShared = 0
    for (const id of splitIds) {
      const shared = flatten(provinces.get(id).pieces[0])[0].filter((v) => verts.has(snap(v))).length
      if (shared > bestShared) { best = id; bestShared = shared }
    }
    if (!best || bestShared < 2) throw new Error(`orphan shape could not be assigned: ${orphan.d.slice(0, 30)}`)
    provinces.get(best).pieces.push(orphan.d)
    orphan.owner = best
    notes.push(`${best}: drawn as two shapes in the source; merged into one outline`)
  }

  const missing = engine.filter((p) => !provinces.has(p.id)).map((p) => p.id)
  if (missing.length) throw new Error(`no shape for: ${missing.join(", ")}`)

  // What you see at a point is the last shape painted there. Some source
  // shapes (the North Sea and Norwegian Sea) are rough underlays that other
  // provinces are painted over; cut every province down to its visible part.
  const raw = drawOrder.map((s) => ({ ...s, polys: flatten(s.d), box: bbox(flatten(s.d)) }))
  const geo = new Map()
  for (const [id, pr] of provinces) {
    const mine = raw.filter((s) => s.owner === id)
    const myBox = bbox(mine.flatMap((s) => s.polys))
    const above = raw.slice(raw.indexOf(mine[0]) + 1).filter((s) => s.owner !== id && bboxOverlap(s.box, myBox))
    const insideMine = (x, y) => mine.some((s) => pointInPolys(s.polys, x, y))
    const visible = (x, y) => insideMine(x, y) && !above.some((s) => pointInPolys(s.polys, x, y))
    // Is anything painted over this province (more than a hairline)?
    let covered = 0
    for (let x = Math.floor(myBox.x0) + 0.5; x < myBox.x1; x += 1)
      for (let y = Math.floor(myBox.y0) + 0.5; y < myBox.y1; y += 1)
        if (insideMine(x, y) && !visible(x, y)) covered++

    let d, polys
    if (mine.length === 1 && covered === 0) {
      d = pr.pieces[0]
      polys = flatten(d)
    } else {
      const rings = regionOutline(visible, [...mine, ...above].flatMap((s) => s.polys))
      if (rings.length !== 1) throw new Error(`${id}: visible region has ${rings.length} rings`)
      d = ringsToPath(rings)
      polys = rings
      if (mine.length === 1) notes.push(`${id}: source shape runs under ${covered} px² of shapes painted over it; clipped to the visible part`)
    }
    geo.set(id, { d, polys, water: pr.water.map((w) => flatten(w)), label: pr.label })
  }

  // Supply-centre markers: centre of each marker shape, deduplicated, assigned by containment.
  const scMarkers = {}
  for (const d of scPaths) {
    const b = bbox(flatten(d))
    const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
    const owner = [...geo].find(([, g]) => pointInPolys(g.polys, c.x, c.y))?.[0]
    if (!owner) throw new Error(`supply centre at ${c.x},${c.y} is in no province`)
    if (scMarkers[owner] && Math.hypot(scMarkers[owner].x - c.x, scMarkers[owner].y - c.y) > 0.5)
      throw new Error(`two different supply-centre markers in ${owner}`)
    scMarkers[owner] = c
  }
  const scIds = engine.filter((p) => p.sc).map((p) => p.id)
  const scMissing = scIds.filter((id) => !scMarkers[id])
  const scExtra = Object.keys(scMarkers).filter((id) => !engineById.get(id).sc)
  if (scMissing.length || scExtra.length) throw new Error(`SC mismatch: missing ${scMissing} extra ${scExtra}`)

  // Labels and supply-centre markers are laid out together: the name sits at
  // the province's visual centre with the marker directly below it, and the
  // name + marker block is placed where it has the most room (the "pole of
  // inaccessibility" of the province for that block). The source's own label
  // and marker positions are only used to check which provinces have centres.
  const LABEL_H = CAP_HEIGHT * LABEL_FONT_SIZE
  const SC_GAP = 2.5
  const scDrop = LABEL_H / 2 + SC_GAP + SC_RADIUS // label centre -> marker centre
  const labels = {}
  const blockSamples = (id, cx, cy, hasSc) => {
    const w = textWidth(engineById.get(id).abbr, LABEL_FONT_SIZE) + 2
    const ly = hasSc ? cy - scDrop / 2 : cy
    const pts = []
    for (let i = 0; i <= 4; i++) {
      const x = cx - w / 2 + (w * i) / 4
      pts.push([x, ly - LABEL_H / 2 - 1], [x, ly + LABEL_H / 2 + 1])
    }
    if (hasSc) {
      const sy = ly + scDrop
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4
        pts.push([cx + Math.cos(a) * (SC_RADIUS + 1), sy + Math.sin(a) * (SC_RADIUS + 1)])
      }
    }
    return pts
  }
  /** Signed room at a point: distance to the outline / water inlets inside the province, negative outside. */
  const signedRoom = (g, x, y) => {
    const inside = pointInPolys(g.polys, x, y) && !g.water.some((w) => pointInPolys(w, x, y))
    let r = edgeDist(g.polys, x, y)
    for (const w of g.water) r = Math.min(r, edgeDist(w, x, y))
    return inside ? r : -r
  }
  for (const [id, g] of geo) {
    const hasSc = engineById.get(id).sc
    if (LABEL_OVERRIDES[id]) {
      labels[id] = { ...LABEL_OVERRIDES[id] }
    } else {
      const b = bbox(g.polys)
      const score = (x, y) => Math.min(...blockSamples(id, x, y, hasSc).map(([sx, sy]) => signedRoom(g, sx, sy)))
      let best = null
      const tryAt = (x, y) => {
        if (!pointInPolys(g.polys, x, y)) return
        const sc = score(x, y)
        if (!best || sc > best.s) best = { x, y, s: sc }
      }
      for (let x = b.x0; x <= b.x1; x += 2) for (let y = b.y0; y <= b.y1; y += 2) tryAt(x, y)
      for (const step of [0.5, 0.125]) {
        const c = { ...best }
        for (let x = c.x - 4 * step; x <= c.x + 4 * step; x += step) for (let y = c.y - 4 * step; y <= c.y + 4 * step; y += step) tryAt(x, y)
      }
      labels[id] = { x: best.x, y: hasSc ? best.y - scDrop / 2 : best.y }
      if (best.s < 0.5) notes.push(`${id}: name${hasSc ? " and centre marker" : ""} only just fit (${best.s.toFixed(1)} units of room)`)
    }
    if (hasSc) scMarkers[id] = { x: labels[id].x, y: labels[id].y + scDrop }
  }
  /** Box a drawn label occupies (engine abbreviation at LABEL_FONT_SIZE), padded. */
  const labelRect = (id) => {
    const w = textWidth(engineById.get(id).abbr, LABEL_FONT_SIZE) + 2
    const h = LABEL_H + 3
    return { x0: labels[id].x - w / 2, x1: labels[id].x + w / 2, y0: labels[id].y - h / 2, y1: labels[id].y + h / 2 }
  }

  // Unit anchors.
  const anchors = {}
  const report = []
  const placed = [] // all anchors placed so far, for spacing

  /**
   * Room around a point: distance to the outline, to water inlets, to the label
   * box and to the SC marker (each net of the unit's own clearance needs).
   */
  const room = (id, x, y) => {
    const g = geo.get(id)
    let r = edgeDist(g.polys, x, y)
    for (const w of g.water) r = Math.min(r, pointInPolys(w, x, y) ? 0 : edgeDist(w, x, y))
    // Fleets are wider than they are tall, so keep a little extra space between
    // a unit that may be a fleet and the province's name and supply-centre dot.
    const extra = engineById.get(id).kind === "inland" ? 0 : 1.5
    r = Math.min(r, rectDist(x, y, labelRect(id)) - extra)
    const sc = scMarkers[id]
    if (sc) r = Math.min(r, Math.hypot(x - sc.x, y - sc.y) - SC_RADIUS - 1 - extra)
    return r
  }

  /** Grid search (coarse then fine) for the point maximising `score` inside the province. */
  const search = (id, score) => {
    const g = geo.get(id)
    const b = bbox(g.polys)
    let best = null
    const tryAt = (x, y) => {
      if (!pointInPolys(g.polys, x, y)) return
      if (g.water.some((w) => pointInPolys(w, x, y))) return
      const s = score(x, y)
      if (!best || s > best.s) best = { x, y, s }
    }
    for (let x = Math.ceil(b.x0); x <= b.x1; x += 1) for (let y = Math.ceil(b.y0); y <= b.y1; y += 1) tryAt(x, y)
    const c = best
    for (let x = c.x - 1; x <= c.x + 1; x += 0.25) for (let y = c.y - 1; y <= c.y + 1; y += 0.25) tryAt(x, y)
    return best
  }

  const want = UNIT_RADIUS + 1.5
  /** Clearance from anchors already placed: a full unit apart from other provinces', less within a province (never occupied together). */
  const spacing = (id, x, y) =>
    placed.reduce((m, a) => {
      const gap = a.key.split("/")[0] === id ? 10 : 2 * UNIT_RADIUS + 2
      return Math.min(m, Math.hypot(a.x - x, a.y - y) - gap)
    }, Infinity)

  // Province anchors (armies and single-coast fleets): enough room for a unit,
  // as close as possible to the label (the source's labels sit at each
  // province's visual centre, so units end up beside their names).
  for (const p of engine) {
    const id = p.id
    let a
    if (ANCHOR_OVERRIDES[id]) a = { ...ANCHOR_OVERRIDES[id] }
    else {
      const l = labels[id]
      a = search(id, (x, y) => Math.min(room(id, x, y), want) - 0.08 * Math.hypot(x - l.x, y - l.y))
    }
    anchors[id] = { x: a.x, y: a.y }
    placed.push({ ...anchors[id], key: id })
  }

  // Coast anchors: room first, then as close to the coast's sea(s) as possible,
  // away from the army anchor of the same province.
  for (const [k, seas] of Object.entries(COAST_SEAS)) {
    const [id] = k.split("/")
    let a
    if (ANCHOR_OVERRIDES[k]) a = { ...ANCHOR_OVERRIDES[k] }
    else {
      const seaPolys = seas.map((s) => geo.get(s).polys)
      const toSea = (x, y) => Math.min(...seaPolys.map((sp) => edgeDist(sp, x, y)))
      a = search(id, (x, y) =>
        Math.min(room(id, x, y), want, spacing(id, x, y)) - 0.35 * toSea(x, y))
    }
    anchors[k] = { x: a.x, y: a.y }
    placed.push({ ...anchors[k], key: k })
  }

  // Debug aid: DEBUG_ROOM=nap,lon prints the roomiest spots near a province's name.
  for (const id of (process.env.DEBUG_ROOM ?? "").split(",").filter(Boolean)) {
    const l = labels[id]
    const pts = []
    for (let x = l.x - 25; x <= l.x + 25; x += 1) for (let y = l.y - 25; y <= l.y + 30; y += 1) {
      const g = geo.get(id)
      if (!pointInPolys(g.polys, x, y)) continue
      pts.push({ x, y, r: room(id, x, y), d: Math.hypot(x - l.x, y - l.y) })
    }
    pts.sort((a, b) => b.r - a.r)
    console.log(`  debug ${id}: label ${fmt(l.x)},${fmt(l.y)} anchor ${fmt(anchors[id].x)},${fmt(anchors[id].y)}`)
    for (const p of pts.filter((p) => p.r >= 4.5).sort((a, b) => a.d - b.d).slice(0, 6)) console.log(`    ${p.x.toFixed(1)},${p.y.toFixed(1)} room ${p.r.toFixed(1)} dist ${p.d.toFixed(1)}`)
  }

  for (const [k, a] of Object.entries(anchors)) {
    const id = k.split("/")[0]
    const r = room(id, a.x, a.y)
    const hand = ANCHOR_OVERRIDES[k] ? " (hand-placed)" : ""
    if (r < UNIT_RADIUS || hand) report.push(`${k}: ${r.toFixed(1)} units of room${hand}`)
  }
  const keys = Object.keys(anchors)
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = anchors[keys[i]], b = anchors[keys[j]]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    if (dist < 2 * UNIT_RADIUS) report.push(`${keys[i]} / ${keys[j]}: anchors only ${dist.toFixed(1)} apart`)
  }

  // -------------------------------------------------------------------------
  // Emit.

  const ids = engine.map((p) => p.id)
  const pt = (o) => `{ x: ${fmt(o.x)}, y: ${fmt(o.y)} }`
  const anchorKeys = [...ids, ...Object.keys(COAST_SEAS)]
  const lines = [
    "// GENERATED by scripts/extract-map.mjs from Martin Asal's \"Diplomacy.svg\"",
    "// (https://commons.wikimedia.org/wiki/File:Diplomacy.svg), licensed CC BY-SA 3.0.",
    "// This file is a derivative of that map (path data adapted) and is distributed",
    "// under CC BY-SA 3.0; see LICENSE-map.md. Do not edit by hand: change the",
    "// generator (its override tables) and re-run it.",
    "",
    'import type { ProvinceId } from "../engine/types"',
    "",
    "export const VIEWBOX = { width: 610, height: 560 }",
    "",
    "/** Radius-ish half size of a unit glyph; anchors keep this much room where they can. */",
    `export const UNIT_RADIUS = ${UNIT_RADIUS}`,
    "/** Supply-centre marker radius. */",
    `export const SC_RADIUS = ${SC_RADIUS}`,
    "/** Province label font size (labels are drawn centred on LABELS). */",
    `export const LABEL_FONT_SIZE = ${LABEL_FONT_SIZE}`,
    "/** Where a dislodged unit is drawn, relative to its location's anchor. */",
    `export const DISLODGED_OFFSET = ${pt(DISLODGED_OFFSET)}`,
    "",
    "/** SVG path data for each of the 75 provinces, keyed by engine id. */",
    "export const PROVINCE_PATHS: Record<ProvinceId, string> = {",
    ...ids.map((id) => `  ${id}: ${JSON.stringify(geo.get(id).d)},`),
    "}",
    "",
    "/** Non-playable shapes: background land, Switzerland, and water inlets drawn over land. */",
    'export const DECOR_PATHS: { id: string; kind: "land" | "impassable" | "water"; d: string }[] = [',
    ...decor.map((x) => `  { id: ${JSON.stringify(x.id)}, kind: ${JSON.stringify(x.kind)}, d: ${JSON.stringify(x.d)} },`),
    "]",
    "",
    "/** Centre of each province label. */",
    "export const LABELS: Record<ProvinceId, { x: number; y: number }> = {",
    ...ids.map((id) => `  ${id}: ${pt(labels[id])},`),
    "}",
    "",
    "/** Centre of each supply-centre marker (34). */",
    "export const SC_MARKERS: Record<ProvinceId, { x: number; y: number }> = {",
    ...ids.filter((id) => scMarkers[id]).map((id) => `  ${id}: ${pt(scMarkers[id])},`),
    "}",
    "",
    "/** Where a unit is drawn, keyed by location key (province id or \"spa/nc\" etc.). */",
    "export const UNIT_ANCHORS: Record<string, { x: number; y: number }> = {",
    ...anchorKeys.map((k) => `  ${k.includes("/") ? JSON.stringify(k) : k}: ${pt(anchors[k])},`),
    "}",
    "",
  ]
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, lines.join("\n"))

  console.log(`wrote ${path.relative(process.cwd(), outPath)}`)
  console.log(`  ${ids.length} provinces, ${Object.keys(scMarkers).length} supply centres, ${anchorKeys.length} anchors, ${decor.length} decor shapes`)
  for (const n of notes) console.log(`  note: ${n}`)
  for (const r of report) console.log(`  warn: ${r}`)
}

main()
