import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants

/-! # Bounded Transaction source and Program admission

The Transaction cancellation capsule selects two finite Task chains by role. Neither reader compares a model with fixture identities or gives the profile a different transition meaning.
-/
namespace BpmnSemantics.SemanticProcess

abbrev transactionCancellationCheckpointProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-transaction-cancellation-checkpoint-draft"⟩

private def only? (xs : List α) : Option α :=
  match xs with | [x] => some x | _ => none

private def exactSet [DecidableEq α] (xs ys : List α) : Bool :=
  decide xs.Nodup && decide ys.Nodup && xs.length == ys.length && xs.all ys.contains

private def descriptorValid (body : CheckedCompensationBody) : Bool :=
  body.input == .empty && body.handlerElementId == body.effectElementId &&
    body.descriptor.protocol == "urn:bpmn-lean:effect-protocol:activity-v1" &&
    body.descriptor.operation == "urn:bpmn-lean:effect-operation:compensation-single-effect-v1"

private def nodeOwner? (s : CheckedProcess) (id : NodeId) : Option DefinitionScopeId :=
  (only? (s.nodeScopes.filter (·.nodeId == id))).map (·.scopeId)

private def outgoing (s : CheckedProcess) (id : NodeId) : List CheckedSequenceFlow :=
  s.sequenceFlows.filter (·.sourceId == id)

private def next? (s : CheckedProcess) (id : NodeId) : Option NodeId :=
  (only? (outgoing s id)).map (·.targetId)

private def checkedChain (s : CheckedProcess) (child : DefinitionScopeId) :
    Nat → NodeId → Option (List NodeId × NodeId)
  | 0, _ => none
  | fuel + 1, id => do
      let node ← only? (s.nodes.filter (·.id == id))
      if nodeOwner? s id != some child then none else
      match node with
      | .userTask _ _ none =>
          let next ← next? s id
          let (tasks, finish) ← checkedChain s child fuel next
          pure (id :: tasks, finish)
      | .noneEndEvent _ | .cancelEndEvent _ => pure ([], id)
      | _ => none

/-- Complete bounded checked grammar, including exact ownership and both disjoint branches. -/
def transactionCancellationCheckedGraph (s : CheckedProcess) : Bool := Id.run do
  let some d := s.transactionCancellation | return false
  let some root := only? (s.definitionScopes.filter (·.parentScopeId.isNone)) | return false
  let some child := only? (s.definitionScopes.filter (·.parentScopeId.isSome)) | return false
  let some (.transactionSubProcess transaction childId method) := only? (s.nodes.filter fun
    | .transactionSubProcess .. => true | _ => false) | return false
  let some (.cancelBoundaryEvent boundary attached output) := only? (s.nodes.filter fun
    | .cancelBoundaryEvent .. => true | _ => false) | return false
  let some (.cancelEndEvent cancel) := only? (s.nodes.filter fun
    | .cancelEndEvent .. => true | _ => false) | return false
  let rootNodes := s.nodes.filter (fun n => nodeOwner? s n.id == some root.id)
  let childNodes := s.nodes.filter (fun n => nodeOwner? s n.id == some child.id)
  let some (.noneStartEvent rootStart) := only? (rootNodes.filter fun
    | .noneStartEvent .. => true | _ => false) | return false
  let some (.noneStartEvent childStart) := only? (childNodes.filter fun
    | .noneStartEvent .. => true | _ => false) | return false
  let some (.userTask ack _ none) := only? (rootNodes.filter fun
    | .userTask .. => true | _ => false) | return false
  let some (.parallelGateway split .diverging) := only? (childNodes.filter fun
    | .parallelGateway .. => true | _ => false) | return false
  let some (.noneEndEvent childEnd) := only? (childNodes.filter fun
    | .noneEndEvent .. => true | _ => false) | return false
  let rootEnds := rootNodes.filterMap fun | .noneEndEvent id => some id | _ => none
  let tasks := childNodes.filterMap fun | .userTask id _ none => some id | _ => none
  let some normalEnd := next? s transaction | return false
  let some ackEnd := next? s ack | return false
  let [left, right] := outgoing s split | return false
  let some (lt, le) := checkedChain s child.id 3 left.targetId | return false
  let some (rt, re) := checkedChain s child.id 3 right.targetId | return false
  let .boundaryActivity eligible compensationBoundary body := d.subject | return false
  let ordinaryTasks := if le == childEnd then lt else rt
  let identities := [s.processId.value] ++ s.nodes.map (·.id.value) ++
    s.sequenceFlows.map (·.id.value) ++ [compensationBoundary.value, body.handlerElementId.value]
  return s.identity.semanticProfile == transactionCancellationCheckpointProfileId &&
    s.identity.sourceOverlay.isNone && s.compensation.isNone &&
    exactSet s.definitionScopes [root, child] &&
    root.originElementId.value == s.processId.value && root.id.value == "scope:" ++ s.processId.value &&
    child.id.value == "scope:" ++ transaction.value && child.id == childId &&
    child.parentScopeId == some root.id && child.originElementId == transaction &&
    method == "##Compensate" && attached == transaction &&
    d.definitionScopeId == child.id && d.triggerElementId == cancel &&
    exactSet (rootNodes.map (·.id)) [rootStart, transaction, boundary, ack, normalEnd, ackEnd] &&
    exactSet rootEnds [normalEnd, ackEnd] &&
    exactSet (childNodes.map (·.id)) ([childStart, split, cancel, childEnd] ++ tasks) &&
    s.nodes.length == rootNodes.length + childNodes.length &&
    exactSet (s.nodeScopes.map (·.nodeId)) (s.nodes.map (·.id)) &&
    exactSet (s.sequenceFlowScopes.map (·.sequenceFlowId)) (s.sequenceFlows.map (·.id)) &&
    s.sequenceFlows.all (fun f => f.condition.isNone &&
      nodeOwner? s f.sourceId == nodeOwner? s f.targetId &&
      ((only? (s.sequenceFlowScopes.filter (·.sequenceFlowId == f.id))).map (·.scopeId)) == nodeOwner? s f.sourceId) &&
    next? s rootStart == some transaction && next? s boundary == some ack &&
    (only? (outgoing s boundary)).map (·.id) == some output && next? s childStart == some split &&
    s.nodes.all (fun n =>
      (s.sequenceFlows.filter (·.targetId == n.id)).length ==
        (if [rootStart, childStart, boundary].contains n.id then 0 else 1)) &&
    ([normalEnd, ackEnd, cancel, childEnd].all fun id => (outgoing s id).isEmpty) &&
    !lt.isEmpty && !rt.isEmpty && lt.length ≤ 2 && rt.length ≤ 2 &&
    exactSet [le, re] [cancel, childEnd] && exactSet (lt ++ rt) tasks &&
    s.sequenceFlows.length == tasks.length + 7 && ordinaryTasks.contains eligible &&
    descriptorValid body && identities.all nonempty && decide identities.Nodup &&
    d.retentionLimits == { maxRecords := 1, maxCanonicalBytes := 4096 } &&
    d.executionLimits == { maxTriggers := 1, maxHandlers := 1, maxCanonicalBytes := 20480 }

