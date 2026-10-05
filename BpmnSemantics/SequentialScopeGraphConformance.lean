import BpmnSemantics.SemanticProcess.GraphValidation
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.SequentialScopeObservation
import BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import BpmnSemantics.SemanticProcess.StructuredParallelBodyAdmission
import BpmnSemantics.SemanticProcess.SequentialScopeControlAdmission
import BpmnSemantics.SemanticProcess.CommandAdmission
import BpmnSemantics.SemanticProcess.ScenarioAdmission
import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.Lowering

/-! SMIS-ADMIT-01: a repeated body has one paired completion and cannot choose another scope's continuation. -/

namespace BpmnSemantics.SequentialScopeGraphConformance

open SemanticProcess

private def origin (value : String) : BpmnElementOrigin := { elementId := ⟨value⟩ }

private def operations : List SemanticOperation :=
  [ .initiate ⟨"start"⟩ (origin "Start") ⟨"incoming"⟩
  , .enterSequentialMultiInstanceScope ⟨"enter"⟩ (origin "Batch")
      ⟨"incoming"⟩ ⟨"body-in"⟩ ⟨"body"⟩ ⟨"outgoing"⟩ "items" "item" [] none
  , .awaitUserTask ⟨"task"⟩ (origin "Review") ⟨"body-in"⟩ ⟨"body-out"⟩ { id := ⟨"Review"⟩, name := none }
  , .reachNoneEnd ⟨"child-end"⟩ (origin "ChildEnd") ⟨"body-out"⟩
  , .completeSequentialMultiInstanceScope ⟨"complete"⟩ (origin "Batch") ⟨"enter"⟩
  , .reachNoneEnd ⟨"end"⟩ (origin "End") ⟨"outgoing"⟩
  , .completeScope ⟨"root-complete"⟩ (origin "P") ⟨"root"⟩ none ]

private def places : List String := ["incoming", "outgoing", "body-in", "body-out"]

private def program : Program :=
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

private def replacing (id : String) (replacement : SemanticOperation) : Program :=
  { program with operations := operations.map fun operation => if operation.id.value == id then replacement else operation }

theorem paired_repeated_scope_graph_is_admitted : programGraphWellFormed program = true := by decide +kernel

theorem paired_graph_admission_is_declaration_order_independent : programGraphWellFormed { program with
    operations := operations.reverse
    operationScopes := program.operationScopes.reverse } = true := by decide +kernel

theorem completion_rejects_non_entry_binding : programGraphWellFormed (replacing "complete"
    (.completeSequentialMultiInstanceScope ⟨"complete"⟩ (origin "Batch") ⟨"start"⟩)) = false := by decide +kernel

theorem completion_rejects_a_different_activity_origin : programGraphWellFormed (replacing "complete"
    (.completeSequentialMultiInstanceScope ⟨"complete"⟩ (origin "OtherBatch") ⟨"enter"⟩)) = false := by decide +kernel

