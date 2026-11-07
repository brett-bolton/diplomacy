import { expect, test, type Page } from "@playwright/test"

// Winter disbands on a phone: Russia owns its four home centers but has five
// units (six for two disbands), so after an all-hold Fall it must remove one
// (or two). Under the default civil-disorder rule (farthest from home first,
// fleets before armies) the Gulf of Bothnia fleet goes first.

type Unit = { power: "RUS"; type: "A" | "F"; location: { province: string } }
const RUSSIA: Unit[] = [
  { power: "RUS", type: "A", location: { province: "war" } },
  { power: "RUS", type: "F", location: { province: "sev" } },
  { power: "RUS", type: "F", location: { province: "bot" } },
  { power: "RUS", type: "A", location: { province: "ukr" } },
  { power: "RUS", type: "A", location: { province: "lvn" } },
]
const PRUSSIA: Unit = { power: "RUS", type: "A", location: { province: "pru" } }

/** Create the game, join as Russia on this phone, lock in Fall, and open the Winter screen. */
async function russiaInWinter(page: Page, units: Unit[]): Promise<string> {
  const players = ["Austria", "England", "France", "Germany", "Italy", "Russia", "Turkey"]
  const created = await page.request.post("/api/games", {
    data: {
      name: "Disbands",
      playerCount: 7,
      participants: players.map((name, seat) => ({ name, seat, isGameMaster: seat === 0 })),
      custom: { year: 1901, season: "fall", units, owners: { mos: "RUS", stp: "RUS", war: "RUS", sev: "RUS" } },
    },
  })
  expect(created.ok()).toBe(true)
  const { code } = await created.json()

  // Join as Russia with the creator's QR link, then lock in Fall (everything holds).
  const view = await (await page.request.get(`/api/games/${code}`)).json()
  const russia = view.participants.find((p: { name: string }) => p.name === "Russia")
  const { url } = await (await page.request.post(`/api/games/${code}/participants/${russia.id}/link`, { data: {} })).json()
  await page.goto(url)
  await expect(page).toHaveURL(new RegExp(`/g/${code}$`))
  expect((await page.request.post(`/api/games/${code}/submit`, { data: { requestId: "fall" } })).ok()).toBe(true)

  await page.reload()
  await expect(page.getByText("Winter 1901 · Builds").first()).toBeVisible()
  return code
}

const unit = (page: Page, name: string) => page.getByRole("button", { name, exact: true })

async function lockIn(page: Page) {
  await page.getByRole("button", { name: "Submit orders" }).click()
  await page.getByRole("button", { name: "Lock in orders" }).click()
  await expect(page.getByText("Spring 1902 · Orders").first()).toBeVisible({ timeout: 15_000 })
}

async function russianUnits(page: Page, code: string): Promise<string[]> {
  const after = await (await page.request.get(`/api/games/${code}`)).json()
  return (after.state.units as Unit[])
    .filter((u) => u.power === "RUS")
    .map((u) => `${u.type} ${u.location.province}`)
    .sort()
}

