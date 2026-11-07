import { defineConfig, devices } from "@playwright/test"

// End-to-end tests: several phones (browser contexts) play one game against a
// local dev server using the Neon dev branch from .env.local.
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3300", trace: "retain-on-failure" },
  webServer: {
    command: "npx next dev -p 3300",
    url: "http://localhost:3300",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "iphone-se", use: { ...devices["iPhone SE"] } },
    { name: "iphone-15", use: { ...devices["iPhone 15"] } },
    { name: "iphone-pro-max", use: { ...devices["iPhone 15 Pro Max"] } },
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
  ],
})
