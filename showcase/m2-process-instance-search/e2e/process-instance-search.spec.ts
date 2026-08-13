import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type {
  APIRequestContext,
  Locator,
  Page,
} from "@playwright/test";
import {
  DefinitionDeployStatus,
  DefinitionScheduleStatus,
  MessageStartPublicationStatus,
  ProcessInstanceStartStatus,
  decodeDefinitionDeployResult,
  decodeDefinitionSchedule,
  decodeMessageStartPublication,
  decodeProcessInstanceStartResult,
  definitionSchedulePath,
  definitionVersionStartPath,
  definitionsCollectionPath,
  messageStartPublicationPath,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  PublicMessageStartCapability,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

const apiOrigin = "http://127.0.0.1:3202";
const directProfile = "bpmn-2.0.2-user-task-preserved-notation-draft";
const timerProfile = "bpmn-2.0.2-timer-start-event-draft";
const messageProfile = "bpmn-2.0.2-message-start-event-draft";
const directTemplateUrl = new URL(
  "../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const timerTemplateUrl = new URL(
  "../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);
const messageTemplateUrl = new URL(
  "../../../scenarios/message-start-event/process.bpmn",
  import.meta.url,
);

test("searches three exact confirmed starts through the global public panel", async ({ page, request }) => {
  const token = `${Date.now()}_${process.pid}`;
  const sharedProcessId = `Process_Search_Browser_Shared_${token}`;
  const messageProcessId = `Process_Search_Browser_Message_${token}`;
  const sources = await runtimeSources(sharedProcessId, messageProcessId, token);

  const directDefinition = await deployDefinition(
    request,
    sources.direct,
    `browser-direct-${token}.bpmn`,
    directProfile,
  );
  const direct = await startDefinition(request, directDefinition);

  const scheduleDefinition = await deployDefinition(
    request,
    sources.timer,
    `browser-schedule-${token}.bpmn`,
    timerProfile,
  );
  expect(scheduleDefinition.processId).toBe(sharedProcessId);
  expect(scheduleDefinition.version).toBe(2);
  const scheduled = await scheduleDefinitionStart(
    request,
    scheduleDefinition,
    `browser-schedule-${token}`,
  );

  const messageDefinition = await deployDefinition(
    request,
    sources.message,
    `browser-message-${token}.bpmn`,
    messageProfile,
  );
  const capability = messageDefinition.startCapabilities.messageStarts[0];
  expect(capability).toBeDefined();
  const message = await publishMessageStart(
    request,
    messageDefinition,
    requireCapability(capability),
    `browser-publication-${token}`,
  );

  expectDistinctPublicIdentities([direct, scheduled, message]);
  await page.goto("/", { timeout: 10_000 });
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Process instances", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Process instances", level: 1 }))
    .toBeVisible();
  const panel = page.getByRole("region", { name: "Confirmed Product 2 starts" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Search", exact: true }).click();

  await assertRenderedIdentity(panel, message);
  await assertRenderedIdentity(panel, scheduled);
  await expect(panel.getByRole("row")).toHaveCount(3);
  const loadMore = panel.getByRole("button", { name: "Load more" });
  await expect(loadMore).toBeVisible();

  await panel.getByRole("textbox", { name: "Process ID" }).fill("unsent-filter-mutation");
  await loadMore.click();
  await assertRenderedIdentity(panel, direct);
  await expect(panel.getByRole("row")).toHaveCount(4);
  await expect(loadMore).toHaveCount(0);

  await searchBy(panel, {
    processInstanceId: direct.processInstanceId,
    processId: "",
    version: "",
    sourceSha256: "",
  });
  await assertOnlyRenderedIdentity(panel, direct);

  await searchBy(panel, {
    processInstanceId: "",
    processId: sharedProcessId,
    version: "",
    sourceSha256: "",
  });
  await assertRenderedIdentity(panel, scheduled);
  await assertRenderedIdentity(panel, direct);
  await expect(panel.getByRole("row")).toHaveCount(3);

  await searchBy(panel, {
    processInstanceId: "",
    processId: "",
    version: String(scheduleDefinition.version),
    sourceSha256: "",
  });
  await assertOnlyRenderedIdentity(panel, scheduled);

  await searchBy(panel, {
    processInstanceId: "",
    processId: "",
    version: "",
    sourceSha256: message.definition.source.sha256,
  });
  await assertOnlyRenderedIdentity(panel, message);
  await expect(panel).not.toContainText(
    /workflow(?: id)?|run id|task queue|memo|history|ordinal|status|timestamp|origin/iu,
  );
});

async function searchBy(
  panel: Locator,
  fields: Readonly<{
    processInstanceId: string;
    processId: string;
    version: string;
    sourceSha256: string;
  }>,
): Promise<void> {
  await panel.getByRole("textbox", { name: "Process-instance ID" })
    .fill(fields.processInstanceId);
  await panel.getByRole("textbox", { name: "Process ID" }).fill(fields.processId);
  await panel.getByRole("spinbutton", { name: "Version" }).fill(fields.version);
  await panel.getByRole("textbox", { name: "Source digest" }).fill(fields.sourceSha256);
  await panel.getByRole("button", { name: "Search", exact: true }).click();
}

async function assertOnlyRenderedIdentity(
  panel: Locator,
  expected: PublicProcessInstanceIdentity,
): Promise<void> {
  await assertRenderedIdentity(panel, expected);
  await expect(panel.getByRole("row")).toHaveCount(2);
}

async function assertRenderedIdentity(
  panel: Locator,
  expected: PublicProcessInstanceIdentity,
): Promise<void> {
  expect(
    expected.processInstanceId,
    "Process-instance ID must not alias the BPMN Process ID",
  ).not.toBe(expected.definition.processId);
  const row = panel
    .getByRole("table", { name: "Confirmed Product 2 starts" })
    .getByRole("row")
    .filter({ hasText: expected.processInstanceId });
  await expect(row, `Process-instance row ${expected.processInstanceId}`).toHaveCount(1);
  const rowHeader = row.getByRole("rowheader");
  const cells = row.getByRole("cell");
  await expect(rowHeader, "Process-instance ID rendering").toHaveText(
    expected.processInstanceId,
  );
  await expect(cells, "complete public identity value count").toHaveCount(5);
  await expect(cells.nth(0), "BPMN Process ID rendering").toHaveText(
    expected.definition.processId,
  );
  await expect(cells.nth(1), "exact deployed version rendering").toHaveText(
    String(expected.definition.version),
  );
  await expect(cells.nth(2), "exact source ID rendering").toHaveText(
    expected.definition.source.id,
  );
  await expect(cells.nth(3), "exact source digest rendering").toHaveText(
    expected.definition.source.sha256,
  );
  await expect(cells.nth(4), "exact semantic profile rendering").toHaveText(
    expected.definition.semanticProfile,
  );
}

async function deployDefinition(
  request: APIRequestContext,
  bytes: Buffer,
  sourceId: string,
  semanticProfile: string,
): Promise<DeployedDefinitionVersion> {
  const url = new URL(definitionsCollectionPath(), apiOrigin);
  url.searchParams.set("sourceId", sourceId);
  url.searchParams.set("semanticProfile", semanticProfile);
  const response = await request.post(url.toString(), {
    headers: {
      accept: "application/json",
      "content-type": "application/bpmn+xml",
    },
    data: bytes,
  });
  expect(response.status()).toBe(201);
  const result = decodeDefinitionDeployResult(await response.json() as unknown);
  expect(result.status).toBe(DefinitionDeployStatus.Deployed);
  if (result.status !== DefinitionDeployStatus.Deployed) {
    throw new TypeError("browser setup definition was rejected");
  }
  return result.definition;
}

async function startDefinition(
  request: APIRequestContext,
  definition: DeployedDefinitionVersion,
): Promise<PublicProcessInstanceIdentity> {
  const response = await request.post(new URL(
    definitionVersionStartPath(definition.processId, definition.version),
    apiOrigin,
  ).toString(), { headers: { accept: "application/json" } });
  expect(response.status()).toBe(201);
  const result = decodeProcessInstanceStartResult(await response.json() as unknown);
  expect(result.status).toBe(ProcessInstanceStartStatus.Started);
  if (result.status !== ProcessInstanceStartStatus.Started) {
    throw new TypeError("browser setup direct start was rejected");
  }
  return result.instance;
}

async function scheduleDefinitionStart(
  request: APIRequestContext,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
): Promise<PublicProcessInstanceIdentity> {
  const url = new URL(
    definitionSchedulePath(definition.processId, definition.version, scheduleId),
    apiOrigin,
  ).toString();
  const put = await request.put(url, {
    headers: { accept: "application/json", "content-type": "application/json" },
    data: { activationAt: nextWholeSecond(2) },
  });
  expect([200, 201]).toContain(put.status());
  expect(decodeDefinitionSchedule(await put.json() as unknown).status)
    .toBe(DefinitionScheduleStatus.Scheduled);
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const response = await request.get(url, { headers: { accept: "application/json" } });
    expect(response.status()).toBe(200);
    const schedule = decodeDefinitionSchedule(await response.json() as unknown);
    if (schedule.status === DefinitionScheduleStatus.Started) {
      return schedule.instance;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("browser setup definition Schedule did not start");
}

async function publishMessageStart(
  request: APIRequestContext,
  definition: DeployedDefinitionVersion,
  messageStart: PublicMessageStartCapability,
  publicationId: string,
): Promise<PublicProcessInstanceIdentity> {
  const url = new URL(messageStartPublicationPath(publicationId), apiOrigin).toString();
  const put = await request.put(url, {
    headers: { accept: "application/json", "content-type": "application/json" },
    data: {
      definition: { processId: definition.processId, version: definition.version },
      messageStart,
    },
  });
  expect([200, 201, 202]).toContain(put.status());
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const response = await request.get(url, { headers: { accept: "application/json" } });
    expect(response.status()).toBe(200);
    const publication = decodeMessageStartPublication(await response.json() as unknown);
    if (publication.status === MessageStartPublicationStatus.Accepted) {
      return publication.instance;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("browser setup Message Start publication was not accepted");
}

function requireCapability(
  capability: PublicMessageStartCapability | undefined,
): PublicMessageStartCapability {
  if (capability === undefined) {
    throw new TypeError("Message Start definition must publish one capability");
  }
  return capability;
}

function expectDistinctPublicIdentities(
  instances: readonly PublicProcessInstanceIdentity[],
): void {
  expect(new Set(instances.map(({ processInstanceId }) => processInstanceId)).size).toBe(3);
  expect(new Set(instances.map(({ definition }) => definition.source.sha256)).size).toBe(3);
  expect(new Set(instances.map(({ definition }) => definition.source.id)).size).toBe(3);
  for (const instance of instances) {
    expect(instance.processInstanceId, "Process-instance ID aliases Process ID")
      .not.toBe(instance.definition.processId);
  }
}

async function runtimeSources(
  sharedProcessId: string,
  messageProcessId: string,
  token: string,
): Promise<Readonly<{ direct: Buffer; timer: Buffer; message: Buffer }>> {
  const [direct, timer, message] = await Promise.all([
    readFile(directTemplateUrl, "utf8"),
    readFile(timerTemplateUrl, "utf8"),
    readFile(messageTemplateUrl, "utf8"),
  ]);
  return {
    direct: Buffer.from(direct
      .replaceAll("Definitions_SequentialUserTask", `Definitions_Browser_Direct_${token}`)
      .replaceAll("Process_SequentialUserTask", sharedProcessId)
      .replace('name="Approve"', `name="Browser direct ${token}"`)
      .replace(
        "https://bpmn-lean.local/scenarios/sequential-user-task",
        `https://third-party.invalid/search/browser/direct/${token}`,
      )),
    timer: Buffer.from(timer
      .replaceAll("Definitions_TimerStart", `Definitions_Browser_Timer_${token}`)
      .replaceAll("Process_TimerStart", sharedProcessId)
      .replace('name="Review"', `name="Browser scheduled ${token}"`)
      .replace(
        "https://bpmn-lean.local/tests/timer-start",
        `https://third-party.invalid/search/browser/timer/${token}`,
      )),
    message: Buffer.from(message
      .replaceAll("Definitions_MessageStart", `Definitions_Browser_Message_${token}`)
      .replaceAll("Process_MessageStart", messageProcessId)
      .replaceAll(
        "Operation_ReceiveApprovalRequest",
        `Operation_ReceiveApprovalRequest_Browser_${token}`,
      )
      .replace('name="Approve"', `name="Browser Message Start ${token}"`)
      .replace(
        "https://bpmn-lean.local/tests/message-start",
        `https://third-party.invalid/search/browser/message/${token}`,
      )),
  };
}

function nextWholeSecond(offsetSeconds: number): string {
  const wholeSecond = Math.ceil(Date.now() / 1_000) * 1_000;
  return new Date(wholeSecond + offsetSeconds * 1_000).toISOString();
}
