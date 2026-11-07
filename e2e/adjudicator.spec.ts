import { expect, test, type Page } from "@playwright/test"

async function addPower(page: Page, name: string) {
  await page.getByRole("button", { name: "+ Add power" }).click()
  await page.getByRole("dialog", { name: "Add a power" }).getByRole("button", { name }).click()
}

async function addUnit(page: Page, power: string, provinceId: string, kind: string) {
  await page.getByRole("button", { name: `Add a ${power} unit` }).click()
  const sheet = page.getByRole("dialog", { name: `Add a ${power} unit` })
  await sheet.getByRole("combobox", { name: "Province" }).selectOption(provinceId)
  await sheet.getByRole("button", { name: new RegExp(`^${kind}`) }).click()
}

test("adjudicates a standalone position and explains the result", async ({ page }) => {
  await page.goto("/adjudicate")
  await expect(page.getByRole("heading", { name: "Adjudicator" })).toBeVisible()

  // Year and season.
  await page.getByRole("textbox", { name: "Year" }).fill("1903")
  await page.getByRole("button", { name: "Fall" }).click()

  // Powers and units.
  await addPower(page, "France")
  await addUnit(page, "France", "par", "Army")
  await addUnit(page, "France", "mar", "Army")
  await addPower(page, "Germany")
  await addUnit(page, "Germany", "bur", "Army")
  await expect(page.getByRole("button", { name: /^A Bur: holds/ })).toBeVisible()

  // Orders: Paris attacks Burgundy, supported by Marseilles. Germany holds.
  await page.getByRole("button", { name: /^A Par:/ }).click()
  await page.getByRole("button", { name: /^Move/ }).click()
  await page.getByRole("button", { name: /^Burgundy/ }).click()
  await expect(page.getByRole("button", { name: /^A Par: Move to Burgundy/ })).toBeVisible()
  await page.getByRole("button", { name: /^A Mar:/ }).click()
  await page.getByRole("button", { name: /^Support/ }).click()
  await page.getByRole("button", { name: "Army in Paris (France)" }).click()
  await page.getByRole("button", { name: /^Move to Burgundy/ }).click()
  await expect(page.getByRole("button", { name: /^A Mar: Support the army in Paris into Burgundy/ })).toBeVisible()

  // The link holds the scenario: reload and everything is still there.
  expect(new URL(page.url()).hash.length).toBeGreaterThan(10)
  await page.reload()
  await expect(page.getByRole("button", { name: /^A Par: Move to Burgundy/ })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Year" })).toHaveValue("1903")

  // Adjudicate.
  await page.getByRole("button", { name: "Adjudicate Fall 1903" }).click()
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible()
  await expect(page.getByText(/Germany's A Bur: retreat to/)).toBeVisible()
  await page.getByText("A Par - Bur", { exact: true }).click()
  await expect(page.getByText(/Attack strength 2 \(A Par \+ support from A Mar\)/)).toBeVisible()
  await expect(page.getByText(/A Bur is dislodged/)).toBeVisible()

  // Continue from the result: Spring 1904, France in Burgundy, the German army gone.
  await page.getByRole("button", { name: "Continue from this result" }).click()
  await expect(page.getByRole("button", { name: "Adjudicate Spring 1904" })).toBeVisible()
  await expect(page.getByRole("button", { name: /^A Bur: holds/ })).toBeVisible()
  await expect(page.getByRole("button", { name: /^A Par:/ })).toHaveCount(0)
  await expect(page.getByText("No units yet.")).toBeVisible() // Germany's card is now empty
})
