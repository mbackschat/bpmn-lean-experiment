/** Isolates SDK callback batching from BPMN semantics so the adapter's job-drain premise is observable. */
import {
  ApplicationFailure,
  condition,
  defineSignal,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

const readinessSignal = defineSignal("eventRaceSdkReadiness");

type ReadinessKind = "message" | "timer";

type Readiness = Readonly<{
  activation: number;
  kind: ReadinessKind;
}>;

export async function eventRaceSdkActivationProbe(): Promise<ReadinessKind> {
  const batch = await collectActivationBatch();
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
  const batch = await collectActivationBatch();
  if (hasBothKinds(batch)) {
    return "message";
  }
  const first = batch[0];
  if (first === undefined) {
    throw new TypeError("SDK activation mutation classified an empty batch");
  }
  return first.kind;
}

async function collectActivationBatch(): Promise<ReadonlyArray<Readiness>> {
  const readiness: Readiness[] = [];
  setHandler(readinessSignal, () => {
    readiness.push({
      activation: workflowInfo().historyLength,
      kind: "message",
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
  return batch.some(({ kind }) => kind === "message") &&
    batch.some(({ kind }) => kind === "timer");
}
