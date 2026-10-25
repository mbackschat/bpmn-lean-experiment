module

public import BpmnSemantics.SemanticProcess.GraphValidation
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
public import BpmnSemantics.SemanticProcess.SequentialScopeObservation
public import BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
public import BpmnSemantics.SemanticProcess.StructuredParallelBodyAdmission
public import BpmnSemantics.SemanticProcess.SequentialScopeControlAdmission
public import BpmnSemantics.SemanticProcess.CommandAdmission
public import BpmnSemantics.SemanticProcess.ScenarioAdmission
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
public import BpmnSemantics.SemanticProcess.TransitionTrace

/-! Fixture definitions and executable checks of [`SequentialScopeGraphConformance`](SequentialScopeGraphConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.SequentialScopeGraphConformance


open SemanticProcess
open SemanticProcess.InternalCommutation

def origin (value : String) : BpmnElementOrigin := { elementId := ⟨value⟩ }

def operations : List SemanticOperation :=
  [ .initiate ⟨"start"⟩ (origin "Start") ⟨"incoming"⟩
  , .enterSequentialMultiInstanceScope ⟨"enter"⟩ (origin "Batch")
      ⟨"incoming"⟩ ⟨"body-in"⟩ ⟨"body"⟩ ⟨"outgoing"⟩ "items" "item" [] none
  , .awaitUserTask ⟨"task"⟩ (origin "Review") ⟨"body-in"⟩ ⟨"body-out"⟩ { id := ⟨"Review"⟩, name := none }
  , .reachNoneEnd ⟨"child-end"⟩ (origin "ChildEnd") ⟨"body-out"⟩
  , .completeSequentialMultiInstanceScope ⟨"complete"⟩ (origin "Batch") ⟨"enter"⟩
  , .reachNoneEnd ⟨"end"⟩ (origin "End") ⟨"outgoing"⟩
  , .completeScope ⟨"root-complete"⟩ (origin "P") ⟨"root"⟩ none ]

def places : List String := ["incoming", "outgoing", "body-in", "body-out"]

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"cibseven-2.2.0-embedded-subprocess-completion-draft"⟩
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

def injectedScopeControllerState : RuntimeState :=
  { initialState with sequentialScopeControllers := [{
    id := { processInstanceId := ⟨"P-instance"⟩, activityElementId := ⟨"Batch"⟩, activation := 1 }
    total := 2, completed := 0, currentItem := "invoice" }] }

def scopeEntry (element : String) : SemanticOperation :=
  .enterSequentialMultiInstanceScope ⟨"enter-batch"⟩ { elementId := ⟨element⟩ }
    ⟨"incoming"⟩ ⟨"body-in"⟩ ⟨"body"⟩ ⟨"outgoing"⟩ "items" "item" [] none

def not_started_refuses_injected_scope_controller : Bool := decide <|
    notStartedStateEmpty injectedScopeControllerState = false

def scope_controller_requires_a_matching_declaration : Bool := decide <|
    hiddenRecordDeclarationsValid { program with operations := [] } injectedScopeControllerState = false ∧
    hiddenRecordDeclarationsValid { program with
      operations := [scopeEntry "Other"] } injectedScopeControllerState = false

def scope_controller_requires_a_unique_declaration : Bool := decide <|
    hiddenRecordDeclarationsValid { program with
      operations := [scopeEntry "Batch", scopeEntry "Batch"] }
      injectedScopeControllerState = false

def scope_controller_declaration_ignores_unrelated_operations : Bool := decide <|
    hiddenRecordDeclarationsValid { program with
      operations := [scopeEntry "Other", scopeEntry "Batch"] }
      injectedScopeControllerState = true

def projectionParent : ScopeOccurrenceId := ⟨⟨"invoice-batch"⟩, ⟨"root"⟩, 1⟩
def projectionBody : ScopeOccurrenceId := ⟨projectionParent.processInstanceId, ⟨"body"⟩, 1⟩
def projectionEntered : RuntimeState :=
  { initialState with
    control := .running projectionParent.processInstanceId,
    scopeOccurrences := [{ id := projectionParent, parent := none },
      { id := projectionBody, parent := some projectionParent }],
    activityOccurrences := [{
      processInstanceId := projectionParent.processInstanceId, activityElementId := ⟨"Batch"⟩,
      activation := 1, owner := projectionParent, body := .childScope projectionBody, attachedHandlers := [] }],
    activityActivations := [{ taskId := ⟨"Batch"⟩, count := 1 }],
    scopeActivations := [{ scopeId := ⟨"body"⟩, count := 1 }, { scopeId := ⟨"root"⟩, count := 1 }],
    sequentialScopeControllers := [{
      id := ⟨projectionParent.processInstanceId, ⟨"Batch"⟩, 1⟩,
      total := 2, completed := 0, currentItem := "INV-01" }],
    variables := { initialState.variables with scopes := [{ owner := projectionBody, bindings := [⟨"status", .null⟩] }] } }
def projectionTask (name : String) (owner : ScopeOccurrenceId) : UserTaskWait :=
  { processInstanceId := projectionParent.processInstanceId, owner,
    task := { id := ⟨name⟩, name := none }, activation := 1, output := ⟨"body-out"⟩ }

def controllerValidationState : RuntimeState :=
  { projectionEntered with variables := { projectionEntered.variables with
      process := { bindings := [⟨"items", .stringList ["INV-01", "INV-02"]⟩] } } }

def repeated_scope_state_binds_the_captured_collection : Bool := decide <|
    sequentialScopeStateValid program controllerValidationState = true

def repeated_scope_state_rejects_wrong_total_and_item : Bool := decide <|
    sequentialScopeStateValid program { controllerValidationState with sequentialScopeControllers :=
      (controllerValidationState.sequentialScopeControllers.map (fun controller => { controller with total := 3 })) } = false ∧
    sequentialScopeStateValid program { controllerValidationState with sequentialScopeControllers :=
      (controllerValidationState.sequentialScopeControllers.map (fun controller => { controller with currentItem := "other" })) } = false

def repeated_scope_state_requires_exact_controller_ownership : Bool := decide <|
    sequentialScopeStateValid program { controllerValidationState with sequentialScopeControllers := [] } = false ∧
    sequentialScopeStateValid program { controllerValidationState with sequentialScopeControllers :=
      (controllerValidationState.sequentialScopeControllers ++ controllerValidationState.sequentialScopeControllers) } = false ∧
    sequentialScopeStateValid program { controllerValidationState with sequentialScopeControllers :=
      (controllerValidationState.sequentialScopeControllers.map (fun controller =>
        { controller with id := { controller.id with activation := 2 } })) } = false

def projectionEffect (name : String) (owner : ScopeOccurrenceId) : EffectWait :=
  { processInstanceId := projectionParent.processInstanceId, owner, elementId := ⟨name⟩,
    activation := 1, descriptor := ⟨"test", "validateInvoice"⟩, arguments := [], outputMappings := [],
    output := ⟨"body-out"⟩, bpmnErrorRoute := none }
def projectionWaiting : RuntimeState :=
  { projectionEntered with
    tokens := [], waits := [projectionTask "Zulu" projectionBody,
      projectionTask "Alpha" projectionBody, projectionTask "Other" projectionParent],
    effectWaits := [projectionEffect "Validate" projectionBody, projectionEffect "OtherEffect" projectionParent] }

def repeated_scope_projection_is_empty_before_entry : Bool := decide <|
    sequentialScopeProgress? program initialState = some []

def repeated_scope_projection_refuses_missing_or_duplicate_binding : Bool := decide <|
    sequentialScopeProgress? program { projectionWaiting with sequentialScopeControllers := [] } = none ∧
    sequentialScopeProgress? program { projectionWaiting with sequentialScopeControllers :=
      projectionWaiting.sequentialScopeControllers ++ projectionWaiting.sequentialScopeControllers } = none

def dataRead (target name : String) : VariableMapping := ⟨target, .enclosingVariable name⟩

def dataEntry (inputs : List VariableMapping) : SemanticOperation :=
  .enterSequentialMultiInstanceScope ⟨"enter"⟩ (origin "Batch") ⟨"in"⟩ ⟨"body-in"⟩ ⟨"body"⟩ ⟨"out"⟩
    "items" "item" inputs (some "stop")

def dataEffect (inputs outputs : List VariableMapping) : SemanticOperation :=
  .awaitEffect ⟨"service"⟩ (origin "Validate") ⟨"body-in"⟩ ⟨"body-out"⟩
    { elementId := ⟨"Validate"⟩,
      descriptor := ⟨"urn:bpmn-lean:effect-protocol:activity-v1", "validate"⟩,
      inputMappings := inputs, outputMappings := outputs } none

def dataProgram (inputs : List VariableMapping := [dataRead "local" "seed"])
    (scope : String := "body") : Program :=
  { program with
    identity := { program.identity with semanticProfile := ⟨"cibseven-2.2.0-sequential-multi-instance-subprocess-draft"⟩ }
    operations := [dataEntry inputs, dataEffect [dataRead "a" "item", dataRead "b" "local", dataRead "c" "account"] []]
    operationScopes := [⟨⟨"enter"⟩, ⟨"root"⟩⟩, ⟨⟨"service"⟩, ⟨scope⟩⟩] }

def dataBindings : List VariableBinding :=
  [⟨"account", .null⟩, ⟨"items", .stringList ["first", "second"]⟩,
    ⟨"seed", .string "ready"⟩, ⟨"stop", .boolean false⟩]

def dataAnalysis : SequentialScopeData.Analysis :=
  { entry :=
      { id := ⟨"enter"⟩, elementId := ⟨"Batch"⟩, input := ⟨"in"⟩,
        childEntry := ⟨"body-in"⟩, childScopeId := ⟨"body"⟩, normalOutput := ⟨"out"⟩,
        collectionName := "items", itemName := "item", bodyInputs := [dataRead "local" "seed"],
        completionBooleanName := some "stop" }
    handlers := ["validate"]
    requiredProcessScalars := ["account", "seed"] }

def repeated_scope_data_rejects_protected_locals_and_typed_scalar_reads : Bool := decide <|
    (["items", "item", "stop", "validate"].all fun name =>
      (SequentialScopeData.requirements (dataProgram [dataRead name "seed"])).isNone) = true ∧
    (["items", "stop", "validate"].all fun name =>
      (SequentialScopeData.requirements (dataProgram [dataRead "local" name])).isNone) = true

def repeated_scope_body_literals_preserve_java_trim_semantics : Bool := decide <|
    SequentialScopeData.bodyMappingsValid [] [⟨"local", .stringLiteral " pending "⟩] = true ∧
    SequentialScopeData.bodyMappingsValid [] [⟨"local", .stringLiteral " pending "⟩] = true ∧
    SerialBusinessTask.mappingsValid [] [⟨"argument", .stringLiteral " pending "⟩] [] = false ∧
    SequentialScopeData.bodyMappingsValid [] [⟨"local", .stringLiteral " pending"⟩] = false ∧
    SequentialScopeData.bodyMappingsValid [] [⟨"local", .stringLiteral ""⟩] = false

def parallelBody (width : Nat) (separateEnds : Bool := false) : List StructuredParallelBody.Vertex :=
  let tasks := (List.range width).map fun index => "task" ++ toString index
  [⟨"start", .start, ["fork"]⟩, ⟨"fork", .fork, tasks⟩] ++
    tasks.mapIdx (fun index id => ⟨id, .task, [if separateEnds then "end" ++ toString index else "join"]⟩) ++
    if separateEnds then (List.range width).map fun index => ⟨"end" ++ toString index, .finish, []⟩
    else [⟨"join", .join, ["after"]⟩, ⟨"after", .task, ["end"]⟩, ⟨"end", .finish, []⟩]

def repeated_scope_parallel_bursts_count_all_armed_branches : Bool := decide <|
    StructuredParallelBody.analyze (parallelBody 2) = some ⟨3, 2, 1⟩ ∧
    StructuredParallelBody.analyze (parallelBody 2 true) = some ⟨3, 1, 1⟩ ∧
    StructuredParallelBody.analyze (parallelBody 7) = some ⟨8, 2, 1⟩ ∧
    StructuredParallelBody.analyze (parallelBody 8) = some ⟨9, 2, 1⟩

def repeated_scope_parallel_bursts_preserve_delayed_join_and_edge_multiplicity : Bool := decide <|
    StructuredParallelBody.analyze
      [⟨"start", .start, ["before"]⟩, ⟨"before", .task, ["fork"]⟩,
       ⟨"fork", .fork, ["join", "later"]⟩, ⟨"later", .task, ["join"]⟩,
       ⟨"join", .join, ["end"]⟩, ⟨"end", .finish, []⟩] = some ⟨1, 2, 2⟩ ∧
    StructuredParallelBody.analyze
      [⟨"start", .start, ["task"]⟩, ⟨"task", .task, ["fork"]⟩,
       ⟨"fork", .fork, ["join", "join"]⟩, ⟨"join", .join, ["end"]⟩,
       ⟨"end", .finish, []⟩] = some ⟨1, 3, 3⟩

def repeated_scope_parallel_topology_refuses_cycles_and_partial_joins : Bool := decide <|
    StructuredParallelBody.analyze (parallelBody 2 ++ [⟨"loop", .task, ["loop"]⟩]) = none ∧
    StructuredParallelBody.analyze ((parallelBody 3).map fun vertex =>
      if vertex.id == "task0" then { vertex with outputs := ["after"] } else vertex) = none

def controlProgram : Program :=
  { program with identity := { program.identity with semanticProfile := ⟨"cibseven-2.2.0-sequential-multi-instance-subprocess-draft"⟩ } }

def nestedParallelBody : List StructuredParallelBody.Vertex :=
  ((parallelBody 2).map fun vertex => if vertex.id == "task0" then
    { vertex with kind := .fork, outputs := ["left", "right"] } else vertex) ++
      [⟨"left", .task, ["innerJoin"]⟩, ⟨"right", .task, ["innerJoin"]⟩, ⟨"innerJoin", .join, ["join"]⟩]

def repeated_scope_parallel_analysis_is_independent_of_nested_declaration_order : Bool := decide <|
    StructuredParallelBody.analyze nestedParallelBody = some ⟨5, 3, 1⟩ ∧
    StructuredParallelBody.analyze nestedParallelBody.reverse = some ⟨5, 3, 1⟩

def repeated_scope_control_refuses_wrong_body_and_completion_ownership : Bool := decide <|
    SequentialScopeControl.analyze { controlProgram with operationScopes := controlProgram.operationScopes.map fun owner =>
      if owner.operationId.value == "task" then { owner with scopeId := ⟨"foreign"⟩ } else owner } = none ∧
    SequentialScopeControl.analyze { controlProgram with operations := controlProgram.operations.map fun operation =>
      if operation.id.value == "complete" then .completeSequentialMultiInstanceScope ⟨"complete"⟩ (origin "Batch") ⟨"other"⟩
      else operation } = none

def repeated_scope_control_graph_does_not_open_execution_admission : Bool := decide <|
    programGraphWellFormed controlProgram = true ∧
    programProfileCapabilitiesValid controlProgram = false

def repeated_scope_control_composes_entry_turnover_and_parent_continuation : Bool := decide <|
    SequentialScopeControl.analyze controlProgram = some ⟨⟨"enter"⟩, ⟨"body"⟩, 4⟩ ∧
    SequentialScopeControl.maximumBurst ⟨5, 2, 2⟩ 0 0 = 8 ∧
    SequentialScopeControl.maximumBurst ⟨6, 2, 2⟩ 0 0 = 9 ∧
    SequentialScopeControl.maximumBurst ⟨5, 2, 2⟩ 40 40 = 8

def mixedProgram : Program :=
  { controlProgram with
    identity := { controlProgram.identity with sourceOverlay := some { id := ⟨"handlers"⟩, sha256 := "private-overlay" } }
    operations := (controlProgram.operations.map fun operation => match operation with
      | .reachNoneEnd id origin _ => if id.value == "child-end" then .reachNoneEnd id origin ⟨"effect-out"⟩ else operation
      | _ => operation) ++
        [.awaitEffect ⟨"effect"⟩ (origin "Validate") ⟨"body-out"⟩ ⟨"effect-out"⟩
          { elementId := ⟨"Validate"⟩, descriptor := ⟨"urn:bpmn-lean:effect-protocol:activity-v1", "validateInvoice"⟩, inputMappings := [], outputMappings := [] } none]
    operationScopes := controlProgram.operationScopes ++ [{ operationId := ⟨"effect"⟩, scopeId := ⟨"body"⟩ }]
    controlPlaces := controlProgram.controlPlaces ++ [{ id := ⟨"effect-out"⟩, origin := { elementId := ⟨"effect-out"⟩ } }]
    controlPlaceScopes := controlProgram.controlPlaceScopes ++ [{ controlPlaceId := ⟨"effect-out"⟩, scopeId := ⟨"body"⟩ }] }

def repeated_scope_private_profile_admits_complete_mixed_body : Bool := decide <|
    programGraphWellFormed mixedProgram = true ∧
    programProfileCapabilitiesValid mixedProgram = true

def repeated_scope_private_profile_requires_overlay_and_distinct_source_ids : Bool := decide <|
    programProfileCapabilitiesValid { mixedProgram with identity := { mixedProgram.identity with sourceOverlay := none } } = false ∧
    programProfileCapabilitiesValid { mixedProgram with processId := ⟨"Review"⟩ } = false

def repeated_scope_private_profile_requires_both_body_task_kinds : Bool := decide <|
    programProfileCapabilitiesValid { mixedProgram with operations := mixedProgram.operations.map fun operation =>
      match operation with
      | .awaitEffect id origin input output _ _ =>
          .awaitUserTask id origin input output { id := ⟨origin.elementId.value⟩, name := none }
      | _ => operation } = false

def repeated_scope_start_dispatch_accepts_typed_collection : Bool := decide <|
    (admitStimulus mixedProgram initialState
      (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩ [⟨"items", .stringList ["invoice"]⟩])).outcome = .committed ∧
    (admitStimulus mixedProgram initialState
      (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩ [⟨"items", .stringList []⟩])).outcome = .committed

def repeated_scope_start_dispatch_refuses_missing_collection_and_identity : Bool := decide <|
    (admitStimulus mixedProgram initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩ [])).outcome = .rejected ∧
    (admitStimulus mixedProgram initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨""⟩ [⟨"items", .stringList []⟩])).outcome = .rejected