test("disbands the one unit the player picks", async ({ page }) => {
  const code = await russiaInWinter(page, RUSSIA)
  await expect(page.getByText("You must disband 1 unit")).toBeVisible()
  await expect(page.getByText("0 of 1 chosen")).toBeVisible()
  await expect(page.getByText("picked by the civil-disorder rule (farthest from home first)")).toBeVisible()
  for (const name of ["Army in Warsaw", "Fleet in Sevastopol", "Fleet in Gulf of Bothnia", "Army in Ukraine", "Army in Livonia"]) {
    await expect(unit(page, name)).toHaveAttribute("aria-pressed", "false")
  }

  // Pick Livonia, then tap Ukraine: with one disband the selection moves.
  await unit(page, "Army in Livonia").click()
  await expect(unit(page, "Army in Livonia")).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("1 of 1 chosen")).toBeVisible()
  await unit(page, "Army in Ukraine").click()
  await expect(unit(page, "Army in Ukraine")).toHaveAttribute("aria-pressed", "true")
  await expect(unit(page, "Army in Livonia")).toHaveAttribute("aria-pressed", "false")
  await expect(page.getByText("1 of 1 chosen")).toBeVisible()
  await expect(page.getByText(/You've already chosen/)).toHaveCount(0)
  await expect(page.getByText("Draft saved")).toBeVisible({ timeout: 10_000 })

  // Review shows exactly that disband, then lock in.
  await page.getByRole("button", { name: "Review orders" }).click()
  await expect(page.getByText("Disband A Ukr")).toBeVisible()
  await expect(page.getByText("Disband A Lvn")).toHaveCount(0)
  await expect(page.getByText(/more disbands? needed/)).toHaveCount(0)
  await lockIn(page)

  // Spring 1902: the Ukraine army is gone and the checklist says to take it off the board.
  await expect(page.getByText("Remove Russia's A Ukr")).toBeVisible()
  expect(await russianUnits(page, code)).toEqual(["A lvn", "A war", "F bot", "F sev"])
})

test("disbands two chosen units, refusing a third until one is put back", async ({ page }) => {
  const code = await russiaInWinter(page, [...RUSSIA, PRUSSIA])
  await expect(page.getByText("You must disband 2 units")).toBeVisible()

  await unit(page, "Army in Livonia").click()
  await unit(page, "Army in Prussia").click()
  await expect(unit(page, "Army in Livonia")).toHaveAttribute("aria-pressed", "true")
  await expect(unit(page, "Army in Prussia")).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("2 of 2 chosen")).toBeVisible()

  // A third tap is refused with a hint.
  await unit(page, "Army in Ukraine").click()
  await expect(page.getByText("You've already chosen 2. Tap one again to keep it instead.")).toBeVisible()
  await expect(unit(page, "Army in Ukraine")).toHaveAttribute("aria-pressed", "false")
  await expect(page.getByText("2 of 2 chosen")).toBeVisible()

  // Keep Livonia instead, then pick Ukraine.
  await unit(page, "Army in Livonia").click()
  await expect(unit(page, "Army in Livonia")).toHaveAttribute("aria-pressed", "false")
  await expect(page.getByText(/You've already chosen/)).toHaveCount(0)
  await expect(page.getByText("1 of 2 chosen")).toBeVisible()
  await unit(page, "Army in Ukraine").click()
  await expect(unit(page, "Army in Ukraine")).toHaveAttribute("aria-pressed", "true")
  await expect(unit(page, "Army in Prussia")).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("2 of 2 chosen")).toBeVisible()
  await expect(page.getByText("Draft saved")).toBeVisible({ timeout: 10_000 })

  await page.getByRole("button", { name: "Review orders" }).click()
  await expect(page.getByText("Disband A Pru")).toBeVisible()
  await expect(page.getByText("Disband A Ukr")).toBeVisible()
  await expect(page.getByText("Disband A Lvn")).toHaveCount(0)
  await expect(page.getByText(/more disbands? needed/)).toHaveCount(0)
  await lockIn(page)

  await expect(page.getByText("Remove Russia's A Pru")).toBeVisible()
  await expect(page.getByText("Remove Russia's A Ukr")).toBeVisible()
  expect(await russianUnits(page, code)).toEqual(["A lvn", "A war", "F bot", "F sev"])
})

test("fills a missing disband by the civil-disorder rule", async ({ page }) => {
  const code = await russiaInWinter(page, [...RUSSIA, PRUSSIA])
  await expect(page.getByText("You must disband 2 units")).toBeVisible()
  await unit(page, "Army in Ukraine").click()
  await expect(page.getByText("1 of 2 chosen")).toBeVisible()
  await expect(page.getByText("Draft saved")).toBeVisible({ timeout: 10_000 })

  // Review flags the missing disband.
  await page.getByRole("button", { name: "Review orders" }).click()
  await expect(page.getByText("Disband A Ukr")).toBeVisible()
  await expect(page.getByText("1 more disband needed")).toBeVisible()
  await expect(page.getByText("Chosen by the civil-disorder rule (farthest from home first)")).toBeVisible()
  await expect(page.getByText("automatic", { exact: true })).toBeVisible()
  await lockIn(page)

  // The rule takes the fleet farthest from home: the Gulf of Bothnia.
  await expect(page.getByText("Remove Russia's A Ukr")).toBeVisible()
  await expect(page.getByText("Remove Russia's F Bot (removed by the civil-disorder rule)")).toBeVisible()
  expect(await russianUnits(page, code)).toEqual(["A lvn", "A pru", "A war", "F sev"])
})
