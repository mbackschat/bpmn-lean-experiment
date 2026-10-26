module

public import BpmnSemantics.SemanticProcess.GraphValidation
public import BpmnSemantics.SemanticProcess.Lowering
public import BpmnSemantics.SemanticProcessJson.CheckedProcess
public import BpmnSemantics.SemanticProcess.ParallelScopeCheckedAdmission
public import BpmnSemantics.SemanticProcess.ParallelScopeStartAdmission
public import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
public import BpmnSemantics.SemanticProcess.CommandAdmission
public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog

/-! PMIS-END-01 checks paired parallel-scope declarations independently of private runtime execution. -/

@[expose] public section

namespace BpmnSemantics.ParallelScopeGraphConformance
open SemanticProcess

def origin (value : String) : BpmnElementOrigin := { elementId := ⟨value⟩ }

def operations : List SemanticOperation :=
  [ .initiate ⟨"start"⟩ (origin "Start") ⟨"incoming"⟩
  , .enterParallelMultiInstanceScope ⟨"enter"⟩ (origin "Batch")
      ⟨"incoming"⟩ ⟨"body-in"⟩ ⟨"body"⟩ ⟨"outgoing"⟩ "items" "item" [] none
  , .awaitUserTask ⟨"task"⟩ (origin "Review") ⟨"body-in"⟩ ⟨"body-out"⟩ { id := ⟨"Review"⟩, name := none }
  , .reachNoneEnd ⟨"child-end"⟩ (origin "ChildEnd") ⟨"body-out"⟩
  , .completeParallelMultiInstanceScope ⟨"complete"⟩ (origin "Batch") ⟨"enter"⟩
  , .reachNoneEnd ⟨"end"⟩ (origin "End") ⟨"outgoing"⟩
  , .completeScope ⟨"root-complete"⟩ (origin "P") ⟨"root"⟩ none ]

def places : List String := ["incoming", "outgoing", "body-in", "body-out"]

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"cibseven-2.2.0-parallel-multi-instance-subprocess-draft"⟩
        sourceId := ⟨"paired-body"⟩
        sourceSha256 := "private-graph-witness" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"P"⟩
    definitionScopes := [{ id := ⟨"root"⟩, parentScopeId := none, originElementId := ⟨"P"⟩ },
      { id := ⟨"body"⟩, parentScopeId := some ⟨"root"⟩, originElementId := ⟨"Batch"⟩ }]
    operationScopes := operations.map fun operation =>
      { operationId := operation.id
        scopeId := ⟨if ["task", "child-end", "complete"].contains operation.id.value then "body" else "root"⟩ }
    controlPlaceScopes := places.map fun place =>
      { controlPlaceId := ⟨place⟩
        scopeId := ⟨if ["body-in", "body-out"].contains place then "body" else "root"⟩ }
    controlPlaces := places.map fun place => { id := ⟨place⟩, origin := { elementId := ⟨place⟩ } }
    operations }

def replacing (id : String) (replacement : SemanticOperation) : Program :=
  { program with operations := operations.map fun operation => if operation.id.value == id then replacement else operation }

def parallel_source_graph_policy_does_not_admit_execution : Bool := decide <|
    programProfileCapabilitiesValid program = false

theorem paired_repeated_scope_graph_is_admitted : programGraphWellFormed program = true := by decide +kernel

theorem paired_graph_admission_is_declaration_order_independent : programGraphWellFormed { program with
    operations := operations.reverse
    operationScopes := program.operationScopes.reverse } = true := by decide +kernel

theorem completion_rejects_non_entry_binding : programGraphWellFormed (replacing "complete"
    (.completeParallelMultiInstanceScope ⟨"complete"⟩ (origin "Batch") ⟨"start"⟩)) = false := by decide +kernel

theorem completion_rejects_a_different_activity_origin : programGraphWellFormed (replacing "complete"
    (.completeParallelMultiInstanceScope ⟨"complete"⟩ (origin "OtherBatch") ⟨"enter"⟩)) = false := by decide +kernel

theorem entry_rejects_a_child_owned_parent_continuation : programGraphWellFormed (replacing "enter"
    (.enterParallelMultiInstanceScope ⟨"enter"⟩ (origin "Batch")
      ⟨"incoming"⟩ ⟨"body-in"⟩ ⟨"body"⟩ ⟨"body-out"⟩ "items" "item" [] none)) = false := by decide +kernel

