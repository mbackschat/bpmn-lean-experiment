/**
 * Locks the product example configurations to the complete registered profile set.
 *
 * This is the port-free half of product acceptance: every registered semantic profile must have one
 * example configuration that loads under strict validation, compiles from its exact source, and
 * passes both pre-start gates without opening a Temporal connection. Live durable execution of these
 * same configurations is a separate lane that requires a running Temporal service.
 *
 * The oracle is `SemanticProfileId`, not the example directory, so adding a profile without a product
 * example fails here rather than silently shrinking the advertised product surface.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import {
  BpmnProcessAdmissionResultKind,
  TemporalHostCapabilityResultKind,
  assessBpmnProcessAdmission,
  assessTemporalHostCapability,
} from "@bpmn-lean/temporal-testkit";

import { loadRunnableMvpConfig } from "../../runner/cli/runnable-mvp-config.ts";
import type { RunnableMvpConfig } from "../../runner/cli/runnable-mvp-config.ts";
import {
  createRunnableMvpStartStimulus,
} from "../../runner/cli/runnable-mvp-start.ts";

const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const exampleRoot = path.join(projectRoot, "examples/temporal-mvp");
const registeredProfiles = Object.values(SemanticProfileId);
const configuredTaskProfileId =
  "bpmn-2.0.2-bpmn-lean-configured-task-effect-draft";
const timerStartProfileId = "bpmn-2.0.2-timer-start-event-draft";
const terminateEndProfileId = "bpmn-2.0.2-terminate-end-event-draft";
const booleanCompletionProfileId =
  "cibseven-2.2.0-user-task-boolean-completion-data-draft";
const userTaskMetadataProfileId =
  "cibseven-2.2.0-user-task-assignment-form-metadata-draft";
const parallelUserTaskMetadataProfileId =
  "cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft";

/** The rejection example deliberately pairs a real model with a profile that excludes it. */
const admissionRejectionExample = "unsupported.json";

async function exampleConfigPaths(): Promise<ReadonlyArray<string>> {
  return (await readdir(exampleRoot))
    .filter((file) => file.endsWith(".json"))
    .filter((file) => file !== admissionRejectionExample)
    .sort()
    .map((file) => path.join(exampleRoot, file));
}

async function compileExample(config: RunnableMvpConfig) {
  return compileBpmnToSemanticProcess({
    bytes: await readFile(config.bpmn.file),
    sourceId: config.bpmn.sourceId,
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: config.bpmn.semanticProfile,
    limits: config.bpmn.limits,
  });
}

// Both directions are load-bearing, and neither is the former exact-multiset equality.
//
// A profile with no example would silently shrink the advertised product surface, and an example
// naming an unregistered profile would advertise a surface the engine does not have. Exactly-one
// equality also forbade a second example per profile, which only ever bought duplicate detection
// while blocking the deliberate variant a profile needs when one configuration cannot reach both
// arms of a race: the Event-Based Gateway profile has two registered scenarios, and one example
// can answer the Message or decline it, never both.
test("gives every registered semantic profile at least one example and no example an unregistered profile", async () => {
  const configs = await Promise.all(
    (await exampleConfigPaths()).map((file) => loadRunnableMvpConfig(file)),
  );
  const exampleCounts = new Map(
    registeredProfiles.map((profileId) => [
      profileId,
      configs.filter((config) => config.bpmn.semanticProfile === profileId)
        .length,
    ]),
  );

  assert.deepEqual(
    {
      profilesWithoutExample: registeredProfiles.filter(
        (profileId) => (exampleCounts.get(profileId) ?? 0) === 0,
      ),
      unregisteredProfiles: configs
        .map((config) => config.bpmn.semanticProfile)
        .filter((profileId) =>
          !registeredProfiles.some((registered) => registered === profileId)
        ),
    },
    { profilesWithoutExample: [], unregisteredProfiles: [] },
  );
});

test("registers Timer Start with one exact runnable product example", async () => {
  assert.equal(registeredProfiles.includes(timerStartProfileId), true);
  const timerExamples = await Promise.all(
    (await exampleConfigPaths())
      .filter((file) => path.basename(file) === "timer-start-event.json")
      .map((file) => loadRunnableMvpConfig(file)),
  );
  assert.deepEqual(
    timerExamples.map(({ bpmn, process }) => ({
      semanticProfile: bpmn.semanticProfile,
      process,
    })),
    [{
      semanticProfile: timerStartProfileId,
      process: {
        instanceId: "MvpExample_timer_start_event_1",
        startEventId: "TimerStart_PT1S",
      },
    }],
  );
});

