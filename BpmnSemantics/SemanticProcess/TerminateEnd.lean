import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.ScopeCancellation
import BpmnSemantics.SemanticProcess.ScopeCompletion

/-! # Containing-scope termination

This module owns the no-output Terminate End transition. The exact offered token selects one live
scope occurrence, shared cancellation clears that occurrence's represented runtime subtree while
retaining the selected occurrence, and the existing scope-completion transition remains the only
producer of a parent continuation or root completion.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def operationOwnershipExact (program : Program) (id : OperationId)
    (scopeId : DefinitionScopeId) : Bool :=
  program.operationScopes.filter (fun ownership => ownership.operationId = id) =
    [{ operationId := id, scopeId }]

private def terminateOperationPresent (program : Program) (id : OperationId)
    (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (scopeId : DefinitionScopeId) : Bool :=
  program.operations.contains (.terminateScope id origin input scopeId)

/-- Declarative enabling facts for one exact selected scope occurrence. -/
structure TerminateScopeEnabled (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (scopeId : DefinitionScopeId) (owner : ScopeOccurrenceId) : Prop where
  profile : program.identity.semanticProfile = terminateEndCheckpointProfileId
  operation : .terminateScope id origin input scopeId ∈ program.operations
  operationScope :
    program.operationScopes.filter (fun ownership => ownership.operationId = id) =
      [{ operationId := id, scopeId }]
  running : before.control = .running owner.processInstanceId
  exactToken : tokenOwners before input = [owner]
  exactScope : owner.definitionScopeId = scopeId
  liveOccurrence :
    (before.scopeOccurrences.filter fun occurrence => occurrence.id = owner).length = 1

private def commitTermination (before : RuntimeState)
    (owner : ScopeOccurrenceId) : RuntimeState :=
  let cancelled := cancelScopeSubtree before owner .retain
  { cancelled with endOccurrences := before.endOccurrences + 1 }

/-- Declarative containing-scope termination relation. -/
inductive TerminateScopeStep (program : Program) (id : OperationId)
    (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (scopeId : DefinitionScopeId) : RuntimeState → RuntimeState → Prop where
  | terminate (before : RuntimeState) (owner : ScopeOccurrenceId)
      (enabled : TerminateScopeEnabled program before id origin input scopeId owner) :
      TerminateScopeStep program id origin input scopeId before
        (commitTermination before owner)

private def selectedTerminateOwner? (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (scopeId : DefinitionScopeId) : Option ScopeOccurrenceId := do
  if program.identity.semanticProfile ≠ terminateEndCheckpointProfileId then none
  else if !terminateOperationPresent program id origin input scopeId then none
  else if !operationOwnershipExact program id scopeId then none
  else match before.control, tokenOwners before input with
    | .running instanceId, [owner] =>
        if owner.processInstanceId = instanceId ∧
            owner.definitionScopeId = scopeId then
          if (before.scopeOccurrences.filter fun occurrence =>
              occurrence.id = owner).length = 1 then some owner
          else none
        else none
    | _, _ => none

/-- Execute one exact containing-scope termination, producing no continuation token. -/
def terminateScopeState? (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (scopeId : DefinitionScopeId) : Option RuntimeState :=
  match selectedTerminateOwner? program before id origin input scopeId with
  | some owner => some (commitTermination before owner)
  | none => none

private theorem selectedTerminateOwner_sound
    (program : Program) (before : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (scopeId : DefinitionScopeId) (owner : ScopeOccurrenceId)
    (selected :
      selectedTerminateOwner? program before id origin input scopeId = some owner) :
    TerminateScopeEnabled program before id origin input scopeId owner := by
  unfold selectedTerminateOwner? at selected
  split at selected <;> try contradiction
  rename_i profile
  have profileValid :
      program.identity.semanticProfile = terminateEndCheckpointProfileId := by
    simpa using profile
  split at selected <;> try contradiction
  rename_i operation
  have operationPresent :
      .terminateScope id origin input scopeId ∈ program.operations := by
    simpa [terminateOperationPresent] using operation
  split at selected <;> try contradiction
  rename_i ownership
  have scopeExact :
      program.operationScopes.filter (fun candidate => candidate.operationId = id) =
        [{ operationId := id, scopeId }] := by
    simpa [operationOwnershipExact] using ownership
  split at selected <;> try contradiction
  rename_i instanceId tokenOwner running exactToken
  split at selected <;> try contradiction
  rename_i identity
  split at selected <;> try contradiction
  rename_i live
  simp only [Option.some.injEq] at selected
  subst owner
  exact
    { profile := profileValid
      operation := operationPresent
      operationScope := scopeExact
      running := by simpa [identity.1] using running
      exactToken := exactToken
      exactScope := identity.2
      liveOccurrence := by simpa using live }

/-- Every evaluator-produced termination belongs to the declarative relation. -/
theorem terminateScopeState_sound
    (program : Program) (before after : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (scopeId : DefinitionScopeId)
    (result : terminateScopeState? program before id origin input scopeId = some after) :
    TerminateScopeStep program id origin input scopeId before after := by
  unfold terminateScopeState? at result
  split at result <;> try contradiction
  rename_i owner selected
  simp only [Option.some.injEq] at result
  subst after
  exact .terminate before owner
    (selectedTerminateOwner_sound program before id origin input scopeId owner selected)

/-- Termination preserves every monotonic activation family, Process variables, logical time, and existing End history except for its one required increment. -/
theorem terminateScopeState_preserves_history
    (program : Program) (before after : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (scopeId : DefinitionScopeId)
    (result : terminateScopeState? program before id origin input scopeId = some after) :
    after.activations = before.activations ∧
      after.messageActivations = before.messageActivations ∧
      after.timerActivations = before.timerActivations ∧
      after.effectActivations = before.effectActivations ∧
      after.scopeActivations = before.scopeActivations ∧
      after.eventRaceActivations = before.eventRaceActivations ∧
      after.callActivations = before.callActivations ∧
      after.variables.process = before.variables.process ∧
      after.logicalTimeMs = before.logicalTimeMs ∧
      after.endOccurrences = before.endOccurrences + 1 := by
  unfold terminateScopeState? at result
  split at result <;> try contradiction
  simp only [Option.some.injEq] at result
  subst after
  simp [commitTermination, cancelScopeSubtree]

end BpmnSemantics.SemanticProcess
