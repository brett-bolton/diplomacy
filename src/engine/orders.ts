// Engine-level order types. Units are identified by the province they stand in
// (there is never more than one unit per province).

import type { Coast, Location, ProvinceId, UnitType } from "./types"

export type MovementOrder =
  | { kind: "hold"; unit: ProvinceId }
  | { kind: "move"; unit: ProvinceId; to: Location; viaConvoy?: boolean }
  | { kind: "support-hold"; unit: ProvinceId; target: ProvinceId }
  | {
      kind: "support-move"
      unit: ProvinceId
      from: ProvinceId
      to: ProvinceId
      /** Optional coast; if given it must match the supported fleet's move (DATC 4.B.4). The app never sets it. */
      toCoast?: Coast
    }
  | { kind: "convoy"; unit: ProvinceId; from: ProvinceId; to: ProvinceId }

export type RetreatOrder =
  | { kind: "retreat"; unit: ProvinceId; to: Location }
  | { kind: "disband"; unit: ProvinceId }

export type AdjustmentOrder =
  | { kind: "build"; unitType: UnitType; at: Location }
  | { kind: "remove"; unit: ProvinceId }
  | { kind: "waive" }
