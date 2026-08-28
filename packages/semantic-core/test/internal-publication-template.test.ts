import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticTransitionKind,
} from "@bpmn-lean/semantic-core";
import type {
  ScopeOccurrenceId,
} from "@bpmn-lean/semantic-core";

type PublicationTemplateModule =
  typeof import("../src/internal-publication-template.ts");
type AlternativeModule =
  typeof import("../src/internal-transition-alternative.ts");
type InternalAlternative =
  import("../src/internal-transition-alternative.ts").InternalAlternative;
type InternalPublicationTemplate =
  import("../src/internal-publication-template.ts").InternalPublicationTemplate;
type InternalCommittedTransitionTemplate =
  import("../src/internal-publication-template.ts").InternalCommittedTransitionTemplate;

const templateModule = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as PublicationTemplateModule;
const alternativeModule = await import(
  new URL("../dist/internal-transition-alternative.js", import.meta.url).href
) as AlternativeModule;

const {
  InternalPublicationTemplateAnchorKind,
  instantiateInternalPublicationBatch,
} = templateModule;
const {
  internalMergeInputAlternative,
  internalOperationAlternative,
} = alternativeModule;

const ownerA = owner("Instance_A", "scope:Process_A", 2);
const ownerB = owner("Instance_B", "scope:Process_B", 10);

test("sorts complete templates before assigning transition and local indices", () => {
  const operationZ = operationTemplate("operation:Z", ownerB, [
    instantaneous("Process_Z", "Node_B", ownerB),
    instantaneous("Process_Z", "Node_A", ownerA),
    instantaneous("Process_Z", "Node_A", ownerA),
  ]);
  const operationA = operationTemplate("operation:A", ownerA, [
    instantaneous("Process_A", "Node_Only", ownerA),
  ]);
  const merge = operationTemplate(
    "operation:A",
    ownerB,
    [instantaneous("Process_A", "Merge", ownerB)],
    internalMergeInputAlternative(
      "operation:A",
      ownerB,
      "place:Merge_Input",
    ),
  );
  const instantiated = instantiateInternalPublicationBatch(
    "command-1",
    7,
    [merge, operationZ, operationA],
  );
  assert.notEqual(instantiated, null);
  assert.deepEqual(
    instantiated?.map(({ alternative }) => alternative),
    [operationA.alternative, operationZ.alternative, merge.alternative],
  );
  assert.deepEqual(
    instantiated?.map(({ transitionIndex }) => transitionIndex),
    [7, 8, 9],
  );

  const zLifecycle = instantiated?.[1]?.lifecycle;
  assert.notEqual(zLifecycle, undefined);
  assert.deepEqual(
    zLifecycle?.started.map(({ elementId, anchor }) => ({ elementId, anchor })),
    [
      {
        elementId: "Node_A",
        anchor: transitionAnchor("command-1", 8, 0),
      },
      {
        elementId: "Node_A",
        anchor: transitionAnchor("command-1", 8, 1),
      },
      {
        elementId: "Node_B",
        anchor: transitionAnchor("command-1", 8, 2),
      },
    ],
  );
  assert.deepEqual(
    zLifecycle?.ended.map(({ anchor, terminal }) => ({ anchor, terminal })),
    [0, 1, 2].map((localIndex) => ({
      anchor: transitionAnchor("command-1", 8, localIndex),
      terminal: FlowNodeOccurrenceTerminalKind.Completed,
    })),
  );
});

test("keeps wait, scope, and Call Activity anchors ahead of late transition anchors", () => {
  const waitId = {
    processInstanceId: ownerA.processInstanceId,
    elementId: "Task_Wait",
    activation: 1,
  };
  const callId = {
    processInstanceId: ownerA.processInstanceId,
    elementId: "Call_Child",
    activation: 1,
  };
  const instant = instantaneous("Process_A", "Gateway", ownerA);
  const template: InternalPublicationTemplate = {
    ...operationTemplate("operation:anchors", ownerA, [instant]),
    lifecycle: {
      started: [
        instant.started,
        {
          anchor: {
            kind: InternalPublicationTemplateAnchorKind.CallActivity,
            id: callId,
          },
          processId: "Process_A",
          elementId: "Call_Child",
          owner: ownerA,
        },
        {
          anchor: {
            kind: InternalPublicationTemplateAnchorKind.Wait,
            id: waitId,
          },
          processId: "Process_A",
          elementId: "Task_Wait",
          owner: ownerA,
        },
      ],
      ended: [
        instant.ended,
        {
          anchor: {
            kind: InternalPublicationTemplateAnchorKind.Scope,
            id: ownerB,
          },
          terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
        },
        {
          anchor: {
            kind: InternalPublicationTemplateAnchorKind.Wait,
            id: waitId,
          },
          terminal: FlowNodeOccurrenceTerminalKind.Completed,
        },
      ],
    },
  };
  const result = instantiateInternalPublicationBatch("command-anchors", 0, [template]);
  assert.deepEqual(
    result?.[0]?.lifecycle.started.map(({ anchor }) => anchor.kind),
    [
      SemanticFlowNodeOccurrenceAnchorKind.Wait,
      SemanticFlowNodeOccurrenceAnchorKind.CallActivity,
      SemanticFlowNodeOccurrenceAnchorKind.Transition,
    ],
  );
  assert.deepEqual(
    result?.[0]?.lifecycle.ended.map(({ anchor }) => anchor.kind),
    [
      SemanticFlowNodeOccurrenceAnchorKind.Wait,
      SemanticFlowNodeOccurrenceAnchorKind.Scope,
      SemanticFlowNodeOccurrenceAnchorKind.Transition,
    ],
  );
});

