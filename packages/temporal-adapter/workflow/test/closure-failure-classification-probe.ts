import assert from "node:assert/strict";
import { mock, test } from "node:test";
import * as core from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import * as sdk from "@temporalio/workflow";
import {
  bpmnTraceQueryName,
  bpmnWorkflowChainPatchId,
  productionBpmnWorkflowInitialHostInput,
} from "@bpmn-lean/temporal-protocol";
import {
  publicationCompletion,
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";
import type { registerWorkflowCommandIngress } from "../src/workflow-command-ingress.js";

type Ingress = Parameters<typeof registerWorkflowCommandIngress>[0];
type FailureMode = "fuel" | "ambiguity" | "success";
let mode: FailureMode = "success";
let ingress: Ingress;
let before: ReturnType<typeof snapshot>;
const queries = new Map<string, () => unknown>();
const admissions: string[] = [];
const completionA = publicationCompletion("UserTask_A");
const completionB = publicationCompletion("UserTask_B");

const temporalMockOptions = {
  cache: false,
  exports: {
    ...Object.fromEntries(Object.entries(sdk).filter(([name]) => name !== "default")),
    patched: (id: string) => id === bpmnWorkflowChainPatchId,
    workflowInfo: () => ({
      runId: "run-closure", firstExecutionRunId: "run-closure", workflowId: "closure",
      taskQueue: "closure", historyLength: 1, historySize: 0, continueAsNewSuggested: false,
    }),
    setHandler: (definition: { name: string }, handler: () => unknown) => {
      queries.set(definition.name, handler);
    },
    allHandlersFinished: () => true,
    condition: async (predicate: () => boolean) => { assert.equal(predicate(), true); },
  },
};
mock.module("@temporalio/workflow", temporalMockOptions);
const ingressMockOptions = {
  cache: false,
  exports: {
    registerWorkflowCommandIngress: (options: Ingress) => {
      ingress = options;
      assert.ok(options.workflowChain);
      const recovery = options.workflowChain.recovery;
      const preflight = recovery.preflight.bind(recovery);
      mock.method(recovery, "preflight", (stimulus: Stimulus) => {
        const result = preflight(stimulus);
        assert.equal(result.kind, "admitted");
        admissions.push(core.stimulusCommandId(stimulus));
        return result;
      });
      for (const stimulus of [completionA, completionB]) {
        assert.equal(options.reserveStimulus(stimulus), true);
        options.acceptedStimuli.push(stimulus);
        options.pendingStimuli.push(stimulus);
      }
    },
  },
};
mock.module(new URL("../dist/workflow-command-ingress.js", import.meta.url), ingressMockOptions);
const semanticMockOptions = {
  cache: false,
  exports: {
    ...core,
    advanceScenario: (program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus) => {
      if (core.stimulusCommandId(stimulus) !== completionB.commandId) {
        return core.advanceScenario(program, state, stimulus);
      }
      before = snapshot();
      assert.deepEqual(admissions, [completionA.commandId, completionB.commandId]);
      if (mode === "success") {
        return core.advanceScenario(program, state, stimulus);
      }
      // CLOSURE-ATOMIC-01 requires host classification even when recovery has admitted the command.
      // Inject only the evaluator boundary; the Workflow loop, ledger and publication stay real.
      const selected = mode === "ambiguity" ? withAmbiguousEnd(program) : program;
      const limit = mode === "fuel" ? 0 : 50;
      const evaluated = core.applyStimulus(selected, state, stimulus, limit);
      assert.equal(evaluated.internalStepBoundExceeded, mode === "fuel");
      assert.equal(evaluated.ambiguousInternalChoice, mode === "ambiguity");
      assert.equal(evaluated.outcome, core.CommandOutcome.RolledBack);
      assert.equal(evaluated.state, state);
      const step = core.advanceScenario(selected, state, stimulus, limit);
      assert.equal(step.kind, core.ScenarioStepKind.HarnessFailure);
      return step;
    },
  },
};
mock.module("@bpmn-lean/semantic-core", semanticMockOptions);

const { runBpmnProcessWithHostEffects }: typeof import("../src/workflow-implementation.js") =
  await import(new URL("../dist/workflow-implementation.js", import.meta.url).href);
const { ActivationDrain }: typeof import("../src/activation-tagged-readiness.js") =
  await import(new URL("../dist/activation-tagged-readiness.js", import.meta.url).href);
const {
  createCommandPublicationState, integrateCommandPublication, recordCommandPublicationOutcome,
}: typeof import("../src/command-publication-integration.js") =
  await import(new URL("../dist/command-publication-integration.js", import.meta.url).href);
const {
  WorkflowCommandRecoveryLookupKind,
}: typeof import("../src/workflow-command-recovery.js") =
  await import(new URL("../dist/workflow-command-recovery.js", import.meta.url).href);

for (const failureMode of ["fuel", "ambiguity"] as const) {
  test(`${failureMode} closure failure precedes recovery outcome lookup and publication`, async () => {
    reset(failureMode);
    await assert.rejects(run(), (error: unknown) => {
      assert.ok(error instanceof sdk.ApplicationFailure);
      assert.equal(error.type, "BpmnSemanticClosureFailure");
      assert.equal(error.nonRetryable, true);
      return true;
    });
    assert.deepEqual(snapshot(), before);
    assert.equal(ingress.currentState(), before.state);
    assert.deepEqual(ingress.workflowChain?.recovery.lookup(completionB), {
      kind: WorkflowCommandRecoveryLookupKind.Unseen,
    });
    assert.deepEqual(ingress.workflowChain?.recovery.lookup(completionA), {
      kind: WorkflowCommandRecoveryLookupKind.Resolved, outcome: core.CommandOutcome.Committed,
    });
  });
}

test("successful recoverable completion preserves exact canonical publication", async () => {
  reset("success");
  mock.method(Date, "now", () => 0);
  try {
    await run();
    let state = core.initialState;
    let publication = createCommandPublicationState(publicationProgram, publicationStart.instanceId);
    for (const stimulus of [publicationStart, completionA, completionB]) {
      const step = core.advanceScenario(publicationProgram, state, stimulus);
      assert.equal(step.kind, core.ScenarioStepKind.Committed);
      publication = recordCommandPublicationOutcome(
        integrateCommandPublication(publicationProgram, publication, stimulus, step, () => 0),
        stimulus, step.observations,
      );
      state = step.state;
    }
    assert.deepEqual(ingress.currentState(), state);
    assert.deepEqual(ingress.currentPublication(), publication);
    assert.equal(ingress.workflowChain?.recovery.snapshot().length, 2);
    for (const stimulus of [completionA, completionB]) {
      assert.deepEqual(ingress.workflowChain?.recovery.lookup(stimulus), {
        kind: WorkflowCommandRecoveryLookupKind.Resolved, outcome: core.CommandOutcome.Committed,
      });
    }
  } finally {
    mock.restoreAll();
  }
});

function reset(selected: FailureMode): void {
  mode = selected;
  queries.clear();
  admissions.length = 0;
}

function run() {
  return runBpmnProcessWithHostEffects(
    publicationStart, publicationProgram,
    async () => assert.fail("fixture has no timer"),
    async () => assert.fail("fixture has no effect"),
    ActivationDrain.Required, productionBpmnWorkflowInitialHostInput(),
  );
}

function snapshot() {
  return {
    state: ingress.currentState(),
    stateValue: structuredClone(ingress.currentState()),
    publication: structuredClone(ingress.currentPublication()),
    recovery: structuredClone(ingress.workflowChain?.recovery.snapshot()),
    trace: structuredClone(queries.get(bpmnTraceQueryName)?.()),
  };
}

function withAmbiguousEnd(program: SemanticProcessProgram): SemanticProcessProgram {
  const operation = {
    id: "operation:EndEvent_Alternate", kind: core.SemanticOperationKind.ReachNoneEnd,
    input: "place:Flow_JoinToEnd",
    origin: { kind: core.SemanticOriginKind.BpmnElement, elementId: "EndEvent_Alternate" },
  } as const;
  return {
    ...program,
    operations: [...program.operations, operation].sort((left, right) =>
      core.compareCanonicalStrings(left.id, right.id)),
    operationScopes: [...program.operationScopes, {
      operationId: operation.id, scopeId: `scope:${program.processId}`,
    }].sort((left, right) => core.compareCanonicalStrings(left.operationId, right.operationId)),
  };
}