/-- Old profiles physically omit the new declaration and constructors. -/
def transactionSourceAbsent (s : CheckedProcess) : Bool :=
  s.transactionCancellation.isNone && s.nodes.all fun
    | .transactionSubProcess .. | .cancelEndEvent .. | .cancelBoundaryEvent .. => false
    | _ => true

private def opOwner? (p : Program) (id : OperationId) : Option DefinitionScopeId :=
  (only? (p.operationScopes.filter (·.operationId == id))).map (·.scopeId)

private def placeOwner? (p : Program) (id : ControlPlaceId) : Option DefinitionScopeId :=
  (only? (p.controlPlaceScopes.filter (·.controlPlaceId == id))).map (·.scopeId)

private def input? : SemanticOperation → Option ControlPlaceId
  | .enterScope _ _ input _ _ | .awaitUserTask _ _ input _ _
  | .duplicate _ _ input _ | .cancelTransaction _ _ _ input _ _
  | .reachNoneEnd _ _ input => some input
  | _ => none

private def consumer? (p : Program) (place : ControlPlaceId) : Option SemanticOperation :=
  only? (p.operations.filter (fun op => input? op == some place))

private def programChain (p : Program) (child : DefinitionScopeId) :
    Nat → ControlPlaceId → Option (List SemanticOperation × List ControlPlaceId)
  | 0, _ => none
  | fuel + 1, place => do
      if placeOwner? p place != some child then none else
      let op ← consumer? p place
      if opOwner? p op.id != some child then none else
      match op with
      | .awaitUserTask _ _ _ output task =>
          if task.metadata.isSome then none else
          let (ops, places) ← programChain p child fuel output
          pure (op :: ops, place :: places)
      | .reachNoneEnd .. | .cancelTransaction .. => pure ([op], [place])
      | _ => none

private def canonicalOperation (op : SemanticOperation) : Bool :=
  match op with
  | .completeScope id origin scope _ =>
      id.value == "operation:complete-scope:" ++ scope.value && nonempty origin.elementId.value
  | .initiate id origin _ | .enterScope id origin _ _ _
  | .duplicate id origin _ _ | .cancelTransaction id origin _ _ _ _
  | .reachNoneEnd id origin _ =>
      id.value == "operation:" ++ origin.elementId.value && nonempty origin.elementId.value
  | .awaitUserTask id origin _ _ task =>
      id.value == "operation:" ++ origin.elementId.value && nonempty origin.elementId.value &&
      task.id.value == origin.elementId.value && task.metadata.isNone
  | _ => false

