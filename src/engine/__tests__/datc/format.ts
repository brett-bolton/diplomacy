// Fixture format for DATC (Diplomacy Adjudicator Test Cases) v3.0 test cases.
// Orders are kept in DATC's own notation so fixtures stay close to the source text.

export interface DatcCase {
  /** DATC id, e.g. "6.A.1" */
  id: string
  /** DATC title, e.g. "Moving to an area that is not a neighbour" */
  title: string
  /**
   * Units on the board that the order lines don't introduce, in DATC notation
   * with power headings and no action, e.g. "England:\nF London".
   */
  units?: string
  /**
   * Supply center owners when they matter (adjustment cases), e.g.
   * "Germany: Berlin, Kiel, Munich, Denmark\nRussia: Warsaw".
   */
  ownership?: string
  /** Phase the `orders` are for. Default "movement". */
  phase?: "movement" | "adjustment"
  /**
   * Orders in DATC notation with power headings, e.g.
   * "England:\nF North Sea - Picardy\nA Liverpool Supports F North Sea - Picardy".
   * Every unit named at the start of an order line is placed on the board for
   * that power, unless `units` already put a unit in that province.
   */
  orders: string
  /** Retreat-phase orders, given after the movement orders are adjudicated. */
  retreats?: string
  expect: DatcExpect
  /** Why the expectation is what it is, when it depends on a rule option. */
  note?: string
  /** If set, the case is reported as skipped with this reason. */
  skip?: string
}

/** Province ids are lower-case three-letter ids ("nth", "stp", "mao"). */
export interface DatcExpect {
  /**
   * Units (by starting province) whose movement-phase order succeeds.
   * Moves: the unit moved. Supports: the support was given (legal, matched, not cut).
   */
  succeeds?: string[]
  /** Units whose movement-phase order fails (illegal, bounced, cut, void). */
  fails?: string[]
  /** Units (by starting province) dislodged in the movement phase. */
  dislodged?: string[]
  /** Units (by starting province) explicitly not dislodged. */
  notDislodged?: string[]
  /**
   * Complete list of units on the board after all phases in the case, by power
   * name, e.g. { England: ["F nth", "A bel"], Russia: ["F stp/sc"] }.
   * Powers not listed are not checked.
   */
  final?: Record<string, string[]>
}
