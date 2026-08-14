import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type {
  CapturedJson,
} from "../test/http-support.ts";
import {
  deployDefinition,
  listIncidents,
  readIncidentAudit,
  startDefinition,
} from "../test/http-support.ts";
import {
  cancellationProfile,
  effectElementId,
  exactIncidentBpmnSource,
  retryProfile,
} from "../test/fixture.ts";
import {
  restartPlatform,
  startWorker,
  stopWorker,
  verifyAndReplay,
} from "../test/host-control.ts";
import { privateFactPaths } from "../test/private-fact-scan.ts";

const apiOrigin = requireApiOrigin();

type PublicTransport = Readonly<{
  method: string;
  path: string;
  requestBody: unknown;
  response?: Readonly<{ status: number; body: unknown }>;
  failure?: string;
}>;

function requireApiOrigin(): string {
  const value = process.env.PLATFORM_API_ORIGIN;
  if (value === undefined) {
    throw new Error("Playwright config must provide PLATFORM_API_ORIGIN.");
  }
  return value;
}

test("private-fact scan detects nested key and value regressions", () => {
  expect(privateFactPaths({
    publicEnvelope: {
      locator: "opaque",
      nested: [{ copy: "Task Queue must not escape" }],
    },
  })).toEqual([
    "$.publicEnvelope.locator",
    "$.publicEnvelope.nested[0].copy",
  ]);
});