/-- Independent Program traversal covers every operation and place exactly once, including the erased child Start edge. -/
def transactionCancellationProgramGraph (p : Program) : Bool := Id.run do
  let some root := only? (p.definitionScopes.filter (·.parentScopeId.isNone)) | return false
  let some child := only? (p.definitionScopes.filter (·.parentScopeId.isSome)) | return false
  let some start@(.initiate _ _ first) := only? (p.operations.filter fun
    | .initiate .. => true | _ => false) | return false
  let some entry@(.enterScope _ transaction _ childEntry childId) := consumer? p first | return false
  let some split@(.duplicate _ _ _ outputs) := consumer? p childEntry | return false
  let [left, right] := outputs | return false
  let some cancel@(.cancelTransaction cancelId _ cancelScope _ cancelOutput cancelBoundary) := only? (p.operations.filter fun
    | .cancelTransaction .. => true | _ => false) | return false
  let some rootComplete@(.completeScope _ rootOrigin _ none) := only? (p.operations.filter fun
    | .completeScope _ _ scope _ => scope == root.id | _ => false) | return false
  let some childComplete@(.completeScope _ childOrigin _ (some normalOutput)) := only? (p.operations.filter fun
    | .completeScope _ _ scope _ => scope == child.id | _ => false) | return false
  let some normalEnd@(.reachNoneEnd ..) := consumer? p normalOutput | return false
  let some ack@(.awaitUserTask _ _ _ ackOutput _) := consumer? p cancelOutput | return false
  let some ackEnd@(.reachNoneEnd ..) := consumer? p ackOutput | return false
  let some (lo, lp) := programChain p child.id 3 left | return false
  let some (ro, rp) := programChain p child.id 3 right | return false
  let some retention := p.compensationActivityRetention | return false
  let some execution := p.compensationExecution | return false
  let [target] := retention.targets | return false
  let [.boundaryActivity eligible body] := execution.subjects | return false
  let branches := [lo, ro]
  let ordinary := branches.filter fun ops => match ops.getLast? with
    | some (.reachNoneEnd ..) => true | _ => false
  let cancelling := branches.filter fun ops => ops.getLast? == some cancel
  let some ordinaryBranch := only? ordinary | return false
  let some cancelBranch := only? cancelling | return false
  let taskIds := fun (ops : List SemanticOperation) => ops.filterMap fun
    | .awaitUserTask _ _ _ _ task => some task.id.value | _ => none
  let visited := [start, entry, split, rootComplete, childComplete, normalEnd, ack, ackEnd] ++ lo ++ ro
  let places := [first, childEntry, normalOutput, cancelOutput, ackOutput] ++ lp ++ rp
  let elements := [p.processId.value] ++ (p.operations.filterMap fun
    | .initiate _ origin _ | .enterScope _ origin _ _ _
    | .awaitUserTask _ origin _ _ _ | .duplicate _ origin _ _
    | .cancelTransaction _ origin _ _ _ _ | .reachNoneEnd _ origin _ => some origin.elementId.value
    | _ => none) ++
    p.controlPlaces.map (·.origin.elementId.value) ++
    [cancelBoundary.value, target.boundaryEventElementId.value, target.compensationActivityElementId.value]
  return p.identity.semanticProfile == transactionCancellationCheckpointProfileId &&
    p.identity.compiler == .bpmnSourceSemanticProcess && p.identity.sourceOverlay.isNone &&
    p.internalSchedulingMode == .rejectObservableChoice &&
    exactSet p.definitionScopes [root, child] &&
    root.id.value == "scope:" ++ p.processId.value && root.originElementId.value == p.processId.value &&
    child.id.value == "scope:" ++ transaction.elementId.value && child.id == childId &&
    child.parentScopeId == some root.id && child.originElementId == transaction.elementId &&
    rootOrigin.elementId == root.originElementId && childOrigin.elementId == child.originElementId &&
    cancelScope == child.id &&
    exactSet p.operations visited && p.operations.all canonicalOperation &&
    exactSet (p.operationScopes.map (·.operationId)) (p.operations.map (·.id)) &&
    ([start, entry, rootComplete, normalEnd, ack, ackEnd].all fun op => opOwner? p op.id == some root.id) &&
    opOwner? p split.id == some child.id && opOwner? p childComplete.id == some child.id &&
    exactSet (p.controlPlaces.map (·.id)) places &&
    exactSet (p.controlPlaceScopes.map (·.controlPlaceId)) places &&
    p.controlPlaces.all (fun place => place.id.value == "place:" ++ place.origin.elementId.value) &&
    ([first, normalOutput, cancelOutput, ackOutput].all fun place => placeOwner? p place == some root.id) &&
    placeOwner? p childEntry == some child.id &&
    2 ≤ ordinaryBranch.length && ordinaryBranch.length ≤ 3 &&
    2 ≤ cancelBranch.length && cancelBranch.length ≤ 3 &&
    (taskIds ordinaryBranch).contains eligible.value && !(taskIds cancelBranch).contains eligible.value &&
    p.compensationEventSubProcessSnapshots.isNone &&
    retention.definitionScopeId == child.id && target.activityElementId == eligible &&
    target.compensationActivityElementId == body.handlerElementId &&
    retention.maxRecords == 1 && retention.maxCanonicalBytes == 4096 &&
    execution.definitionScopeId == child.id && execution.triggerOperationId == cancelId &&
    execution.dependencies.isEmpty &&
    execution.limits == { maxTriggers := 1, maxHandlers := 1, maxCanonicalBytes := 20480 } &&
    body.handlerElementId == body.effectElementId && body.input == .empty &&
    body.descriptor.protocol == "urn:bpmn-lean:effect-protocol:activity-v1" &&
    body.descriptor.operation == "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" &&
    elements.all nonempty && decide elements.Nodup

