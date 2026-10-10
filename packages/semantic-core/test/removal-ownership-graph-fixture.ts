/**
 * One runtime state in which every owner-keyed collection holds a record for each of seven owners.
 *
 * The removal routes decide by owner, so a route is only separated from a no-op or an inverted filter
 * by a state that has records inside the removed owner and records outside it in the same collection.
 * No registered program composes regional cancellation with a Call Activity and a Compensation
 * trigger, so no schedule reaches such a state; it is constructed, and the removal functions are
 * pure over it. The state is deliberately not well formed for any program: ownership is the only
 * property under test.
 *
 * Topology. `root` hosts `region`, whose child is `descendant`; `sibling` is a second child of `root`.
 * `descendant` calls `calledIn`, which calls `calledNested`; `sibling` calls `calledOut`. Removing
 * `region` therefore removes `region`, `descendant` and both called instances, and nothing else.
 */
import {
  ActivityBodyKind,
  ActivityHandlerKind,
  CompensationParentContextRetentionKind,
  ControlStateKind,
  EffectOperation,
  EffectProtocol,
  LocalDataOwnerKind,
  MessageChannelKind,
  VariableValueKind,
  initialState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, VariableBinding } from "@bpmn-lean/semantic-core";
import type {
  ActivityOccurrenceId,
} from "../src/activity-occurrence.ts";
import type { ScopeOccurrenceId } from "../src/semantic-process-state.ts";

export const ownerLabels = [
  "root", "region", "descendant", "sibling", "calledIn", "calledNested", "calledOut",
] as const;
export type OwnerLabel = typeof ownerLabels[number];

const scope = (processInstanceId: string, definitionScopeId: string): ScopeOccurrenceId =>
  ({ processInstanceId, definitionScopeId, activation: 1 });

export const owners = {
  root: scope("main", "Process_Root"),
  region: scope("main", "Region"),
  descendant: scope("main", "Descendant"),
  sibling: scope("main", "Sibling"),
  calledIn: scope("called-in", "CalledIn"),
  calledNested: scope("called-nested", "CalledNested"),
  calledOut: scope("called-out", "CalledOut"),
} as const satisfies Record<OwnerLabel, ScopeOccurrenceId>;

/** Which owner each record was built for, recorded by identity so survivors can be classified. */
const labelOfRecord = new Map<object, OwnerLabel>();

export const labelOf = (record: object): OwnerLabel | "?" => labelOfRecord.get(record) ?? "?";

function owned<T extends object>(label: OwnerLabel, record: T): T {
  labelOfRecord.set(record, label);
  return record;
}

const occurrence = (label: OwnerLabel, kind: string) => ({
  processInstanceId: owners[label].processInstanceId,
  elementId: `${kind}_${owners[label].definitionScopeId}`,
  activation: 1,
});

const activityId = (label: OwnerLabel): ActivityOccurrenceId => ({
  processInstanceId: owners[label].processInstanceId,
  activityElementId: `Activity_${owners[label].definitionScopeId}`,
  activation: 1,
});

const binding = (name: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value: name } });
const place = (owner: ScopeOccurrenceId) => `place:${owner.definitionScopeId}`;

function effectWait(label: OwnerLabel) {
  return {
    id: occurrence(label, "Effect"),
    owner: owners[label],
    descriptor: { protocol: EffectProtocol.Activity, operation: EffectOperation.Probe },
    arguments: [],
    outputMappings: [],
    bpmnErrorRoute: null,
    output: place(owners[label]),
    incidentAlreadyRetried: false,
  } as const;
}

/** `scopeOccurrences` is the one collection whose removal is defined by parentage rather than owner. */
function scopeOccurrences(): RuntimeState["scopeOccurrences"] {
  const parentOf: Record<OwnerLabel, OwnerLabel | null> = {
    root: null, region: "root", descendant: "region", sibling: "root",
    calledIn: null, calledNested: null, calledOut: null,
  };
  return ownerLabels.map((label) => {
    const parent = parentOf[label];
    return owned(label, { id: owners[label], parent: parent === null ? null : owners[parent] });
  });
}

