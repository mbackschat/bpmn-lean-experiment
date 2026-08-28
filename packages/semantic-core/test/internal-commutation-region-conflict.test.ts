import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  InternalTransitionFootprint,
  InternalTransitionStateAtom,
} from "../src/internal-transition-footprint.ts";
import type { InternalOccurrenceRegion } from "../src/internal-transition-region.ts";
import type {
  CalledProcessOccurrence,
  ScopeOccurrenceId,
} from "../src/semantic-process-state.ts";

type FootprintModule = typeof import("../src/internal-transition-footprint.ts");

const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;

const {
  InternalOccurrenceKind,
  InternalTransitionStateAtomKind,
  internalTransitionFootprintsAreIndependent,
} = footprintModule;

const root = scope("Instance_Region", "Process_Region", 1);
const left = scope("Instance_Region", "Scope_Left", 1);
const leftChild = scope("Instance_Region", "Scope_LeftChild", 1);
const right = scope("Instance_Region", "Scope_Right", 1);
const calledRoot = scope("Instance_Called", "Process_Called", 1);

const rootRegion: InternalOccurrenceRegion = {
  root,
  members: [calledRoot, root, left, leftChild, right],
};
const leftRegion: InternalOccurrenceRegion = {
  root: left,
  members: [calledRoot, left, leftChild],
};
const rightRegion: InternalOccurrenceRegion = {
  root: right,
  members: [right],
};
const calledRegion: InternalOccurrenceRegion = {
  root: calledRoot,
  members: [calledRoot],
};

const callRecord: CalledProcessOccurrence = {
  id: {
    processInstanceId: left.processInstanceId,
    elementId: "Call_Left",
    activation: 1,
  },
  caller: leftChild,
  calledProcessId: calledRoot.definitionScopeId,
  calledRoot,
  returnOperationId: "operation:Return_Left",
};

test("overlapping occurrence regions conflict while disjoint siblings compose", () => {
  assert.equal(
    independent(regionWrite(rootRegion), regionWrite(leftRegion)),
    false,
  );
  assert.equal(
    independent(regionWrite(leftRegion), regionWrite(rightRegion)),
    true,
  );
});

test("a region conflicts with every member-owned runtime atom", () => {
  assert.equal(
    independent(
      regionWrite(leftRegion),
      atomWrite({
        kind: InternalTransitionStateAtomKind.ControlToken,
        owner: leftChild,
        placeId: "place:Fresh",
      }),
    ),
    false,
  );
  assert.equal(
    independent(
      regionWrite(leftRegion),
      atomWrite({
        kind: InternalTransitionStateAtomKind.Wait,
        occurrence: {
          kind: InternalOccurrenceKind.UserTask,
          id: {
            processInstanceId: right.processInstanceId,
            elementId: "Task_Right",
            activation: 1,
          },
        },
        owner: right,
      }),
    ),
    true,
  );
});

test("ownership metadata cannot distinguish one untagged public wait anchor", () => {
  const occurrence = {
    processInstanceId: root.processInstanceId,
    elementId: "Shared_Wait",
    activation: 1,
  };
  assert.equal(
    independent(
      atomWrite({
        kind: InternalTransitionStateAtomKind.OpenWaitAnchor,
        occurrence,
        owner: left,
      }),
      atomWrite({
        kind: InternalTransitionStateAtomKind.OpenWaitAnchor,
        occurrence,
        owner: right,
      }),
    ),
    false,
  );
});

test("insertion below a removed member conflicts before the child exists", () => {
  const freshChild = scope("Instance_Region", "Scope_Fresh", 1);
  assert.equal(
    independent(
      regionWrite(leftRegion),
      atomWrite({
        kind: InternalTransitionStateAtomKind.ScopeParent,
        occurrence: freshChild,
        parent: leftChild,
      }),
    ),
    false,
  );
  assert.equal(
    independent(
      regionWrite(rightRegion),
      atomWrite({
        kind: InternalTransitionStateAtomKind.ScopeParent,
        occurrence: freshChild,
        parent: leftChild,
      }),
    ),
    true,
  );
});

test("a Call association is jointly owned by its caller and called root", () => {
  const association = atomWrite({
    kind: InternalTransitionStateAtomKind.CallAssociation,
    record: callRecord,
  });
  assert.equal(independent(regionWrite(leftRegion), association), false);
  assert.equal(independent(regionWrite(calledRegion), association), false);
  assert.equal(independent(regionWrite(rightRegion), association), true);
});

function regionWrite(region: InternalOccurrenceRegion): InternalTransitionFootprint {
  return atomWrite({
    kind: InternalTransitionStateAtomKind.OccurrenceRegion,
    region,
  });
}

function atomWrite(atom: InternalTransitionStateAtom): InternalTransitionFootprint {
  return {
    reads: [],
    writes: [atom],
    publications: [],
    publicationSortKey: {
      operationId: "operation:RegionConflictFixture",
      occurrenceKind: InternalOccurrenceKind.UserTask,
      processInstanceId: root.processInstanceId,
      elementId: "RegionConflictFixture",
      activation: 1,
    },
  };
}

function independent(
  left: InternalTransitionFootprint,
  right: InternalTransitionFootprint,
): boolean {
  return internalTransitionFootprintsAreIndependent(left, right);
}

function scope(
  processInstanceId: string,
  definitionScopeId: string,
  activation: number,
): ScopeOccurrenceId {
  return { processInstanceId, definitionScopeId, activation };
}
