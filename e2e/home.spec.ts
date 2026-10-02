import { expect, test } from "./fixtures";

test.describe("Página inicial", () => {
  test("carga sin violaciones graves de accesibilidad @smoke @mobile", async ({
    page,
    makeAxeBuilder,
  }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const { violations } = await makeAxeBuilder().analyze();
    const graves = violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(graves).toEqual([]);
  });
});