theorem completion_rejects_parent_scope_ownership : programGraphWellFormed { program with operationScopes := program.operationScopes.map fun owner =>
    if owner.operationId.value == "complete" then { owner with scopeId := ⟨"root"⟩ } else owner } = false := by decide +kernel

theorem repeated_scope_requires_its_completion : programGraphWellFormed { program with
    operations := operations.filter fun operation => operation.id.value != "complete",
    operationScopes := program.operationScopes.filter fun owner => owner.operationId.value != "complete" } = false := by decide +kernel

theorem ordinary_completion_cannot_compete_with_repeated_completion : programGraphWellFormed { program with
    operations := operations ++ [.completeScope ⟨"ordinary"⟩ (origin "Batch") ⟨"body"⟩ (some ⟨"outgoing"⟩)],
    operationScopes := program.operationScopes ++ [{ operationId := ⟨"ordinary"⟩, scopeId := ⟨"body"⟩ }] } = false := by decide +kernel

theorem repeated_scope_requires_unique_completion : programGraphWellFormed { program with
    operations := operations ++ [.completeParallelMultiInstanceScope ⟨"duplicate"⟩ (origin "Batch") ⟨"enter"⟩],
    operationScopes := program.operationScopes ++ [{ operationId := ⟨"duplicate"⟩, scopeId := ⟨"body"⟩ }] } = false := by decide +kernel

def parallel_completion_cannot_bind_sequential_entry : Bool := decide <| programGraphWellFormed
    (replacing "enter" (.enterSequentialMultiInstanceScope ⟨"enter"⟩ (origin "Batch")
      ⟨"incoming"⟩ ⟨"body-in"⟩ ⟨"body"⟩ ⟨"outgoing"⟩ "items" "item" [] none)) = false

def checkedParallel : CheckedProcess :=
  { identity :=
      { semanticProfile := program.identity.semanticProfile
        sourceId := program.identity.sourceId
        sourceSha256 := program.identity.sourceSha256 }
    processId := program.processId
    definitionScopes := program.definitionScopes
    nodes := [.parallelMultiInstanceSubProcess ⟨"Batch"⟩ ⟨"body"⟩ "items" "item"
        [⟨"local", .enclosingVariable "seed"⟩] (some "done"),
      .noneEndEvent ⟨"ChildEnd"⟩, .noneStartEvent ⟨"ChildStart"⟩, .noneEndEvent ⟨"End"⟩,
      .userTask ⟨"Review"⟩ none, .noneStartEvent ⟨"Start"⟩]
    nodeScopes := [⟨⟨"Batch"⟩, ⟨"root"⟩⟩, ⟨⟨"ChildEnd"⟩, ⟨"body"⟩⟩,
      ⟨⟨"ChildStart"⟩, ⟨"body"⟩⟩, ⟨⟨"End"⟩, ⟨"root"⟩⟩,
      ⟨⟨"Review"⟩, ⟨"body"⟩⟩, ⟨⟨"Start"⟩, ⟨"root"⟩⟩]
    sequenceFlows := [⟨⟨"body-in"⟩, ⟨"ChildStart"⟩, ⟨"Review"⟩, none⟩,
      ⟨⟨"body-out"⟩, ⟨"Review"⟩, ⟨"ChildEnd"⟩, none⟩,
      ⟨⟨"incoming"⟩, ⟨"Start"⟩, ⟨"Batch"⟩, none⟩, ⟨⟨"outgoing"⟩, ⟨"Batch"⟩, ⟨"End"⟩, none⟩]
    sequenceFlowScopes := [⟨⟨"body-in"⟩, ⟨"body"⟩⟩, ⟨⟨"body-out"⟩, ⟨"body"⟩⟩,
      ⟨⟨"incoming"⟩, ⟨"root"⟩⟩, ⟨⟨"outgoing"⟩, ⟨"root"⟩⟩] }