namespace TransactionProgramRoles

/-- These projections expose the admission reader's roles without a second graph traversal. -/
def operationOwner? := opOwner?
def controlPlaceOwner? := placeOwner?
def operationInput? := input?
def soleConsumer? := consumer?
def taskChain? := programChain
def unique? := @only?
def exactInventory := @exactSet
def canonical := canonicalOperation

def endsNormally (operations : List SemanticOperation) : Bool :=
  match operations.getLast? with
  | some (.reachNoneEnd ..) => true
  | _ => false

def taskElementIds (operations : List SemanticOperation) : List String :=
  operations.filterMap fun
    | .awaitUserTask _ _ _ _ task => some task.id.value
    | _ => none

theorem unique_exact (values : List α) (value : α)
    (selected : unique? values = some value) : values = [value] := by
  cases values with
  | nil => simp [unique?, only?] at selected
  | cons head tail =>
      cases tail with
      | nil => simpa [unique?, only?] using selected
      | cons next rest => simp [unique?, only?] at selected

theorem unique_filter_facts (values : List α) (predicate : α → Bool) (value : α)
    (selected : unique? (values.filter predicate) = some value) :
    value ∈ values ∧ predicate value = true := by
  apply List.mem_filter.mp
  rw [unique_exact _ _ selected]
  exact List.mem_cons_self

theorem soleConsumer_exact (p : Program) (place : ControlPlaceId)
    (operation : SemanticOperation) (selected : soleConsumer? p place = some operation) :
    p.operations.filter (fun candidate => operationInput? candidate == some place) =
      [operation] := by
  change only? (p.operations.filter (fun candidate => input? candidate == some place)) =
    some operation at selected
  change p.operations.filter (fun candidate => input? candidate == some place) = [operation]
  generalize filtered : p.operations.filter (fun candidate => input? candidate == some place) =
    candidates at selected ⊢
  cases candidates with
  | nil => simp [only?] at selected
  | cons head tail =>
      cases tail with
      | nil => simpa [only?, operationInput?] using selected
      | cons next rest => simp [only?] at selected

theorem soleConsumer_facts (p : Program) (place : ControlPlaceId)
    (operation : SemanticOperation) (selected : soleConsumer? p place = some operation) :
    operation ∈ p.operations ∧ operationInput? operation = some place := by
  have facts := unique_filter_facts p.operations
    (fun candidate => operationInput? candidate == some place) operation selected
  exact ⟨facts.1, by simpa only [beq_iff_eq] using facts.2⟩

theorem taskChain_zero (p : Program) (child : DefinitionScopeId) (place : ControlPlaceId) :
    taskChain? p child 0 place = none := rfl

theorem taskChain_succ (p : Program) (child : DefinitionScopeId)
    (fuel : Nat) (place : ControlPlaceId) :
    taskChain? p child (fuel + 1) place = (do
      if controlPlaceOwner? p place != some child then none else
      let op ← soleConsumer? p place
      if operationOwner? p op.id != some child then none else
      match op with
      | .awaitUserTask _ _ _ output task =>
          if task.metadata.isSome then none else
          let (ops, places) ← taskChain? p child fuel output
          pure (op :: ops, place :: places)
      | .reachNoneEnd .. | .cancelTransaction .. => pure ([op], [place])
      | _ => none) := rfl

theorem exactInventory_eq [DecidableEq α] (xs ys : List α) :
    exactInventory xs ys =
      (decide xs.Nodup && decide ys.Nodup && xs.length == ys.length && xs.all ys.contains) := rfl

end TransactionProgramRoles

end BpmnSemantics.SemanticProcess