theorem entry_rejects_a_child_owned_parent_continuation : programGraphWellFormed (replacing "enter"
    (.enterSequentialMultiInstanceScope ⟨"enter"⟩ (origin "Batch")
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
    operations := operations ++ [.completeSequentialMultiInstanceScope ⟨"duplicate"⟩ (origin "Batch") ⟨"enter"⟩],
    operationScopes := program.operationScopes ++ [{ operationId := ⟨"duplicate"⟩, scopeId := ⟨"body"⟩ }] } = false := by decide +kernel

private def injectedScopeControllerState : RuntimeState :=
  { initialState with sequentialScopeControllers := [{
    id := { processInstanceId := ⟨"P-instance"⟩, activityElementId := ⟨"Batch"⟩, activation := 1 }
    total := 2, completed := 0, currentItem := "invoice" }] }

private def scopeEntry (element : String) : SemanticOperation :=
  .enterSequentialMultiInstanceScope ⟨"enter-batch"⟩ { elementId := ⟨element⟩ }
    ⟨"incoming"⟩ ⟨"body-in"⟩ ⟨"body"⟩ ⟨"outgoing"⟩ "items" "item" [] none

theorem not_started_refuses_injected_scope_controller :
    notStartedStateEmpty injectedScopeControllerState = false := by decide +kernel

theorem scope_controller_requires_a_matching_declaration :
    hiddenRecordDeclarationsValid { program with operations := [] } injectedScopeControllerState = false ∧
    hiddenRecordDeclarationsValid { program with
      operations := [scopeEntry "Other"] } injectedScopeControllerState = false := by decide +kernel

theorem scope_controller_requires_a_unique_declaration :
    hiddenRecordDeclarationsValid { program with
      operations := [scopeEntry "Batch", scopeEntry "Batch"] }
      injectedScopeControllerState = false := by decide +kernel

theorem scope_controller_declaration_ignores_unrelated_operations :
    hiddenRecordDeclarationsValid { program with
      operations := [scopeEntry "Other", scopeEntry "Batch"] }
      injectedScopeControllerState = true := by decide +kernel

private def projectionParent : ScopeOccurrenceId := ⟨⟨"invoice-batch"⟩, ⟨"root"⟩, 1⟩
private def projectionBody : ScopeOccurrenceId := ⟨projectionParent.processInstanceId, ⟨"body"⟩, 1⟩
private def projectionEntered : RuntimeState :=
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
private def projectionTask (name : String) (owner : ScopeOccurrenceId) : UserTaskWait :=
  { processInstanceId := projectionParent.processInstanceId, owner,
    task := { id := ⟨name⟩, name := none }, activation := 1, output := ⟨"body-out"⟩ }

private def controllerValidationState : RuntimeState :=
  { projectionEntered with variables := { projectionEntered.variables with
      process := { bindings := [⟨"items", .stringList ["INV-01", "INV-02"]⟩] } } }

theorem repeated_scope_state_binds_the_captured_collection :
    sequentialScopeStateValid program controllerValidationState = true := by decide +kernel

theorem repeated_scope_state_rejects_wrong_total_and_item :
    sequentialScopeStateValid program { controllerValidationState with sequentialScopeControllers :=
      (controllerValidationState.sequentialScopeControllers.map (fun controller => { controller with total := 3 })) } = false ∧
    sequentialScopeStateValid program { controllerValidationState with sequentialScopeControllers :=
      (controllerValidationState.sequentialScopeControllers.map (fun controller => { controller with currentItem := "other" })) } = false := by decide +kernel

theorem repeated_scope_state_requires_exact_controller_ownership :
    sequentialScopeStateValid program { controllerValidationState with sequentialScopeControllers := [] } = false ∧
    sequentialScopeStateValid program { controllerValidationState with sequentialScopeControllers :=
      (controllerValidationState.sequentialScopeControllers ++ controllerValidationState.sequentialScopeControllers) } = false ∧
    sequentialScopeStateValid program { controllerValidationState with sequentialScopeControllers :=
      (controllerValidationState.sequentialScopeControllers.map (fun controller =>
        { controller with id := { controller.id with activation := 2 } })) } = false := by decide +kernel

private def projectionEffect (name : String) (owner : ScopeOccurrenceId) : EffectWait :=
  { processInstanceId := projectionParent.processInstanceId, owner, elementId := ⟨name⟩,
    activation := 1, descriptor := ⟨"test", "validateInvoice"⟩, arguments := [], outputMappings := [],
    output := ⟨"body-out"⟩, bpmnErrorRoute := none }
private def projectionWaiting : RuntimeState :=
  { projectionEntered with
    tokens := [], waits := [projectionTask "Zulu" projectionBody,
      projectionTask "Alpha" projectionBody, projectionTask "Other" projectionParent],
    effectWaits := [projectionEffect "Validate" projectionBody, projectionEffect "OtherEffect" projectionParent] }

theorem repeated_scope_projection_publishes_exact_body_membership :
    sequentialScopeProgress? program projectionWaiting = some [{
      id := ⟨projectionParent.processInstanceId, ⟨"Batch"⟩, 1⟩,
      plannedInstanceCount := 2, pendingItemCount := 1, numberOfInstances := 1,
      numberOfActiveInstances := 1, numberOfCompletedInstances := 0, numberOfTerminatedInstances := 0,
      activeIterations := [{
        loopCounter := 0, body := projectionBody,
        item := ⟨"item", .string "INV-01"⟩, bindings := [⟨"status", .null⟩],
        userTaskIds := [⟨projectionParent.processInstanceId, ⟨"Alpha"⟩, 1⟩,
          ⟨projectionParent.processInstanceId, ⟨"Zulu"⟩, 1⟩], effectIds := [⟨projectionParent.processInstanceId, ⟨"Validate"⟩, 1⟩] }] }] := by cbv

theorem repeated_scope_projection_is_empty_before_entry :
    sequentialScopeProgress? program initialState = some [] := by decide +kernel

theorem repeated_scope_projection_refuses_missing_or_duplicate_binding :
    sequentialScopeProgress? program { projectionWaiting with sequentialScopeControllers := [] } = none ∧
    sequentialScopeProgress? program { projectionWaiting with sequentialScopeControllers :=
      projectionWaiting.sequentialScopeControllers ++ projectionWaiting.sequentialScopeControllers } = none := by decide +kernel

theorem repeated_scope_projection_refuses_duplicate_or_foreign_interactions :
    sequentialScopeProgress? program { projectionWaiting with waits :=
      [projectionTask "Alpha" projectionBody, projectionTask "Alpha" projectionBody] } = none ∧
    sequentialScopeProgress? program { projectionWaiting with waits :=
      [{ projectionTask "Alpha" projectionBody with processInstanceId := ⟨"foreign"⟩ }] } = none := by cbv

private def dataRead (target name : String) : VariableMapping := ⟨target, .enclosingVariable name⟩

private def dataEntry (inputs : List VariableMapping) : SemanticOperation :=
  .enterSequentialMultiInstanceScope ⟨"enter"⟩ (origin "Batch") ⟨"in"⟩ ⟨"body-in"⟩ ⟨"body"⟩ ⟨"out"⟩
    "items" "item" inputs (some "stop")

private def dataEffect (inputs outputs : List VariableMapping) : SemanticOperation :=
  .awaitEffect ⟨"service"⟩ (origin "Validate") ⟨"body-in"⟩ ⟨"body-out"⟩
    { elementId := ⟨"Validate"⟩,
      descriptor := ⟨"urn:bpmn-lean:effect-protocol:activity-v1", "validate"⟩,
      inputMappings := inputs, outputMappings := outputs } none

private def dataProgram (inputs : List VariableMapping := [dataRead "local" "seed"])
    (scope : String := "body") : Program :=
  { program with
    identity := { program.identity with semanticProfile := ⟨"cibseven-2.2.0-sequential-multi-instance-subprocess-draft"⟩ }
    operations := [dataEntry inputs, dataEffect [dataRead "a" "item", dataRead "b" "local", dataRead "c" "account"] []]
    operationScopes := [⟨⟨"enter"⟩, ⟨"root"⟩⟩, ⟨⟨"service"⟩, ⟨scope⟩⟩] }

private def dataBindings : List VariableBinding :=
  [⟨"account", .null⟩, ⟨"items", .stringList ["first", "second"]⟩,
    ⟨"seed", .string "ready"⟩, ⟨"stop", .boolean false⟩]

private def dataAnalysis : SequentialScopeData.Analysis :=
  { entry :=
      { id := ⟨"enter"⟩, elementId := ⟨"Batch"⟩, input := ⟨"in"⟩,
        childEntry := ⟨"body-in"⟩, childScopeId := ⟨"body"⟩, normalOutput := ⟨"out"⟩,
        collectionName := "items", itemName := "item", bodyInputs := [dataRead "local" "seed"],
        completionBooleanName := some "stop" }
    handlers := ["validate"]
    requiredProcessScalars := ["account", "seed"] }

private theorem dataAnalysis_computed : SequentialScopeData.analyze dataProgram = some dataAnalysis := by
  have raw : SequentialScopeData.requirements dataProgram =
      some { dataAnalysis with requiredProcessScalars := ["seed", "account"] } := by decide +kernel
  simp only [SequentialScopeData.analyze, raw, Option.map_some]
  have sorted : (["seed", "account"] : List String).mergeSort (fun a b => a ≤ b) = ["account", "seed"] := by
    simp [List.mergeSort, List.MergeSort.Internal.splitInTwo]
  simp only [sorted, dataAnalysis]

theorem repeated_scope_data_distinguishes_initialization_from_body_reads :
    ((SequentialScopeData.analyze dataProgram).map (·.requiredProcessScalars)) = some ["account", "seed"] ∧
    ((SequentialScopeData.analyze (dataProgram [dataRead "local" "local"])).map (·.requiredProcessScalars)) = some ["account", "local"] ∧
    ((SequentialScopeData.analyze (dataProgram [dataRead "local" "item"])).map (·.requiredProcessScalars)) = some ["account", "item"] ∧
    ((SequentialScopeData.analyze (dataProgram [dataRead "local" "seed"] "root")).map (·.requiredProcessScalars)) = some ["account", "item", "local", "seed"] := by
  refine ⟨?_, ?_, ?_, ?_⟩
  · rw [dataAnalysis_computed]; rfl
  · have raw : SequentialScopeData.requirements (dataProgram [dataRead "local" "local"]) =
        some { dataAnalysis with
          entry := { dataAnalysis.entry with bodyInputs := [dataRead "local" "local"] },
          requiredProcessScalars := ["local", "account"] } := by decide +kernel
    simp only [SequentialScopeData.analyze, raw, Option.map_some]
    simp [List.mergeSort, List.MergeSort.Internal.splitInTwo]
  · have raw : SequentialScopeData.requirements (dataProgram [dataRead "local" "item"]) =
        some { dataAnalysis with
          entry := { dataAnalysis.entry with bodyInputs := [dataRead "local" "item"] },
          requiredProcessScalars := ["item", "account"] } := by decide +kernel
    simp only [SequentialScopeData.analyze, raw, Option.map_some]
    simp [List.mergeSort, List.MergeSort.Internal.splitInTwo]
  · have raw : SequentialScopeData.requirements (dataProgram [dataRead "local" "seed"] "root") =
        some { dataAnalysis with requiredProcessScalars := ["seed", "item", "local", "account"] } := by decide +kernel
    simp only [SequentialScopeData.analyze, raw, Option.map_some]
    simp [List.mergeSort, List.MergeSort.Internal.splitInTwo]

theorem repeated_scope_start_requires_pre_entry_data_and_accepts_present_null :
    SequentialScopeData.startAdmitted dataProgram dataBindings = true ∧
    SequentialScopeData.startAdmitted dataProgram (dataBindings.filter (·.name != "account")) = false ∧
    SequentialScopeData.startAdmitted dataProgram (dataBindings.filter (·.name != "stop")) = false ∧
    SequentialScopeData.startAdmitted dataProgram dataBindings.reverse = false := by
  simp only [SequentialScopeData.startAdmitted, dataAnalysis_computed]
  decide +kernel

theorem repeated_scope_data_rejects_protected_locals_and_typed_scalar_reads :
    (["items", "item", "stop", "validate"].all fun name =>
      (SequentialScopeData.requirements (dataProgram [dataRead name "seed"])).isNone) = true ∧
    (["items", "stop", "validate"].all fun name =>
      (SequentialScopeData.requirements (dataProgram [dataRead "local" name])).isNone) = true := by decide +kernel

theorem repeated_scope_body_literals_preserve_java_trim_semantics :
    SequentialScopeData.bodyMappingsValid [] [⟨"local", .stringLiteral " pending "⟩] = true ∧
    SequentialScopeData.bodyMappingsValid [] [⟨"local", .stringLiteral " pending "⟩] = true ∧
    SerialBusinessTask.mappingsValid [] [⟨"argument", .stringLiteral " pending "⟩] [] = false ∧
    SequentialScopeData.bodyMappingsValid [] [⟨"local", .stringLiteral " pending"⟩] = false ∧
    SequentialScopeData.bodyMappingsValid [] [⟨"local", .stringLiteral ""⟩] = false := by decide +kernel

private def parallelBody (width : Nat) (separateEnds : Bool := false) : List StructuredParallelBody.Vertex :=
  let tasks := (List.range width).map fun index => "task" ++ toString index
  [⟨"start", .start, ["fork"]⟩, ⟨"fork", .fork, tasks⟩] ++
    tasks.mapIdx (fun index id => ⟨id, .task, [if separateEnds then "end" ++ toString index else "join"]⟩) ++
    if separateEnds then (List.range width).map fun index => ⟨"end" ++ toString index, .finish, []⟩
    else [⟨"join", .join, ["after"]⟩, ⟨"after", .task, ["end"]⟩, ⟨"end", .finish, []⟩]

theorem repeated_scope_parallel_bursts_count_all_armed_branches :
    StructuredParallelBody.analyze (parallelBody 2) = some ⟨3, 2, 1⟩ ∧
    StructuredParallelBody.analyze (parallelBody 2 true) = some ⟨3, 1, 1⟩ ∧
    StructuredParallelBody.analyze (parallelBody 7) = some ⟨8, 2, 1⟩ ∧
    StructuredParallelBody.analyze (parallelBody 8) = some ⟨9, 2, 1⟩ := by decide +kernel

theorem repeated_scope_parallel_bursts_preserve_delayed_join_and_edge_multiplicity :
    StructuredParallelBody.analyze
      [⟨"start", .start, ["before"]⟩, ⟨"before", .task, ["fork"]⟩,
       ⟨"fork", .fork, ["join", "later"]⟩, ⟨"later", .task, ["join"]⟩,
       ⟨"join", .join, ["end"]⟩, ⟨"end", .finish, []⟩] = some ⟨1, 2, 2⟩ ∧
    StructuredParallelBody.analyze
      [⟨"start", .start, ["task"]⟩, ⟨"task", .task, ["fork"]⟩,
       ⟨"fork", .fork, ["join", "join"]⟩, ⟨"join", .join, ["end"]⟩,
       ⟨"end", .finish, []⟩] = some ⟨1, 3, 3⟩ := by decide +kernel

theorem repeated_scope_parallel_topology_refuses_cycles_and_partial_joins :
    StructuredParallelBody.analyze (parallelBody 2 ++ [⟨"loop", .task, ["loop"]⟩]) = none ∧
    StructuredParallelBody.analyze ((parallelBody 3).map fun vertex =>
      if vertex.id == "task0" then { vertex with outputs := ["after"] } else vertex) = none := by decide +kernel

private def controlProgram : Program :=
  { program with identity := { program.identity with semanticProfile := ⟨"cibseven-2.2.0-sequential-multi-instance-subprocess-draft"⟩ } }

private def nestedParallelBody : List StructuredParallelBody.Vertex :=
  ((parallelBody 2).map fun vertex => if vertex.id == "task0" then
    { vertex with kind := .fork, outputs := ["left", "right"] } else vertex) ++
      [⟨"left", .task, ["innerJoin"]⟩, ⟨"right", .task, ["innerJoin"]⟩, ⟨"innerJoin", .join, ["join"]⟩]

theorem repeated_scope_parallel_analysis_is_independent_of_nested_declaration_order :
    StructuredParallelBody.analyze nestedParallelBody = some ⟨5, 3, 1⟩ ∧
    StructuredParallelBody.analyze nestedParallelBody.reverse = some ⟨5, 3, 1⟩ := by decide +kernel

theorem repeated_scope_control_refuses_wrong_body_and_completion_ownership :
    SequentialScopeControl.analyze { controlProgram with operationScopes := controlProgram.operationScopes.map fun owner =>
      if owner.operationId.value == "task" then { owner with scopeId := ⟨"foreign"⟩ } else owner } = none ∧
    SequentialScopeControl.analyze { controlProgram with operations := controlProgram.operations.map fun operation =>
      if operation.id.value == "complete" then .completeSequentialMultiInstanceScope ⟨"complete"⟩ (origin "Batch") ⟨"other"⟩
      else operation } = none := by decide +kernel

theorem repeated_scope_control_graph_does_not_open_execution_admission :
    programGraphWellFormed controlProgram = true ∧
    programProfileCapabilitiesValid controlProgram = false := by decide +kernel

theorem repeated_scope_control_composes_entry_turnover_and_parent_continuation :
    SequentialScopeControl.analyze controlProgram = some ⟨⟨"enter"⟩, ⟨"body"⟩, 4⟩ ∧
    SequentialScopeControl.maximumBurst ⟨5, 2, 2⟩ 0 0 = 8 ∧
    SequentialScopeControl.maximumBurst ⟨6, 2, 2⟩ 0 0 = 9 ∧
    SequentialScopeControl.maximumBurst ⟨5, 2, 2⟩ 40 40 = 8 := by decide +kernel

private def mixedProgram : Program :=
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

theorem repeated_scope_private_profile_admits_complete_mixed_body :
    programGraphWellFormed mixedProgram = true ∧
    programProfileCapabilitiesValid mixedProgram = true := by decide +kernel

theorem repeated_scope_private_profile_requires_overlay_and_distinct_source_ids :
    programProfileCapabilitiesValid { mixedProgram with identity := { mixedProgram.identity with sourceOverlay := none } } = false ∧
    programProfileCapabilitiesValid { mixedProgram with processId := ⟨"Review"⟩ } = false := by decide +kernel

theorem repeated_scope_private_profile_requires_both_body_task_kinds :
    programProfileCapabilitiesValid { mixedProgram with operations := mixedProgram.operations.map fun operation =>
      match operation with
      | .awaitEffect id origin input output _ _ =>
          .awaitUserTask id origin input output { id := ⟨origin.elementId.value⟩, name := none }
      | _ => operation } = false := by decide +kernel

theorem repeated_scope_start_dispatch_accepts_typed_collection :
    (admitStimulus mixedProgram initialState
      (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩ [⟨"items", .stringList ["invoice"]⟩])).outcome = .committed ∧
    (admitStimulus mixedProgram initialState
      (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩ [⟨"items", .stringList []⟩])).outcome = .committed := by decide +kernel

theorem repeated_scope_start_dispatch_refuses_missing_collection_and_identity :
    (admitStimulus mixedProgram initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩ [])).outcome = .rejected ∧
    (admitStimulus mixedProgram initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨""⟩ [⟨"items", .stringList []⟩])).outcome = .rejected := by decide +kernel

