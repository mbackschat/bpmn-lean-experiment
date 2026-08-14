import { expect, test } from "@playwright/test";

import {
  deployDefinition,
  readWorkAudit,
  startDefinition,
} from "../test/http-support.ts";
import {
  humanWorkSources,
  metadataProfile,
} from "../test/fixture.ts";

const apiOrigin = process.env.PLATFORM_API_ORIGIN ?? "http://127.0.0.1:3203";
const privateFactKeys = new Set([
  "bpmnleandirectstartintentsha256",
  "commandtransportpayload",
  "describeresult",
  "directstartintent",
  "directstartintentsha256",
  "engineprocessworklocator",
  "eventhistory",
  "intent",
  "intentsha256",
  "locator",
  "memo",
  "runid",
  "scheduleid",
  "scheduleidentity",
  "taskqueue",
  "temporalstatus",
  "workflowid",
  "workflowtype",
]);

test("private-fact scan detects nested key and value regressions", () => {
  expect(privateFactPaths({
    publicEnvelope: {
      workflowId: "bpmn-process-sha256:planted",
      nested: [{ display: "Task Queue must not escape" }],
    },
  })).toEqual([
    "$.publicEnvelope.workflowId",
    "$.publicEnvelope.workflowId",
    "$.publicEnvelope.nested[0].display",
  ]);
});

