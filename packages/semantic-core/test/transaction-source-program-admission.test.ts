import assert from "node:assert/strict";
import test from "node:test";
import {
  EffectOperation,
  EffectProtocol,
  InternalSchedulingMode,
  SemanticOperationKind as Kind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  type SemanticOperation,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  transactionCancellationProgramGraph,
  transactionCancellationProgramShape,
} from "@bpmn-lean/semantic-core";

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

function model(cancelLength: 1 | 2 = 1, ordinaryLength: 1 | 2 = 2,
  prefix = "Booking", reverse = false, eligibleIndex = 0): SemanticProcessProgram {
  const element = (role: string) => `${prefix}_${role}`;
  const scope = (role: string) => `scope:${element(role)}`;
  const place = (role: string) => `place:${element(role)}`;
  const base = (role: string) => ({ id: `operation:${element(role)}`,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: element(role) } } as const);
  const root = scope("Process");
  const child = scope("Transaction");
  const operations: SemanticOperation[] = [];
  const operationScopes: { operationId: string; scopeId: string }[] = [];
  const places = new Map<string, string>();
  const add = (operation: SemanticOperation, owner: string) => {
    operations.push(operation);
    operationScopes.push({ operationId: operation.id, scopeId: owner });
  };
  const flow = (role: string, owner: string) => {
    const id = place(role);
    places.set(id, owner);
    return id;
  };
  const entryInput = flow("RootStart_Transaction", root);
  const childEntry = flow("ChildStart_Split", child);
  const normal = flow("Transaction_NormalEnd", root);
  const cancelled = flow("Boundary_Acknowledge", root);
  const acknowledged = flow("Acknowledge_CancelledEnd", root);
  add({ ...base("RootStart"), kind: Kind.Initiate, output: entryInput }, root);
  add({ ...base("Transaction"), kind: Kind.EnterScope, input: entryInput, childEntry,
    childScopeId: child }, root);
  add({ ...base("Acknowledge"), kind: Kind.AwaitUserTask, input: cancelled,
    output: acknowledged, task: { elementId: element("Acknowledge"), name: null } }, root);
  add({ ...base("NormalEnd"), kind: Kind.ReachNoneEnd, input: normal }, root);
  add({ ...base("CancelledEnd"), kind: Kind.ReachNoneEnd, input: acknowledged }, root);
  const outputs = [flow("Split_CancelTask0", child), flow("Split_OrdinaryTask0", child)];
  add({ ...base("Split"), kind: Kind.Duplicate, input: childEntry,
    outputs: reverse ? [...outputs].reverse() : outputs }, child);
  for (const [branch, length, initial] of [
    ["Cancel", cancelLength, outputs[0]!], ["Ordinary", ordinaryLength, outputs[1]!],
  ] as const) {
    let input = initial;
    for (let index = 0; index < length; index += 1) {
      const role = `${branch}Task${index}`;
      const output = flow(`${role}_Next`, child);
      add({ ...base(role), kind: Kind.AwaitUserTask, input, output,
        task: { elementId: element(role), name: role } }, child);
      input = output;
    }
    add(branch === "Cancel"
      ? { ...base("CancelEnd"), kind: Kind.CancelTransaction, input, output: cancelled,
          definitionScopeId: child, boundaryEventElementId: element("CancelBoundary") }
      : { ...base("OrdinaryEnd"), kind: Kind.ReachNoneEnd, input }, child);
  }
  for (const [owner, role, parentOutput] of [[root, "Process", null], [child, "Transaction", normal]] as const) {
    add({ ...base(role), id: `operation:complete-scope:${owner}`, kind: Kind.CompleteScope,
      scopeId: owner, parentOutput }, owner);
  }
  const eligible = element(`OrdinaryTask${eligibleIndex}`);
  const handler = element("Release");
  return {
    kind: SemanticProcessKind.SemanticProcess,
    identity: { compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: "bpmn-2.0.2-transaction-cancellation-checkpoint-draft",
      sourceId: `${prefix}.bpmn`, sourceSha256: "a".repeat(64), sourceOverlay: null },
    internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
    processId: element("Process"),
    definitionScopes: [
      { id: root, parentScopeId: null, originElementId: element("Process") },
      { id: child, parentScopeId: root, originElementId: element("Transaction") },
    ],
    operations: reverse ? operations.reverse() : operations,
    operationScopes: reverse ? operationScopes.reverse() : operationScopes,
    controlPlaces: [...places].map(([id]) => ({ id,
      origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: id.slice(6) } })),
    controlPlaceScopes: [...places].map(([controlPlaceId, scopeId]) => ({ controlPlaceId, scopeId })),
    compensationActivityRetention: { definitionScopeId: child,
      targets: [{ activityElementId: eligible, boundaryEventElementId: element("CompensateBoundary"),
        compensationActivityElementId: handler }], limits: { maxRecords: 1, maxCanonicalBytes: 4096 } },
    compensationExecution: { definitionScopeId: child, triggerOperationId: base("CancelEnd").id,
      subjects: [{ kind: "boundaryActivity", subjectElementId: eligible,
        body: { kind: "singleEffect", handlerElementId: handler, effectElementId: handler,
          descriptor: { protocol: EffectProtocol.Activity, operation: EffectOperation.CompensationSingleEffect },
          input: { kind: "empty" } } }], dependencies: [],
      limits: { maxTriggers: 1, maxHandlers: 1, maxCanonicalBytes: 20480 } },
  };
}

