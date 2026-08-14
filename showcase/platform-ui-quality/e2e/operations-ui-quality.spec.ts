import { expect, test } from "@playwright/test";

import {
  assertOwnedActionsFit,
  horizontalOverflowFindings,
} from "./geometry.ts";
import {
  FixtureIncidentActionState,
  FixtureIncidentAuditState,
  FixtureIncidentCollectionState,
  installOperationsApiFixtures,
  operationsFixtureLabels,
} from "./operations-fixtures.ts";
import type {
  OperationsFixtureOptions,
} from "./operations-fixtures.ts";
import { waitForStableUi } from "./fixtures.ts";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("private-surface scanner finds a recursively planted host fact", () => {
  const planted = {
    public: [{ nested: { locator: { workflowId: "private-workflow" } } }],
  };
  expect(privateSurfaceFindings(planted)).toEqual([
    "$.public[0].nested.locator",
    "$.public[0].nested.locator.workflowId",
  ]);
});

test("Operations is a primary keyboard-reachable workspace", async ({ page }) => {
  await installOperationsApiFixtures(page);
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  const operations = navigation.getByRole("button", { name: "Operations", exact: true });
  await expect(operations).toBeVisible();
  await expect(page.locator("body")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(navigation.getByRole("button", { name: "Work", exact: true })).toBeFocused();
  await operations.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeFocused();
});

test("incident collection and full-width detail remain contained and focus-safe", async ({ page }) => {
  await openIncidents(page);
  const workspace = page.locator('[data-ui="operations-workspace"]');
  const collection = page.locator('[data-ui="incident-collection"]');
  const table = page.getByRole("table", { name: "Current incidents" });
  await expect(page.getByRole("heading", { name: "Current incidents" })).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table).toContainText(operationsFixtureLabels.process);
  await expect(table).toContainText(operationsFixtureLabels.element);
  await expect(table).toContainText(operationsFixtureLabels.processModel);
  await expect(table.locator("tbody td").evaluateAll((cells) =>
    cells.flatMap((cell, index) =>
      getComputedStyle(cell).overflowWrap === "anywhere" ? [] : [index]
    )
  ), "every incident cell must wrap identifier-shaped content").resolves.toEqual([]);

  await assertNoOverflow(page.locator("html"), "document");
  await assertNoOverflow(page.locator("main"), "workspace");
  await assertNoOverflow(workspace, "Operations workspace");
  await assertNoOverflow(page.getByRole("tablist", { name: "Operations" }), "Operations tabs");
  await assertNoOverflow(collection, "incident collection");
  await assertNoOverflow(collection.locator('[data-ui="data-table-collection"]'), "incident table owner");
  const rows = table.getByRole("row");
  for (let index = 1; index < await rows.count(); index += 1) {
    await assertNoOverflow(rows.nth(index), `incident row ${index}`);
  }
  await assertOwnedActionsFit(collection);
  if (test.info().project.name === "chromium-768") {
    const columnCount = await rows.nth(1).evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length
    );
    expect(columnCount, "768px incident cards must use one content column").toBe(1);
  }

  const selection = incidentSelection(page);
  await selection.click();
  const heading = page.getByRole("heading", {
    name: `Incident ${operationsFixtureLabels.element}`,
  });
  await expect(heading).toBeFocused();
  const detail = page.locator('[data-ui="incident-detail"]');
  await expect(detail).toContainText(operationsFixtureLabels.process);
  const detailTabs = page.getByRole("tablist", { name: "Incident detail" });
  await expect(detailTabs.getByRole("tab")).toHaveCount(3);
  await expect(detailTabs.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const widths = await Promise.all([
    workspace.evaluate((element) => element.getBoundingClientRect().width),
    detail.evaluate((element) => element.getBoundingClientRect().width),
  ]);
  expect(widths[1], "detail must occupy the Operations content width").toBeGreaterThanOrEqual(
    widths[0] * 0.98,
  );
  await assertNoOverflow(detail, "incident detail");
  await assertNoOverflow(page.locator('[data-ui="incident-overview"]'), "incident overview");
  await assertOwnedActionsFit(page.locator('[data-ui="incident-overview"]'));

  await page.getByRole("button", { name: "Back to incidents" }).click();
  await expect(selection).toBeFocused();
});

