// Convoy route helpers shared by the adjudicator and the legal-order generator.

import { FLEET_ADJ, PROVINCES, isSea } from "./map/standard"
import type { ProvinceId } from "./types"

/** Sea provinces a fleet could convoy from/to for an army in `prov`. */
export function seasTouching(prov: ProvinceId): Set<ProvinceId> {
  const out = new Set<ProvinceId>()
  const pr = PROVINCES[prov]
  if (!pr || pr.kind === "inland") return out
  const keys = pr.coasts ? pr.coasts.map((c) => `${prov}/${c}`) : [prov]
  for (const k of keys) {
    for (const n of FLEET_ADJ.get(k) ?? []) if (isSea(n)) out.add(n)
  }
  return out
}

/** Is there a chain of the given sea provinces linking `from` and `to`? */
export function seaChain(from: ProvinceId, to: ProvinceId, seas: Set<ProvinceId>): ProvinceId[] | null {
  const start = [...seasTouching(from)].filter((s) => seas.has(s))
  const goal = seasTouching(to)
  const prev = new Map<ProvinceId, ProvinceId | null>()
  const queue: ProvinceId[] = []
  for (const s of start) {
    prev.set(s, null)
    queue.push(s)
  }
  while (queue.length) {
    const s = queue.shift()!
    if (goal.has(s)) {
      const path: ProvinceId[] = []
      for (let c: ProvinceId | null = s; c; c = prev.get(c) ?? null) path.unshift(c)
      return path
    }
    for (const n of FLEET_ADJ.get(s) ?? []) {
      if (seas.has(n) && !prev.has(n)) {
        prev.set(n, s)
        queue.push(n)
      }
    }
  }
  return null
}

/**
 * Every irredundant convoy route from `from` to `to` through the given seas: no
 * fleet can be dropped and still leave a route. A fleet is only "part of" a
 * convoy if it is on one of these (DATC 6.G.19).
 */
export function minimalConvoyRoutes(from: ProvinceId, to: ProvinceId, seas: Set<ProvinceId>): ProvinceId[][] {
  const atStart = seasTouching(from)
  const atEnd = seasTouching(to)
  const routes: ProvinceId[][] = []
  const walk = (path: ProvinceId[]) => {
    const last = path[path.length - 1]
    if (atEnd.has(last)) {
      routes.push([...path])
      return
    }
    for (const n of FLEET_ADJ.get(last) ?? []) {
      if (!seas.has(n) || path.includes(n) || atStart.has(n)) continue
      // No shortcut: n must not touch any earlier sea except its predecessor.
      if (path.slice(0, -1).some((p) => FLEET_ADJ.get(p)?.has(n))) continue
      path.push(n)
      walk(path)
      path.pop()
    }
  }
  for (const s of atStart) if (seas.has(s)) walk([s])
  return routes
}

