/**
 * The CIB-run scenarios the pinned engine cannot answer, by scenario path, each with the mechanism that stops it. The
 * evidence replay (`replace-cibseven-evidence.ts`) still runs every one of them and fails on drift in either direction:
 * a declared scenario that is answered or fails another way, or a scenario that is not declared here and fails.
 *
 * - `register`: a CIB behavior or limitation the observation cannot represent, owned by the named entry of the
 *   [relation register](../docs/CIB-BPMN-RELATION-REGISTER.md).
 * - `protocol`: a value or form the runner's wire protocol refuses by design, at the named rule.
 * - `resource`: a resource bound of the replay (the batch deadline or the JVM heap) the scenario breaches alone;
 *   whichever it reaches first ends it, so either breach matches.
 *
 * `failure` is the leading text of the harness failure the replay reports for the scenario.
 */
export type DeclaredHarnessFailure = Readonly<
  | { kind: "register"; entry: string; failure: string }
  | { kind: "protocol"; rule: string; failure: string }
  | { kind: "resource" }
>;

const activityInstanceTree = {
  kind: "register",
  entry: "CIB-LIM-0048",
  failure: "java.lang.IndexOutOfBoundsException: Index -1 out of bounds for length 0",
} as const;

// CIB starts one instance per true root Conditional start and offers no request that evaluates a named one alone, so
// the start creates two instances where the single-instance observation holds one (`CibSevenStarts.startedAt`).
const twoConditionalStarts = {
  kind: "register",
  entry: "CIB-EXT-0044",
  failure: "java.lang.IllegalStateException: A conditional start created 2 instances, not one",
} as const;

const finiteCycleChain = {
  kind: "register",
  entry: "CIB-DEV-0006",
  failure: "java.lang.IllegalStateException: CIB chained a finite Timer cycle past its declared count of 2 (CIB-DEV-0006)",
} as const;

const emptyCandidateGroup = {
  kind: "register",
  entry: "CIB-EXT-0011",
  failure: "evidence violates its schema:",
} as const;

const timerDueOutsideWire = {
  kind: "protocol",
  rule: "runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioDiagnosticsProtocol.java#TimerJob",
  failure: "java.lang.IllegalArgumentException: dueDateDeltaMs must be a non-negative safe wire integer",
} as const;

// Issue #89 tracks holding these JUEL results in a model whose answer the canonical result can carry.
const doubleResult = {
  kind: "protocol",
  rule: "runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioVariableValueProjection.java#projectHost",
  failure: "java.lang.IllegalArgumentException: Process variable snapshot has an unsupported host carrier",
} as const;