test("registers Terminate End with one exact manual-start product example", async () => {
  assert.equal(registeredProfiles.includes(terminateEndProfileId), true);
  const [config] = await Promise.all(
    (await exampleConfigPaths())
      .filter((file) => path.basename(file) === "terminate-end-event.json")
      .map((file) => loadRunnableMvpConfig(file)),
  );
  assert.ok(config !== undefined);
  assert.deepEqual(
    {
      semanticProfile: config.bpmn.semanticProfile,
      process: config.process,
      interactions: config.interactions,
      start: createRunnableMvpStartStimulus(config, {
        processId: "Process_TerminateEnd",
      }),
    },
    {
      semanticProfile: terminateEndProfileId,
      process: {
        instanceId: "MvpExample_terminate_end_event_1",
        initialVariables: [],
      },
      interactions: [
        {
          kind: "completeUserTaskInstance",
          elementId: "UserTask_Trigger",
          delayMs: 250,
          inputVariableNames: [],
          submittedValues: [],
        },
        {
          kind: "completeUserTaskInstance",
          elementId: "UserTask_Outer",
          delayMs: 250,
          inputVariableNames: [],
          submittedValues: [],
        },
      ],
      start: {
        kind: "startProcess",
        commandId: "mvp-start:MvpExample_terminate_end_event_1",
        processId: "Process_TerminateEnd",
        instanceId: "MvpExample_terminate_end_event_1",
        initialVariables: [],
      },
    },
  );
});

test("registers configured Task with the existing Probe handler and User Task interaction", async () => {
  assert.equal(registeredProfiles.includes(configuredTaskProfileId), true);
  const [config] = await Promise.all(
    (await exampleConfigPaths())
      .filter((file) => path.basename(file) === "configured-task.json")
      .map((file) => loadRunnableMvpConfig(file)),
  );
  assert.ok(config !== undefined);
  assert.deepEqual(
    {
      semanticProfile: config.bpmn.semanticProfile,
      interactions: config.interactions,
      effectHandlers: config.effectHandlers,
    },
    {
      semanticProfile: configuredTaskProfileId,
      interactions: [{
        kind: "completeUserTaskInstance",
        elementId: "UserTask_Review",
        delayMs: 250,
        inputVariableNames: [],
        submittedValues: [],
      }],
      effectHandlers: [{
        protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
        operation: "urn:bpmn-lean:effect-operation:probe-v1",
        result: { kind: "success", localPatch: [] },
      }],
    },
  );
});

test("registers Boolean completion with the existing User Task interaction", async () => {
  assert.equal(registeredProfiles.includes(booleanCompletionProfileId), true);
  const [config] = await Promise.all(
    (await exampleConfigPaths())
      .filter((file) => path.basename(file) === "user-task-boolean-completion.json")
      .map((file) => loadRunnableMvpConfig(file)),
  );
  assert.ok(config !== undefined);
  assert.deepEqual(
    {
      source: config.bpmn.file,
      semanticProfile: config.bpmn.semanticProfile,
      interactions: config.interactions,
      effectHandlers: config.effectHandlers,
    },
    {
      source: path.join(
        projectRoot,
        "scenarios/user-task-discovery-completion/process.bpmn",
      ),
      semanticProfile: booleanCompletionProfileId,
      interactions: [{
        kind: "completeUserTaskInstance",
        elementId: "UserTask_Approve",
        delayMs: 250,
        inputVariableNames: ["initialNote", "requestTitle"],
        submittedValues: [
          {
            name: "approved",
            value: { kind: "boolean", value: true },
          },
          {
            name: "decisionLabel",
            value: { kind: "string", value: "approved" },
          },
          { name: "reviewNote", value: { kind: "null" } },
        ],
      }],
      effectHandlers: [],
    },
  );
});

