import BpmnSemantics.SemanticProcess.GraphValidation

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

end BpmnSemantics.ParallelScopeGraphConformance
