import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts

/-! # Parallel Sub-Process completion publication

PMIS-END-01, PMIS-EARLY-01 and PMIS-PUBLIC-01 derive completion terminals from one exact predecessor body and its validated population. Regional cancellation is supplied by the lifecycle owner; this module neither evaluates a runtime successor nor compares before/after collections.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def completionCondition? (entry : ParallelScopeEntry) (before : RuntimeState) : Option Bool := do
  match entry.completionBooleanName with
  | none => some false
  | some name =>
      let [binding] := before.variables.process.bindings.filter (·.name == name) | none
      let .boolean condition := binding.value | none
      pure condition

/-- Exact predecessor binding closes the selected body; only nonempty early siblings use regional cancellation. -/
def candidateParallelScopeCompletionEnds? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (before : RuntimeState)
    (cancelledSubtreeEnds? : ScopeOccurrenceId → Option (List UnnumberedFlowNodeOccurrenceEnd)) :
    Option (List UnnumberedFlowNodeOccurrenceEnd) := do
  let .completeParallelMultiInstanceScope _ origin entryId := operation | none
  let [selected] := program.operations.filter (·.id == operation.id) | none
  if selected != operation then none else pure ()
  let [entryOperation] := program.operations.filter (·.id == entryId) | none
  let entry ← parallelScopeEntry? entryOperation
  let [completion] := program.operations.filter (fun candidate => match candidate with
    | .completeParallelMultiInstanceScope _ _ paired => paired == entry.id
    | _ => false) | none
  if completion != operation || completion.origin != entryOperation.origin ||
      !(program.operations.all fun candidate => candidate.origin.elementId != entry.elementId ||
        candidate == entryOperation || candidate == operation) then none else pure ()
  let [entryOwner] := program.operationScopes.filter (·.operationId == entry.id) | none
  let [completionOwner] := program.operationScopes.filter (·.operationId == operation.id) | none
  if completionOwner.scopeId != entry.childScopeId || owner.definitionScopeId != entry.childScopeId
    then none else pure ()
  let _ ← candidateOperationFlowNodeIdentity? program operation owner owner origin.elementId
  let binding ← parallelScopeBinding? entry before owner
  let bodies := before.scopeOccurrences.filter (·.id.definitionScopeId == entry.childScopeId)
  let frames := before.variables.scopes.filter (·.owner.definitionScopeId == entry.childScopeId)
  let activities := before.activityOccurrences.filter (·.activityElementId == entry.elementId)
  let controllers := before.parallelScopeControllers.filter (fun row => row.id.activityElementId.value == entry.elementId.value)
  if bodies.length != binding.iterations.length || frames.length != binding.iterations.length ||
      activities != [binding.activity] || controllers != [binding.controller] then none else pure ()
  if binding.activity.owner.definitionScopeId != entryOwner.scopeId || !scopeQuiescent before owner ||
      before.activityOccurrences.any (fun record => record.owner == owner) then none else pure ()
  let [body] := before.scopeOccurrences.filter (·.id == owner) | none
  let _ ← candidateScopeStart? program entryOperation binding.activity.owner body
  -- PMIS-EARLY-01 reads protected Process data: disposing the body-local frame cannot change it.
  let condition ← completionCondition? entry before
  let retirement ← retireParallelScopeIteration binding.controller binding.iterations owner condition
  let completed : UnnumberedFlowNodeOccurrenceEnd := { anchor := .scope owner, terminal := .completed }
  match retirement with
  | .remaining .. | .naturalCompletion .. => pure [completed]
  | .earlyCompletion _ _ first rest =>
      let cancelled ← (first :: rest).mapM fun iteration => cancelledSubtreeEnds? iteration.scope
      pure (completed :: cancelled.flatten)

end BpmnSemantics.SemanticProcess
