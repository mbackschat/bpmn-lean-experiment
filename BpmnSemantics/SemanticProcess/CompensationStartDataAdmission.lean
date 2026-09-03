import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerTransition
import BpmnSemantics.SemanticProcess.ValueDomain

/-! # Compensation checkpoint start-data admission

This module projects the exact activation-one promoted snapshot and first compensation frontier before start. It derives every identity from the immutable Program and reuses the production snapshot, trigger, frontier, and canonical-byte constructors.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

structure CompensationStartCapacityProjection where
  retentions : List CompensationParentContextRetention
  trigger : CompensationTriggerExecution
  waits : List CompensationHandlerEffectWait
  snapshotCanonicalBytes : Nat
  executionCanonicalBytes : Nat
  deriving Repr, DecidableEq

private def restoredSourceNames : List CompensationSubjectDefinition → List String
  | [] => []
  | subject :: rest =>
      match subject.body.input with
      | .empty => restoredSourceNames rest
      | .restoredProcessBinding sourceName _ => sourceName :: restoredSourceNames rest

private def eventSubjectRetentions? (program : Program) (root : ScopeOccurrenceId)
    (bindings : List VariableBinding) :
    List CompensationSubjectDefinition → Option (List CompensationParentContextRetention)
  | [] => some []
  | .boundaryActivity .. :: rest => eventSubjectRetentions? program root bindings rest
  | .eventSubProcess parentScopeId handlerScopeId _ :: rest => do
      let target ← targetForParent? program parentScopeId
      if target.handlerScopeId != handlerScopeId then none
      let parent : RuntimeScopeOccurrence :=
        { id :=
            { processInstanceId := root.processInstanceId
              definitionScopeId := parentScopeId
              activation := 1 }
          parent := some root }
      let snapshot ← constructCompensationParentContextSnapshot? program root parent bindings
      let remaining ← eventSubjectRetentions? program root bindings rest
      pure (.promoted parent handlerScopeId snapshot :: remaining)

private def selectedProjectedSubjects? (instanceId : SemanticId)
    (retentions : List CompensationParentContextRetention) :
    List CompensationSubjectDefinition → Option (List SelectedCompensationSubject)
  | [] => some []
  | definition@(.boundaryActivity elementId _) :: rest => do
      let remaining ← selectedProjectedSubjects? instanceId retentions rest
      pure
        ({ definition
           occurrence := .boundaryActivity
             { processInstanceId := instanceId
               activityElementId := ⟨elementId.value⟩
               activation := 1 }
           restoredContext := none } :: remaining)
  | definition@(.eventSubProcess parentScopeId handlerScopeId _) :: rest => do
      let retention ← match retentions.filter fun retention =>
          retention.parent.id.definitionScopeId == parentScopeId &&
            retention.handlerScopeId == handlerScopeId with
        | [.promoted parent _ snapshot] => some (parent, snapshot)
        | _ => none
      let remaining ← selectedProjectedSubjects? instanceId retentions rest
      pure
        ({ definition
           occurrence := .eventSubProcess retention.1.id
           restoredContext := some retention.2 } :: remaining)

private def compensationTriggerOperation? (program : Program)
    (declaration : CompensationExecutionDeclaration) : Option SemanticOperation :=
  match program.operations.filter fun operation => operation.id == declaration.triggerOperationId with
  | [operation@(.triggerCompensation ..)] => some operation
  | _ => none

/-- Projects the exact promoted snapshot and maximal first frontier without committing runtime state. -/
def projectCompensationStartCapacity? (program : Program) (instanceId : SemanticId)
    (bindings : List VariableBinding) : Option CompensationStartCapacityProjection := do
  if program.identity.semanticProfile != compensationSourceCheckpointProfileId then none
  if instanceId.value.isEmpty || !compensationParentContextBindingsValid bindings then none
  let declaration ← program.compensationExecution
  let snapshots ← program.compensationEventSubProcessSnapshots
  let rootScopeId ← programEntryRootScopeId? program
  match restoredSourceNames declaration.subjects, bindings with
  | [sourceName], [{ name, value := .string _ }] =>
      if name != sourceName then none
  | _, _ => none
  let root : ScopeOccurrenceId :=
    { processInstanceId := instanceId, definitionScopeId := rootScopeId, activation := 1 }
  let retentions ← eventSubjectRetentions? program root bindings declaration.subjects
  if retentions.length != snapshots.targets.length || retentions.length != 1 then none
  let selected ← selectedProjectedSubjects? instanceId retentions declaration.subjects
  if selected.length != declaration.subjects.length then none
  let operation ← compensationTriggerOperation? program declaration
  let frontier ← constructCompensationTriggerFrontier program initialState operation root selected
  if frontier.trigger.handlers.length != declaration.subjects.length then none
  pure
    { retentions
      trigger := frontier.trigger
      waits := frontier.waits
      snapshotCanonicalBytes :=
        canonicalCompensationParentContextRetentionsUtf8Bytes retentions
      executionCanonicalBytes :=
        canonicalCompensationExecutionStateUtf8Bytes [frontier.trigger] frontier.waits }

/-- Applies the exact checkpoint's Program-derived start-data and downstream-capacity rule. Other profiles retain their existing admission. -/
def compensationStartDataAdmitted (program : Program) (instanceId : SemanticId)
    (bindings : List VariableBinding) : Bool :=
  if program.identity.semanticProfile != compensationSourceCheckpointProfileId then true
  else
    match program.compensationEventSubProcessSnapshots, program.compensationExecution,
        projectCompensationStartCapacity? program instanceId bindings with
    | some snapshots, some execution, some projection =>
        capacityRefusal? snapshots projection.retentions = none &&
          compensationExecutionCapacityRefusal? execution [projection.trigger]
            projection.waits = none
    | _, _, _ => false

/-- Exact admission implies both inherited canonical-byte inequalities. -/
theorem compensationStartDataAdmitted_implies_canonical_capacities
    (program : Program) (instanceId : SemanticId) (bindings : List VariableBinding)
    (checkpoint : program.identity.semanticProfile = compensationSourceCheckpointProfileId)
    (admitted : compensationStartDataAdmitted program instanceId bindings = true) :
    ∃ snapshots execution projection,
      program.compensationEventSubProcessSnapshots = some snapshots ∧
        program.compensationExecution = some execution ∧
        projectCompensationStartCapacity? program instanceId bindings = some projection ∧
        canonicalCompensationParentContextRetentionsUtf8Bytes projection.retentions ≤
          snapshots.maxCanonicalBytes ∧
        canonicalCompensationExecutionStateUtf8Bytes [projection.trigger] projection.waits ≤
          execution.limits.maxCanonicalBytes := by
  unfold compensationStartDataAdmitted at admitted
  simp [checkpoint] at admitted
  cases snapshotsEq : program.compensationEventSubProcessSnapshots with
  | none => simp [snapshotsEq] at admitted
  | some snapshots =>
      cases executionEq : program.compensationExecution with
      | none => simp [snapshotsEq, executionEq] at admitted
      | some execution =>
          cases projectionEq : projectCompensationStartCapacity? program instanceId bindings with
          | none => simp [snapshotsEq, executionEq, projectionEq] at admitted
          | some projection =>
              simp [snapshotsEq, executionEq, projectionEq] at admitted
              refine ⟨snapshots, execution, projection, rfl, rfl, rfl,
                ((capacityRefusal_none_iff snapshots projection.retentions).mp admitted.1).2, ?_⟩
              unfold compensationExecutionCapacityRefusal? at admitted
              split at admitted <;> simp_all
              split at admitted <;> simp_all

end BpmnSemantics.SemanticProcess