test("the prepared template contains no command or numeric transition anchor", () => {
  const template = operationTemplate("operation:private", ownerA, [
    instantaneous("Process_A", "Task_A", ownerA),
  ]);
  const bytes = JSON.stringify(template);
  assert.equal(bytes.includes("commandId"), false);
  assert.equal(bytes.includes("transitionIndex"), false);
  assert.equal(bytes.includes("localIndex"), false);
  assert.equal(bytes.includes('"kind":"transition"'), false);
  assert.equal(bytes.includes('"kind":"transitionTemplate"'), true);
});

test("refuses a separated instantaneous pair and a non-completing template anchor", () => {
  const complete = operationTemplate("operation:paired", ownerA, [
    instantaneous("Process_A", "Task_A", ownerA),
  ]);
  assert.equal(
    instantiateInternalPublicationBatch("command-paired", 0, [{
      ...complete,
      lifecycle: { ...complete.lifecycle, ended: [] },
    }]),
    null,
  );
  assert.equal(
    instantiateInternalPublicationBatch("command-paired", 0, [{
      ...complete,
      lifecycle: {
        ...complete.lifecycle,
        ended: complete.lifecycle.ended.map((entry) => ({
          ...entry,
          terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
        })),
      },
    }]),
    null,
  );
});

test("refuses duplicate alternatives, duplicate durable anchors, and index overflow", () => {
  const first = operationTemplate("operation:duplicate", ownerA, []);
  const second = operationTemplate("operation:duplicate", ownerB, []);
  assert.equal(
    instantiateInternalPublicationBatch("command-duplicate", 0, [first, second]),
    null,
  );
  assert.equal(
    instantiateInternalPublicationBatch("command-mismatch", 0, [{
      ...first,
      record: {
        ...first.record,
        transition: {
          ...first.record.transition,
          operationId: "operation:other",
        },
      },
    }]),
    null,
  );
  assert.equal(
    instantiateInternalPublicationBatch("command-time", 0, [{
      ...first,
      record: { ...first.record, logicalTimeMs: -1 },
    }]),
    null,
  );

  const waitId = {
    processInstanceId: ownerA.processInstanceId,
    elementId: "Wait_Duplicate",
    activation: 1,
  };
  const waitStart = {
    anchor: {
      kind: InternalPublicationTemplateAnchorKind.Wait,
      id: waitId,
    },
    processId: "Process_A",
    elementId: "Wait_Duplicate",
    owner: ownerA,
  } as const;
  assert.equal(
    instantiateInternalPublicationBatch("command-duplicate", 0, [{
      ...first,
      lifecycle: { started: [waitStart, waitStart], ended: [] },
    }]),
    null,
  );
  assert.equal(
    instantiateInternalPublicationBatch(
      "command-overflow",
      Number.MAX_SAFE_INTEGER,
      [first, operationTemplate("operation:next", ownerA, [])],
    ),
    null,
  );
  assert.equal(
    instantiateInternalPublicationBatch(
      "command-last-safe-index",
      Number.MAX_SAFE_INTEGER,
      [first],
    )?.[0]?.transitionIndex,
    Number.MAX_SAFE_INTEGER,
  );
});

function operationTemplate(
  operationId: string,
  transitionOwner: ScopeOccurrenceId,
  occurrences: ReadonlyArray<ReturnType<typeof instantaneous>>,
  alternative: InternalAlternative = internalOperationAlternative(operationId),
): InternalPublicationTemplate {
  return {
    alternative,
    record: transitionRecord(operationId, transitionOwner),
    lifecycle: {
      started: occurrences.map(({ started }) => started),
      ended: occurrences.map(({ ended }) => ended),
    },
  } as const;
}

function transitionRecord(
  operationId: string,
  transitionOwner: ScopeOccurrenceId,
): InternalCommittedTransitionTemplate {
  return {
    logicalTimeMs: 0,
    transition: {
      kind: SemanticTransitionKind.InternalOperation,
      operationId,
      operationKind: SemanticOperationKind.Duplicate,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: operationId.replace(/^operation:/u, ""),
      },
      owner: transitionOwner,
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [],
      enteredScopes: [],
      exitedScopes: [],
    },
  };
}

function instantaneous(
  processId: string,
  elementId: string,
  occurrenceOwner: ScopeOccurrenceId,
) {
  const anchor = {
    kind: InternalPublicationTemplateAnchorKind.TransitionTemplate,
    processId,
    elementId,
    owner: occurrenceOwner,
  } as const;
  return {
    started: { anchor, processId, elementId, owner: occurrenceOwner },
    ended: {
      anchor,
      terminal: FlowNodeOccurrenceTerminalKind.Completed,
    },
  } as const;
}

function owner(
  processInstanceId: string,
  definitionScopeId: string,
  activation: number,
): ScopeOccurrenceId {
  return { processInstanceId, definitionScopeId, activation };
}

function transitionAnchor(
  commandId: string,
  transitionIndex: number,
  localIndex: number,
) {
  return {
    kind: SemanticFlowNodeOccurrenceAnchorKind.Transition,
    commandId,
    transitionIndex,
    localIndex,
  } as const;
}
