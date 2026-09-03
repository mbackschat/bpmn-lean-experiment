import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  DefinitionCorrelatedMessageResolutionKind,
  DefinitionCorrelatedMessageSemanticOutcomeKind,
  ProcessInstanceStartStatus,
  decodeDefinitionCorrelatedMessagePublication,
  decodeProcessInstanceStartResult,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionCorrelatedMessagePublication,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import { CorrelatedMessageShowcaseRuntime } from "../src/showcase-runtime.ts";

const processId = "Process_SettlementCorrelation";
const profileId = "bpmn-2.0.2-message-key-correlation-draft";
const modelPath = fileURLToPath(new URL(
  "../../../scenarios/message-key-correlation/process.bpmn",
  import.meta.url,
));
let runtime: CorrelatedMessageShowcaseRuntime;

test.beforeAll(async () => {
  runtime = await CorrelatedMessageShowcaseRuntime.create();
  await runtime.start();
});

test.afterAll(async () => {
  await runtime.close();
});

test("shows unique, zero, and ambiguous correlation without a Process locator", async ({ page }) => {
  const token = `${Date.now()}-${process.pid}`;
  await page.goto("/");
  await deployExactDefinition(page);

  const unique = await startExactDefinition(page);
  const other = await startExactDefinition(page);
  const ambiguousA = await startExactDefinition(page);
  const ambiguousB = await startExactDefinition(page);
  const candidate = await runtime.initializeCandidate(
    unique.processInstanceId,
    `open-unique-${token}`,
    "settlement-unique",
  );
  await runtime.initializeCandidate(other.processInstanceId, `open-other-${token}`, "settlement-other");
  await runtime.initializeCandidate(ambiguousA.processInstanceId, `open-ambiguous-a-${token}`, "settlement-ambiguous");
  await runtime.initializeCandidate(ambiguousB.processInstanceId, `open-ambiguous-b-${token}`, "settlement-ambiguous");
  expect(candidate.address).toEqual({
    definition: {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: unique.definition.semanticProfile,
      sourceId: unique.definition.source.id,
      sourceSha256: unique.definition.source.sha256,
      sourceOverlay: null,
    },
    processId,
    channel: {
      kind: "operationMessage",
      interfaceId: "Interface_ClearingHouse",
      interfaceOperationId: "Operation_ConfirmSettlement",
      messageId: "Message_SettlementConfirmed",
    },
    correlationKeyId: "CorrelationKey_SettlementReference",
  });
  expect(candidate.key).toEqual({ kind: "string", value: "settlement-unique" });

  await page.getByRole("tab", { name: "Triggers", exact: true }).click();
  const panel = page.getByRole("region", {
    name: "Correlated Message publication",
  });
  await expect(panel.getByLabel("Published correlated Message capabilities"))
    .toContainText("MessageCatch_CorrelatedSettlement");
  await expect(panel).toContainText("CorrelationKey_SettlementReference");
  await expect(panel.getByRole("textbox")).toHaveCount(2);
  await expect(panel.getByRole("textbox", {
    name: /Process|business key|tenant|locator/iu,
  })).toHaveCount(0);

  const attempts: PublicationAttempt[] = [];
  const responseLoss: {
    publication: DefinitionCorrelatedMessagePublication | undefined;
  } = { publication: undefined };
  await page.route("**/correlated-messages/**/publications/**", async (route) => {
    attempts.push({
      pathname: new URL(route.request().url()).pathname,
      body: route.request().postDataJSON(),
    });
    if (responseLoss.publication === undefined) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      responseLoss.publication = decodeDefinitionCorrelatedMessagePublication(
        await response.json(),
      );
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  const commandInput = panel.getByRole("textbox", {
    name: "Command ID Retry uses this unchanged ID and unchanged Message value.",
    exact: true,
  });
  const valueInput = panel.getByRole("textbox", {
    name: "Message value One non-empty string; no separate correlation-key field is accepted.",
    exact: true,
  });
  const publish = panel.getByRole("button", {
    name: "Publish correlated Message",
  });
  const uniqueCommand = `publish-unique-${token}`;
  await commandInput.fill(uniqueCommand);
  await valueInput.fill("settlement-unique");
  await publish.click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(commandInput).toHaveValue(uniqueCommand);
  await expect(valueInput).toHaveValue("settlement-unique");
  const lostResponse = responseLoss.publication;
  expect(lostResponse?.resolution.kind).toBe(
    DefinitionCorrelatedMessageResolutionKind.Semantic,
  );
  if (lostResponse?.resolution.kind !== DefinitionCorrelatedMessageResolutionKind.Semantic) {
    throw new Error("lost production response was not a semantic resolution");
  }
  expect(lostResponse.resolution.outcome).toEqual({
    kind: DefinitionCorrelatedMessageSemanticOutcomeKind.Committed,
    target: { processInstanceId: unique.processInstanceId },
  });

  await publish.click();
  await expect(panel.getByText("Delivered to one matching Process", { exact: true }))
    .toBeVisible();
  await expect(panel.getByText(unique.processInstanceId, { exact: true }))
    .toBeVisible();
  await runtime.assertOnlyReviewTask(unique.processInstanceId, [
    other.processInstanceId,
    ambiguousA.processInstanceId,
    ambiguousB.processInstanceId,
  ]);

  await beginCommand(panel, `publish-zero-${token}`, "settlement-missing");
  await publish.click();
  await expect(panel.getByText("No matching subscription", { exact: true }))
    .toBeVisible();
  await runtime.assertOnlyReviewTask(unique.processInstanceId, [
    other.processInstanceId,
    ambiguousA.processInstanceId,
    ambiguousB.processInstanceId,
  ]);

  await beginCommand(panel, `publish-ambiguous-${token}`, "settlement-ambiguous");
  await publish.click();
  await expect(panel.getByText("Multiple matching subscriptions", { exact: true }))
    .toBeVisible();
  await runtime.assertOnlyReviewTask(unique.processInstanceId, [
    other.processInstanceId,
    ambiguousA.processInstanceId,
    ambiguousB.processInstanceId,
  ]);

  expect(attempts).toHaveLength(4);
  expect(attempts[1]).toEqual(attempts[0]);
  for (const attempt of attempts) {
    expect(attempt.body).toEqual({
      payload: {
        kind: "string",
        value: expect.stringMatching(/^settlement-/u),
      },
    });
    expect(attempt.pathname).not.toContain(unique.processInstanceId);
    expect(attempt.pathname).not.toContain(other.processInstanceId);
    expect(attempt.pathname).not.toContain(ambiguousA.processInstanceId);
    expect(attempt.pathname).not.toContain(ambiguousB.processInstanceId);
    expect(JSON.stringify(attempt.body)).not.toMatch(
      /processInstanceId|workflowId|runId|businessKey|tenantId|subscriptionId/u,
    );
  }
  await expect(panel).not.toContainText(/workflow|run id|task queue|subscription id/iu);
});

type PublicationAttempt = Readonly<{
  pathname: string;
  body: unknown;
}>;

async function deployExactDefinition(page: Page): Promise<void> {
  await navigateToDefinitions(page);
  await page.getByText("Add BPMN definition", { exact: true }).click();
  await page.getByLabel("BPMN XML file").setInputFiles(modelPath);
  await page.getByLabel("Semantic profile ID").fill(profileId);
  await page.getByRole("button", { name: "Deploy definition", exact: true }).click();
  await expect(page.getByText("Admitted and deployed", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Definition" })).toHaveValue(processId);
}

async function startExactDefinition(
  page: Page,
): Promise<PublicProcessInstanceIdentity> {
  await page.getByRole("tab", { name: "Start", exact: true }).click();
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname.endsWith("/start")
  );
  await page.getByRole("button", { name: /Start version 1/u }).click();
  const result = decodeProcessInstanceStartResult(await (await responsePromise).json());
  expect(result.status).toBe(ProcessInstanceStartStatus.Started);
  if (result.status !== ProcessInstanceStartStatus.Started) {
    throw new Error(`correlated Message Process was rejected: ${result.failure.evidence}`);
  }
  return result.instance;
}

async function beginCommand(
  panel: ReturnType<Page["getByRole"]>,
  commandId: string,
  value: string,
): Promise<void> {
  await panel.getByRole("button", { name: "New command", exact: true }).click();
  await panel.getByRole("textbox", {
    name: "Command ID Retry uses this unchanged ID and unchanged Message value.",
    exact: true,
  }).fill(commandId);
  await panel.getByRole("textbox", {
    name: "Message value One non-empty string; no separate correlation-key field is accepted.",
    exact: true,
  }).fill(value);
}

async function navigateToDefinitions(page: Page): Promise<void> {
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Definitions", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Definitions", level: 1 }))
    .toBeVisible();
}