def canonicalProgram : Program :=
  let controlPlaces := ["body-in", "body-out", "effect-out", "incoming", "outgoing"].filterMap fun id =>
    mixedProgram.controlPlaces.find? (·.id.value == id)
  let operations := ["child-end", "complete", "effect", "end", "enter", "root-complete", "start", "task"].filterMap fun id =>
    mixedProgram.operations.find? (·.id.value == id)
  { mixedProgram with
    identity := { mixedProgram.identity with
      sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000001"
      sourceOverlay := some { id := ⟨"handlers"⟩, sha256 := "0000000000000000000000000000000000000000000000000000000000000002" } }
    definitionScopes := mixedProgram.definitionScopes.reverse
    controlPlaces, operations
    operationScopes := operations.filterMap fun operation => mixedProgram.operationScopes.find? (·.operationId == operation.id)
    controlPlaceScopes := controlPlaces.filterMap fun place => mixedProgram.controlPlaceScopes.find? (·.controlPlaceId == place.id) }

def repeated_scope_canonical_program_is_structurally_admitted : Bool := decide <|
    programWellFormed canonicalProgram = true ∧
    programProfileCapabilitiesValid canonicalProgram = true

def repeatedScenario : Scenario :=
  { kind := .scenario, id := ⟨"invoice-batch"⟩, profile := canonicalProgram.identity.semanticProfile
    bpmn := {
      id := canonicalProgram.identity.sourceId, relativePath := "invoice-batch.bpmn"
      sha256 := canonicalProgram.identity.sourceSha256, sourceOverlay := canonicalProgram.identity.sourceOverlay }
    stimuli := [.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩ [⟨"items", .stringList ["invoice"]⟩]]
    observations := [.deployment, .commandResults, .processStatus, .activeWaits, .openUserTasks,
      .openTimers, .openEffects, .openMultiInstances, .variables, .enabledInteractions, .logicalTime]
    provenance := { normativeRefs := [], cibRevision := "2.2.0", cibRefs := [] } }