test("registers User Task metadata with the existing User Task interaction", async () => {
  assert.equal(registeredProfiles.includes(userTaskMetadataProfileId), true);
  const [config] = await Promise.all(
    (await exampleConfigPaths())
      .filter((file) => path.basename(file) === "user-task-assignment-form-metadata.json")
      .map((file) => loadRunnableMvpConfig(file)),
  );
  assert.ok(config !== undefined);
  assert.deepEqual(
    {
      source: config.bpmn.file,
      semanticProfile: config.bpmn.semanticProfile,
      interactions: config.interactions,
      effectHandlers: config.effectHandlers,
    },
    {
      source: path.join(
        projectRoot,
        "scenarios/user-task-assignment-form-metadata/process.bpmn",
      ),
      semanticProfile: userTaskMetadataProfileId,
      interactions: [{
        kind: "completeUserTaskInstance",
        elementId: "UserTask_Approve",
        delayMs: 250,
        inputVariableNames: ["requestTitle"],
        submittedValues: [{
          name: "approved",
          value: { kind: "boolean", value: true },
        }],
      }],
      effectHandlers: [],
    },
  );
});

test("registers parallel User Task metadata with two existing User Task interactions", async () => {
  assert.equal(
    registeredProfiles.includes(parallelUserTaskMetadataProfileId),
    true,
  );
  const [config] = await Promise.all(
    (await exampleConfigPaths())
      .filter((file) =>
        path.basename(file) ===
          "parallel-user-task-assignment-form-metadata.json"
      )
      .map((file) => loadRunnableMvpConfig(file)),
  );
  assert.ok(config !== undefined);
  assert.deepEqual(
    {
      source: config.bpmn.file,
      semanticProfile: config.bpmn.semanticProfile,
      process: config.process,
      interactions: config.interactions,
      effectHandlers: config.effectHandlers,
    },
    {
      source: path.join(
        projectRoot,
        "scenarios/parallel-user-task-metadata-composition/process.bpmn",
      ),
      semanticProfile: parallelUserTaskMetadataProfileId,
      process: {
        instanceId: "MvpExample_parallel_user_task_metadata_1",
        initialVariables: [],
      },
      interactions: [
        {
          kind: "completeUserTaskInstance",
          elementId: "UserTask_ContentReview",
          delayMs: 250,
          inputVariableNames: [],
          submittedValues: [{
            name: "contentApproved",
            value: { kind: "boolean", value: true },
          }],
        },
        {
          kind: "completeUserTaskInstance",
          elementId: "UserTask_RiskReview",
          delayMs: 250,
          inputVariableNames: [],
          submittedValues: [{
            name: "riskApproved",
            value: { kind: "boolean", value: true },
          }],
        },
      ],
      effectHandlers: [],
    },
  );
});

test("admits every example through both pre-start gates without connecting", async () => {
  for (const file of await exampleConfigPaths()) {
    const config = await loadRunnableMvpConfig(file);
    const compilation = await compileExample(config);
    assert.equal(
      compilation.status,
      BpmnCompilationStatus.Accepted,
      `${path.basename(file)} must admit at source and profile admission`,
    );
    if (compilation.status !== BpmnCompilationStatus.Accepted) {
      return;
    }
    const capability = assessTemporalHostCapability(compilation.semanticProcess);
    assert.equal(
      capability.kind,
      TemporalHostCapabilityResultKind.Admitted,
      `${path.basename(file)} must be within this host's wait-set capability`,
    );
    const admission = assessBpmnProcessAdmission(
      createRunnableMvpStartStimulus(config, compilation.semanticProcess),
      compilation.semanticProcess,
    );
    assert.equal(
      admission.kind,
      BpmnProcessAdmissionResultKind.Admitted,
      `${path.basename(file)} must pass semantic start admission`,
    );
  }
});

test("declares an effect handler for every effect the program awaits", async () => {
  for (const file of await exampleConfigPaths()) {
    const config = await loadRunnableMvpConfig(file);
    const compilation = await compileExample(config);
    if (compilation.status !== BpmnCompilationStatus.Accepted) {
      continue;
    }
    const awaited = compilation.semanticProcess.operations.flatMap((operation) =>
      "effect" in operation && operation.effect !== undefined
        ? [operation.effect.descriptor]
        : []
    );
    for (const descriptor of awaited) {
      assert.ok(
        config.effectHandlers.some(
          (handler) =>
            handler.protocol === descriptor.protocol &&
            handler.operation === descriptor.operation,
        ),
        `${path.basename(file)} must declare a handler for ${descriptor.protocol}/${descriptor.operation}`,
      );
    }
  }
});

test("keeps a rejection example that never reaches host capability", async () => {
  const config = await loadRunnableMvpConfig(
    path.join(exampleRoot, admissionRejectionExample),
  );
  const compilation = await compileExample(config);

  assert.equal(compilation.status, BpmnCompilationStatus.Rejected);
});