test("claims and completes a Boolean task through the global Human Work panel", async ({ page }) => {
  const adopterLogger: string[] = [];
  page.on("console", (message) => adopterLogger.push(message.text()));
  await page.addInitScript(() => {
    const captured: unknown[] = [];
    Object.defineProperty(globalThis, "__m3PublicTransportCapture", {
      configurable: false,
      enumerable: false,
      value: captured,
      writable: false,
    });
    const originalFetch = globalThis.fetch.bind(globalThis);
    let completionAttempt = 0;
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      const requestBody = request.method === "GET" || request.method === "HEAD"
        ? null
        : await request.clone().text();
      const parsedRequestBody = parseCapturedJson(requestBody);
      const isCompletion = request.method === "PUT" &&
        path.startsWith("/api/v1/work-task-completions/");
      if (isCompletion) completionAttempt += 1;
      const response = isCompletion && completionAttempt === 2
        ? syntheticIndeterminateCompletion(path, parsedRequestBody)
        : await originalFetch(input, init);
      const responseBody = await response.clone().text();
      captured.push({
        method: request.method,
        path,
        requestBody: parsedRequestBody,
        response: {
          body: parseCapturedJson(responseBody),
          status: response.status,
        },
      });
      if (isCompletion && completionAttempt === 1) {
        throw new TypeError("Synthetic response loss after completion capture");
      }
      return response;
    };

    function parseCapturedJson(value: string | null): unknown {
      if (value === null || value.length === 0) return null;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }

    function syntheticIndeterminateCompletion(
      path: string,
      requestBody: unknown,
    ): Response {
      if (
        typeof requestBody !== "object" ||
        requestBody === null ||
        !("taskId" in requestBody)
      ) {
        throw new TypeError("Test completion capture did not contain task identity");
      }
      const actionId = decodeURIComponent(
        path.slice("/api/v1/work-task-completions/".length),
      );
      return new Response(JSON.stringify({
        state: "indeterminate",
        actionId,
        taskId: requestBody.taskId,
      }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    }
  });
  const token = `${Date.now()}_${process.pid}`;
  const sources = await humanWorkSources(token);
  const definition = (await deployDefinition(apiOrigin, {
    bytes: sources.metadata,
    sourceId: `browser-human-work-${token}.bpmn`,
    semanticProfile: metadataProfile,
  })).value;
  const started = (await startDefinition(apiOrigin, definition)).value.instance;

  await page.goto("/", { timeout: 10_000 });
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Work", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Work", level: 1 })).toBeVisible();
  const panel = page.getByRole("region", { name: "Tasks" });
  await expect(panel).toBeVisible();
  const table = panel.getByRole("table", { name: "Current tasks" });
  const taskName = `Review request ${token}`;
  const row = table.getByRole("row").filter({ hasText: taskName });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("cell")).toHaveCount(5);
  await expect(row).toContainText("reviewers");
  await expect(row).toContainText("Unclaimed");
  await expect(row.getByRole("button", { name: taskName, exact: true })).toHaveCount(0);

  await row.getByRole("button", { name: "Claim", exact: true }).click();
  await expect(row).toContainText("Claimed by demo-user");
  await expect(row.getByRole("button", { name: taskName, exact: true })).toBeVisible();
  await page.reload();
  const reloadedPanel = page.getByRole("region", { name: "Tasks" });
  const reloadedRow = reloadedPanel
    .getByRole("table", { name: "Current tasks" })
    .getByRole("row")
    .filter({ hasText: taskName });
  await expect(reloadedRow).toContainText("Claimed by demo-user");

  await reloadedRow.getByRole("button", { name: taskName }).click();
  const detailTabs = reloadedPanel.getByRole("tablist", { name: "Task detail views" });
  await detailTabs.getByRole("tab", { name: "Diagram" }).click();
  await expect(reloadedPanel.getByText("Generated layout", { exact: true })).toBeVisible();
  const taskDiagram = reloadedPanel.getByLabel(
    `BPMN diagram for ${definition.processId}, version ${definition.version}`,
  );
  await expect(taskDiagram).toBeVisible();
  await expect(taskDiagram.getByText(taskName, { exact: true })).toBeVisible();
  await detailTabs.getByRole("tab", { name: "Form" }).click();
  const trueChoice = reloadedPanel.getByRole("radio", { name: "True" });
  const falseChoice = reloadedPanel.getByRole("radio", { name: "False" });
  await expect(trueChoice).not.toBeChecked();
  await expect(falseChoice).not.toBeChecked();
  await trueChoice.press("Space");
  await expect(trueChoice).toBeChecked();
  await expect(falseChoice).not.toBeChecked();
  expect(privateFactPaths(await browserHeldState(page))).toEqual([]);
  expect(privateFactPaths(adopterLogger)).toEqual([]);
  await reloadedPanel.getByRole("button", { name: "Complete task" }).click();
  await expect(reloadedPanel).toContainText("Completion delivery is unknown");
  await expect(reloadedPanel.getByRole("heading", { name: taskName })).toBeVisible();
  expect(privateFactPaths(await browserHeldState(page))).toEqual([]);
  await reloadedPanel.getByRole("button", { name: "Retry completion" }).click();
  await expect(reloadedPanel).toContainText("Completion is indeterminate");
  await expect(reloadedPanel.getByRole("heading", { name: taskName })).toBeVisible();
  expect(privateFactPaths(await browserHeldState(page))).toEqual([]);
  await reloadedPanel.getByRole("button", { name: "Retry completion" }).click();
  await expect(reloadedPanel).toContainText("No current tasks.");
  await expect(reloadedPanel.getByRole("table", { name: "Current tasks" }))
    .toHaveCount(0);

  const audit = await readWorkAudit(apiOrigin);
  expect(audit.value.events.map(({ action }) => [action.kind, action.outcome]))
    .toEqual([
      ["claim", "claimed"],
      ["completion", "reserved"],
      ["completion", "committed"],
    ]);
  expect(audit.value.events.every(({ hostingProcessInstanceId, taskId }) =>
    hostingProcessInstanceId === started.processInstanceId &&
    taskId.processInstanceId === started.processInstanceId
  )).toBe(true);
  await expect(reloadedPanel).not.toContainText(
    /workflow(?: id)?|run id|task queue|schedule|history|locator|memo|intent sha/iu,
  );
  expect(privateFactPaths(await browserHeldState(page))).toEqual([]);
  expect(privateFactPaths(adopterLogger)).toEqual([]);
  const completionCalls = await capturedCompletionCalls(page);
  expect(completionCalls).toHaveLength(3);
  expect(completionCalls[1]).toEqual(completionCalls[0]);
  expect(completionCalls[2]).toEqual(completionCalls[0]);
});

