import BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration

/-! # Compensation trigger and single-effect handler declaration validity -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def compensationProtocol := "urn:bpmn-lean:effect-protocol:activity-v1"
private def compensationOperation :=
  "urn:bpmn-lean:effect-operation:compensation-single-effect-v1"

private def safeNat (value : Nat) : Bool :=
  BpmnSemantics.SemanticProcessJson.isSafeWireNat value

private def uniqueDefinitionScope? (program : Program) (id : DefinitionScopeId) :
    Option DefinitionScope :=
  match program.definitionScopes.filter fun scope => scope.id == id with
  | [scope] => some scope
  | _ => none

private def subjectElementId? (program : Program) :
    CompensationSubjectDefinition → Option NodeId
  | .boundaryActivity subjectElementId _ => some subjectElementId
  | .eventSubProcess parentScopeId _ _ =>
      (uniqueDefinitionScope? program parentScopeId).map (·.originElementId)

private def subjectBefore (program : Program) (left right : CompensationSubjectDefinition) : Bool :=
  match subjectElementId? program left, subjectElementId? program right with
  | some leftId, some rightId => decide (leftId.value < rightId.value)
  | _, _ => false

private def subjectsStrictlyOrdered (program : Program) :
    List CompensationSubjectDefinition → Bool
  | [] | [_] => true
  | left :: right :: rest =>
      subjectBefore program left right && subjectsStrictlyOrdered program (right :: rest)

private def dependencyBefore (left right : CompensationDependency) : Bool :=
  if left.predecessorElementId.value = right.predecessorElementId.value then
    decide (left.successorElementId.value < right.successorElementId.value)
  else decide (left.predecessorElementId.value < right.predecessorElementId.value)

private def dependenciesStrictlyOrdered : List CompensationDependency → Bool
  | [] | [_] => true
  | left :: right :: rest =>
      dependencyBefore left right && dependenciesStrictlyOrdered (right :: rest)

private def handlerDescriptorValid (body : SingleEffectCompensationHandlerBody) : Bool :=
  !body.handlerElementId.value.isEmpty && !body.effectElementId.value.isEmpty &&
    body.descriptor.protocol = compensationProtocol &&
    body.descriptor.operation = compensationOperation

private def boundaryTargetValid (program : Program)
    (subjectElementId : NodeId) (body : SingleEffectCompensationHandlerBody) : Bool :=
  match program.compensationActivityRetention with
  | none => false
  | some retention =>
      match retention.targets.filter fun target => target.activityElementId == subjectElementId with
      | [target] =>
          body.handlerElementId == target.compensationActivityElementId &&
            body.effectElementId == target.compensationActivityElementId &&
            body.input == .empty
      | _ => false

private def eventTargetValid (program : Program) (parentScopeId handlerScopeId : DefinitionScopeId)
    (body : SingleEffectCompensationHandlerBody) : Bool :=
  match program.compensationEventSubProcessSnapshots,
      uniqueDefinitionScope? program handlerScopeId with
  | some snapshots, some handlerScope =>
      (snapshots.targets.filter fun target =>
        target.parentScopeId == parentScopeId &&
          target.handlerScopeId == handlerScopeId).length = 1 &&
        handlerScope.originElementId == body.handlerElementId &&
        body.effectElementId != body.handlerElementId &&
        match body.input with
        | .empty => false
        | .restoredProcessBinding sourceName argumentName =>
            !sourceName.isEmpty && !argumentName.isEmpty && sourceName != argumentName
  | _, _ => false

private def subjectValid (program : Program) : CompensationSubjectDefinition → Bool
  | .boundaryActivity subjectElementId body =>
      handlerDescriptorValid body && boundaryTargetValid program subjectElementId body
  | .eventSubProcess parentScopeId handlerScopeId body =>
      handlerDescriptorValid body &&
        eventTargetValid program parentScopeId handlerScopeId body

private def boundarySubjectCount : List CompensationSubjectDefinition → Nat
  | [] => 0
  | .boundaryActivity .. :: rest => boundarySubjectCount rest + 1
  | _ :: rest => boundarySubjectCount rest

private def eventSubjectCount : List CompensationSubjectDefinition → Nat
  | [] => 0
  | .eventSubProcess .. :: rest => eventSubjectCount rest + 1
  | _ :: rest => eventSubjectCount rest

private def declaredTargetCountsMatch (program : Program)
    (subjects : List CompensationSubjectDefinition) : Bool :=
  boundarySubjectCount subjects =
      (program.compensationActivityRetention.map (·.targets.length)).getD 0 &&
    eventSubjectCount subjects =
      (program.compensationEventSubProcessSnapshots.map (·.targets.length)).getD 0

private def operationOriginElementId : SemanticOperation → Option NodeId
  | .triggerCompensation .. => none
  | .initiate _ origin _ | .initiateMessage _ origin _ _ | .initiateTimer _ origin _ _
  | .enterScope _ origin _ _ _ | .enterBoundedScope _ origin _ _ _ _
  | .invokeProcess _ origin _ _ _ _ _ | .returnProcess _ origin _ _ _
  | .awaitUserTask _ origin _ _ _ | .awaitDataInputUserTask _ origin _ _ _ _ _
  | .awaitDataOutputUserTask _ origin _ _ _ _ _
  | .awaitSequentialMultiInstanceUserTask _ origin _ _ _ _ _ _
  | .awaitParallelMultiInstanceUserTask _ origin _ _ _ _ _ _ _ _
  | .completeParallelMultiInstanceUserTask _ origin _ _ _
  | .awaitTimer _ origin _ _ _ | .awaitMessage _ origin _ _ _
  | .awaitPayloadMessage _ origin _ _ _ _
  | .awaitCorrelatedPayloadMessage _ origin _ _ _ _ _ _ _
  | .awaitEventRace _ origin _ _ _ | .awaitBoundedUserTask _ origin _ _ _
  | .awaitMessageBoundedUserTask _ origin _ _ _
  | .awaitMonitoredUserTask _ origin _ _ _ | .awaitEffect _ origin _ _ _ _
  | .duplicate _ origin _ _ | .synchronize _ origin _ _ | .mergeExclusive _ origin _ _
  | .choose _ origin _ _ _ _ | .selectMany _ origin _ _ _ _
  | .synchronizeSelected _ origin _ _ _ | .throwError _ origin _ _ _
  | .reachNoneEnd _ origin _ | .terminateScope _ origin _ _
  | .completeScope _ origin _ _ => some origin.elementId