def repeated_scope_scenario_requires_progress_observation_and_start_data : Bool := decide <|
    supportsScenario canonicalProgram repeatedScenario = true ∧
    supportsScenario canonicalProgram { repeatedScenario with
      observations := repeatedScenario.observations.filter (· != .openMultiInstances) } = false ∧
    supportsScenario canonicalProgram { repeatedScenario with
      stimuli := [.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩ []] } = false

def checkedSource : CheckedProcess :=
  let nodes : List CheckedNode :=
    [.sequentialMultiInstanceSubProcess ⟨"Batch"⟩ ⟨"body"⟩ "items" "item" [] none,
     .noneStartEvent ⟨"BodyStart"⟩, .noneEndEvent ⟨"ChildEnd"⟩, .noneEndEvent ⟨"End"⟩,
     .userTask ⟨"Review"⟩ none none, .noneStartEvent ⟨"Start"⟩,
     .serviceTask ⟨"Validate"⟩ ⟨"urn:bpmn-lean:effect-protocol:activity-v1", "validateInvoice"⟩ [] [] none]
  { identity := {
      semanticProfile := canonicalProgram.identity.semanticProfile
      sourceId := canonicalProgram.identity.sourceId, sourceSha256 := canonicalProgram.identity.sourceSha256,
      sourceOverlay := canonicalProgram.identity.sourceOverlay }
    processId := ⟨"P"⟩, definitionScopes := canonicalProgram.definitionScopes
    nodes
    nodeScopes := nodes.map fun node =>
      { nodeId := node.id
        scopeId := ⟨if ["BodyStart", "ChildEnd", "Review", "Validate"].contains node.id.value then "body" else "root"⟩ }
    sequenceFlows := [⟨⟨"body-in"⟩, ⟨"BodyStart"⟩, ⟨"Review"⟩, none⟩,
      ⟨⟨"body-out"⟩, ⟨"Review"⟩, ⟨"Validate"⟩, none⟩,
      ⟨⟨"effect-out"⟩, ⟨"Validate"⟩, ⟨"ChildEnd"⟩, none⟩,
      ⟨⟨"incoming"⟩, ⟨"Start"⟩, ⟨"Batch"⟩, none⟩, ⟨⟨"outgoing"⟩, ⟨"Batch"⟩, ⟨"End"⟩, none⟩]
    sequenceFlowScopes := canonicalProgram.controlPlaceScopes.map fun owner =>
      { sequenceFlowId := ⟨owner.controlPlaceId.value⟩, scopeId := owner.scopeId } }

