/**
 * Host views in the form `Kernel.Run.hostViewJson` renders, trimmed from `kernelRun --host-view` on the retained
 * scenarios named per constant (2026-11-08). The incident and Script views are written from `Kernel.Host.View` and
 * `Kernel.State.OpenKind.view`, since no admitted scenario reaches an incident or a Script Task yet.
 */
import type { HostView, OccurrenceId, TransitionView } from "../../src/port.ts";

export const instance = "Instance_1";

export function occurrence(elementId: string, activation = 1): OccurrenceId {
  return { processInstanceId: instance, elementId, activation };
}

function key(elementId: string, activation = 1) {
  return { ...occurrence(elementId, activation), role: "element" };
}

const startJournal: readonly TransitionView[] = [
  {
    cause: { kind: "input", input: "start" },
    element: "StartEvent_1",
    owner: 0,
    started: [{ occurrence: key("StartEvent_1"), owner: 0, sourceType: "startEvent" }],
    ended: [{ occurrence: key("StartEvent_1"), terminal: "completed" }],
  },
  { cause: { kind: "signal", signal: "armScope" }, element: null, owner: 0, started: [], ended: [] },
  {
    cause: { kind: "arrive", flow: "Flow_StartToTask" },
    element: "Task_Probe",
    owner: 0,
    started: [{ occurrence: key("Task_Probe"), owner: 0, sourceType: "task" }],
    ended: [],
  },
];

/** `configured-task`: the start opens one effect wait. */
export const effectOpen: HostView = {
  status: "running",
  openWaits: [{
    id: occurrence("Task_Probe"),
    input: "effectResult",
    effect: {
      protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
      operation: "urn:bpmn-lean:effect-operation:probe-v1",
      arguments: [{ name: "amount", value: { kind: "integer", value: 42 } }],
      failures: 0,
    },
  }],
  journal: startJournal,
};

/** The effect's technical failure turned it into an incident: no effect wait, a command-closed incident wait. */
export const incidentOpen: HostView = {
  status: "running",
  openWaits: [{ id: occurrence("Task_Probe"), input: "command", incident: { generation: 1, cancellable: false } }],
  journal: [{ cause: { kind: "input", input: "effectResult" }, element: null, owner: 0, started: [], ended: [] }],
};

/** `retryIncident` reopened the effect with the same activation and one recorded failure. */
export const effectRetried: HostView = {
  status: "running",
  openWaits: [{
    id: occurrence("Task_Probe"),
    input: "effectResult",
    effect: { ...effectOpen.openWaits[0]!.effect!, failures: 1 },
  }],
  journal: [{ cause: { kind: "input", input: "command" }, element: null, owner: 0, started: [], ended: [] }],
};

/** `activity-boundary-timer`: a User Task with an interrupting boundary timer due at 1000 ms. */
export const boundedTask: HostView = {
  status: "running",
  openWaits: [
    { id: occurrence("BoundedTask"), input: "command", userTask: { inputs: [], name: "Bounded work" } },
    { id: occurrence("Deadline"), input: "timerFire", deadlineMs: 1000 },
  ],
  journal: startJournal,
};

/** The task completed first: the boundary subscription is withdrawn with it. */
export const boundedTaskCompleted: HostView = {
  status: "running",
  openWaits: [{ id: occurrence("AfterTask"), input: "command", userTask: { inputs: [], name: "After" } }],
  journal: [
    {
      cause: { kind: "input", input: "command" },
      element: null,
      owner: 0,
      started: [],
      ended: [{ occurrence: key("BoundedTask"), terminal: "completed" }],
    },
    {
      cause: { kind: "arrive", flow: "Flow_TaskToAfter" },
      element: "AfterTask",
      owner: 0,
      started: [{ occurrence: key("AfterTask"), owner: 0, sourceType: "userTask" }],
      ended: [],
    },
  ],
};

/** An effect running under a boundary timer, and the view after the deadline cancelled the effect's Activity. */
export const effectUnderDeadline: HostView = {
  status: "running",
  openWaits: [effectOpen.openWaits[0]!, { id: occurrence("Deadline"), input: "timerFire", deadlineMs: 5000 }],
  journal: startJournal,
};

export const deadlineWon: HostView = {
  status: "running",
  openWaits: [{ id: occurrence("Escalate"), input: "command", userTask: { inputs: [], name: "Escalate" } }],
  journal: [
    { cause: { kind: "input", input: "timerFire" }, element: null, owner: 0, started: [], ended: [] },
    {
      cause: { kind: "signal", signal: "cancel" },
      element: null,
      owner: 0,
      started: [],
      ended: [{ occurrence: key("Task_Probe"), terminal: "cancelled" }],
    },
    {
      cause: { kind: "signal", signal: "complete" },
      element: null,
      owner: 0,
      started: [{ occurrence: key("Deadline"), owner: 0, sourceType: "boundaryEvent" }],
      ended: [{ occurrence: key("Deadline"), terminal: "completed" }],
    },
    {
      cause: { kind: "arrive", flow: "Flow_Boundary" },
      element: "Escalate",
      owner: 0,
      started: [{ occurrence: key("Escalate"), owner: 0, sourceType: "userTask" }],
      ended: [],
    },
  ],
};

/** `intermediate-catch-message`: a Message wait closed by a delivery. */
export const messageOpen: HostView = {
  status: "running",
  openWaits: [{
    id: occurrence("MessageCatch_ApprovalRequest"),
    input: "deliver",
    channel: { kind: "operationMessage", messageId: "Message_ApprovalRequest" },
  }],
  journal: startJournal,
};

/** A Script Task's effect wait; the arguments are the variables the Script reads. */
export const scriptOpen: HostView = {
  status: "running",
  openWaits: [{
    id: occurrence("Script_Total"),
    input: "effectResult",
    effect: {
      protocol: "script",
      operation: "javascript",
      arguments: [{ name: "price", value: { kind: "integer", value: 3 } }],
      failures: 0,
    },
  }],
  journal: startJournal,
};

/** The instance completed: the closure's last micro-step is the idle root. */
export const completed: HostView = {
  status: "completed",
  openWaits: [],
  journal: [
    {
      cause: { kind: "arrive", flow: "Flow_ToEnd" },
      element: "EndEvent_1",
      owner: 0,
      started: [{ occurrence: key("EndEvent_1"), owner: 0, sourceType: "endEvent" }],
      ended: [{ occurrence: key("EndEvent_1"), terminal: "completed" }],
    },
    { cause: { kind: "idle", scope: 0 }, element: null, owner: 0, started: [], ended: [] },
  ],
};
