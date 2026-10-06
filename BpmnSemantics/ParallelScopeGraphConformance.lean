import BpmnSemantics.SemanticProcess.GraphValidation
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcessJson.CheckedProcess
import BpmnSemantics.SemanticProcess.ParallelScopeCheckedAdmission

/-! PMIS-END-01 checks paired parallel-scope declarations independently of private runtime execution. -/

namespace BpmnSemantics.ParallelScopeGraphConformance
open SemanticProcess

private def origin (value : String) : BpmnElementOrigin := { elementId := ⟨value⟩ }

private def operations : List SemanticOperation :=
  [ .initiate ⟨"start"⟩ (origin "Start") ⟨"incoming"⟩
  , .enterParallelMultiInstanceScope ⟨"enter"⟩ (origin "Batch")
      ⟨"incoming"⟩ ⟨"body-in"⟩ ⟨"body"⟩ ⟨"outgoing"⟩ "items" "item" [] none
  , .awaitUserTask ⟨"task"⟩ (origin "Review") ⟨"body-in"⟩ ⟨"body-out"⟩ { id := ⟨"Review"⟩, name := none }
  , .reachNoneEnd ⟨"child-end"⟩ (origin "ChildEnd") ⟨"body-out"⟩
  , .completeParallelMultiInstanceScope ⟨"complete"⟩ (origin "Batch") ⟨"enter"⟩
  , .reachNoneEnd ⟨"end"⟩ (origin "End") ⟨"outgoing"⟩
  , .completeScope ⟨"root-complete"⟩ (origin "P") ⟨"root"⟩ none ]

private def places : List String := ["incoming", "outgoing", "body-in", "body-out"]

private def program : Program :=
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

private def replacing (id : String) (replacement : SemanticOperation) : Program :=
  { program with operations := operations.map fun operation => if operation.id.value == id then replacement else operation }

theorem parallel_source_graph_policy_does_not_admit_execution :
    programProfileCapabilitiesValid program = false := by decide +kernel

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

theorem parallel_completion_cannot_bind_sequential_entry : programGraphWellFormed
    (replacing "enter" (.enterSequentialMultiInstanceScope ⟨"enter"⟩ (origin "Batch")
      ⟨"incoming"⟩ ⟨"body-in"⟩ ⟨"body"⟩ ⟨"outgoing"⟩ "items" "item" [] none)) = false := by decide +kernel

private def checkedParallel : CheckedProcess :=
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

private def checkedMixed : CheckedProcess :=
  { checkedParallel with
    identity := { checkedParallel.identity with sourceOverlay := some { id := ⟨"handlers"⟩, sha256 := "private-overlay" } }
    nodes := checkedParallel.nodes ++ [.serviceTask ⟨"Validate"⟩
      ⟨"urn:bpmn-lean:effect-protocol:activity-v1", "validateInvoice"⟩ [] [] none]
    nodeScopes := checkedParallel.nodeScopes ++ [⟨⟨"Validate"⟩, ⟨"body"⟩⟩]
    sequenceFlows := (checkedParallel.sequenceFlows.map fun flow =>
      if flow.id.value == "body-out" then { flow with targetId := ⟨"Validate"⟩ } else flow) ++
      [⟨⟨"validated"⟩, ⟨"Validate"⟩, ⟨"ChildEnd"⟩, none⟩]
    sequenceFlowScopes := checkedParallel.sequenceFlowScopes ++ [⟨⟨"validated"⟩, ⟨"body"⟩⟩] }

theorem private_checked_admission_retains_both_task_kinds_and_execution_refusal :
    ParallelScopeChecked.admitted checkedMixed = true ∧
    ParallelScopeChecked.admitted { checkedMixed with nodes := checkedMixed.nodes.reverse } = true ∧
    ParallelScopeChecked.admitted checkedParallel = false ∧
    programProfileCapabilitiesValid (lowerCheckedProcess checkedMixed) = false := by decide +kernel

private def parallelScopeNodeFields : List (String × Lean.Json) :=
  [("kind", .str "parallelMultiInstanceSubProcess"), ("id", .str "mi"),
   ("childScopeId", .str "body"), ("collectionName", .str "items"),
   ("itemName", .str "item"), ("bodyInputs", .arr #[]), ("completionBooleanName", .null)]

private def decodedNodes (fields : List (String × Lean.Json)) : Option (List CheckedNode) :=
  let identity := Lean.Json.mkObj [("semanticProfile", .str "p"), ("sourceId", .str "s"),
    ("sourceOverlay", .null), ("sourceSha256", .str "x")]
  (SemanticProcessJson.decodeCheckedProcess (Lean.Json.mkObj [
    ("kind", .str "checkedProcess"), ("identity", identity), ("processId", .str "p"),
    ("definitionScopes", .arr #[]), ("nodeScopes", .arr #[]),
    ("sequenceFlowScopes", .arr #[]), ("sequenceFlows", .arr #[]),
    ("nodes", .arr #[Lean.Json.mkObj fields])])).toOption.map (·.nodes)

theorem parallel_scope_wire_distinguishes_mode_and_rejects_missing_or_extra_fields :
    decodedNodes parallelScopeNodeFields =
      some [.parallelMultiInstanceSubProcess ⟨"mi"⟩ ⟨"body"⟩ "items" "item" [] none] ∧
    decodedNodes (parallelScopeNodeFields.filter (·.1 != "collectionName")) = none ∧
    decodedNodes (parallelScopeNodeFields ++ [("isSequential", .bool false)]) = none := by
  decide +kernel

end BpmnSemantics.ParallelScopeGraphConformance
