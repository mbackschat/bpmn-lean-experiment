import BpmnSemantics.SemanticProcess.JsonSupport
import BpmnSemantics.SemanticProcess.ProfileAdmission

/-! # Boundary Compensation Activity retention declaration

Program-only validation for the optional hidden boundary Compensation retention declaration. Runtime
state and insertion stay in `CompensationActivityRetention` so aggregate Program admission can depend
on this module without creating a Program-to-runtime import cycle.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive CompensationActivityOperationFamily where
  | ordinaryUserTask
  | multiInstanceUserTask
  deriving Repr, DecidableEq

private def safeNat (value : Nat) : Bool :=
  BpmnSemantics.SemanticProcessJson.isSafeWireNat value

private def nonemptyNodeId (id : NodeId) : Bool :=
  !id.value.isEmpty

def boundaryCompensationTargetBefore (left right : BoundaryCompensationTarget) : Bool :=
  if left.activityElementId.value = right.activityElementId.value then
    if left.boundaryEventElementId.value = right.boundaryEventElementId.value then
      decide (left.compensationActivityElementId.value <
        right.compensationActivityElementId.value)
    else decide (left.boundaryEventElementId.value < right.boundaryEventElementId.value)
  else decide (left.activityElementId.value < right.activityElementId.value)

private def targetsStrictlyOrdered : List BoundaryCompensationTarget → Bool
  | [] | [_] => true
  | left :: right :: rest =>
      boundaryCompensationTargetBefore left right &&
        targetsStrictlyOrdered (right :: rest)

private def targetIdentityValid (target : BoundaryCompensationTarget) : Bool :=
  nonemptyNodeId target.activityElementId &&
    nonemptyNodeId target.boundaryEventElementId &&
    nonemptyNodeId target.compensationActivityElementId &&
    target.activityElementId != target.boundaryEventElementId &&
    target.activityElementId != target.compensationActivityElementId &&
    target.boundaryEventElementId != target.compensationActivityElementId

private def targetActivityUnique (targets : List BoundaryCompensationTarget)
    (target : BoundaryCompensationTarget) : Bool :=
  (targets.filter fun candidate =>
    candidate.activityElementId == target.activityElementId).length = 1

private def compensationActivityElementAndFamily? :
    SemanticOperation → Option (NodeId × CompensationActivityOperationFamily)
  | .awaitUserTask _ origin _ _ task =>
      if origin.elementId.value = task.id.value then
        some (origin.elementId, .ordinaryUserTask)
      else none
  | .awaitSequentialMultiInstanceUserTask _ origin _ task _ _ _ _ =>
      if origin.elementId.value = task.id.value then
        some (origin.elementId, .multiInstanceUserTask)
      else none
  | .awaitParallelMultiInstanceUserTask _ origin _ taskId _ _ _ _ _ _ =>
      if origin.elementId.value = taskId.value then
        some (origin.elementId, .multiInstanceUserTask)
      else none
  | _ => none

private def operationOwnedByScope (program : Program) (operation : SemanticOperation)
    (scopeId : DefinitionScopeId) : Bool :=
  match program.operationScopes.filter fun ownership =>
      ownership.operationId == operation.id with
  | [ownership] => ownership.scopeId == scopeId
  | _ => false

/-- Exact supported operation family for one declared target in its declared definition scope. -/
def compensationActivityTargetFamily? (program : Program)
    (declaration : CompensationActivityRetentionDeclaration)
    (activityElementId : NodeId) : Option CompensationActivityOperationFamily :=
  match program.operations.filter fun operation =>
      (compensationActivityElementAndFamily? operation).map Prod.fst = some activityElementId with
  | [operation] =>
      if operationOwnedByScope program operation declaration.definitionScopeId then
        (compensationActivityElementAndFamily? operation).map Prod.snd
      else none
  | _ => none

private def targetOperationValid (program : Program)
    (declaration : CompensationActivityRetentionDeclaration)
    (target : BoundaryCompensationTarget) : Bool :=
  (compensationActivityTargetFamily? program declaration target.activityElementId).isSome

private def declarationHasFlatRoot (program : Program)
    (declaration : CompensationActivityRetentionDeclaration) : Bool :=
  match program.definitionScopes.filter (·.parentScopeId.isNone) with
  | [scope] =>
      scope.id == declaration.definitionScopeId && scope.parentScopeId.isNone &&
        scope.originElementId.value == program.processId.value &&
        (program.compensationExecution.isSome || program.definitionScopes.length = 1)
  | _ => false

private def forbiddenRetentionOperation : SemanticOperation → Bool
  | .invokeProcess .. | .returnProcess .. | .terminateScope .. => true
  | _ => false

/-- Validity of the optional Program declaration, including its closed producer and lifecycle census. -/
def compensationActivityRetentionDeclarationValid (program : Program) : Bool :=
  match program.compensationActivityRetention with
  | none => true
  | some declaration =>
      declarationHasFlatRoot program declaration &&
        program.identity.semanticProfile != serviceTaskIncidentCancellationCheckpointProfileId &&
        !declaration.targets.isEmpty &&
        declaration.targets.all targetIdentityValid &&
        declaration.targets.all (targetActivityUnique declaration.targets) &&
        targetsStrictlyOrdered declaration.targets &&
        declaration.maxRecords > 0 && safeNat declaration.maxRecords &&
        declaration.maxCanonicalBytes ≥ 2 &&
        declaration.maxCanonicalBytes ≤ 65536 &&
        safeNat declaration.maxCanonicalBytes &&
        declaration.targets.all (targetOperationValid program declaration) &&
        !(program.operations.any forbiddenRetentionOperation)

end BpmnSemantics.SemanticProcess