/** Every owner-keyed collection of `RuntimeState`, populated once per owner. */
export function ownershipGraphState(): RuntimeState {
  const each = <T extends object>(build: (label: OwnerLabel) => T): ReadonlyArray<T> =>
    ownerLabels.map((label) => owned(label, build(label)));
  return {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: "main" },
    scopeOccurrences: scopeOccurrences(),
    controlTokens: each((label) => ({ placeId: "place:in", owner: owners[label], multiplicity: 1 })),
    userTaskWaits: each((label) => ({
      id: occurrence(label, "UserTask"), owner: owners[label], name: null, output: place(owners[label]),
    })),
    messageWaits: each((label) => ({
      id: occurrence(label, "Message"), owner: owners[label],
      channel: { kind: MessageChannelKind.DirectMessage, messageId: "m" }, output: place(owners[label]),
    })),
    eventSubProcessMessageSubscriptions: each((label) => ({
      id: occurrence(label, "Subscription"), owner: owners[label],
      channel: { kind: MessageChannelKind.DirectMessage, messageId: "m" },
    })),
    timerWaits: each((label) => ({
      id: occurrence(label, "Timer"), owner: owners[label], deadlineMs: 1000, output: place(owners[label]),
    })),
    effectWaits: each(effectWait),
    effectIncidents: each((label) => ({
      id: { effectId: occurrence(label, "Effect"), generation: 1 }, wait: effectWait(label),
    })),
    selectedBranchSets: each((label) => ({
      owner: owners[label], selectionKey: `key_${label}`, expectedInputs: ["a"],
    })),
    eventRaces: each((label) => ({
      id: occurrence(label, "Race"), owner: owners[label],
      messageSubscriptionId: occurrence(label, "Message"), timerOccurrenceId: occurrence(label, "Timer"),
    })),
    // Labelled by the called root: every route removes a call record exactly when its callee goes.
    calledProcessOccurrences: [
      owned("calledIn", { id: occurrence("descendant", "Call"), caller: owners.descendant,
        calledProcessId: "Called", calledRoot: owners.calledIn, returnOperationId: "return" }),
      owned("calledNested", { id: occurrence("calledIn", "Call"), caller: owners.calledIn,
        calledProcessId: "Nested", calledRoot: owners.calledNested, returnOperationId: "return" }),
      owned("calledOut", { id: occurrence("sibling", "Call"), caller: owners.sibling,
        calledProcessId: "Other", calledRoot: owners.calledOut, returnOperationId: "return" }),
    ],
    activityOccurrences: each((label) => ({
      id: activityId(label), owner: owners[label], operationId: "operation",
      body: { kind: ActivityBodyKind.UserTask, task: occurrence(label, "UserTask") },
      attachedHandlers: [
        { kind: ActivityHandlerKind.Timer, occurrence: occurrence(label, "Timer") },
        { kind: ActivityHandlerKind.Message, occurrence: occurrence(label, "Message") },
      ],
    })),
    sequentialMultiInstanceControllers: each((label) => ({
      id: activityId(label), snapshot: [], outputSlots: [],
    })),
    sequentialScopeControllers: each((label) => ({
      id: activityId(label), total: 2, completed: 0, currentItem: "item",
    })),
    parallelScopeControllers: each((label) => ({ id: activityId(label), total: 2, completed: 0 })),
    parallelMultiInstanceControllers: each((label) => ({
      id: activityId(label), snapshot: [], slots: [],
    })),
    compensationActivityRetentions: each((label) => ({
      owner: owners[label], nextCompletionOrdinal: 0, records: [],
    })),
    compensationParentContextRetentions: each((label) => ({
      kind: CompensationParentContextRetentionKind.Provisional,
      parent: { id: owners[label], parent: null }, handlerScopeId: "Handler",
    })),
    compensationTriggers: each((label) => ({
      id: occurrence(label, "Trigger"), owner: owners[label], output: place(owners[label]),
      lifecycle: "active", handlers: [], dependencies: [],
    })),
    compensationHandlerEffectWaits: each((label) => ({
      id: occurrence(label, "CompensationEffect"), triggerId: occurrence(label, "Trigger"),
      handlerId: occurrence(label, "Handler"),
      descriptor: {
        protocol: EffectProtocol.Activity, operation: EffectOperation.CompensationSingleEffect,
      },
      arguments: [],
    })),
    variables: {
      process: { bindings: [binding("process")] },
      // One effect-keyed and one Activity-keyed scope per owner: the two ownership paths differ.
      activities: ownerLabels.flatMap((label) => [
        owned(label, { owner: { kind: LocalDataOwnerKind.EffectOccurrence, id: occurrence(label, "Effect") },
          bindings: [binding("effect")] }),
        owned(label, { owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: activityId(label) },
          bindings: [binding("activity")] }),
      ]),
      processInterfaces: each((label) => ({ owner: owners[label], inputs: [], outputs: [] })),
      scopes: each((label) => ({ owner: owners[label], bindings: [binding("scope")] })),
    },
    taskActivations: [{ elementId: "task", count: 7 }],
    messageActivations: [{ elementId: "message", count: 7 }],
    timerActivations: [{ elementId: "timer", count: 7 }],
    eventRaceActivations: [{ elementId: "race", count: 7 }],
    callActivations: [{ elementId: "call", count: 7 }],
    effectActivations: [{ elementId: "effect", count: 7 }],
    scopeActivations: [{ elementId: "scope", count: 7 }],
    activityActivations: [{ elementId: "activity", count: 7 }],
    endOccurrences: 3,
    logicalTimeMs: 500,
  };
}
