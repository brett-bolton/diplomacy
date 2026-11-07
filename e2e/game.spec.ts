import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

const PLAYERS = ["Anna", "Ben", "Cleo", "Dev", "Eli", "Fay", "Gus"] // AUS, ENG, FRA, GER, ITA, RUS, TUR

async function newPhone(browser: Browser, contextOptions: Parameters<Browser["newContext"]>[0]): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(contextOptions)
  return { ctx, page: await ctx.newPage() }
}

test("seven phones join by QR, order, lock in, and see the result explained", async ({ browser, playwright }, info) => {
  const device = info.project.use
  const creator = await newPhone(browser, device)
  const p = creator.page

  // Create a 7-player game; Anna (Austria) is the game master.
  await p.goto("/new")
  await p.getByPlaceholder("Friday night").fill("E2E game")
  const nameInputs = p.getByPlaceholder("Player name")
  for (let i = 0; i < 7; i++) await nameInputs.nth(i).fill(PLAYERS[i])
  await p.getByRole("button", { name: "Create game" }).click()
  await expect(p).toHaveURL(/\/g\/[A-Z0-9]{6}\/admin$/)
  const code = p.url().split("/g/")[1].split("/")[0]

  // Each player scans their own QR code (we read the link from the QR sheet).
  const phones: Record<string, Page> = {}
  for (const name of PLAYERS) {
    const row = p.locator("li", { hasText: name })
    await row.getByRole("button", { name: "Show QR" }).click()
    const url = (await p.getByTestId("join-url").textContent())!.trim()
    await p.getByRole("button", { name: "Close" }).click()
    const phone = await newPhone(browser, device)
    await phone.page.goto(url)
    await expect(phone.page).toHaveURL(new RegExp(`/g/${code}$`))
    phones[name] = phone.page
  }
  await expect(p.getByText("7 of 7 joined")).toBeVisible()

  // The game master starts a timer; every phone shows the countdown.
  const anna = phones.Anna
  await anna.getByRole("button", { name: "Game master", exact: true }).click()
  await anna.getByRole("button", { name: "30 min" }).click()
  await expect(phones.Gus.getByText(/^\d+:\d\d$/).first()).toBeVisible({ timeout: 10_000 })

  // France orders Paris → Burgundy with the pickers.
  const cleo = phones.Cleo
  await expect(cleo.getByText("Your units")).toBeVisible()
  await cleo.getByRole("button", { name: /A Par/ }).click()
  await cleo.getByRole("button", { name: /^Move/ }).click()
  await cleo.getByRole("button", { name: /Burgundy/ }).click()
  await expect(cleo.getByText("Move to Burgundy")).toBeVisible()
  await expect(cleo.getByText("Draft saved")).toBeVisible({ timeout: 10_000 })

  // England can't see France's orders.
  await expect(phones.Ben.getByText("Move to Burgundy")).toHaveCount(0)

  // Everyone reviews and locks in.
  for (const name of PLAYERS) {
    const ph = phones[name]
    await ph.getByRole("button", { name: "Orders", exact: true }).click()
    await ph.getByRole("button", { name: "Review orders" }).click()
    await ph.getByRole("button", { name: "Submit orders" }).click()
    await ph.getByRole("button", { name: "Lock in orders" }).click()
    if (name !== PLAYERS.at(-1)) await expect(ph.getByText("Orders locked in")).toBeVisible()
  }

  // Adjudicated: everyone moves on to Fall 1901 and sees the checklist.
  for (const name of PLAYERS) await expect(phones[name].getByText("Fall 1901 · Orders").first()).toBeVisible({ timeout: 15_000 })
  await expect(phones.Ben.getByText("Move A Par → Bur")).toBeVisible()

  // History explains the result.
  await phones.Ben.getByRole("button", { name: "History", exact: true }).click()
  await expect(phones.Ben.getByText("Spring 1901 · Orders")).toBeVisible()
  await phones.Ben.getByText("A Par - Bur").click()
  await expect(phones.Ben.getByText(/Attack strength 1/)).toBeVisible()

  void playwright
})