def repeated_scope_checked_source_admission_reaches_valid_lowering : Bool := decide <|
    checkedWellFormed checkedSource = true ∧
    programWellFormed (lowerCheckedProcess checkedSource) = true ∧
    programProfileCapabilitiesValid (lowerCheckedProcess checkedSource) = true

def parentServiceSource : CheckedProcess :=
  { checkedSource with
    nodes := checkedSource.nodes ++ [.serviceTask ⟨"Publish"⟩
      ⟨"urn:bpmn-lean:effect-protocol:activity-v1", "publishBatch"⟩ [] [] none]
    nodeScopes := checkedSource.nodeScopes ++ [{ nodeId := ⟨"Publish"⟩, scopeId := ⟨"root"⟩ }]
    sequenceFlows := (checkedSource.sequenceFlows.map fun flow =>
      if flow.id.value == "outgoing" then { flow with targetId := ⟨"Publish"⟩ } else flow) ++
      [⟨⟨"publish-out"⟩, ⟨"Publish"⟩, ⟨"End"⟩, none⟩]
    sequenceFlowScopes := checkedSource.sequenceFlowScopes ++ [{ sequenceFlowId := ⟨"publish-out"⟩, scopeId := ⟨"root"⟩ }] }

def repeated_scope_checked_analysis_requires_mixed_body_not_parent_service : Bool := decide <|
    (SequentialScopeChecked.analyze parentServiceSource).isSome = true ∧
    SequentialScopeChecked.analyze { parentServiceSource with nodes := parentServiceSource.nodes.map fun node =>
      if node.id.value == "Validate" then CheckedNode.userTask node.id none none else node } = none

