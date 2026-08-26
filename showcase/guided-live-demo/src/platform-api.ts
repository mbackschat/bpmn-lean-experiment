import {
  DefinitionDeployStatus,
  ProcessInstanceStartStatus,
  SemanticTransitionKind,
  StimulusKind,
  VariableValueKind,
  decodeDefinitionDeployResult,
  decodeExecutionPublicationPage,
  decodeProcessInstanceSearchPage,
  decodeProcessInstanceStartResult,
  decodePublicIncidentSnapshot,
  decodeWorkTaskSnapshot,
  definitionVersionStartPath,
  definitionsCollectionPath,
  executionPublicationIdentityForPublicProcessInstance,
  executionPublicationPath,
  incidentsPath,
  processInstancesPath,
  workTasksPath,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";
import { setTimeout as delay } from "node:timers/promises";

import { isAudienceStateReady } from "./audience-readiness.ts";
import type { AudienceExecutionEvidence } from "./audience-readiness.ts";
import type {
  GuidedDemoPreparationPort,
  PreparedDemoScenario,
} from "./demo-preparation.ts";
import { DemoScenario } from "./demo-plan.ts";
import type { DemoPlanEntry } from "./demo-plan.ts";

const requestDeadlineMs = 10_000;
const publicStateAttempts = 120;
const publicStatePollMs = 250;

/** Product 2 public HTTP adapter used only by deterministic demo preparation. */
export class GuidedDemoPlatformApi implements Pick<
  GuidedDemoPreparationPort,
  "deploy" | "start" | "waitForAudienceState"
> {
  readonly #origin: string;

  constructor(origin: string) {
    this.#origin = new URL(origin).origin;
  }

  async deploy(
    entry: DemoPlanEntry,
    bytes: Uint8Array,
  ): Promise<DeployedDefinitionVersion> {
    const url = new URL(definitionsCollectionPath(), this.#origin);
    url.searchParams.set("sourceId", entry.sourceId);
    url.searchParams.set("semanticProfile", entry.semanticProfile);
    const response = await requestJson(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/bpmn+xml",
      },
      body: bytes.slice(),
    });
    requireStatus(response, 201);
    const result = decodeDefinitionDeployResult(response.json);
    if (result.status !== DefinitionDeployStatus.Deployed) {
      throw new Error(`Demo definition ${entry.sourceId} was rejected: ${response.text}`);
    }
    if (
      result.definition.source.id !== entry.sourceId ||
      result.definition.semanticProfile !== entry.semanticProfile
    ) {
      throw new Error(`Demo definition ${entry.sourceId} returned a different public identity`);
    }
    return result.definition;
  }

  async start(
    entry: DemoPlanEntry,
    definition: DeployedDefinitionVersion,
  ): Promise<PublicProcessInstanceIdentity> {
    const response = await requestJson(new URL(definitionVersionStartPath(
      definition.processId,
      definition.version,
    ), this.#origin), {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ initialVariables: entry.initialVariables }),
    });
    requireStatus(response, 201);
    const result = decodeProcessInstanceStartResult(response.json);
    if (result.status !== ProcessInstanceStartStatus.Started) {
      throw new Error(`Demo definition ${entry.sourceId} did not start: ${response.text}`);
    }
    if (
      result.instance.definition.processId !== definition.processId ||
      result.instance.definition.version !== definition.version ||
      result.instance.definition.source.sha256 !== definition.source.sha256
    ) {
      throw new Error(`Demo definition ${entry.sourceId} start changed exact definition identity`);
    }
    return result.instance;
  }

  async waitForAudienceState(
    prepared: ReadonlyArray<PreparedDemoScenario>,
  ): Promise<void> {
    const natural = requirePreparedInstance(prepared, DemoScenario.PurchaseOrderReview);
    const deadline = requirePreparedInstance(prepared, DemoScenario.DeadlineEscalation);
    let lastFailure: unknown;
    for (let attempt = 0; attempt < publicStateAttempts; attempt += 1) {
      try {
        const [work, incidents, batch, naturalExecution, deadlineExecution] = await Promise.all([
          this.#get(workTasksPath(), decodeWorkTaskSnapshot),
          this.#get(incidentsPath(), decodePublicIncidentSnapshot),
          this.#get(processInstancesPath({
            processId: "Process_SequentialMultiInstanceReview",
            limit: 2,
          }), decodeProcessInstanceSearchPage),
          this.#executionEvidence(natural),
          this.#executionEvidence(deadline),
        ]);
        if (isAudienceStateReady(
          prepared,
          work,
          incidents,
          batch,
          [naturalExecution, deadlineExecution],
        )) return;
        lastFailure = new Error("public snapshots are valid but incomplete");
      } catch (failure: unknown) {
        lastFailure = failure;
      }
      await delay(publicStatePollMs);
    }
    const detail = lastFailure instanceof Error ? lastFailure.message : String(lastFailure);
    throw new Error(`Prepared demo state did not become publicly visible: ${detail}`);
  }

  async #get<Result>(path: string, decode: (value: unknown) => Result): Promise<Result> {
    const response = await requestJson(new URL(path, this.#origin), {
      headers: { accept: "application/json" },
    });
    requireStatus(response, 200);
    return decode(response.json);
  }

  async #executionEvidence(
    instance: PublicProcessInstanceIdentity,
  ): Promise<AudienceExecutionEvidence> {
    const identity = executionPublicationIdentityForPublicProcessInstance(instance);
    const request = { ...identity, afterRevision: 0, limit: 100 } as const;
    const response = await requestJson(new URL(executionPublicationPath(request), this.#origin), {
      headers: { accept: "application/json" },
    });
    requireStatus(response, 200);
    const page = decodeExecutionPublicationPage(response.json, request);
    if (page.current === null) {
      throw new Error(`Demo execution ${instance.processInstanceId} exceeds one readiness page`);
    }
    const output = page.current.state.variables.find(({ name }) =>
      name === "DataObjectReference_OutputResults"
    );
    let terminalOutput: ReadonlyArray<string> | null = null;
    if (output !== undefined) {
      if (output.value.kind !== VariableValueKind.StringList) {
        throw new Error(`Demo execution ${instance.processInstanceId} has a non-list terminal output`);
      }
      terminalOutput = output.value.value;
    }
    return {
      processInstanceId: instance.processInstanceId,
      status: page.current.state.status,
      terminalOutput,
      timerFirings: page.batches.reduce((count, batch) => count +
        batch.transitions.filter(({ transition }) =>
          transition.kind === SemanticTransitionKind.ExternalStimulus &&
          transition.stimulus.kind === StimulusKind.FireTimer
        ).length, 0),
    };
  }
}

function requirePreparedInstance(
  prepared: ReadonlyArray<PreparedDemoScenario>,
  scenario: DemoScenario,
): PublicProcessInstanceIdentity {
  const instance = prepared.find((candidate) => candidate.scenario === scenario)?.instance;
  if (instance === undefined) throw new Error(`Prepared demo omitted ${scenario}`);
  return instance;
}

async function requestJson(
  url: URL,
  init: RequestInit,
): Promise<Readonly<{ status: number; text: string; json: unknown }>> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(requestDeadlineMs),
  });
  const mediaType = response.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new TypeError(`HTTP ${response.status} returned ${mediaType ?? "no media type"}`);
  }
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (cause: unknown) {
    throw new TypeError(`HTTP ${response.status} returned malformed JSON`, { cause });
  }
  return { status: response.status, text, json };
}

function requireStatus(
  response: Readonly<{ status: number; text: string }>,
  expected: number,
): void {
  if (response.status !== expected) {
    throw new Error(`expected HTTP ${expected}, received ${response.status}: ${response.text}`);
  }
}