private def canonicalProgram : Program :=
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

theorem repeated_scope_canonical_program_is_structurally_admitted :
    programWellFormed canonicalProgram = true ∧
    programProfileCapabilitiesValid canonicalProgram = true := by decide +kernel

private def repeatedScenario : Scenario :=
  { kind := .scenario, id := ⟨"invoice-batch"⟩, profile := canonicalProgram.identity.semanticProfile
    bpmn := {
      id := canonicalProgram.identity.sourceId, relativePath := "invoice-batch.bpmn"
      sha256 := canonicalProgram.identity.sourceSha256, sourceOverlay := canonicalProgram.identity.sourceOverlay }
    stimuli := [.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩ [⟨"items", .stringList ["invoice"]⟩]]
    observations := [.deployment, .commandResults, .processStatus, .activeWaits, .openUserTasks,
      .openTimers, .openEffects, .openMultiInstances, .variables, .enabledInteractions, .logicalTime]
    provenance := { normativeRefs := [], cibRevision := "2.2.0", cibRefs := [] } }

theorem repeated_scope_scenario_requires_progress_observation_and_start_data :
    supportsScenario canonicalProgram repeatedScenario = true ∧
    supportsScenario canonicalProgram { repeatedScenario with
      observations := repeatedScenario.observations.filter (· != .openMultiInstances) } = false ∧
    supportsScenario canonicalProgram { repeatedScenario with
      stimuli := [.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"instance"⟩ []] } = false := by decide +kernel