def repeated_scope_checked_analysis_rejects_protected_mappings_and_foreign_ownership : Bool := decide <|
    SequentialScopeChecked.analyze { checkedSource with nodes := checkedSource.nodes.map fun node => match node with
      | .sequentialMultiInstanceSubProcess id scope collection item _ condition =>
          .sequentialMultiInstanceSubProcess id scope collection item [⟨item, .enclosingVariable "seed"⟩] condition
      | _ => node } = none ∧
    SequentialScopeChecked.analyze { checkedSource with nodeScopes := checkedSource.nodeScopes.map fun owner =>
      if owner.nodeId.value == "Validate" then { owner with scopeId := ⟨"foreign"⟩ } else owner } = none

def repeated_scope_checked_analysis_ignores_declaration_order : Bool := decide <|
    SequentialScopeChecked.analyze { checkedSource with
      nodes := checkedSource.nodes.reverse, nodeScopes := checkedSource.nodeScopes.reverse,
      sequenceFlows := checkedSource.sequenceFlows.reverse } = SequentialScopeChecked.analyze checkedSource

def delayedJoinProgram : Program :=
  let changed := canonicalProgram.operations.map fun operation => match operation with
    | .enterSequentialMultiInstanceScope id origin input childEntry scope output collection item _ condition =>
        .enterSequentialMultiInstanceScope id origin input childEntry scope output collection item
          [⟨"status", .enclosingVariable "seed"⟩] condition
    | .awaitUserTask id origin _ output task => .awaitUserTask id origin ⟨"task-in"⟩ output task
    | .awaitEffect id origin _ output effect route =>
        .awaitEffect id origin ⟨"effect-in"⟩ output
          { effect with outputMappings := [⟨"audit", .localVariable "result"⟩, ⟨"status", .localVariable "result"⟩] } route
    | .reachNoneEnd id origin input =>
        .reachNoneEnd id origin (if id.value == "child-end" then ⟨"join-out"⟩ else input)
    | _ => operation
  let added : List SemanticOperation := [.duplicate ⟨"fork"⟩ (origin "Fork") ⟨"body-in"⟩ [⟨"effect-in"⟩, ⟨"task-in"⟩],
    .synchronize ⟨"join"⟩ (origin "Join") [⟨"body-out"⟩, ⟨"effect-out"⟩] ⟨"join-out"⟩]
  let operations := ["child-end", "complete", "effect", "end", "enter", "fork", "join", "root-complete", "start", "task"].filterMap
    fun id => (changed ++ added).find? (·.id.value == id)
  let places := ["body-in", "body-out", "effect-in", "effect-out", "incoming", "join-out", "outgoing", "task-in"]
  { canonicalProgram with
    operations := operations
    operationScopes := operations.map fun operation =>
      { operationId := operation.id
        scopeId := ⟨if ["end", "enter", "root-complete", "start"].contains operation.id.value then "root" else "body"⟩ }
    controlPlaces := places.map fun id => { id := ⟨id⟩, origin := { elementId := ⟨id⟩ } }
    controlPlaceScopes := places.map fun id =>
      { controlPlaceId := ⟨id⟩, scopeId := ⟨if ["incoming", "outgoing"].contains id then "root" else "body"⟩ } }

