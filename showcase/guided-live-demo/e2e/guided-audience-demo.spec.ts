import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

test("delivers the complete seven-minute audience journey through the real stack", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.setViewportSize({ width: 1_600, height: 900 });
  await page.goto("/?audience=demo");

  await expect(page.getByRole("heading", {
    name: "Seven-minute verified walkthrough",
  })).toBeVisible();
  await expect(page.getByRole("list", { name: "Audience walkthrough" })
    .getByRole("listitem")).toHaveCount(4);
  await expect(page.getByLabel("BPMN XML file")).toHaveCount(0);
  await expect(page.getByLabel("Semantic profile ID")).toHaveCount(0);

  await completeExpenseException(page);
  await inspectDeadlineEvidence(page);
  await resolveIncidents(page);
  await inspectCorrectnessStack(page);

  await expectNoHorizontalOverflow(page, 1_600);
  await expectNoHorizontalOverflow(page, 1_280);
  expect(browserErrors).toEqual([]);
});

async function completeExpenseException(page: Page): Promise<void> {
  const tasks = page.getByRole("region", { name: "Tasks" });
  const row = tasks.getByRole("table", { name: "Current tasks" })
    .getByRole("row")
    .filter({ hasText: "Review exception" });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Claim", exact: true }).click();
  await expect(row).toContainText("Claimed by demo-user");
  await row.getByRole("button", { name: "Review exception", exact: true }).click();

  const tabs = tasks.getByRole("tablist", { name: "Task detail views" });
  await tabs.getByRole("tab", { name: "Diagram", exact: true }).click();
  await expect(tasks.getByLabel(
    /^BPMN diagram for .* highlighting ReviewException$/u,
  )).toBeVisible();
  await tabs.getByRole("tab", { name: "Form", exact: true }).click();

  await tasks.getByLabel("Request reference").fill("EXP-2026-0842");
  await tasks.getByLabel("Expense date").fill("2026-08-25");
  await tasks.getByLabel("Approved amount").fill("4250");
  await tasks.getByRole("radio", { name: "Engineering", exact: true }).press("Space");
  await tasks.getByRole("checkbox", { name: "Missing receipt", exact: true }).press("Space");
  await tasks.getByRole("checkbox", { name: "Policy exception", exact: true }).press("Space");
  await tasks.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(tasks).toContainText("No current tasks.");
}

async function inspectDeadlineEvidence(page: Page): Promise<void> {
  await selectAudienceStep(page, "Deadline behavior");
  await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
  const table = page.getByRole("table", { name: "Prepared batch-review instances" });
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table).toContainText("demo-purchase-order-review.bpmn");
  await expect(table).toContainText("demo-deadline-escalation.bpmn");

  await table.getByRole("button", { name: "Open evidence Purchase-order review" }).click();
  const natural = preview(page);
  await expect(page.locator('[data-ui="execution-overview"]')).toContainText("completed");
  await expect(natural.getByText("Committed terminal output", { exact: true })).toBeVisible();
  await expect(natural).toContainText("accepted");
  await expect(natural).toContainText("flagged");
  await expect(natural).toContainText("archived");
  await expect(natural).not.toContainText("fireTimer");
  await inspectProcessDiagram(page);
  await page.getByRole("button", { name: "Back to Process instances" }).click();

  await table.getByRole("button", { name: "Open evidence Deadline escalation" }).click();
  const interrupted = preview(page);
  await expect(page.locator('[data-ui="execution-overview"]')).toContainText("completed");
  await expect(interrupted.getByRole("list", { name: "Committed Timer commands" }))
    .toContainText("fireTimer");
  await expect(interrupted).toContainText(
    "No output collection is present in this committed terminal state.",
  );
  await inspectProcessDiagram(page);
  await page.getByRole("button", { name: "Back to Process instances" }).click();
}

