import { expect, test } from "./fixtures";

test.describe("Página inicial", () => {
  test("redirige al dashboard sin violaciones graves de accesibilidad @smoke @mobile", async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Dashboard · Platería Pereda");

    const { violations } = await makeAxeBuilder().analyze();
    const graves = violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(graves).toEqual([]);
  });
});