theorem checked_parallel_lowering_keeps_pair_and_data :
    ((lowerCheckedProcess checkedParallel).operations.filterMap fun
      | .enterParallelMultiInstanceScope id origin _ _ scope _ collection item inputs condition =>
          some (id, origin.elementId, scope, collection, item, inputs, condition)
      | _ => none) = [(⟨"operation:Batch"⟩, ⟨"Batch"⟩, ⟨"body"⟩, "items", "item",
        [⟨"local", .enclosingVariable "seed"⟩], some "done")] ∧
    ((lowerCheckedProcess checkedParallel).operations.filterMap fun
      | .completeParallelMultiInstanceScope _ origin entry => some (origin.elementId, entry)
      | _ => none) = [(⟨"Batch"⟩, ⟨"operation:Batch"⟩)] ∧
    programGraphWellFormed (lowerCheckedProcess checkedParallel) = true ∧
    lowerCheckedProcess { checkedParallel with nodes := checkedParallel.nodes.reverse } =
      lowerCheckedProcess checkedParallel := by
  refine ⟨?_, ?_, ?_, ?_⟩
  · rfl
  · decide +kernel
  · decide +kernel
  · decide +kernel

def checkedMixed : CheckedProcess :=
  { checkedParallel with
    identity := { checkedParallel.identity with sourceOverlay := some { id := ⟨"handlers"⟩, sha256 := "private-overlay" } }
    nodes := checkedParallel.nodes ++ [.serviceTask ⟨"Validate"⟩
      ⟨"urn:bpmn-lean:effect-protocol:activity-v1", "validateInvoice"⟩ [] [] none]
    nodeScopes := checkedParallel.nodeScopes ++ [⟨⟨"Validate"⟩, ⟨"body"⟩⟩]
    sequenceFlows := (checkedParallel.sequenceFlows.map fun flow =>
      if flow.id.value == "body-out" then { flow with targetId := ⟨"Validate"⟩ } else flow) ++
      [⟨⟨"validated"⟩, ⟨"Validate"⟩, ⟨"ChildEnd"⟩, none⟩]
    sequenceFlowScopes := checkedParallel.sequenceFlowScopes ++ [⟨⟨"validated"⟩, ⟨"body"⟩⟩] }

def private_checked_admission_retains_both_task_kinds_and_execution_refusal : Bool := decide <|
    ParallelScopeChecked.admitted checkedMixed = true ∧
    ParallelScopeChecked.admitted { checkedMixed with nodes := checkedMixed.nodes.reverse } = true ∧
    ParallelScopeChecked.admitted checkedParallel = false ∧
    programProfileCapabilitiesValid (lowerCheckedProcess checkedMixed) = false

def startBindings (count : Nat) : List VariableBinding :=
  [⟨"done", .boolean false⟩, ⟨"items", .stringList (List.replicate count "same")⟩, ⟨"seed", .null⟩]

def private_start_bound_counts_population_and_requires_pre_entry_inputs : Bool := decide <|
    ParallelScopeStart.checkedSourceBound checkedMixed (startBindings 0) = some 4 ∧
    ParallelScopeStart.checkedSourceBound checkedMixed (startBindings 16) = some 68 ∧
    ParallelScopeStart.checkedSourceBound checkedMixed (startBindings 17) = none ∧
    ParallelScopeStart.checkedSourceBound checkedMixed ((startBindings 0).filter (·.name != "seed")) = none

def rawCapacityProgram : Program :=
  lowerCheckedProcess { checkedMixed with
    definitionScopes := checkedMixed.definitionScopes.reverse
    identity := { checkedMixed.identity with
      sourceSha256 := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      sourceOverlay := some {
        id := ⟨"handlers"⟩
        sha256 := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } } }

def private_raw_parallel_capacity_retains_population_and_required_empty_inputs : Bool := decide <|
    (ParallelScopeStart.programStartCapacity rawCapacityProgram (startBindings 0)).map (·.closureBound) = some 4 ∧
    (ParallelScopeStart.programStartCapacity rawCapacityProgram (startBindings 1)).map (·.closureBound) = some 8 ∧
    (ParallelScopeStart.programStartCapacity rawCapacityProgram (startBindings 2)).map (·.closureBound) = some 12 ∧
    (ParallelScopeStart.programStartCapacity rawCapacityProgram (startBindings 16)).map (·.closureBound) = some 68 ∧
    ParallelScopeStart.programStartCapacity rawCapacityProgram (startBindings 17) = none ∧
    ParallelScopeStart.programStartCapacity rawCapacityProgram ((startBindings 0).filter (·.name != "seed")) = none