test("incident Diagram shows the exact highlighted element and reduced motion", async ({ page }) => {
  await openIncident(page);
  await page.getByRole("tab", { name: "Diagram" }).click();
  await waitForStableUi(page, { diagram: true });
  const detail = page.locator('[data-ui="incident-detail"]');
  const diagramSurface = page.locator('[data-ui="definition-diagram-surface"]');
  await expect(diagramSurface).toBeVisible();
  await expect(page.getByLabel(
    `BPMN diagram for ${operationsFixtureLabels.processModel}, version 1, highlighting ${operationsFixtureLabels.element}`,
    { exact: true },
  )).toBeVisible();
  await expect(diagramSurface.locator(
    `.djs-element[data-element-id="${operationsFixtureLabels.element}"].bpmn-platform-incident`,
  )).toHaveCount(1);
  await expect(diagramSurface.getByText("Generated layout", { exact: true })).toBeVisible();
  await expect(diagramSurface.getByText("Derived presentation copy, not admitted source.")).toBeVisible();
  await assertNoOverflow(detail, "Diagram detail");
  await assertNoOverflow(diagramSurface, "Diagram surface");
  await assertOwnedActionsFit(diagramSurface);

  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches))
    .toBe(true);
  const motion = await page.getByRole("tablist", { name: "Incident detail" }).evaluate(
    (element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        scrollBehavior: style.scrollBehavior,
        transitionDuration: style.transitionDuration,
      };
    },
  );
  expect(motion).toEqual({
    animationDuration: "0s",
    scrollBehavior: "auto",
    transitionDuration: "0s",
  });
});

test("Cancel confirmation is safe, dismissible, and retains processClosed rejection", async ({ page }) => {
  await openIncident(page);
  const cancel = page.getByRole("button", { name: "Cancel Process", exact: true });
  await cancel.focus();
  await cancel.click();
  const dialog = page.getByRole("dialog", { name: "Cancel root Process?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep Process running" })).toBeFocused();
  await assertNoOverflow(dialog, "Cancel dialog");
  await assertOwnedActionsFit(dialog);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(cancel).toBeFocused();

  await cancel.click();
  await dialog.getByRole("button", { name: "Cancel root Process" }).click();
  const rejected = page.getByRole("status").filter({
    hasText: "Rejected, no longer current. The root Process is cancelled.",
  });
  await expect(rejected).toBeFocused();
  await expect(page.getByText(
    "Return to Incidents to refresh the complete current snapshot.",
    { exact: true },
  )).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel Process", exact: true })).toHaveCount(0);
});

test("pending Retry blocks duplicates and returns focus after commitment", async ({ page }) => {
  await openIncident(page, { actions: FixtureIncidentActionState.Pending });
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await retry.click({ noWaitAfter: true });
  const pending = page.getByRole("status").filter({ hasText: "Retry pending." });
  await expect(pending).toBeFocused();
  await expect(retry).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Current incidents" })).toBeFocused();
});

test("response-loss Retry keeps exact public bytes and private facts absent", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => { consoleMessages.push(message.text()); });
  const capture = await openIncident(page, {
    actions: FixtureIncidentActionState.RetryResponseLoss,
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const transportFailure = page.getByRole("status").filter({
    hasText: "Retry outcome is unknown after a transport failure.",
  });
  await expect(transportFailure).toBeFocused();

  const exactRetry = page.getByRole("button", { name: "Submit Retry again" });
  await exactRetry.click();
  const indeterminate = page.getByRole("status").filter({
    hasText: "Retry outcome is indeterminate. Submit the exact action again.",
  });
  await expect(indeterminate).toBeFocused();
  await page.getByRole("button", { name: "Submit Retry again" }).click();
  await expect(page.getByRole("heading", { name: "Current incidents" })).toBeFocused();

  expect(capture.actions).toHaveLength(3);
  expect(new Set(capture.actions.map(({ url }) => url)).size).toBe(1);
  expect(new Set(capture.actions.map(({ body }) => body)).size).toBe(1);

  await page.getByRole("tab", { name: "Audit" }).click();
  await expect(page.getByRole("heading", { name: "Incident action audit" })).toBeVisible();
  const publicBrowserState = await page.evaluate(() => ({
    dom: document.documentElement.outerHTML,
    forms: Array.from(document.forms, (form) => ({
      data: Array.from(new FormData(form).entries()),
      fields: Array.from(form.elements, (element) => ({
        name: element instanceof HTMLInputElement || element instanceof HTMLSelectElement
          ? element.name
          : "",
        value: element instanceof HTMLInputElement || element instanceof HTMLSelectElement
          ? element.value
          : "",
      })),
    })),
    history: { state: history.state, url: location.href },
    storage: {
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
    },
  }));
  expect(privateSurfaceFindings({
    browser: publicBrowserState,
    console: consoleMessages,
    publicTransport: capture.actions,
  })).toEqual([]);
});