def delayedJoinStart : Stimulus :=
  .startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩
    [⟨"items", .stringList ["first", "second"]⟩, ⟨"seed", .string "initial"⟩]

def delayedJoinEffect : Stimulus :=
  .completeEffect ⟨"complete-effect"⟩ ⟨⟨"instance"⟩, ⟨"Validate"⟩, 1⟩ (.success [⟨"result", .null⟩])

def delayedJoinHuman : Stimulus :=
  .completeUserTaskInstance ⟨"complete-review"⟩ ⟨⟨"instance"⟩, ⟨"Review"⟩, 1⟩ []

def delayedJoinStarted := applyStimulus scenarioClosureLimit delayedJoinProgram initialState delayedJoinStart
def delayedJoinArrived := applyStimulus scenarioClosureLimit delayedJoinProgram delayedJoinStarted.state delayedJoinEffect
def delayedJoinTurnedOver := applyStimulus scenarioClosureLimit delayedJoinProgram delayedJoinArrived.state delayedJoinHuman

def delayed_join_origin_alias_requires_full_profile_admission : Bool := decide <|
    let aliased := { delayedJoinProgram with controlPlaces := delayedJoinProgram.controlPlaces.map fun place =>
      if place.id.value == "effect-out" then { place with origin := { elementId := ⟨"body-out"⟩ } } else place }
    programWellFormed aliased = true ∧
      SequentialScopeControl.analyze aliased = some ⟨⟨"enter"⟩, ⟨"body"⟩, 6⟩ ∧
      SequentialScopeProgram.admitted aliased = false ∧ programProjectionBindingsValid aliased = false

def delayedJoinEntry : SequentialScopeEntry :=
  ⟨⟨"enter"⟩, ⟨"Batch"⟩, ⟨"incoming"⟩, ⟨"body-in"⟩, ⟨"body"⟩, ⟨"outgoing"⟩,
    "items", "item", [⟨"status", .enclosingVariable "seed"⟩], none⟩

