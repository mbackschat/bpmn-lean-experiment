import {
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProfileId,
  StimulusKind,
} from "../src/index.js";
import type {
  CheckedNode,
  InitiateTimerOperation,
  TriggerTimerStartStimulus,
} from "../src/index.js";

const trigger = {
  kind: StimulusKind.TriggerTimerStart,
  commandId: "trigger-timer-start",
  processId: "Process_1",
  instanceId: "Instance_1",
  startEventId: "StartEvent_Timer",
} as const satisfies TriggerTimerStartStimulus;

const operation = {
  id: "operation:StartEvent_Timer",
  kind: SemanticOperationKind.InitiateTimer,
  origin: {
    kind: SemanticOriginKind.BpmnElement,
    elementId: "StartEvent_Timer",
  },
  timer: { durationMs: 1000 },
  outputs: ["place:Flow_1"],
} as const satisfies InitiateTimerOperation;

const checkedNode = {
  kind: CheckedNodeKind.TimerStartEvent,
  id: "StartEvent_Timer",
  durationLiteral: "PT1S",
} as const satisfies CheckedNode;

type RegisteredSemanticProfileId =
  typeof SemanticProfileId[keyof typeof SemanticProfileId];

const registeredProfile: RegisteredSemanticProfileId =
  SemanticProfileId.TimerStart;
// @ts-expect-error Timer-start command identity is immutable
trigger.startEventId = "OtherStart";
// @ts-expect-error normalized timer configuration is deeply immutable
operation.timer.durationMs = 1000;
// @ts-expect-error initiation output arrays are deeply immutable
operation.outputs.push("place:Flow_2");
// @ts-expect-error checked-source duration identity is immutable
checkedNode.durationLiteral = "PT1S";

void registeredProfile;
void trigger;
void operation;
void checkedNode;
