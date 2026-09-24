import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mock, test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import * as core from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import * as sdk from "@temporalio/workflow";
import {
  bpmnTraceQueryName,
  bpmnWorkflowChainPatchId,
  productionBpmnWorkflowInitialHostInput,
  WorkflowChainBudgetKind,
  workflowChainProductionLimit,
  timerFiringStimulus,
} from "@bpmn-lean/temporal-protocol";
import type { WorkflowSemanticCandidate, WorkflowSemanticCandidateCapacityBound } from "../src/workflow-semantic-candidate.js";
const candidatePreflight: typeof import("../src/workflow-semantic-candidate.js") =
  await import(new URL("../dist/workflow-semantic-candidate.js", import.meta.url).href);
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
const TimerFailureMode = {
  Fuel: "fuel",
  LiveRejection: "live rejection",
  Projection: "injected projection failure",
  Capacity: "candidate capacity",
} as const;
type TimerFailureMode = typeof TimerFailureMode[keyof typeof TimerFailureMode];
let timerFailure: TimerFailureMode | undefined;
let timerEvaluations = 0;
let timerInstallations = 0;
let firing: core.FireTimerStimulus;
let firingStep: core.ScenarioStep;
let capacityBound: WorkflowSemanticCandidateCapacityBound | undefined;
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
    condition: async (predicate: () => boolean) => {
      for (let turn = 0; !predicate() && turn < 16; turn += 1) await Promise.resolve();
      assert.equal(predicate(), true, "SDK condition did not wake within the bounded callback drain");
    },
    CancellationScope: class {
      run<T>(body: () => Promise<T>): Promise<T> { return body(); }
      cancel(): void {}
    },
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
      if (timerFailure !== undefined) return;
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
      if (timerFailure !== undefined && stimulus.kind === core.StimulusKind.FireTimer) {
        timerEvaluations += 1;
        assert.equal(timerEvaluations, 1, "failed native firing must never be reevaluated");
        assert.deepEqual(stimulus, firing);
        assert.deepEqual(snapshot(), before);
        switch (timerFailure) {
          case TimerFailureMode.Fuel:
            firingStep = core.advanceScenario(program, state, stimulus, 0);
            break;
          case TimerFailureMode.LiveRejection:
            firingStep = core.advanceScenario(program, state, {
              ...stimulus, logicalTimeMs: stimulus.logicalTimeMs + 1,
            });
            break;
          case TimerFailureMode.Projection:
            // ESL-HANDOFF-01 tests cause propagation here, not a reachable Timer projection defect.
            // The actual rejected wrong-Start/NotStarted result supplies the injected diagnostic.
            firingStep = core.advanceScenario(program, core.initialState, {
              ...subscriptionStart, processId: "Wrong_Process",
            });
            break;
          case TimerFailureMode.Capacity:
            firingStep = core.advanceScenario(program, state, stimulus);
            break;
        }
        return firingStep;
      }
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
const candidateMockOptions = {
  cache: false,
  exports: {
    ...candidatePreflight,
    preflightWorkflowSemanticCandidate: (candidate: WorkflowSemanticCandidate) => {
      if (timerFailure !== TimerFailureMode.Capacity || timerEvaluations === 0) {
        return candidatePreflight.preflightWorkflowSemanticCandidate(candidate);
      }
      const result = candidatePreflight.preflightWorkflowSemanticCandidate(candidate, {
        committedRuntimeStateBytes: 1,
        publicationBatchBytes: workflowChainProductionLimit(WorkflowChainBudgetKind.PublicationBatchBytes),
      });
      assert.equal(result.kind, candidatePreflight.WorkflowSemanticCandidatePreflightKind.CapacityExceeded);
      if (result.kind !== candidatePreflight.WorkflowSemanticCandidatePreflightKind.CapacityExceeded) {
        throw new Error("Candidate capacity discriminator did not refuse");
      }
      capacityBound = result.failure;
      return result;
    },
  },
};
mock.module(new URL("../dist/workflow-semantic-candidate.js", import.meta.url), candidateMockOptions);

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
      assert.deepEqual(error.details, [{
        stage: "commandClosure",
        outcome: core.CommandOutcome.RolledBack,
        internalStepBoundExceeded: failureMode === "fuel",
        ambiguousInternalChoice: failureMode === "ambiguity",
        commandId: completionB.commandId,
        publicationRevision: before.publication.execution.headRevision,
      }]);
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
  timerFailure = undefined;
  queries.clear();
  admissions.length = 0;
}