def delayedJoinEntered : RuntimeState :=
  let raw := (admitStimulus delayedJoinProgram initialState delayedJoinStart).state
  let initiated := (fire? delayedJoinProgram (.initiate ⟨"start"⟩ (origin "Start") ⟨"incoming"⟩) raw).getD raw
  ((enterSequentialScopeResult? delayedJoinEntry initiated ⟨⟨"instance"⟩, ⟨"root"⟩, 1⟩).map (·.state)).getD initiated

def delayed_join_earlier_completion_leaves_its_owned_arrival : Bool := decide <|
    delayedJoinArrived.outcome = .committed ∧
      delayedJoinArrived.state.tokens = [⟨⟨"effect-out"⟩, ⟨⟨"instance"⟩, ⟨"body"⟩, 1⟩⟩] ∧
      delayedJoinArrived.state.waits.length = 1 ∧ delayedJoinArrived.state.effectWaits = []

def delayedJoinQuietBody : RuntimeState :=
  let completed := (admitStimulus delayedJoinProgram delayedJoinArrived.state delayedJoinHuman).state
  let joined := (fire? delayedJoinProgram
    (.synchronize ⟨"join"⟩ (origin "Join") [⟨"body-out"⟩, ⟨"effect-out"⟩] ⟨"join-out"⟩) completed).getD completed
  (fire? delayedJoinProgram (.reachNoneEnd ⟨"child-end"⟩ (origin "ChildEnd") ⟨"join-out"⟩) joined).getD joined

def delayed_join_runtime_validity_alone_permits_reused_body_identity : Bool := decide <|
    let stale := { delayedJoinQuietBody with scopeActivations := [] }
    let old : ScopeOccurrenceId := ⟨⟨"instance"⟩, ⟨"body"⟩, 1⟩
    let after := ((completeSequentialScopeResult? delayedJoinEntry stale).map (·.state)).getD stale
    runtimeStateWellFormed delayedJoinProgram ⟨"instance"⟩ stale = true ∧
      scopeQuiescent stale old = true ∧ scopeActivationCount stale delayedJoinEntry.childScopeId = 0 ∧
      completeSequentialScopeResult? delayedJoinEntry stale = some (.next old after) ∧
      after.scopeOccurrences.any (fun occurrence => occurrence.id == old) = true ∧
      continuationMarking after old delayedJoinEntry.childEntry = 1

def delayed_join_last_completion_turns_over_with_fresh_waits_and_locals : Bool := decide <|
    delayedJoinTurnedOver.outcome = .committed ∧
      delayedJoinTurnedOver.state.waits.map (·.activation) = [2] ∧
      delayedJoinTurnedOver.state.effectWaits.map (·.activation) = [2] ∧
      delayedJoinTurnedOver.state.variables.scopes.map (fun scope => (scope.owner.activation, scope.bindings)) =
        [(2, [⟨"status", .string "initial"⟩])] ∧
      delayedJoinTurnedOver.state.variables.process.bindings.find? (·.name == "audit") = some ⟨"audit", .null⟩

def delayed_join_runtime_validity_survives_waits_and_turnover : Bool := decide <|
    runtimeStateWellFormed delayedJoinProgram ⟨"instance"⟩ delayedJoinStarted.state = true ∧
      runtimeStateWellFormed delayedJoinProgram ⟨"instance"⟩ delayedJoinArrived.state = true ∧
      runtimeStateWellFormed delayedJoinProgram ⟨"instance"⟩ delayedJoinTurnedOver.state = true

def delayed_join_missing_and_extra_service_results_refuse_without_mutation : Bool := decide <|
    let missing := applyStimulus scenarioClosureLimit delayedJoinProgram delayedJoinStarted.state
      (.completeEffect ⟨"missing"⟩ ⟨⟨"instance"⟩, ⟨"Validate"⟩, 1⟩ (.success []))
    let extra := applyStimulus scenarioClosureLimit delayedJoinProgram delayedJoinStarted.state
      (.completeEffect ⟨"extra"⟩ ⟨⟨"instance"⟩, ⟨"Validate"⟩, 1⟩
        (.success [⟨"extra", .null⟩, ⟨"result", .null⟩]))
    missing.outcome = .rejected ∧ missing.state = delayedJoinStarted.state ∧
      extra.outcome = .rejected ∧ extra.state = delayedJoinStarted.state

