import BpmnSemantics.SemanticProcess.ScopeCompletion

/-! Token-free completion of a declared Message Event Sub-Process. Exact child/parent binding and the
shared quiescence predicate gate disposal; ordinary scope continuation keeps its existing owner. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- BPMN 2.0.2 §13.5.4 closes an Event Sub-Process without an ordinary outgoing Sequence Flow. -/
def completeEventSubProcessState? (program : Program) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (elementId : NodeId) : Option RuntimeState :=
  match program.interruptingMessageEventSubProcesses.filter
      (fun candidate => candidate.handlerScopeId == scopeId),
      state.scopeOccurrences.filter (fun candidate => candidate.id.definitionScopeId == scopeId) with
  | [declaration], [child] =>
    match child.parent with
    | none => none
    | some parent =>
      if declaration.elementId = elementId ∧
          state.control = .running child.id.processInstanceId ∧
          parent.processInstanceId = child.id.processInstanceId ∧
          parent.definitionScopeId = declaration.parentScopeId ∧
          program.definitionScopes.filter (fun candidate => candidate.id == scopeId) =
            [{ id := scopeId, parentScopeId := some declaration.parentScopeId,
               originElementId := declaration.elementId }] ∧
          (program.definitionScopes.filter
            (fun candidate => candidate.id == declaration.parentScopeId)).length = 1 ∧
          (state.scopeOccurrences.filter (fun candidate => candidate.id == parent)).length = 1 ∧
          scopeQuiescent state child.id = true then
        some { state with
          scopeOccurrences := state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id ≠ child.id)) }
      else none
  | _, _ => none

/-- IMES-CLOSE-01 binds disposal to one declared child, its live parent and actual quiescence. -/
inductive EventSubProcessCompletionStep : Program → RuntimeState → DefinitionScopeId → NodeId → RuntimeState → Prop where
  | close (program : Program) (before : RuntimeState) (scopeId : DefinitionScopeId) (elementId : NodeId)
      (declaration : InterruptingMessageEventSubProcessDeclaration)
      (child : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId)
      (declared : program.interruptingMessageEventSubProcesses.filter
        (fun candidate => candidate.handlerScopeId == scopeId) = [declaration])
      (selected : before.scopeOccurrences.filter
        (fun candidate => candidate.id.definitionScopeId == scopeId) = [child])
      (parented : child.parent = some parent)
      (bound : declaration.elementId = elementId ∧
        before.control = .running child.id.processInstanceId ∧
        parent.processInstanceId = child.id.processInstanceId ∧
        parent.definitionScopeId = declaration.parentScopeId ∧
        program.definitionScopes.filter (fun candidate => candidate.id == scopeId) =
          [{ id := scopeId, parentScopeId := some declaration.parentScopeId,
             originElementId := declaration.elementId }] ∧
        (program.definitionScopes.filter
          (fun candidate => candidate.id == declaration.parentScopeId)).length = 1 ∧
        (before.scopeOccurrences.filter (fun candidate => candidate.id == parent)).length = 1 ∧
        scopeQuiescent before child.id = true) :
      EventSubProcessCompletionStep program before scopeId elementId
        { before with
          scopeOccurrences := before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id ≠ child.id)) }

theorem completeEventSubProcessState_sound (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (elementId : NodeId)
    (result : completeEventSubProcessState? program before scopeId elementId = some after) :
    EventSubProcessCompletionStep program before scopeId elementId after := by
  unfold completeEventSubProcessState? at result
  split at result
  · rename_i declaration child declared selected
    split at result
    · simp at result
    · rename_i parent parented
      split at result
      · rename_i bound
        simp only [Option.some.injEq] at result
        subst after
        exact .close program before scopeId elementId declaration child parent declared selected parented bound
      · simp at result
  · simp at result

end BpmnSemantics.SemanticProcess
