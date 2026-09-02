import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  BpmnProcessAdmissionResultKind,
  BpmnProcessStartResultKind,
  assessBpmnProcessAdmission,
  startBpmnProcess,
} from "@bpmn-lean/temporal-client";
import {
  TemporalHostAdmissionFailureCode,
} from "@bpmn-lean/temporal-protocol";

const limits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

test("rejects the lowered Compensation checkpoint through both Product 1 start paths", async () => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "../../../bpmn-source/test/fixtures/compensation-source-checkpoint.bpmn",
      import.meta.url,
    )),
    sourceId: "compensation-source-host-refusal",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
    limits,
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Compensation source checkpoint was not admitted");
  }

  const start = {
    kind: StimulusKind.StartProcess,
    commandId: "start-compensation-source-host-refusal",
    processId: compilation.semanticProcess.processId,
    instanceId: "CompensationSourceHostRefusal_1",
    initialVariables: [],
  } as const satisfies StartProcessStimulus;
  const failure = {
    code: TemporalHostAdmissionFailureCode.CompensationSchedulerUnavailable,
    evidence:
      "The Temporal host does not yet provide the concurrent compensation-frontier scheduler required by triggerCompensation.",
  } as const;

  assert.deepEqual(
    assessBpmnProcessAdmission(start, compilation.semanticProcess),
    {
      kind: BpmnProcessAdmissionResultKind.Rejected,
      failure,
    },
  );

  const starts: unknown[] = [];
  const result = await startBpmnProcess(
    {
      start: async (...args: unknown[]) => {
        starts.push(args);
        throw new Error("host admission must refuse before Workflow start");
      },
    } as never,
    start,
    compilation.semanticProcess,
    { taskQueue: "compensation-source-host-refusal" },
  );
  assert.deepEqual(result, {
    kind: BpmnProcessStartResultKind.Rejected,
    failure,
  });
  assert.deepEqual(starts, []);
});