const compiledSubscription = await compileBpmnToSemanticProcess({
  bytes: await readFile(new URL(
    "../../../bpmn-source/test/fixtures/repeatable-event-subscriptions/boundary-timer.bpmn", import.meta.url,
  )),
  sourceId: "subscription-firing-failure", expectedSha256: undefined, sourceOverlay: null,
  semanticProfile: core.REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
});
assert.equal(compiledSubscription.status, BpmnCompilationStatus.Accepted);
if (compiledSubscription.status !== BpmnCompilationStatus.Accepted) throw new Error("Subscription source refused");
const subscriptionProgram = compiledSubscription.semanticProcess;
const subscriptionStart: core.StartProcessStimulus = {
  kind: core.StimulusKind.StartProcess, commandId: "start-subscription-failure",
  processId: subscriptionProgram.processId, instanceId: "SubscriptionFailure", initialVariables: [],
};

for (const failure of Object.values(TimerFailureMode)) {
  test(`native subscription ${failure} preserves the committed boundary without rearming`, async () => {
    reset("success");
    timerFailure = failure;
    timerEvaluations = 0;
    timerInstallations = 0;
    capacityBound = undefined;
    mock.method(Date, "now", () => 0);
    try {
      await assert.rejects(runBpmnProcessWithHostEffects(
        subscriptionStart, subscriptionProgram,
        async (durationMs) => {
          timerInstallations += 1;
          assert.equal(timerInstallations, 1, "failed native firing must never install a retry Timer");
          assert.equal(durationMs, 1_000);
          before = snapshot();
          const timer = before.state.timerWaits[0];
          assert.ok(timer);
          firing = timerFiringStimulus({ id: timer.id, deadlineMs: timer.deadlineMs });
        },
        async () => assert.fail("subscription profile has no effect"),
        ActivationDrain.Required, productionBpmnWorkflowInitialHostInput(),
      ), (error: unknown) => {
        assert.ok(error instanceof sdk.ApplicationFailure);
        assert.equal(error.nonRetryable, true);
        const firingDetails = {
          commandId: firing.commandId, timerId: firing.timerId,
          logicalDeadlineMs: firing.logicalTimeMs,
          publicationRevision: before.publication.execution.headRevision,
        };
        switch (failure) {
          case TimerFailureMode.Fuel:
          case TimerFailureMode.Projection:
            assert.equal(error.type, "BpmnSemanticClosureFailure");
            assert.equal(firingStep.kind, core.ScenarioStepKind.HarnessFailure);
            if (firingStep.kind !== core.ScenarioStepKind.HarnessFailure) return false;
            assert.deepEqual(firingStep.diagnostic, {
              stage: failure === TimerFailureMode.Fuel ? "commandClosure" : "observationProjection",
              outcome: failure === TimerFailureMode.Fuel ? core.CommandOutcome.RolledBack : core.CommandOutcome.Rejected,
              internalStepBoundExceeded: failure === TimerFailureMode.Fuel,
              ambiguousInternalChoice: false,
            });
            assert.deepEqual(error.details, [{ ...firingStep.diagnostic, ...firingDetails }]);
            break;
          case TimerFailureMode.LiveRejection:
            assert.equal(error.type, "BpmnHostCapabilityInvariantViolation");
            assert.equal(firingStep.kind, core.ScenarioStepKind.Terminal);
            assert.equal(firingStep.state, before.state);
            assert.deepEqual(error.details, [{ outcome: core.CommandOutcome.Rejected, ...firingDetails }]);
            break;
          case TimerFailureMode.Capacity:
            assert.equal(error.type, "BPMN_WORKFLOW_CHAIN_CAPACITY_EXHAUSTED");
            assert.equal(firingStep.kind, core.ScenarioStepKind.Committed);
            assert.ok(capacityBound);
            assert.equal(capacityBound.budget, WorkflowChainBudgetKind.CommittedRuntimeStateBytes);
            assert.equal(capacityBound.configuredBound, 1);
            assert.ok(capacityBound.observedValue > capacityBound.configuredBound);
            assert.deepEqual(error.details, [{
              ...capacityBound, processInstanceId: subscriptionStart.instanceId, runOrdinal: 1,
              publicRevision: before.publication.execution.headRevision,
            }]);
            break;
        }
        return true;
      });
      assert.deepEqual(snapshot(), before);
      assert.equal(ingress.currentState(), before.state);
      assert.equal(timerEvaluations, 1);
      assert.equal(timerInstallations, 1);
      assert.deepEqual(admissions, []);
      assert.deepEqual(ingress.workflowChain?.recovery.snapshot(), []);
    } finally {
      mock.restoreAll();
    }
  });
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