private def checkedSource : CheckedProcess :=
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

theorem repeated_scope_checked_source_admission_reaches_valid_lowering :
    checkedWellFormed checkedSource = true ∧
    programWellFormed (lowerCheckedProcess checkedSource) = true ∧
    programProfileCapabilitiesValid (lowerCheckedProcess checkedSource) = true := by decide +kernel

private def parentServiceSource : CheckedProcess :=
  { checkedSource with
    nodes := checkedSource.nodes ++ [.serviceTask ⟨"Publish"⟩
      ⟨"urn:bpmn-lean:effect-protocol:activity-v1", "publishBatch"⟩ [] [] none]
    nodeScopes := checkedSource.nodeScopes ++ [{ nodeId := ⟨"Publish"⟩, scopeId := ⟨"root"⟩ }]
    sequenceFlows := (checkedSource.sequenceFlows.map fun flow =>
      if flow.id.value == "outgoing" then { flow with targetId := ⟨"Publish"⟩ } else flow) ++
      [⟨⟨"publish-out"⟩, ⟨"Publish"⟩, ⟨"End"⟩, none⟩]
    sequenceFlowScopes := checkedSource.sequenceFlowScopes ++ [{ sequenceFlowId := ⟨"publish-out"⟩, scopeId := ⟨"root"⟩ }] }