async function browserHeldState(
  page: import("@playwright/test").Page,
): Promise<unknown> {
  return page.evaluate(() => {
    const browser = globalThis as typeof globalThis & Readonly<{
      __m3PublicTransportCapture?: unknown;
      document: Readonly<{
        body: Readonly<{ textContent: string | null }>;
        querySelectorAll: (selector: string) => ArrayLike<Readonly<{
          checked: boolean;
          name: string;
          type: string;
          value: string;
        }>>;
      }>;
      history: Readonly<{ state: unknown }>;
      localStorage: StorageShape;
      sessionStorage: StorageShape;
    }>;
    return {
      documentText: browser.document.body.textContent,
      formControls: Array.from(
        browser.document.querySelectorAll("input"),
        ({ checked, name, type, value }) => ({ checked, name, type, value }),
      ),
      localValues: Object.fromEntries(
        Array.from({ length: browser.localStorage.length }, (_, index) => {
          const key = browser.localStorage.key(index)!;
          return [key, browser.localStorage.getItem(key)];
        }),
      ),
      navigationState: browser.history.state,
      publicTransport: browser.__m3PublicTransportCapture,
      sessionValues: Object.fromEntries(
        Array.from({ length: browser.sessionStorage.length }, (_, index) => {
          const key = browser.sessionStorage.key(index)!;
          return [key, browser.sessionStorage.getItem(key)];
        }),
      ),
    };
  });
}

type StorageShape = Readonly<{
  length: number;
  getItem: (key: string) => string | null;
  key: (index: number) => string | null;
}>;

async function capturedCompletionCalls(
  page: import("@playwright/test").Page,
): Promise<unknown[]> {
  return page.evaluate(() => {
    const captured = (globalThis as typeof globalThis & Readonly<{
      __m3PublicTransportCapture?: unknown;
    }>).__m3PublicTransportCapture;
    if (!Array.isArray(captured)) return [];
    return captured.filter((entry) =>
      typeof entry === "object" &&
      entry !== null &&
      "path" in entry &&
      typeof entry.path === "string" &&
      entry.path.startsWith("/api/v1/work-task-completions/")
    ).map((entry) => {
      const exact = entry as Readonly<{
        method: unknown;
        path: unknown;
        requestBody: unknown;
      }>;
      return {
        method: exact.method,
        path: exact.path,
        requestBody: exact.requestBody,
      };
    });
  });
}

function privateFactPaths(value: unknown): string[] {
  const findings: string[] = [];
  inspect(value, "$", findings, new Set<object>());
  return findings;
}

function inspect(
  value: unknown,
  path: string,
  findings: string[],
  visited: Set<object>,
): void {
  if (typeof value === "string") {
    if (containsPrivateFactText(value)) findings.push(path);
    return;
  }
  if (typeof value !== "object" || value === null || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((member, index) => inspect(member, `${path}[${index}]`, findings, visited));
    return;
  }
  for (const [key, member] of Object.entries(value)) {
    const memberPath = `${path}.${key}`;
    if (isPrivateFactKey(key)) findings.push(memberPath);
    inspect(member, memberPath, findings, visited);
  }
}

function isPrivateFactKey(key: string): boolean {
  const normalized = key.replaceAll(/[-_\s]/gu, "").toLowerCase();
  return privateFactKeys.has(normalized);
}

function containsPrivateFactText(value: string): boolean {
  return /(?:bpmn-(?:definition-schedule|direct-start|process)-sha256:|bpmn-direct-start-v1|command transport payload|describe result|direct[- ]start intent|event history|intent sha|process work locator|run id|schedule (?:id|identity)|task queue|temporal status|workflow (?:id|type))/iu.test(
    value,
  );
}