def delayed_join_old_body_commands_refuse_after_turnover : Bool := decide <|
    let human := applyStimulus scenarioClosureLimit delayedJoinProgram delayedJoinTurnedOver.state delayedJoinHuman
    let effect := applyStimulus scenarioClosureLimit delayedJoinProgram delayedJoinTurnedOver.state delayedJoinEffect
    human.outcome = .rejected ∧ human.state = delayedJoinTurnedOver.state ∧
      effect.outcome = .rejected ∧ effect.state = delayedJoinTurnedOver.state

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("not_started_refuses_injected_scope_controller", not_started_refuses_injected_scope_controller),
  ("scope_controller_requires_a_matching_declaration", scope_controller_requires_a_matching_declaration),
  ("scope_controller_requires_a_unique_declaration", scope_controller_requires_a_unique_declaration),
  ("scope_controller_declaration_ignores_unrelated_operations", scope_controller_declaration_ignores_unrelated_operations),
  ("repeated_scope_state_binds_the_captured_collection", repeated_scope_state_binds_the_captured_collection),
  ("repeated_scope_state_rejects_wrong_total_and_item", repeated_scope_state_rejects_wrong_total_and_item),
  ("repeated_scope_state_requires_exact_controller_ownership", repeated_scope_state_requires_exact_controller_ownership),
  ("repeated_scope_projection_is_empty_before_entry", repeated_scope_projection_is_empty_before_entry),
  ("repeated_scope_projection_refuses_missing_or_duplicate_binding", repeated_scope_projection_refuses_missing_or_duplicate_binding),
  ("repeated_scope_data_rejects_protected_locals_and_typed_scalar_reads", repeated_scope_data_rejects_protected_locals_and_typed_scalar_reads),
  ("repeated_scope_body_literals_preserve_java_trim_semantics", repeated_scope_body_literals_preserve_java_trim_semantics),
  ("repeated_scope_parallel_bursts_count_all_armed_branches", repeated_scope_parallel_bursts_count_all_armed_branches),
  ("repeated_scope_parallel_bursts_preserve_delayed_join_and_edge_multiplicity", repeated_scope_parallel_bursts_preserve_delayed_join_and_edge_multiplicity),
  ("repeated_scope_parallel_topology_refuses_cycles_and_partial_joins", repeated_scope_parallel_topology_refuses_cycles_and_partial_joins),
  ("repeated_scope_parallel_analysis_is_independent_of_nested_declaration_order", repeated_scope_parallel_analysis_is_independent_of_nested_declaration_order),
  ("repeated_scope_control_refuses_wrong_body_and_completion_ownership", repeated_scope_control_refuses_wrong_body_and_completion_ownership),
  ("repeated_scope_control_graph_does_not_open_execution_admission", repeated_scope_control_graph_does_not_open_execution_admission),
  ("repeated_scope_control_composes_entry_turnover_and_parent_continuation", repeated_scope_control_composes_entry_turnover_and_parent_continuation),
  ("repeated_scope_private_profile_admits_complete_mixed_body", repeated_scope_private_profile_admits_complete_mixed_body),
  ("repeated_scope_private_profile_requires_overlay_and_distinct_source_ids", repeated_scope_private_profile_requires_overlay_and_distinct_source_ids),
  ("repeated_scope_private_profile_requires_both_body_task_kinds", repeated_scope_private_profile_requires_both_body_task_kinds),
  ("repeated_scope_start_dispatch_accepts_typed_collection", repeated_scope_start_dispatch_accepts_typed_collection),
  ("repeated_scope_start_dispatch_refuses_missing_collection_and_identity", repeated_scope_start_dispatch_refuses_missing_collection_and_identity),
  ("repeated_scope_canonical_program_is_structurally_admitted", repeated_scope_canonical_program_is_structurally_admitted),
  ("repeated_scope_scenario_requires_progress_observation_and_start_data", repeated_scope_scenario_requires_progress_observation_and_start_data),
  ("repeated_scope_checked_source_admission_reaches_valid_lowering", repeated_scope_checked_source_admission_reaches_valid_lowering),
  ("repeated_scope_checked_analysis_requires_mixed_body_not_parent_service", repeated_scope_checked_analysis_requires_mixed_body_not_parent_service),
  ("repeated_scope_checked_analysis_rejects_protected_mappings_and_foreign_ownership", repeated_scope_checked_analysis_rejects_protected_mappings_and_foreign_ownership),
  ("repeated_scope_checked_analysis_ignores_declaration_order", repeated_scope_checked_analysis_ignores_declaration_order),
  ("delayed_join_origin_alias_requires_full_profile_admission", delayed_join_origin_alias_requires_full_profile_admission),
  ("delayed_join_earlier_completion_leaves_its_owned_arrival", delayed_join_earlier_completion_leaves_its_owned_arrival),
  ("delayed_join_runtime_validity_alone_permits_reused_body_identity", delayed_join_runtime_validity_alone_permits_reused_body_identity),
  ("delayed_join_last_completion_turns_over_with_fresh_waits_and_locals", delayed_join_last_completion_turns_over_with_fresh_waits_and_locals),
  ("delayed_join_runtime_validity_survives_waits_and_turnover", delayed_join_runtime_validity_survives_waits_and_turnover),
  ("delayed_join_missing_and_extra_service_results_refuse_without_mutation", delayed_join_missing_and_extra_service_results_refuse_without_mutation),
  ("delayed_join_old_body_commands_refuse_after_turnover", delayed_join_old_body_commands_refuse_after_turnover)
]

end BpmnSemantics.SequentialScopeGraphConformance