test("operates both graduated current incidents through the production boundary", async ({ page }) => {
  const consoleMessages: string[] = [];
  const publicCaptures: Array<CapturedJson<unknown> | PublicTransport> = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  await installPublicTransportCapture(page);

  const source = await exactIncidentBpmnSource();
  const token = `${Date.now()}-${process.pid}`;
  const retryDefinition = capture(publicCaptures, await deployDefinition(apiOrigin, {
    bytes: source,
    sourceId: `m4-retry-${token}.bpmn`,
    semanticProfile: retryProfile,
  })).value;
  const cancellationDefinition = capture(publicCaptures, await deployDefinition(apiOrigin, {
    bytes: source,
    sourceId: `m4-cancel-${token}.bpmn`,
    semanticProfile: cancellationProfile,
  })).value;
  const retryStarted = capture(
    publicCaptures,
    await startDefinition(apiOrigin, retryDefinition),
  ).value.instance;
  const cancellationStarted = capture(
    publicCaptures,
    await startDefinition(apiOrigin, cancellationDefinition),
  ).value.instance;
  const initialSnapshot = capture(publicCaptures, await waitForTwoIncidents()).value;
  const retryIncident = initialSnapshot.incidents.find(
    ({ hostingInstance }) =>
      hostingInstance.processInstanceId === retryStarted.processInstanceId,
  );
  const cancellationIncident = initialSnapshot.incidents.find(
    ({ hostingInstance }) =>
      hostingInstance.processInstanceId === cancellationStarted.processInstanceId,
  );
  expect(retryIncident?.availableInteractions.map(({ kind }) => kind))
    .toEqual(["retryIncident"]);
  expect(cancellationIncident?.availableInteractions.map(({ kind }) => kind))
    .toEqual(["retryIncident", "cancelIncidentProcess"]);
  if (retryIncident === undefined || cancellationIncident === undefined) {
    throw new Error("both public starts must own one exact current incident");
  }

  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Operations", exact: true })
    .click();
  const operationsTabs = page.getByRole("tablist", { name: "Operations" });
  await operationsTabs.getByRole("tab", { name: "Incidents" }).click();
  const incidentsHeading = page.getByRole("heading", {
    name: "Current incidents",
    level: 2,
  });
  await expect(incidentsHeading).toBeVisible();
  await expect(page.getByRole("table", { name: "Current incidents" }))
    .toBeVisible();

  await selectIncident(page, retryIncident.incident.id.effectId.processInstanceId);
  await expect(page.getByRole("heading", {
    name: `Incident ${effectElementId}`,
    level: 2,
  })).toBeFocused();
  const detailTabs = page.getByRole("tablist", { name: "Incident detail" });
  await detailTabs.getByRole("tab", { name: "Diagram" }).click();
  await expect(page.getByText("Generated layout", { exact: true })).toBeVisible();
  await expect(page.getByLabel(new RegExp(
    `^BPMN diagram for .*highlighting ${effectElementId}$`,
    "u",
  ))).toBeVisible();
  await detailTabs.getByRole("tab", { name: "Overview" }).click();

  let lostRetry: PublicTransport | undefined;
  await page.route("**/api/v1/incident-actions/*", async (route) => {
    if (lostRetry !== undefined) {
      await route.continue();
      return;
    }
    const request = route.request();
    const response = await route.fetch();
    lostRetry = {
      method: request.method(),
      path: new URL(request.url()).pathname,
      requestBody: parseCapturedJson(request.postData()),
      response: {
        status: response.status(),
        body: parseCapturedJson(await response.text()),
      },
    };
    publicCaptures.push(lostRetry);
    await route.abort("connectionreset");
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const lostStatus = page.getByRole("status").filter({
    hasText: "Retry outcome is unknown after a transport failure",
  });
  await expect(lostStatus).toBeFocused();
  if (lostRetry === undefined) throw new Error("Retry response was not intercepted");
  expect(lostRetry.response?.status).toBe(200);

  await detailTabs.getByRole("tab", { name: "Audit" }).click();
  const incidentAudit = page.getByRole("table", { name: "Incident action audit" });
  await expect(incidentAudit).toContainText("reserved");
  await expect(incidentAudit).toContainText("committed");
  await detailTabs.getByRole("tab", { name: "Overview" }).click();
  await restartPlatform();
  await page.unroute("**/api/v1/incident-actions/*");
  await page.getByRole("button", { name: "Submit Retry again" }).click();
  await expect(incidentsHeading).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Retry action" }))
    .toContainText("committed");
  await expect(page.getByRole("table", { name: "Current incidents" }))
    .not.toContainText(retryStarted.processInstanceId);
  const retryCalls = (await capturedBrowserTransport(page)).filter(({ path }) =>
    path.startsWith("/api/v1/incident-actions/"));
  expect(retryCalls).toHaveLength(2);
  expect(exactRequest(retryCalls[1])).toEqual(exactRequest(retryCalls[0]));

  await selectIncident(page, cancellationIncident.incident.id.effectId.processInstanceId);
  const cancelButton = page.getByRole("button", { name: "Cancel Process", exact: true });
  await cancelButton.click();
  const dialog = page.getByRole("dialog", { name: "Cancel root Process?" });
  await expect(dialog).toContainText("removes all remaining live work");
  await expect(dialog.getByRole("button", { name: "Keep Process running" }))
    .toBeFocused();
  await stopWorker();
  await dialog.getByRole("button", { name: "Cancel root Process" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Cancel Process pending" }))
    .toBeFocused();
  await startWorker();
  await expect(incidentsHeading).toBeFocused();
  await expect(page.getByText("No current incidents.", { exact: true })).toBeVisible();

  await operationsTabs.getByRole("tab", { name: "Audit" }).click();
  await expect(page.getByRole("heading", {
    name: "Incident action audit",
    level: 2,
  })).toBeVisible();
  const topAudit = page.getByRole("table", { name: "Incident action audit" });
  await expect(topAudit).toContainText("Retry");
  await expect(topAudit).toContainText("Cancel Process");
  await page.getByRole("textbox", { name: "Actor ID" }).fill("demo-user");
  await page.getByRole("button", { name: "Apply audit filters" }).click();
  await expect(page.getByRole("heading", {
    name: "Incident action audit",
    level: 2,
  })).toBeFocused();
  await expect(topAudit).toContainText("demo-user");

  await operationsTabs.getByRole("tab", { name: "Process instances" }).click();
  await page.getByRole("textbox", { name: "Process-instance ID" })
    .fill(retryStarted.processInstanceId);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const processTable = page.getByRole("table", {
    name: "Confirmed Product 2 starts",
  });
  await expect(processTable).toContainText(retryStarted.processInstanceId);
  await expect(processTable).toContainText(retryProfile);

  const audit = capture(publicCaptures, await readIncidentAudit(apiOrigin)).value;
  expect(audit.events.map(({ actionKind, outcome }) => [actionKind, outcome]))
    .toEqual([
      ["retryIncident", "reserved"],
      ["retryIncident", "committed"],
      ["cancelIncidentProcess", "reserved"],
      ["cancelIncidentProcess", "committed"],
    ]);
  const evidence = await verifyAndReplay(
    retryStarted.processInstanceId,
    cancellationStarted.processInstanceId,
  );
  expect(evidence).toEqual({
    retry: {
      status: "completed",
      activityCompletions: 2,
      acceptedUpdates: 1,
      completedUpdates: 1,
      openIncidents: 0,
      replayed: true,
    },
    cancellation: {
      status: "cancelled",
      activityCompletions: 1,
      acceptedUpdates: 1,
      completedUpdates: 1,
      openIncidents: 0,
      replayed: true,
    },
  });

  expect(privateFactPaths({
    browser: await browserHeldState(page),
    consoleMessages,
    publicCaptures,
  })).toEqual([]);
});

async function selectIncident(page: Page, processInstanceId: string): Promise<void> {
  await page.getByRole("button", {
    name: `View incident ${processInstanceId} ${effectElementId} activation 1 generation 1`,
  }).click();
}

async function waitForTwoIncidents(): Promise<CapturedJson<Awaited<
  ReturnType<typeof listIncidents>
>["value"]>> {
  let captured = await listIncidents(apiOrigin);
  for (let attempt = 0; attempt < 100 && captured.value.incidents.length !== 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    captured = await listIncidents(apiOrigin);
  }
  if (captured.value.incidents.length !== 2) {
    throw new Error(
      `two current incidents did not become visible, observed ${captured.value.incidents.length}`,
    );
  }
  return captured;
}

function capture<Result>(
  captures: Array<CapturedJson<unknown> | PublicTransport>,
  captured: CapturedJson<Result>,
): CapturedJson<Result> {
  captures.push(captured);
  return captured;
}

function exactRequest(value: PublicTransport | undefined): unknown {
  return value === undefined
    ? undefined
    : { method: value.method, path: value.path, requestBody: value.requestBody };
}

async function installPublicTransportCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const browser = globalThis as typeof globalThis & {
      __m4PublicTransportCapture?: unknown[];
    };
    const captured: unknown[] = [];
    Object.defineProperty(browser, "__m4PublicTransportCapture", {
      configurable: false,
      enumerable: false,
      value: captured,
      writable: false,
    });
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      const requestBody = request.method === "GET" || request.method === "HEAD"
        ? null
        : parseJson(await request.clone().text());
      try {
        const response = await originalFetch(input, init);
        captured.push({
          method: request.method,
          path,
          requestBody,
          response: {
            status: response.status,
            body: parseJson(await response.clone().text()),
          },
        });
        return response;
      } catch (error: unknown) {
        captured.push({
          method: request.method,
          path,
          requestBody,
          failure: error instanceof Error ? error.name : "transport failure",
        });
        throw error;
      }
    };

    function parseJson(text: string): unknown {
      if (text.length === 0) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    }
  });
}

async function capturedBrowserTransport(page: Page): Promise<PublicTransport[]> {
  return page.evaluate(() => {
    const value = (globalThis as typeof globalThis & {
      __m4PublicTransportCapture?: unknown;
    }).__m4PublicTransportCapture;
    return Array.isArray(value) ? value as PublicTransport[] : [];
  });
}

async function browserHeldState(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const browser = globalThis as typeof globalThis & {
      __m4PublicTransportCapture?: unknown;
    };
    return {
      documentText: document.body.textContent,
      formControls: Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          "input, select, textarea",
        ),
        ({ name, value }) => ({ name, value }),
      ),
      localValues: storageValues(localStorage),
      navigationState: history.state as unknown,
      publicTransport: browser.__m4PublicTransportCapture,
      sessionValues: storageValues(sessionStorage),
    };

    function storageValues(storage: Storage): Record<string, string | null> {
      return Object.fromEntries(
        Array.from({ length: storage.length }, (_, index) => {
          const key = storage.key(index)!;
          return [key, storage.getItem(key)];
        }),
      );
    }
  });
}

function parseCapturedJson(value: string | null): unknown {
  if (value === null || value.length === 0) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
