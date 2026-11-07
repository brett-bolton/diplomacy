import { describe, expect, it } from "vitest"
import { PROVINCE_IDS, PROVINCES, SUPPLY_CENTERS, neighbors } from "../engine/map/standard"
import type { Coast } from "../engine/types"
import {
  DECOR_PATHS,
  DISLODGED_OFFSET,
  LABELS,
  LABEL_FONT_SIZE,
  PROVINCE_PATHS,
  SC_MARKERS,
  SC_RADIUS,
  UNIT_ANCHORS,
  UNIT_RADIUS,
  VIEWBOX,
} from "./geometry"

type Pt = [number, number]

/** Flatten SVG path data (M/L/H/V/C/Z, absolute or relative) into polygons, sampling curves. */
function flatten(d: string, steps = 8): Pt[][] {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []
  const polys: Pt[][] = []
  let pts: Pt[] = []
  let i = 0
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let cmd = ""
  const num = () => Number(toks[i++])
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++]
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    switch (cmd.toLowerCase()) {
      case "m":
        x = ox + num()
        y = oy + num()
        sx = x
        sy = y
        pts = [[x, y]]
        polys.push(pts)
        cmd = rel ? "l" : "L" // further pairs are line-tos
        break
      case "l":
        x = ox + num()
        y = oy + num()
        pts.push([x, y])
        break
      case "h":
        x = ox + num()
        pts.push([x, y])
        break
      case "v":
        y = oy + num()
        pts.push([x, y])
        break
      case "c": {
        const [x1, y1, x2, y2, x3, y3] = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()]
        for (let s = 1; s <= steps; s++) {
          const t = s / steps
          const u = 1 - t
          pts.push([
            u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          ])
        }
        x = x3
        y = y3
        break
      }
      case "z":
        x = sx
        y = sy
        pts = [[x, y]]
        polys.push(pts)
        break
      default:
        throw new Error(`unsupported path command ${cmd}`)
    }
  }
  return polys.filter((p) => p.length > 2)
}

/** Even-odd point-in-polygon over every subpath. */
function inside(polys: Pt[][], [px, py]: Pt): boolean {
  let hit = false
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit
    }
  }
  return hit
}

/** Distance from a point to the nearest edge of the polygons. */
function edgeDistance(polys: Pt[][], [px, py]: Pt): number {
  let best = Infinity
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j]
      const [bx, by] = poly[i]
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy))
    }
  }
  return best
}

const shapes = Object.fromEntries(PROVINCE_IDS.map((id) => [id, flatten(PROVINCE_PATHS[id] ?? "")]))
const pt = (p: { x: number; y: number }): Pt => [p.x, p.y]
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

const LOCATION_KEYS = PROVINCE_IDS.flatMap((id) => [id, ...(PROVINCES[id].coasts ?? []).map((c) => `${id}/${c}`)])

describe("path flattener (test helper)", () => {
  it("handles relative and absolute commands and curves", () => {
    const rel = flatten("m10 10h20v20h-20z")
    const abs = flatten("M10 10H30V30H10Z")
    for (const polys of [rel, abs]) {
      expect(inside(polys, [20, 20])).toBe(true)
      expect(inside(polys, [5, 20])).toBe(false)
    }
    const circle = flatten("m0 4c-2.21 0-4-1.79-4-4 0-2.21 1.79-4 4-4 2.21 0 4 1.79 4 4 0 2.21-1.79 4-4 4z")
    expect(inside(circle, [0, 0])).toBe(true)
    expect(inside(circle, [3.5, 3.5])).toBe(false)
    const two = flatten("M0 0L10 0 10 10 0 10ZM20 0L30 0 30 10 20 10Z")
    expect(inside(two, [25, 5])).toBe(true)
    expect(inside(two, [15, 5])).toBe(false)
  })
})