def private_raw_parallel_start_ingress_preserves_public_shape_refusal : Bool := decide <|
    (admitStimulus rawCapacityProgram initialState
      (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"invoices"⟩ (startBindings 0))).outcome = .committed ∧
    (admitStimulus rawCapacityProgram initialState
      (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"invoices"⟩ (startBindings 16))).outcome = .committed ∧
    programProfileCapabilitiesValid rawCapacityProgram = false

def private_raw_parallel_capacity_checks_the_original_decoded_program : Bool := decide <|
    ParallelScopeStart.programStartCapacity { rawCapacityProgram with operations := rawCapacityProgram.operations.reverse }
      (startBindings 2) = none ∧
    ParallelScopeStart.programStartCapacity { rawCapacityProgram with interruptingMessageEventSubProcesses := [{
      parentScopeId := ⟨"root"⟩, handlerScopeId := ⟨"body"⟩, elementId := ⟨"Batch"⟩,
      startEventId := ⟨"ChildStart"⟩, channel := .operationMessage ⟨"I"⟩ ⟨"O"⟩ ⟨"M"⟩,
      childEntry := ⟨"body-in"⟩ }] } (startBindings 2) = none

def commandWaitingState? : Option RuntimeState := do
  let started := admitStimulus rawCapacityProgram initialState
    (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"invoices"⟩ (startBindings 2))
  if started.outcome != .committed then none else pure ()
  let [root] := started.state.scopeOccurrences | none
  let [init] := rawCapacityProgram.operations.filter (fun operation => match operation with
    | .initiate .. => true | _ => false) | none
  let initialized ← InternalCommutation.applyInternalOperationOccurrence? rawCapacityProgram started.state ⟨init.id, root.id⟩
  let [entry] := rawCapacityProgram.operations.filterMap parallelScopeEntry? | none
  let entered ← InternalCommutation.applyInternalOperationOccurrence? rawCapacityProgram initialized ⟨entry.id, root.id⟩
  let [task] := rawCapacityProgram.operations.filter (fun operation => match operation with
    | .awaitUserTask .. => true | _ => false) | none
  let body ← entered.scopeOccurrences.find? (fun scope => scope.id.definitionScopeId == entry.childScopeId)
  InternalCommutation.applyInternalOperationOccurrence? rawCapacityProgram entered ⟨task.id, body.id⟩

def commandResume? (change : RuntimeState → RuntimeState) : Option (CommandOutcome × Option Nat) := do
  let waiting ← commandWaitingState?
  let [wait] := waiting.waits | none
  let state := change waiting
  let stimulus := Stimulus.completeUserTaskInstance ⟨"review"⟩
    ⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ []
  pure ((admitStimulus rawCapacityProgram state stimulus).outcome,
    (ParallelScopeStart.programStateCapacity rawCapacityProgram state).map (·.closureBound))

def strayScopeFrame (state : RuntimeState) : RuntimeState :=
  { state with variables := { state.variables with scopes := state.variables.scopes ++
    [⟨⟨⟨"invoices"⟩, ⟨"stray"⟩, 1⟩, []⟩] } }

def strayController (state : RuntimeState) : RuntimeState :=
  { state with parallelScopeControllers := state.parallelScopeControllers ++
    [⟨⟨⟨"invoices"⟩, ⟨"stray"⟩, 1⟩, 1, 0⟩] }

def unissuedHumanWait (state : RuntimeState) : RuntimeState :=
  { state with activations := state.activations.map fun row => { row with count := 0 } }

def cyclicParent (state : RuntimeState) : RuntimeState :=
  { state with scopeOccurrences := state.scopeOccurrences.map fun scope =>
    if scope.parent.isNone then { scope with parent := some scope.id } else scope }

def private_parallel_resumption_uses_real_scoped_waits : Bool := decide <|
    commandResume? id = some (.committed, some 12)