export const declaredCibHarnessFailures: ReadonlyMap<string, DeclaredHarnessFailure> = new Map<string, DeclaredHarnessFailure>([
  ["scenarios/open-rows/compensation-context-live-outer/esp-handler-reads-and-writes-outer.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/compensation-context/late-data-after-completion.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/compensation-context/no-late-data.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/compensation-event-subprocess-nesting/both-rethrow.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/compensation-event-subprocess-nesting/consume-without-rethrow.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/compensation-event-subprocess-nesting/outer-rethrows-everything.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/compensation-event-subprocess-nesting/outer-rethrows-inner-only.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/compensation-event-subprocess-throws/throws-parent-activity.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/compensation-handler-bodies/typed-data-reaches-handlers.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/compensation-handler-consumption/esp-consumes-one-of-two.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/conditional-start-compositions/layout-only-conditions-start.scenario.json", twoConditionalStarts],
  ["scenarios/open-rows/conditional-start-compositions/lexeme-differing-conditions-start.scenario.json", twoConditionalStarts],
  ["scenarios/open-rows/conditional-start-compositions/operator-differing-conditions-start.scenario.json", twoConditionalStarts],
  ["scenarios/open-rows/conditional-start-compositions/routed-both.scenario.json", twoConditionalStarts],
  ["scenarios/open-rows/human-task-metadata-composition/group-list-edge-commas.scenario.json", emptyCandidateGroup],
  ["scenarios/open-rows/human-task-metadata-composition/group-list-empty-entry.scenario.json", emptyCandidateGroup],
  ["scenarios/open-rows/journey-booking-recovery/cancel-after-the-car-recovery.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/journey-booking-recovery/cancel-compensates-completed-reservations.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/journey-booking-recovery/handlers-answered-in-another-order.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/journey-booking-recovery/late-changes-reach-the-handlers.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/juel-core-table/decimal-plus-huge-exponent.scenario.json", {
    kind: "protocol",
    rule: "runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioVariableValueProjection.java#projectDecimal",
    failure: "java.lang.IllegalArgumentException: decimal coefficient is outside the signed 64-bit range",
  }],
  ["scenarios/open-rows/juel-core-table/double-plus-empty.scenario.json", doubleResult],
  ["scenarios/open-rows/juel-core-table/negate-fraction-text.scenario.json", doubleResult],
  // The delivery addresses Instance_1 and its criterion names Instance_2; CIB's correlation takes one instance id.
  ["scenarios/open-rows/message-correlation-criteria/process-instance.scenario.json", {
    kind: "protocol",
    rule: "runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenCommandExecutor.java#correlate",
    failure: "java.lang.IllegalStateException: A process instance criterion naming another instance has no CIB form",
  }],
  // CIB deploys the dangling `operationRef` it never reads; the runner's channel projection resolves it through CIB's
  // model API, which cannot (`CibSevenOpenWaitProjector.channel`).
  ["scenarios/open-rows/message-name-addressing/unresolved-operation.scenario.json", {
    kind: "register",
    entry: "CIB-LIM-0023",
    failure: "org.cibseven.bpm.model.xml.ModelException: Unable to find a model element instance for id Operation_Missing",
  }],
  // CIB attempts 1,874,919,424 parallel instances (the scenario's README).
  ["scenarios/open-rows/multi-instance-expression-results/count-product-over-safe.scenario.json", { kind: "resource" }],
  ["scenarios/open-rows/scalar-types-in-multi-instance/decimal-coefficient-over-long-service-result.scenario.json", {
    kind: "protocol",
    rule: "runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioVariableValueProjection.java#requireDecimal",
    failure: "com.fasterxml.jackson.databind.exc.ValueInstantiationException: Cannot construct instance of " +
      "`org.bpmnlean.cibseven.ScenarioProtocol$DecimalValue`, problem: decimal coefficient is outside the signed 64-bit range",
  }],
  ["scenarios/open-rows/timer-data-derived/catch-weeks-above-int.scenario.json", timerDueOutsideWire],
  ["scenarios/open-rows/timer-data-derived/catch-weeks-past-bound.scenario.json", timerDueOutsideWire],
  ["scenarios/open-rows/timer-data-derived/cycle-arming-past-bound.scenario.json", timerDueOutsideWire],
  ["scenarios/open-rows/timer-data-derived/cycle-period-above-int.scenario.json", timerDueOutsideWire],
  ["scenarios/open-rows/timer-data-derived/cycle-successor-past-bound.scenario.json", timerDueOutsideWire],
  ["scenarios/open-rows/timer-date-forms/before-epoch.scenario.json", timerDueOutsideWire],
  ["scenarios/open-rows/timer-recurrence/dated-start-and-end.scenario.json", finiteCycleChain],
  ["scenarios/open-rows/timer-recurrence/dated-start-and-period.scenario.json", finiteCycleChain],
  ["scenarios/open-rows/transaction-cancel-mixed/normal-completion.scenario.json", {
    kind: "register",
    entry: "CIB-LIM-0058",
    failure: "java.lang.IllegalStateException: Subscription Boundary_Deadline has no unique host instance",
  }],
  ["scenarios/open-rows/transaction-cancel-mixed/subjects-effect-first.scenario.json", activityInstanceTree],
  ["scenarios/open-rows/transaction-cancel-mixed/subjects-user-first.scenario.json", activityInstanceTree],
]);
