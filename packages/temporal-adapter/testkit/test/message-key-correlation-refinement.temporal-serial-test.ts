import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  EngineCorrelatedMessagePublishResolutionKind,
  publishBpmnDefinitionCorrelatedMessage,
} from "@bpmn-lean/engine-api";
import type {
  TemporalCorrelatedMessageClient,
} from "@bpmn-lean/temporal-client/correlation-publication";
import {
  CanonicalObservationKind,
  CommandOutcome,
  CorrelatedMessageInteractionKind,
  ProcessStatus,
  compareCanonicalStrings,
  runEnginePopulationScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  EnginePopulationScenario,
  EnginePopulationScenarioResult,
  SemanticProcessProgram,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  bpmnResolveCorrelationTargetDeliveryActivityName,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
  correlationIngressWorkflowId,
  createCachedLocalEnvironment,
  createCorrelationTargetDeliveryActivities,
  getTestProcessHandle,
  loadBpmnWorkflowBundle,
  requireCorrelationTargetDeliveryActivityRequest,
  startBpmnProcess,
  submitMessageDelivery,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  CorrelationTargetDeliveryActivityRequest,
} from "@bpmn-lean/temporal-testkit";
import type { WorkflowHandle } from "@temporalio/client";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import { waitForMessageState } from "./message-temporal-test-support.ts";
import {
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const projectRoot = path.resolve(import.meta.dirname, "../../../..");
const populationScenarioPaths = [
  "scenarios/message-key-correlation/ambiguous.population-scenario.json",
  "scenarios/message-key-correlation/cross-definition.population-scenario.json",
  "scenarios/message-key-correlation/unique.population-scenario.json",
  "scenarios/message-key-correlation/zero.population-scenario.json",
] as const;

type RetainedHistory = Readonly<{
  history: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>;
  workflowId: string;
}>;

test("refines every registered Message-key population through the public operation, recovery, and replay", async () => {
  const bundle = await loadBpmnWorkflowBundle();
  for (const scenarioPath of populationScenarioPaths) {
    const scenario = JSON.parse(
      await readFile(path.join(projectRoot, scenarioPath), "utf8"),
    ) as EnginePopulationScenario;
    const programs = await compileDefinitions(scenario);
    const expected = runEnginePopulationScenario(scenario, programs);
    assert.ok(expected !== null);

    const histories = await runTemporalPopulation(
      bundle,
      scenario,
      programs,
      expected,
    );
    for (const retained of histories) {
      await replayBpmnHistory(
        bundle,
        retained.history,
        retained.workflowId,
      );
    }
  }
});

async function compileDefinitions(
  scenario: EnginePopulationScenario,
): Promise<ReadonlyMap<string, SemanticProcessProgram>> {
  const compiled = await Promise.all(scenario.definitions.map(async (definition) => {
    assert.equal(definition.sourceOverlay, null);
    const result = await compileBpmnToSemanticProcess({
      bytes: await readFile(path.join(projectRoot, definition.relativePath)),
      sourceId: definition.id,
      expectedSha256: definition.sha256,
      sourceOverlay: null,
      semanticProfile: scenario.profile,
      limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
    });
    assert.equal(result.status, BpmnCompilationStatus.Accepted);
    if (result.status !== BpmnCompilationStatus.Accepted) {
      throw new TypeError(`Population definition ${definition.id} was rejected`);
    }
    return [definition.id, result.semanticProcess] as const;
  }));
  return new Map(compiled);
}

async function runTemporalPopulation(
  bundle: WorkflowBundleWithSourceMap,
  scenario: EnginePopulationScenario,
  programs: ReadonlyMap<string, SemanticProcessProgram>,
  expected: EnginePopulationScenarioResult,
): Promise<ReadonlyArray<RetainedHistory>> {
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: `bpmn-${scenario.id}`,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    `${scenario.id} environment startup`,
  );
  let worker: WorkerLease | undefined;
  const processes: WorkflowHandle<BpmnProcessWorkflow>[] = [];
  const retained: RetainedHistory[] = [];
  const deliveryAttempts: CorrelationTargetDeliveryActivityRequest[] = [];
  let ingress: WorkflowHandle | undefined;
  try {
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      `${scenario.id}-worker-1`,
    );
    for (const instance of scenario.instances) {
      const program = programs.get(instance.definitionId);
      assert.ok(program !== undefined);
      const [start, opening] = instance.stimuli;
      const started = await startBpmnProcess(
        environment.client.workflow,
        start,
        program,
        { taskQueue: bpmnSemanticTaskQueue },
      );
      assert.equal(started.kind, BpmnProcessStartResultKind.Started);
      const process = getTestProcessHandle(
        environment.client.workflow,
        start.instanceId,
      );
      processes.push(process);
      await waitForMessageState(
        process,
        (state) => state.openMessageSubscriptions.some(({ id }) =>
          id.elementId === opening.subscriptionId.elementId
        ),
      );
      assert.deepEqual(
        await submitMessageDelivery(
          environment.client.workflow,
          start.instanceId,
          opening,
        ),
        {
          kind: ProcessCommandResultKind.Semantic,
          commandId: opening.commandId,
          outcome: CommandOutcome.Committed,
        },
      );
      await waitForMessageState(
        process,
        (state) => state.enabledInteractions.some((interaction) =>
          interaction.kind ===
            CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage
        ),
      );
    }

    if (scenario.id === "message-key-correlation-unique") {
      await stopBpmnTestWorker(worker);
      worker = await startRecoveryWorker(
        environment,
        bundle,
        deliveryAttempts,
      );
    }

    const publication = scenario.publications[0];
    const resolution = await publishBpmnDefinitionCorrelatedMessage({
      temporalClient: environment.client.workflow as unknown as
        TemporalCorrelatedMessageClient,
      commandId: publication.commandId,
      address: publication.address,
      payload: publication.payload,
      taskQueue: bpmnSemanticTaskQueue,
    });
    assert.equal(
      resolution.kind,
      EngineCorrelatedMessagePublishResolutionKind.Semantic,
    );
    if (resolution.kind !== EngineCorrelatedMessagePublishResolutionKind.Semantic) {
      throw new TypeError(`${scenario.id} did not return a semantic resolution`);
    }

    const processStates = await Promise.all(processes.map(latestState));
    processStates.sort((left, right) =>
      compareCanonicalStrings(left.instanceId, right.instanceId)
    );
    assert.deepEqual({
      kind: "enginePopulationResult",
      scenarioId: scenario.id,
      publicationResults: [{
        commandId: resolution.commandId,
        ingressOrdinal: resolution.ingressOrdinal,
        outcome: resolution.outcome,
      }],
      ingressOrdinals: [{
        commandId: resolution.commandId,
        ingressOrdinal: resolution.ingressOrdinal,
      }],
      processStates,
    }, expected);

    if (scenario.id === "message-key-correlation-unique") {
      assert.equal(deliveryAttempts.length, 2);
      assert.deepEqual(deliveryAttempts[1], deliveryAttempts[0]);
    }
    ingress = environment.client.workflow.getHandle(
      correlationIngressWorkflowId(publication.address),
    );
    for (const process of processes) {
      retained.push({
        history: await process.fetchHistory(),
        workflowId: process.workflowId,
      });
    }
    retained.push({
      history: await ingress.fetchHistory(),
      workflowId: ingress.workflowId,
    });
  } finally {
    await ingress?.terminate(`${scenario.id} ingress cleanup`).catch(() => undefined);
    await Promise.all(processes.map((process) =>
      process.terminate(`${scenario.id} Process cleanup`).catch(() => undefined)
    ));
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }
  return retained;
}

async function startRecoveryWorker(
  environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>,
  bundle: WorkflowBundleWithSourceMap,
  attempts: CorrelationTargetDeliveryActivityRequest[],
): Promise<WorkerLease> {
  const activities = createCorrelationTargetDeliveryActivities(
    environment.client.workflow as never,
  );
  const deliver = activities[bpmnResolveCorrelationTargetDeliveryActivityName];
  return startBpmnTestWorker(
    environment,
    bundle,
    "message-key-correlation-recovery-worker",
    undefined,
    {
      [bpmnResolveCorrelationTargetDeliveryActivityName]: async (value) => {
        const request = requireCorrelationTargetDeliveryActivityRequest(value);
        attempts.push(request);
        const completion = await deliver(request);
        if (attempts.length === 1) {
          throw new Error("injected post-commit Activity response loss");
        }
        return completion;
      },
    },
  );
}

async function latestState(
  process: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<StateObservation> {
  const trace = await process.query<ReadonlyArray<CanonicalObservation>>(
    bpmnTraceQueryName,
  );
  const state = trace.findLast(
    (observation): observation is StateObservation =>
      observation.kind === CanonicalObservationKind.State,
  );
  assert.ok(state !== undefined && state.status === ProcessStatus.Running);
  return state;
}