describe("map geometry", () => {
  it("has the standard viewBox", () => {
    expect(VIEWBOX).toEqual({ width: 610, height: 560 })
  })

  it("has a path for every engine province and nothing else", () => {
    expect(Object.keys(PROVINCE_PATHS).sort()).toEqual([...PROVINCE_IDS].sort())
    expect(PROVINCE_IDS).toHaveLength(75)
    for (const id of PROVINCE_IDS) expect(shapes[id].length, id).toBeGreaterThan(0)
  })

  it("has a label for every province, inside it", () => {
    expect(Object.keys(LABELS).sort()).toEqual([...PROVINCE_IDS].sort())
    for (const id of PROVINCE_IDS) expect(inside(shapes[id], pt(LABELS[id])), id).toBe(true)
  })

  it("has a supply-centre marker for each of the 34 centres, inside its province", () => {
    expect(SUPPLY_CENTERS).toHaveLength(34)
    expect(Object.keys(SC_MARKERS).sort()).toEqual([...SUPPLY_CENTERS].sort())
    for (const id of SUPPLY_CENTERS) expect(inside(shapes[id], pt(SC_MARKERS[id])), id).toBe(true)
  })

  it("has an anchor for every location key", () => {
    expect(LOCATION_KEYS).toHaveLength(81)
    expect(Object.keys(UNIT_ANCHORS).sort()).toEqual([...LOCATION_KEYS].sort())
  })

  it("puts every anchor inside its own province and no other", () => {
    for (const key of LOCATION_KEYS) {
      const a = pt(UNIT_ANCHORS[key])
      const id = key.split("/")[0]
      expect(inside(shapes[id], a), `${key} inside ${id}`).toBe(true)
      const others = PROVINCE_IDS.filter((o) => o !== id && inside(shapes[o], a))
      expect(others, `${key} also inside`).toEqual([])
      const wet = DECOR_PATHS.filter((d) => d.kind === "water" && inside(flatten(d.d), a)).map((d) => d.id)
      expect(wet, `${key} on water decor`).toEqual([])
    }
  })

  it("keeps anchors at least ~8 units apart", () => {
    const keys = Object.keys(UNIT_ANCHORS)
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const d = dist(UNIT_ANCHORS[keys[i]], UNIT_ANCHORS[keys[j]])
        expect(d, `${keys[i]} vs ${keys[j]}`).toBeGreaterThanOrEqual(8)
      }
    }
  })

  it("keeps units off their supply-centre marker and label", () => {
    // Approximate label box: engine abbreviation at LABEL_FONT_SIZE with
    // Helvetica-like glyph widths, cap height 0.72em.
    const em = (ch: string) =>
      "fijlrtI".includes(ch) ? 0.3 : "MW".includes(ch) ? 0.9 : ch === ch.toUpperCase() ? 0.7 : 0.55
    for (const key of LOCATION_KEYS) {
      const a = UNIT_ANCHORS[key]
      const id = key.split("/")[0]
      const sc = SC_MARKERS[id]
      if (sc) expect(dist(a, sc), `${key} vs its SC`).toBeGreaterThanOrEqual(UNIT_RADIUS + SC_RADIUS)
      const l = LABELS[id]
      const hw = ([...PROVINCES[id].abbr].reduce((w, ch) => w + em(ch), 0) * LABEL_FONT_SIZE) / 2
      const hh = (0.72 * LABEL_FONT_SIZE) / 2
      const dx = Math.max(Math.abs(a.x - l.x) - hw, 0)
      const dy = Math.max(Math.abs(a.y - l.y) - hh, 0)
      // Tuscany is tiny: its unit sits a fraction of a unit closer than a full radius.
      expect(Math.hypot(dx, dy), `${key} vs its label`).toBeGreaterThanOrEqual(UNIT_RADIUS - 0.5)
    }
  })

  it("puts every supply-centre dot directly below its province name", () => {
    for (const [id, sc] of Object.entries(SC_MARKERS)) {
      const l = LABELS[id]
      expect(Math.abs(sc.x - l.x), `${id} dot is centred under the name`).toBeLessThan(0.05)
      expect(sc.y - l.y, `${id} dot sits just below the name`).toBeGreaterThan(7)
      expect(sc.y - l.y, `${id} dot sits just below the name`).toBeLessThan(12)
    }
  })

  it("puts each split-coast anchor on the side of its own coast", () => {
    // For spa/nc vs spa/sc etc.: the neighbours only one coast touches (e.g. the
    // Gulf of Lyon for spa/sc, Gascony for spa/nc) must be nearer to that coast's
    // anchor than to the other coast's anchor.
    for (const id of PROVINCE_IDS.filter((p) => PROVINCES[p].coasts)) {
      const coasts = PROVINCES[id].coasts as Coast[]
      const near = (c: Coast) => new Set(neighbors("F", { province: id, coast: c }).map((l) => l.province))
      for (const c of coasts) {
        const other = coasts.find((o) => o !== c) as Coast
        const own = [...near(c)].filter((n) => !near(other).has(n))
        expect(own.length, `${id}/${c} has exclusive neighbours`).toBeGreaterThan(0)
        for (const n of own) {
          const mine = edgeDistance(shapes[n], pt(UNIT_ANCHORS[`${id}/${c}`]))
          const theirs = edgeDistance(shapes[n], pt(UNIT_ANCHORS[`${id}/${other}`]))
          expect(mine, `${id}/${c} nearer ${n} than ${id}/${other} is`).toBeLessThan(theirs)
        }
      }
    }
  })

  it("keeps everything inside the viewBox", () => {
    const all = [...Object.values(UNIT_ANCHORS), ...Object.values(LABELS), ...Object.values(SC_MARKERS)]
    for (const p of all) {
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(VIEWBOX.width)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(VIEWBOX.height)
    }
    expect(Math.hypot(DISLODGED_OFFSET.x, DISLODGED_OFFSET.y)).toBeGreaterThan(UNIT_RADIUS)
  })
})