async function resolveIncidents(page: Page): Promise<void> {
  await selectAudienceStep(page, "Incident recovery");
  const table = page.getByRole("table", { name: "Current incidents" });
  await expect(table.getByRole("row")).toHaveCount(3);

  const retryRow = table.getByRole("row")
    .filter({ hasText: "Retry" })
    .filter({ hasNotText: "Cancel Process" });
  await expect(retryRow).toHaveCount(1);
  await retryRow.getByRole("button").click();
  await inspectIncidentDiagram(page);
  await page.getByRole("tablist", { name: "Incident detail" })
    .getByRole("tab", { name: "Overview", exact: true }).click();
  await submitUntilCommitted(
    page,
    page.locator('[data-ui="incident-overview"]')
      .getByRole("button", { name: "Retry", exact: true }),
    "Submit Retry again",
    "Retry outcome is indeterminate. Submit the exact action again.",
    "Retry action",
  );
  await expect(table.getByRole("row")).toHaveCount(2);

  const cancelRow = table.getByRole("row").filter({ hasText: "Cancel Process" });
  await expect(cancelRow).toHaveCount(1);
  await cancelRow.getByRole("button").click();
  await page.locator('[data-ui="incident-overview"]')
    .getByRole("button", { name: "Cancel Process", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel root Process?" });
  await expect(dialog).toContainText("Already committed data is preserved.");
  await submitUntilCommitted(
    page,
    dialog.getByRole("button", { name: "Cancel root Process", exact: true }),
    "Submit Cancel Process again",
    "Cancel Process outcome is indeterminate. Submit the exact action again.",
    "Cancel Process action",
  );
  await expect(page.getByText("No current incidents.", { exact: true })).toBeVisible();
}

async function submitUntilCommitted(
  page: Page,
  initialTrigger: Locator,
  retainedLabel: string,
  indeterminateMessage: string,
  committedMessage: string,
): Promise<void> {
  const initial = await clickIncidentAction(page, initialTrigger);
  expect(initial.status()).toBe(202);
  const indeterminate = page.getByRole("status").filter({ hasText: indeterminateMessage });
  await expect(indeterminate).toBeFocused();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const retained = page.getByRole("button", { name: retainedLabel, exact: true });
    await expect(retained).toBeVisible();
    const response = await clickIncidentAction(page, retained);
    switch (response.status()) {
      case 200:
        await expect(page.getByRole("status").filter({ hasText: committedMessage }))
          .toBeVisible();
        return;
      case 202:
        await expect(indeterminate).toBeFocused();
        break;
      default:
        throw new Error(`Incident action returned unexpected HTTP ${response.status()}`);
    }
  }
  throw new Error(`Incident action did not commit after three exact resubmissions`);
}

async function clickIncidentAction(page: Page, trigger: Locator) {
  const response = page.waitForResponse((candidate) =>
    candidate.request().method() === "PUT" &&
    new URL(candidate.url()).pathname.startsWith("/api/v1/incident-actions/")
  );
  await trigger.click();
  return await response;
}

async function inspectCorrectnessStack(page: Page): Promise<void> {
  await selectAudienceStep(page, "Correctness stack");
  await expect(page.getByRole("heading", { name: "About", level: 1 })).toBeVisible();
  const stack = page.getByLabel("Project correctness stack");
  await expect(stack).toContainText("Lean reference");
  await expect(stack).toContainText("Independently written TypeScript core");
  await expect(stack).toContainText("Temporal durability");
  await expect(stack).toContainText("PostgreSQL projections");
  await expect(stack).toContainText("not a general BPMN conformance claim");
  await expect(page.getByRole("table", {
    name: "Executable BPMN element and semantic-variant overview",
  })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Coverage boundary" }))
    .toContainText("Not a conformance claim");
  await expect(page.getByLabel("BPMN XML file")).toHaveCount(0);
  await expect(page.getByLabel("Semantic profile ID")).toHaveCount(0);
}

async function inspectProcessDiagram(page: Page): Promise<void> {
  const tabs = page.getByRole("tablist", { name: "Process instance detail" });
  await tabs.getByRole("tab", { name: "Diagram", exact: true }).click();
  await expect(page.locator('[data-ui="execution-diagram"]')
    .getByLabel(/^BPMN diagram for /u)).toBeVisible();
  await tabs.getByRole("tab", { name: "Overview", exact: true }).click();
}

async function inspectIncidentDiagram(page: Page): Promise<void> {
  const tabs = page.getByRole("tablist", { name: "Incident detail" });
  await tabs.getByRole("tab", { name: "Diagram", exact: true }).click();
  await expect(page.getByLabel(
    /^BPMN diagram for .* highlighting ServiceTask_Record$/u,
  )).toBeVisible();
}

function preview(page: Page): Locator {
  return page.locator('[data-ui="mue-preview-alpha"]');
}

async function selectAudienceStep(page: Page, label: string): Promise<void> {
  await page.getByRole("button").filter({ hasText: label }).click();
}

async function expectNoHorizontalOverflow(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: width === 1_600 ? 900 : 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
