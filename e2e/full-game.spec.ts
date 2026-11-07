import { expect, test, type Browser, type Page } from "@playwright/test"
import { powersToOrder, resolvePhase, type GameState, type PhaseOrders } from "../src/engine/phase"
import { POWERS, type Power } from "../src/engine/types"
import { FULL_GAME, botOrders, seeded } from "../src/testing/bot"

// A whole game, start to finish, on the real server: seven phones join by QR,
// then play every phase through the same API the order screens use until one
// power reaches 18 centers. Bots choose the orders (France plays greedily, the
// rest play random legal orders), so the game is the same every run. After each
// phase the server's new position must match the rules engine's.

const PLAYERS = ["Ava", "Bram", "Cora", "Dax", "Elio", "Fern", "Gale"] // AUS, ENG, FRA, GER, ITA, RUS, TUR

type View = {
  game: { status: string; result: GameState["result"] | null }
  phase: { seq: number; label: string }
  state: GameState
  powers: { power: Power; supplyCenters: number }[]
}

async function newPhone(browser: Browser, device: object): Promise<Page> {
  const ctx = await browser.newContext(device)
  return ctx.newPage()
}

test("plays a whole game from Spring 1901 to victory", async ({ browser }, info) => {
  test.setTimeout(15 * 60_000)
  const device = info.project.use

  // Create the game in the wizard.
  const creator = await newPhone(browser, device)
  await creator.goto("/new")
  await creator.getByPlaceholder("Friday night").fill("Full game")
  const nameInputs = creator.getByPlaceholder("Player name")
  for (let i = 0; i < 7; i++) await nameInputs.nth(i).fill(PLAYERS[i])
  await creator.getByRole("button", { name: "Create game" }).click()
  await expect(creator).toHaveURL(/\/g\/[A-Z0-9]{6}\/admin$/)
  const code = creator.url().split("/g/")[1].split("/")[0]

  // Every player scans their QR code.
  const phoneFor = {} as Record<Power, Page>
  for (const [seat, name] of PLAYERS.entries()) {
    await creator.locator("li", { hasText: name }).getByRole("button", { name: "Show QR" }).click()
    const url = (await creator.getByTestId("join-url").textContent())!.trim()
    await creator.getByRole("button", { name: "Close" }).click()
    const phone = await newPhone(browser, device)
    await phone.goto(url)
    await expect(phone).toHaveURL(new RegExp(`/g/${code}$`))
    phoneFor[POWERS[seat]] = phone
  }
  await expect(creator.getByText("7 of 7 joined")).toBeVisible()

  const watcher = phoneFor.ENG
  const getView = async (): Promise<View> => (await watcher.request.get(`/api/games/${code}`)).json()

  // Play until the game is over.
  const random = seeded(FULL_GAME.seed)
  const played: string[] = []
  let view = await getView()
  while (view.game.status === "active") {
    expect(played.length, "game should end within 120 phases").toBeLessThan(120)
    const state = view.state
    const orders: PhaseOrders = new Map()
    for (const p of powersToOrder(state)) orders.set(p, botOrders(state, p, FULL_GAME.conqueror, random))

    // Each phone saves its orders and locks them in (all at once, like a real table).
    await Promise.all(
      [...orders].map(async ([power, list]) => {
        const phone = phoneFor[power]
        const saved = await phone.request.put(`/api/games/${code}/orders`, { data: { power, orders: list } })
        expect(saved.ok(), `${view.phase.label} ${power}: ${await saved.text()}`).toBe(true)
        const locked = await phone.request.post(`/api/games/${code}/submit`, { data: { requestId: `${view.phase.seq}-${power}` } })
        expect(locked.ok(), `${view.phase.label} ${power}: ${await locked.text()}`).toBe(true)
      }),
    )

    // The server adjudicated exactly as the engine does.
    const expected = resolvePhase(state, orders).state
    played.push(view.phase.label)
    view = await getView()
    if (expected.result) {
      expect(view.game).toMatchObject({ status: "finished", result: expected.result })
    } else {
      expect(view.state, `after ${played.at(-1)}`).toEqual(expected)
    }
  }

  // France won with at least 18 centers.
  expect(view.game.result).toEqual({ kind: "victory", seat: POWERS.indexOf(FULL_GAME.conqueror), powers: [FULL_GAME.conqueror] })
  const winnerName = PLAYERS[POWERS.indexOf(FULL_GAME.conqueror)]
  console.log(`${code}: ${played.length} phases, ${played[0]} → ${played.at(-1)}; ${winnerName} wins`)

  // Nobody can order any more.
  const late = await phoneFor.GER.request.post(`/api/games/${code}/submit`, { data: { requestId: "late" } })
  expect(late.status()).toBe(409)

  // Every phone shows the result.
  for (const power of ["FRA", "TUR"] as Power[]) {
    const phone = phoneFor[power]
    await phone.reload()
    await expect(phone.getByText("Game over").first()).toBeVisible()
    await expect(phone.getByText(`${winnerName} wins`)).toBeVisible()
  }

  // History runs from the first phase to the last.
  const fra = phoneFor.FRA
  await fra.getByRole("button", { name: "History", exact: true }).click()
  await expect(fra.getByText(played.at(-1)!, { exact: true })).toBeVisible()
  await fra.getByRole("slider", { name: "Timeline" }).fill("0")
  await expect(fra.getByText("Spring 1901 · Orders", { exact: true })).toBeVisible()
  await expect(fra.getByRole("button", { name: "Previous phase" })).toBeDisabled()
})