test("top audit filtering and paging move focus without claiming currentness", async ({ page }) => {
  await openOperations(page, { audit: FixtureIncidentAuditState.Loading });
  await page.getByRole("tab", { name: "Audit" }).click();
  const audit = page.locator('[data-ui="incident-audit"]');
  await expect(audit.getByRole("status")).toHaveText("Loading incident action audit…");
  await expect(audit.getByText(
    "These rows are platform actions. They do not prove that an incident is current.",
    { exact: true },
  )).toBeVisible();
  await expect(audit.getByRole("table", { name: "Incident action audit" })).toBeVisible();
  await audit.getByRole("textbox", { name: "Actor ID" }).fill(operationsFixtureLabels.actor);
  await audit.getByRole("combobox", { name: "Action" }).selectOption("retryIncident");
  await audit.getByRole("button", { name: "Apply audit filters" }).click();
  await expect(audit.getByRole("heading", { name: "Incident action audit" })).toBeFocused();
  await audit.getByRole("button", { name: "Next audit page" }).click();
  await expect(audit.locator('[data-audit-event-id="audit-event-000003"]')).toBeFocused();
  await assertNoOverflow(audit, "top audit");
  await assertNoOverflow(audit.locator("form"), "top audit filters");
  const rows = audit.getByRole("table", { name: "Incident action audit" }).getByRole("row");
  for (let index = 1; index < await rows.count(); index += 1) {
    await assertNoOverflow(rows.nth(index), `audit row ${index}`);
  }
  await assertOwnedActionsFit(audit);
});

for (const stateCase of [{
  name: "loading",
  state: FixtureIncidentCollectionState.Loading,
  role: "status",
  message: "Loading current incidents…",
}, {
  name: "empty",
  state: FixtureIncidentCollectionState.Empty,
  role: null,
  message: "No current incidents.",
}, {
  name: "error",
  state: FixtureIncidentCollectionState.Error,
  role: "alert",
  message: "The incident request could not be completed.",
}, {
  name: "unavailable",
  state: FixtureIncidentCollectionState.Unavailable,
  role: "alert",
  message: "The current incident snapshot is unavailable.",
}] as const) {
  test(`${stateCase.name} incident snapshots are explicit`, async ({ page }) => {
    await openOperations(page, { incidents: stateCase.state });
    await page.getByRole("tab", { name: "Incidents" }).click();
    const owner = page.locator('[data-ui="incident-collection"]');
    const target = stateCase.role === null
      ? owner.getByText(stateCase.message, { exact: true })
      : owner.getByRole(stateCase.role).filter({ hasText: stateCase.message });
    await expect(target).toBeVisible();
    await assertNoOverflow(owner, `${stateCase.name} incident state`);
  });
}

test("empty and error audit states are explicit", async ({ browser }) => {
  for (const stateCase of [{
    state: FixtureIncidentAuditState.Empty,
    role: null,
    message: "No platform incident actions match these filters.",
  }, {
    state: FixtureIncidentAuditState.Error,
    role: "alert",
    message: "Incident audit is unavailable.",
  }] as const) {
    const page = await browser.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openOperations(page, { audit: stateCase.state });
    await page.getByRole("tab", { name: "Audit" }).click();
    const audit = page.locator('[data-ui="incident-audit"]');
    const target = stateCase.role === null
      ? audit.getByText(stateCase.message, { exact: true })
      : audit.getByRole(stateCase.role).filter({ hasText: stateCase.message });
    await expect(target).toBeVisible();
    await assertNoOverflow(audit, "explicit audit state");
    await page.close();
  }
});

test("Operations incident collection visual @visual", async ({ page }) => {
  test.skip(process.platform !== "linux", "Shared visual baselines are Linux-only.");
  await openIncidents(page);
  await waitForStableUi(page);
  await expect(page.locator('[data-ui="operations-workspace"]')).toHaveScreenshot(
    "operations-incident-collection.png",
    screenshotOptions,
  );
});