theorem repeated_scope_checked_analysis_requires_mixed_body_not_parent_service :
    (SequentialScopeChecked.analyze parentServiceSource).isSome = true ∧
    SequentialScopeChecked.analyze { parentServiceSource with nodes := parentServiceSource.nodes.map fun node =>
      if node.id.value == "Validate" then CheckedNode.userTask node.id none none else node } = none := by decide +kernel

theorem repeated_scope_checked_analysis_rejects_protected_mappings_and_foreign_ownership :
    SequentialScopeChecked.analyze { checkedSource with nodes := checkedSource.nodes.map fun node => match node with
      | .sequentialMultiInstanceSubProcess id scope collection item _ condition =>
          .sequentialMultiInstanceSubProcess id scope collection item [⟨item, .enclosingVariable "seed"⟩] condition
      | _ => node } = none ∧
    SequentialScopeChecked.analyze { checkedSource with nodeScopes := checkedSource.nodeScopes.map fun owner =>
      if owner.nodeId.value == "Validate" then { owner with scopeId := ⟨"foreign"⟩ } else owner } = none := by decide +kernel

theorem repeated_scope_checked_analysis_ignores_declaration_order :
    SequentialScopeChecked.analyze { checkedSource with
      nodes := checkedSource.nodes.reverse, nodeScopes := checkedSource.nodeScopes.reverse,
      sequenceFlows := checkedSource.sequenceFlows.reverse } = SequentialScopeChecked.analyze checkedSource := by decide +kernel

end BpmnSemantics.SequentialScopeGraphConformance