function changed(mutate: (program: Mutable<SemanticProcessProgram>) => void): SemanticProcessProgram {
  const program = structuredClone(model()) as Mutable<SemanticProcessProgram>;
  mutate(program);
  return program;
}

for (const cancel of [1, 2] as const) for (const ordinary of [1, 2] as const) {
  for (const reverse of [false, true]) for (let eligible = 0; eligible < ordinary; eligible += 1) {
    test(`role grammar accepts renamed ${cancel}/${ordinary} branches, reversed=${reverse}, eligible=${eligible}`, () => {
      const program = model(cancel, ordinary, `Renamed_${cancel}_${ordinary}`, reverse, eligible);
      assert.equal(transactionCancellationProgramShape(program.operations, 2), true);
      assert.equal(transactionCancellationProgramGraph(program), true);
    });
  }
}

const mutations: ReadonlyArray<readonly [string, (program: Mutable<SemanticProcessProgram>) => void]> = [
  ["eligible task moved to Cancel branch with the same operation multiset", (p) => {
    const cancelTask = p.operations.find((o) => o.origin.elementId === "Booking_CancelTask0");
    const eligible = p.operations.find((o) => o.origin.elementId === "Booking_OrdinaryTask0");
    assert.ok(cancelTask?.kind === Kind.AwaitUserTask && eligible?.kind === Kind.AwaitUserTask);
    [cancelTask.input, eligible.input] = [eligible.input, cancelTask.input];
    [cancelTask.output, eligible.output] = [eligible.output, cancelTask.output];
  }],
  ["normal completion enters the Cancel continuation with the same operation multiset", (p) => {
    const completion = p.operations.find((o) => o.kind === Kind.CompleteScope && o.parentOutput !== null);
    assert.ok(completion?.kind === Kind.CompleteScope);
    completion.parentOutput = "place:Booking_Boundary_Acknowledge";
  }],
  ["Cancel output bypasses acknowledgement", (p) => {
    const cancel = p.operations.find((o) => o.kind === Kind.CancelTransaction);
    assert.ok(cancel?.kind === Kind.CancelTransaction);
    cancel.output = "place:Booking_Transaction_NormalEnd";
  }],
  ["shared branch", (p) => {
    const split = p.operations.find((o) => o.kind === Kind.Duplicate);
    assert.ok(split?.kind === Kind.Duplicate);
    split.outputs[1] = split.outputs[0]!;
  }],
  ["cycle", (p) => {
    const task = p.operations.find((o) => o.origin.elementId === "Booking_OrdinaryTask1");
    assert.ok(task?.kind === Kind.AwaitUserTask);
    task.output = "place:Booking_Split_OrdinaryTask0";
  }],
  ["orphan place", (p) => {
    p.controlPlaces.push({ id: "place:Orphan", origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Orphan" } });
    p.controlPlaceScopes.push({ controlPlaceId: "place:Orphan", scopeId: "scope:Booking_Process" });
  }],
  ["orphan operation", (p) => {
    p.operations.push({ id: "operation:Orphan", origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Orphan" },
      kind: Kind.ReachNoneEnd, input: "place:Booking_Acknowledge_CancelledEnd" });
    p.operationScopes.push({ operationId: "operation:Orphan", scopeId: "scope:Booking_Process" });
  }],
  ["host-driven wait", (p) => {
    const index = p.operations.findIndex((o) => o.kind === Kind.AwaitUserTask);
    const task = p.operations[index];
    assert.ok(task?.kind === Kind.AwaitUserTask);
    p.operations[index] = { id: task.id, origin: task.origin, kind: Kind.AwaitTimer,
      input: task.input, output: task.output, timer: { elementId: task.task.elementId, durationMs: 1000 } };
  }],
  ["wrong child completion provenance", (p) => {
    const completion = p.operations.find((o) => o.kind === Kind.CompleteScope && o.parentOutput !== null);
    assert.ok(completion?.kind === Kind.CompleteScope);
    completion.origin.elementId = "Booking_Process";
  }],
  ["duplicate owner", (p) => { p.operationScopes.push({ ...p.operationScopes[0]! }); }],
  ["wrong place owner", (p) => { p.controlPlaceScopes[0]!.scopeId = "scope:Booking_Transaction"; }],
  ["wrong Cancel owner", (p) => {
    p.operationScopes.find((o) => o.operationId === "operation:Booking_CancelEnd")!.scopeId = "scope:Booking_Process";
  }],
  ["wrong Cancel declaration", (p) => { p.compensationExecution!.triggerOperationId = "operation:Booking_RootStart"; }],
  ["wrong retention owner", (p) => { p.compensationActivityRetention!.definitionScopeId = "scope:Booking_Process"; }],
  ["unbound handler", (p) => { p.compensationActivityRetention!.targets[0]!.compensationActivityElementId = "Other"; }],
  ["boundary identity aliases an ordinary node", (p) => {
    const cancel = p.operations.find((o) => o.kind === Kind.CancelTransaction);
    assert.ok(cancel?.kind === Kind.CancelTransaction);
    cancel.boundaryEventElementId = "Booking_Acknowledge";
  }],
  ["boundary identity aliases a Sequence Flow", (p) => {
    p.compensationActivityRetention!.targets[0]!.boundaryEventElementId = "Booking_ChildStart_Split";
  }],
  ["extra scope", (p) => { p.definitionScopes.push({ id: "scope:Other", parentScopeId: "scope:Booking_Transaction", originElementId: "Other" }); }],
  ["scheduled choice", (p) => { p.internalSchedulingMode = InternalSchedulingMode.RequireChoiceSchedule; }],
  ["wrong profile", (p) => { p.identity.semanticProfile = "another-profile"; }],
  ["retention capacity changed", (p) => { p.compensationActivityRetention!.limits.maxRecords = 2; }],
  ["execution capacity changed", (p) => { p.compensationExecution!.limits.maxCanonicalBytes = 20481; }],
  ["dependencies", (p) => { p.compensationExecution!.dependencies.push({ predecessorElementId: "Booking_OrdinaryTask0", successorElementId: "Booking_CancelTask0", reason: "sequenceFlow" }); }],
  ["restored handler arguments", (p) => { p.compensationExecution!.subjects[0]!.body.input = { kind: "restoredProcessBinding", sourceName: "source", argumentName: "argument" }; }],
  ["extra descriptor arguments", (p) => { Object.assign(p.compensationExecution!.subjects[0]!.body.descriptor, { arguments: [] }); }],
  ["snapshot declaration", (p) => { Object.assign(p, { compensationEventSubProcessSnapshots: {} }); }],
  ["task metadata", (p) => { Object.assign(p.operations.find((o) => o.kind === Kind.AwaitUserTask && o.task.elementId === "Booking_Acknowledge")!, { task: { elementId: "Booking_Acknowledge", name: null, metadata: {} } }); }],
  ["flow condition", (p) => { Object.assign(p.controlPlaces[0]!, { condition: true }); }],
  ["Process data", (p) => { Object.assign(p, { variables: [] }); }],
];

for (const [description, mutate] of mutations) {
  test(`role grammar refuses ${description}`, () => {
    assert.equal(transactionCancellationProgramGraph(changed(mutate)), false);
  });
}

test("shape is only a coarse filter and cannot admit a topology mutation", () => {
  const program = changed(mutations[0]![1]);
  assert.equal(transactionCancellationProgramShape(program.operations, 2), true);
  assert.equal(transactionCancellationProgramGraph(program), false);
});