def duplicateStorageCounters : List (RuntimeState → RuntimeState) :=
  [ fun state => { state with activations := [⟨⟨"Probe"⟩, 5⟩, ⟨⟨"Probe"⟩, 9⟩] }
  , fun state => { state with messageActivations := [⟨⟨"Probe"⟩, 5⟩, ⟨⟨"Probe"⟩, 9⟩] }
  , fun state => { state with timerActivations := [⟨⟨"Probe"⟩, 5⟩, ⟨⟨"Probe"⟩, 9⟩] }
  , fun state => { state with effectActivations := [⟨⟨"Probe"⟩, 5⟩, ⟨⟨"Probe"⟩, 9⟩] }
  , fun state => { state with activityActivations := [⟨⟨"Probe"⟩, 5⟩, ⟨⟨"Probe"⟩, 9⟩] }
  , fun state => { state with scopeActivations := [⟨⟨"Probe"⟩, 5⟩, ⟨⟨"Probe"⟩, 9⟩] }
  , fun state => { state with callActivations := [⟨⟨"Probe"⟩, 5⟩, ⟨⟨"Probe"⟩, 9⟩] }
  , fun state => { state with eventRaceActivations := [⟨⟨"Probe"⟩, 5⟩, ⟨⟨"Probe"⟩, 9⟩] } ]

def private_parallel_resumption_refuses_all_duplicate_storage_counter_keys : Bool := decide <|
    commandResume? id = some (.committed, some 12) ∧
      duplicateStorageCounters.all (fun change => commandResume? change == some (.rejected, none)) = true

def private_parallel_start_capacity_refuses_all_duplicate_storage_counter_keys : Bool := decide <|
    let start := Stimulus.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"invoices"⟩ (startBindings 2)
    ParallelScopeStart.commandClosureLimit? rawCapacityProgram initialState start = some 12 ∧
      duplicateStorageCounters.all (fun change =>
        let state := change initialState
        ParallelScopeStart.commandClosureLimit? rawCapacityProgram state start == none &&
          (admitStimulus rawCapacityProgram state start).outcome == .rejected &&
          (admitStimulus rawCapacityProgram state start).state == state) = true

def assertRejectedResumption (name : String)
    (variants : List (String × (RuntimeState → RuntimeState))) : Except String Unit := do
  let actual := variants.map fun (label, change) => (label, commandResume? change)
  unless actual.all (fun result => result.2 == some (.rejected, none)) do
    throw s!"{name}: corrupted resumption was admitted"

def private_parallel_resumption_refuses_unrelated_population_rows : Bool := Except.toBool <|
  assertRejectedResumption "private_parallel_resumption_refuses_unrelated_population_rows"
    [("stray-frame", strayScopeFrame), ("stray-controller", strayController)]

def private_parallel_resumption_refuses_unissued_anchors_and_cyclic_parents : Bool := Except.toBool <|
  assertRejectedResumption "private_parallel_resumption_refuses_unissued_anchors_and_cyclic_parents"
    [("unissued-human", unissuedHumanWait), ("cyclic-parent", cyclicParent)]

def private_frontier_population_retains_serial_task_capacity : Bool := decide <|
    ParallelScopeStart.checkedSourceFrontier checkedMixed (startBindings 0) = some ⟨0, 0⟩ ∧
    ParallelScopeStart.checkedSourceFrontier checkedMixed (startBindings 16) = some ⟨16, 16⟩ ∧
    ParallelScopeStart.checkedSourceFrontier checkedMixed (startBindings 17) = none

def nestedFrontier : List StructuredParallelBody.Vertex :=
  [⟨"start", .start, ["outer"]⟩, ⟨"outer", .fork, ["inner", "c"]⟩,
   ⟨"inner", .fork, ["a", "b"]⟩, ⟨"a", .task, ["innerJoin"]⟩, ⟨"b", .task, ["innerJoin"]⟩,
   ⟨"innerJoin", .join, ["join"]⟩, ⟨"c", .task, ["join"]⟩, ⟨"join", .join, ["d"]⟩,
   ⟨"d", .task, ["end"]⟩, ⟨"end", .finish, []⟩]