test("Operations incident Overview detail visual @visual", async ({ page }) => {
  test.skip(process.platform !== "linux", "Shared visual baselines are Linux-only.");
  await openIncident(page);
  await waitForStableUi(page);
  await expect(page.locator('[data-ui="incident-detail"]')).toHaveScreenshot(
    "operations-incident-detail-overview.png",
    screenshotOptions,
  );
});

test("Operations incident Diagram detail visual @visual", async ({ page }) => {
  test.skip(process.platform !== "linux", "Shared visual baselines are Linux-only.");
  await openIncident(page);
  await page.getByRole("tab", { name: "Diagram" }).click();
  await waitForStableUi(page, { diagram: true });
  await expect(page.locator('[data-ui="incident-detail"]')).toHaveScreenshot(
    "operations-incident-detail-diagram.png",
    screenshotOptions,
  );
});

test("Operations Cancel confirmation visual @visual", async ({ page }) => {
  test.skip(process.platform !== "linux", "Shared visual baselines are Linux-only.");
  await openIncident(page);
  await page.getByRole("button", { name: "Cancel Process", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Cancel root Process?" })).toHaveScreenshot(
    "operations-cancel-dialog.png",
    screenshotOptions,
  );
});

test("Operations top audit visual @visual", async ({ page }) => {
  test.skip(process.platform !== "linux", "Shared visual baselines are Linux-only.");
  await openOperations(page);
  await page.getByRole("tab", { name: "Audit" }).click();
  await waitForStableUi(page);
  await expect(page.locator('[data-ui="incident-audit"]')).toHaveScreenshot(
    "operations-top-audit.png",
    screenshotOptions,
  );
});

const screenshotOptions = {
  animations: "disabled" as const,
  caret: "hide" as const,
  scale: "css" as const,
};

async function openOperations(
  page: import("@playwright/test").Page,
  options: OperationsFixtureOptions = {},
) {
  const capture = await installOperationsApiFixtures(page, options);
  await page.goto("/");
  await page.getByRole("button", { name: "Operations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
  return capture;
}

async function openIncidents(
  page: import("@playwright/test").Page,
  options: OperationsFixtureOptions = {},
) {
  const capture = await openOperations(page, options);
  await page.getByRole("tab", { name: "Incidents" }).click();
  await expect(page.locator('[data-ui="incident-collection"]')).toBeVisible();
  return capture;
}

async function openIncident(
  page: import("@playwright/test").Page,
  options: OperationsFixtureOptions = {},
) {
  const capture = await openIncidents(page, options);
  await incidentSelection(page).click();
  await expect(page.locator('[data-ui="incident-detail"]')).toBeVisible();
  return capture;
}

function incidentSelection(page: import("@playwright/test").Page) {
  return page.getByRole("button", {
    name: `View incident ${operationsFixtureLabels.process} ${operationsFixtureLabels.element} activation 1 generation 1`,
  });
}

async function assertNoOverflow(
  locator: import("@playwright/test").Locator,
  label: string,
) {
  const findings = await horizontalOverflowFindings(locator);
  expect(findings, `${label} must not scroll horizontally`).toEqual([]);
}

const forbiddenPrivateSurface = [
  /locator/iu,
  /workflow[\s_-]*id/iu,
  /run[\s_-]*id/iu,
  /task[\s_-]*queue/iu,
  /event[\s_-]*history/iu,
  /activity[\s_-]*attempt/iu,
  /retry[\s_-]*count/iu,
  /cause/iu,
  /exception/iu,
  /stack(?:[\s_-]*trace)?/iu,
  /transport[\s_-]*command[\s_-]*payload/iu,
] as const;

function privateSurfaceFindings(value: unknown): string[] {
  const findings: string[] = [];
  scan(value, "$", findings, new Set<object>());
  return findings;
}

function scan(
  value: unknown,
  path: string,
  findings: string[],
  seen: Set<object>,
): void {
  if (typeof value === "string") {
    if (forbiddenPrivateSurface.some((pattern) => pattern.test(value))) findings.push(path);
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) => { scan(child, `${path}[${index}]`, findings, seen); });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbiddenPrivateSurface.some((pattern) => pattern.test(key))) findings.push(childPath);
    scan(child, childPath, findings, seen);
  }
}
