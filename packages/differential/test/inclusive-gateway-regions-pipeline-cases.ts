import { CanonicalObservationKind, ProcessStatus } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type InclusiveRegionsName =
  | "account-all-checks-funds-last"
  | "account-all-checks-identity-last"
  | "account-residency-only"
  | "account-standard-only"
  | "account-risk-and-online"
  | "booking-extras-venue-first"
  | "booking-extras-venue-last"
  | "booking-no-extras";

type OpenTask = MutableStateObservation["openUserTasks"][number];

/**
 * Rewrites the running state at `index`, whose open work must be exactly `open`, into the state a wrong algorithm the
 * proposal's separating witnesses exclude would show there.
 */
function rewriteAt(
  index: number,
  open: readonly string[],
  rewrite: (state: MutableStateObservation) => MutableStateObservation,
): PipelineCase["injectMutation"] {
  return (result: MutableScenarioResult) => {
    const state = result.trace[index];
    if (state?.kind !== CanonicalObservationKind.State || state.status !== ProcessStatus.Running ||
      openWork(state).join() !== open.join()) {
      throw new Error(`Inclusive region calibration requires ${open.join(", ")} open at trace[${index}]`);
    }
    result.trace[index] = rewrite(state);
  };
}

/** A User Task the wrong algorithm opens beside the open work: a copy of the first open task under `elementId`. */
function opening(elementId: string): (state: MutableStateObservation) => MutableStateObservation {
  return state => {
    const template = state.openUserTasks[0] as OpenTask;
    const extra = { ...template, id: { ...template.id, elementId, activation: 1 } };
    return { ...state, openUserTasks: [...state.openUserTasks, extra] };
  };
}

/** The open User Task `elementId` the wrong algorithm never opens. */
function withholding(elementId: string): (state: MutableStateObservation) => MutableStateObservation {
  return state => ({ ...state, openUserTasks: state.openUserTasks.filter(task => task.id.elementId !== elementId) });
}

/** The open effect `elementId` the wrong algorithm never opens. */
function withholdingEffect(elementId: string): (state: MutableStateObservation) => MutableStateObservation {
  return state => ({ ...state, openEffects: state.openEffects.filter(effect => effect.id.elementId !== elementId) });
}

/** The open-work count at `path` that the seeded mutation moves from `expected` to `actual`. */
function moved(path: string, expected: number, actual: number): PipelineCase["expectedInjectedDisagreement"] {
  return { kind: DisagreementKind.ObservationValue, path, expected, actual };
}

const allChecks =["CollectTaxResidencyForm#1", "VerifyIdentityDocument#1", "VerifySourceOfFunds#1"];

const cases = {
  // IGR-JOIN-01: a join released by its first arriving token opens *Open account* after the identity check alone.
  "account-all-checks-funds-last": {
    model: "account-opening",
    inject: rewriteAt(6, ["CollectTaxResidencyForm#1", "VerifySourceOfFunds#1"], opening("OpenAccount")),
    expected: moved("trace[6].openUserTasks.length", 2, 3),
  },
  // IGR-SELECT-01: the default taken although conditions held opens *Standard verification* beside the three checks.
  "account-all-checks-identity-last": {
    model: "account-opening",
    inject: rewriteAt(4, allChecks, opening("StandardVerification")),
    expected: moved("trace[4].openUserTasks.length", 2, 3),
  },
  // IGR-JOIN-01: a join waiting for all four inputs never opens *Open account* after the one selected branch.
  "account-residency-only": {
    model: "account-opening",
    inject: rewriteAt(6, ["OpenAccount#1"], withholding("OpenAccount")),
    expected: moved("trace[6].openUserTasks.length", 1, 0),
  },
  // IGR-SELECT-01: a selection that skips the default when no condition holds leaves nothing to do.
  "account-standard-only": {
    model: "account-opening",
    inject: rewriteAt(4, ["StandardVerification#1"], withholding("StandardVerification")),
    expected: moved("trace[4].openUserTasks.length", 1, 0),
  },
  // IGR-SELECT-01: an exclusive first-true selection takes due diligence and skips the true identity condition.
  "account-risk-and-online": {
    model: "account-opening",
    inject: rewriteAt(4, ["VerifyIdentityDocument#1", "VerifySourceOfFunds#1"], withholdingEffect("VerifyIdentityDocument")),
    expected: moved("trace[4].openEffects.length", 1, 0),
  },
  // IGR-JOIN-01 inside a Parallel branch: a first-arrival join lets *Event ready* fire once catering and the venue are done.
  "booking-extras-venue-first": {
    model: "event-booking",
    inject: rewriteAt(8, ["BookTechnician#1", "ConfirmAttendeeList#1", "RentProjector#1"], opening("SendConfirmation")),
    expected: moved("trace[8].openUserTasks.length", 3, 4),
  },
  // IGR-ROOT-01: the extras' join completing the Parallel branch must still wait for the venue at *Event ready*.
  "booking-extras-venue-last": {
    model: "event-booking",
    inject: rewriteAt(12, ["BookVenue#1"], opening("SendConfirmation")),
    expected: moved("trace[12].openUserTasks.length", 1, 2),
  },
  // CIB-INT-0005: an unconditioned flow read as false never selects *Confirm attendee list*.
  "booking-no-extras": {
    model: "event-booking",
    inject: rewriteAt(4, ["BookVenue#1", "ConfirmAttendeeList#1"], withholding("ConfirmAttendeeList")),
    expected: moved("trace[4].openUserTasks.length", 2, 1),
  },
} as const satisfies Record<InclusiveRegionsName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the Inclusive region witness models, with no CIB target and no retained answer, so each
 * seeded mutation is the only calibration. Stimulus order realizes each schedule through the testkit's ordered Activity
 * release and ordered completion delivery.
 */
export const inclusiveGatewayRegionsPipelineCases = Object.freeze(
  (Object.keys(cases) as InclusiveRegionsName[]).map((name): PipelineCase => ({
    id: `inclusive-gateway-regions-${name}`,
    scenarioRelativePath: `scenarios/inclusive-gateway-regions/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/inclusive-gateway-regions/${cases[name].model}.bpmn`,
    sourceOverlayRelativePath: `scenarios/inclusive-gateway-regions/${cases[name].model}-overlay.json`,
    workflowIdPrefix: `inclusive-gateway-regions-${name}`,
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.StimulusOrder,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: cases[name].inject,
    expectedInjectedDisagreement: cases[name].expected,
  })),
);
