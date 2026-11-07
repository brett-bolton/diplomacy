import { expect, test } from "@playwright/test"

// Winter builds on a phone: Russia has one build with St Petersburg (two coasts)
// and Moscow (inland) open. The player picks a fleet on one coast, changes to
// the other coast, taps Moscow (which moves the single build), goes back to
// the fleet, then reviews, locks in, and checks the result.
test("builds a fleet on the chosen coast of St Petersburg", async ({ page }) => {
  const players = ["Austria", "England", "France", "Germany", "Italy", "Russia", "Turkey"]
  const created = await page.request.post("/api/games", {
    data: {
      name: "Builds",
      playerCount: 7,
      participants: players.map((name, seat) => ({ name, seat, isGameMaster: seat === 0 })),
      custom: {
        year: 1901,
        season: "fall",
        units: [
          { power: "RUS", type: "A", location: { province: "war" } },
          { power: "RUS", type: "F", location: { province: "sev" } },
          { power: "RUS", type: "F", location: { province: "bot" } },
          { power: "RUS", type: "A", location: { province: "rum" } },
        ],
        owners: { mos: "RUS", stp: "RUS", war: "RUS", sev: "RUS" },
      },
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

  // Winter: the build screen.
  await page.reload()
  await expect(page.getByText("Winter 1901 · Builds").first()).toBeVisible()
  await expect(page.getByText("You may build 1 unit")).toBeVisible()
  const stp = page.getByRole("group", { name: "Build in St Petersburg" })
  const mos = page.getByRole("group", { name: "Build in Moscow" })
  await expect(mos.getByRole("button")).toHaveText(["Nothing", "Army"]) // inland: no fleets
  await expect(stp.getByRole("button")).toHaveText(["Nothing", "Army", "Fleet (north coast)", "Fleet (south coast)"])

  // Fleet on the north coast, then change to the south coast.
  await stp.getByRole("button", { name: "Fleet (north coast)" }).click()
  await expect(stp.getByRole("button", { name: "Fleet (north coast)" })).toHaveAttribute("aria-pressed", "true")
  await stp.getByRole("button", { name: "Fleet (south coast)" }).click()
  await expect(stp.getByRole("button", { name: "Fleet (south coast)" })).toHaveAttribute("aria-pressed", "true")
  await expect(stp.getByRole("button", { name: "Fleet (north coast)" })).toHaveAttribute("aria-pressed", "false")
  await expect(page.getByText("1 of 1 chosen")).toBeVisible()

  // With one build, tapping Moscow moves it there; then put it back on St Petersburg's south coast.
  await mos.getByRole("button", { name: "Army" }).click()
  await expect(mos.getByRole("button", { name: "Army" })).toHaveAttribute("aria-pressed", "true")
  await expect(stp.getByRole("button", { name: "Nothing" })).toHaveAttribute("aria-pressed", "true")
  await stp.getByRole("button", { name: "Fleet (south coast)" }).click()
  await expect(mos.getByRole("button", { name: "Nothing" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("Draft saved")).toBeVisible({ timeout: 10_000 })

  // Review shows exactly the fleet build, then lock in.
  await page.getByRole("button", { name: "Review orders" }).click()
  await expect(page.getByText("Build F StP/sc")).toBeVisible()
  await expect(page.getByText("Build a fleet in St Petersburg (south coast)")).toBeVisible()
  await page.getByRole("button", { name: "Submit orders" }).click()
  await page.getByRole("button", { name: "Lock in orders" }).click()

  // Spring 1902: the fleet is on the south coast and the checklist says where to put it.
  await expect(page.getByText("Spring 1902 · Orders").first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("Place a new Russian fleet in StP/sc")).toBeVisible()
  const after = await (await page.request.get(`/api/games/${code}`)).json()
  expect(after.state.units).toContainEqual({ power: "RUS", type: "F", location: { province: "stp", coast: "sc" } })
})
