/** Isolates SDK callback batching from BPMN semantics so the adapter's job-drain premise is observable. */
import {
  ApplicationFailure,
  condition,
  defineSignal,
  defineUpdate,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

const readinessSignal = defineSignal("eventRaceSdkReadiness");
const completionUpdate = defineUpdate<void>("boundedCompletionSdkReadiness");

type ReadinessKind = "message" | "timer" | "update";

type Readiness = Readonly<{
  activation: number;
  kind: ReadinessKind;
}>;

export async function eventRaceSdkActivationProbe(): Promise<ReadinessKind> {
  const batch = await collectActivationBatch("message", (record) => {
    setHandler(readinessSignal, record);
  });
  if (hasBothKinds(batch)) {
    throw ApplicationFailure.nonRetryable(
      "Signal and Timer callbacks shared one Workflow activation",
      "BpmnEventRaceOrderingUnavailable",
    );
  }
  const first = batch[0];
  if (first === undefined) {
    throw new TypeError("SDK activation probe classified an empty batch");
  }
  return first.kind;
}

export async function eventRaceFixedMessagePriorityCoreBypassMutation(): Promise<ReadinessKind> {
  const batch = await collectActivationBatch("message", (record) => {
    setHandler(readinessSignal, record);
  });
  if (hasBothKinds(batch)) {
    return "message";
  }
  const first = batch[0];
  if (first === undefined) {
    throw new TypeError("SDK activation mutation classified an empty batch");
  }
  return first.kind;
}

/**
 * @param deliveryKind labels what the installed handler observes, so a coalesced batch names the
 *   real delivery mechanism instead of borrowing another one's label.
 * @param registerDelivery receives the recorder and installs the handler under test, so one
 *   collector serves both delivery kinds.
 */
async function collectActivationBatch(
  deliveryKind: Exclude<ReadinessKind, "timer">,
  registerDelivery: (record: () => void) => void,
): Promise<ReadonlyArray<Readiness>> {
  const readiness: Readiness[] = [];
  registerDelivery(() => {
    readiness.push({
      activation: workflowInfo().historyLength,
      kind: deliveryKind,
    });
  });
  void sleep(1_000).then(() => {
    readiness.push({
      activation: workflowInfo().historyLength,
      kind: "timer",
    });
  });

  await condition(() => readiness.length > 0);
  await Promise.resolve();
  const first = readiness[0];
  if (first === undefined) {
    throw new TypeError("SDK activation probe woke without readiness");
  }
  const batch = readiness.filter(
    ({ activation }) => activation === first.activation,
  );
  return batch;
}

function hasBothKinds(batch: ReadonlyArray<Readiness>): boolean {
  return batch.some(({ kind }) => kind !== "timer") &&
    batch.some(({ kind }) => kind === "timer");
}

/**
 * Observes whether a completion Update and a due Timer share one activation.
 *
 * This is the bounded-Activity deadline premise. Unlike a Signal, an Update leaves the SDK's
 * `hasSignals` predicate false, so its activation takes the single-batch path irrespective of
 * `ProcessWorkflowActivationJobsAsSingleBatch`. Coalescing is therefore the expected outcome even
 * with that flag unavailable, which is what the failure marker records.
 */
export async function boundedCompletionUpdateSdkActivationProbe(): Promise<ReadinessKind> {
  const batch = await collectActivationBatch("update", (record) => {
    setHandler(completionUpdate, () => {
      record();
    });
  });
  if (hasBothKinds(batch)) {
    throw ApplicationFailure.nonRetryable(
      "Completion Update and Timer callbacks shared one Workflow activation",
      "BpmnBoundedCompletionUpdateCoalescedWithTimer",
    );
  }
  const first = batch[0];
  if (first === undefined) {
    throw new TypeError("Bounded completion probe classified an empty batch");
  }
  return first.kind;
}