def weighted_contraction_keeps_nested_parallel_sums_and_serial_maxima : Bool := decide <|
    StructuredParallelBody.frontierCapacity nestedFrontier ["a", "b", "c", "d"] = some ⟨3, 3⟩ ∧
    StructuredParallelBody.frontierCapacity nestedFrontier.reverse ["d"] = some ⟨3, 1⟩ ∧
    ParallelScopeStart.boundedFrontier 128 64 = some ⟨128, 64⟩ ∧
    ParallelScopeStart.boundedFrontier 129 64 = none ∧
    ParallelScopeStart.boundedFrontier 128 65 = none

def parallelScopeNodeFields : List (String × Lean.Json) :=
  [("kind", .str "parallelMultiInstanceSubProcess"), ("id", .str "mi"),
   ("childScopeId", .str "body"), ("collectionName", .str "items"),
   ("itemName", .str "item"), ("bodyInputs", .arr #[]), ("completionBooleanName", .null)]

def decodedNodes (fields : List (String × Lean.Json)) : Option (List CheckedNode) :=
  let identity := Lean.Json.mkObj [("semanticProfile", .str "p"), ("sourceId", .str "s"),
    ("sourceOverlay", .null), ("sourceSha256", .str "x")]
  (SemanticProcessJson.decodeCheckedProcess (Lean.Json.mkObj [
    ("kind", .str "checkedProcess"), ("identity", identity), ("processId", .str "p"),
    ("definitionScopes", .arr #[]), ("nodeScopes", .arr #[]),
    ("sequenceFlowScopes", .arr #[]), ("sequenceFlows", .arr #[]),
    ("nodes", .arr #[Lean.Json.mkObj fields])])).toOption.map (·.nodes)

def parallel_scope_wire_distinguishes_mode_and_rejects_missing_or_extra_fields : Bool := decide <|
    decodedNodes parallelScopeNodeFields =
      some [.parallelMultiInstanceSubProcess ⟨"mi"⟩ ⟨"body"⟩ "items" "item" [] none] ∧
    decodedNodes (parallelScopeNodeFields.filter (·.1 != "collectionName")) = none ∧
    decodedNodes (parallelScopeNodeFields ++ [("isSequential", .bool false)]) = none

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("parallel_source_graph_policy_does_not_admit_execution", parallel_source_graph_policy_does_not_admit_execution),
  ("parallel_completion_cannot_bind_sequential_entry", parallel_completion_cannot_bind_sequential_entry),
  ("private_checked_admission_retains_both_task_kinds_and_execution_refusal", private_checked_admission_retains_both_task_kinds_and_execution_refusal),
  ("private_start_bound_counts_population_and_requires_pre_entry_inputs", private_start_bound_counts_population_and_requires_pre_entry_inputs),
  ("private_raw_parallel_capacity_retains_population_and_required_empty_inputs", private_raw_parallel_capacity_retains_population_and_required_empty_inputs),
  ("private_raw_parallel_start_ingress_preserves_public_shape_refusal", private_raw_parallel_start_ingress_preserves_public_shape_refusal),
  ("private_raw_parallel_capacity_checks_the_original_decoded_program", private_raw_parallel_capacity_checks_the_original_decoded_program),
  ("private_parallel_resumption_uses_real_scoped_waits", private_parallel_resumption_uses_real_scoped_waits),
  ("private_parallel_resumption_refuses_all_duplicate_storage_counter_keys", private_parallel_resumption_refuses_all_duplicate_storage_counter_keys),
  ("private_parallel_start_capacity_refuses_all_duplicate_storage_counter_keys", private_parallel_start_capacity_refuses_all_duplicate_storage_counter_keys),
  ("private_frontier_population_retains_serial_task_capacity", private_frontier_population_retains_serial_task_capacity),
  ("weighted_contraction_keeps_nested_parallel_sums_and_serial_maxima", weighted_contraction_keeps_nested_parallel_sums_and_serial_maxima),
  ("parallel_scope_wire_distinguishes_mode_and_rejects_missing_or_extra_fields", parallel_scope_wire_distinguishes_mode_and_rejects_missing_or_extra_fields),
  ("private_parallel_resumption_refuses_unrelated_population_rows", private_parallel_resumption_refuses_unrelated_population_rows),
  ("private_parallel_resumption_refuses_unissued_anchors_and_cyclic_parents", private_parallel_resumption_refuses_unissued_anchors_and_cyclic_parents)
]

end BpmnSemantics.ParallelScopeGraphConformance