private def bodyElementIds : CompensationSubjectDefinition → List NodeId
  | .boundaryActivity _ body | .eventSubProcess _ _ body =>
      [body.handlerElementId, body.effectElementId]

private def bodyIdentityValues : CompensationSubjectDefinition → List String
  | .boundaryActivity _ body | .eventSubProcess _ _ body =>
      [body.handlerElementId.value, body.effectElementId.value].eraseDups

private def bodyIdentityGroupsUnique (forbidden : List String) :
    List String → List CompensationSubjectDefinition → Bool
  | _, [] => true
  | claimed, subject :: rest =>
      let group := bodyIdentityValues subject
      group.all (fun value => !forbidden.contains value && !claimed.contains value) &&
        bodyIdentityGroupsUnique forbidden (claimed ++ group) rest

private def declarationBodyIdentitiesValid (program : Program)
    (declaration : CompensationExecutionDeclaration) : Bool :=
  match program.operations.filter fun operation => operation.id == declaration.triggerOperationId with
  | [.triggerCompensation id origin _ _ _] =>
      let subjectIds :=
        declaration.subjects.filterMap (subjectElementId? program) |>.map (·.value)
      !subjectIds.contains id.value && !subjectIds.contains origin.elementId.value &&
        bodyIdentityGroupsUnique
          (subjectIds ++ [id.value, origin.elementId.value]) [] declaration.subjects
  | _ => false

private def bodyElementsUnavailableToOperations (program : Program)
    (subjects : List CompensationSubjectDefinition) : Bool :=
  let bodyIds := subjects.flatMap bodyElementIds
  program.operations.all fun operation =>
    match operationOriginElementId operation with
    | none => true
    | some originId => !bodyIds.contains originId

private def triggerValid (program : Program) (declaration : CompensationExecutionDeclaration) : Bool :=
  match program.operations.filter fun operation => operation.id == declaration.triggerOperationId with
  | [.triggerCompensation _ origin definitionScopeId input output] =>
      !origin.elementId.value.isEmpty && definitionScopeId == declaration.definitionScopeId &&
        !input.value.isEmpty && !output.value.isEmpty && input != output &&
        (program.operationScopes.filter fun ownership =>
          ownership.operationId == declaration.triggerOperationId) =
            [{ operationId := declaration.triggerOperationId,
               scopeId := declaration.definitionScopeId }]
  | _ => false

private def successorIds (dependencies : List CompensationDependency) (id : NodeId) : List NodeId :=
  (dependencies.filter fun dependency =>
    dependency.predecessorElementId == id).map (·.successorElementId)

private def reaches (dependencies : List CompensationDependency) : Nat → List NodeId → NodeId → Bool
  | 0, _, _ => false
  | fuel + 1, frontier, target =>
      frontier.contains target ||
        reaches dependencies fuel (frontier.flatMap (successorIds dependencies)) target

private def dependenciesValid (program : Program) (subjects : List CompensationSubjectDefinition)
    (dependencies : List CompensationDependency) : Bool :=
  let subjectIds := subjects.filterMap (subjectElementId? program)
  dependenciesStrictlyOrdered dependencies &&
    dependencies.all fun dependency =>
      subjectIds.contains dependency.predecessorElementId &&
        subjectIds.contains dependency.successorElementId &&
        dependency.predecessorElementId != dependency.successorElementId &&
        !reaches dependencies subjectIds.length [dependency.successorElementId]
          dependency.predecessorElementId

/-- Exact Program-only admission for the bounded compensation trigger and handler declaration. -/
def compensationExecutionDeclarationValid (program : Program) : Bool :=
  match program.compensationExecution with
  | none =>
      !(program.operations.any fun operation =>
        match operation with | .triggerCompensation .. => true | _ => false)
  | some declaration =>
      programEntryRootScopeId? program = some declaration.definitionScopeId &&
        (program.definitionScopes.filter (·.parentScopeId.isNone)).map (·.id) =
          [declaration.definitionScopeId] &&
        triggerValid program declaration &&
        subjectsStrictlyOrdered program declaration.subjects &&
        declaration.subjects.all (subjectValid program) &&
        declaredTargetCountsMatch program declaration.subjects &&
        declarationBodyIdentitiesValid program declaration &&
        bodyElementsUnavailableToOperations program declaration.subjects &&
        dependenciesValid program declaration.subjects declaration.dependencies &&
        declaration.limits.maxTriggers > 0 && safeNat declaration.limits.maxTriggers &&
        declaration.limits.maxHandlers > 0 && safeNat declaration.limits.maxHandlers &&
        declaration.limits.maxCanonicalBytes ≥ 2 &&
        declaration.limits.maxCanonicalBytes ≤ 65536 &&
        safeNat declaration.limits.maxCanonicalBytes

end BpmnSemantics.SemanticProcess
