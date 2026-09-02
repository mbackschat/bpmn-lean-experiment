import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import BpmnSemantics.SemanticProcess.ValueDomain

/-! # Exact Compensation source-checkpoint admission -/

namespace BpmnSemantics.SemanticProcess

private def compensationDescriptorValid (descriptor : EffectDescriptor) : Bool :=
  descriptor.protocol = "urn:bpmn-lean:effect-protocol:activity-v1" &&
    descriptor.operation =
      "urn:bpmn-lean:effect-operation:compensation-single-effect-v1"

private def checkedScope? (source : CheckedProcess) (id : DefinitionScopeId) :
    Option DefinitionScope :=
  match source.definitionScopes.filter fun scope => scope.id == id with
  | [scope] => some scope
  | _ => none

private def checkedNodeScope? (source : CheckedProcess) (id : NodeId) :
    Option DefinitionScopeId :=
  match source.nodeScopes.filter fun ownership => ownership.nodeId == id with
  | [ownership] => some ownership.scopeId
  | _ => none

private def checkedSubjectElementId : CheckedCompensationSubject → NodeId
  | .boundaryActivity subject _ _ => subject
  | .eventSubProcess parent _ _ _ => parent

private def checkedSubjectBefore
    (left right : CheckedCompensationSubject) : Bool :=
  decide ((checkedSubjectElementId left).value <
    (checkedSubjectElementId right).value)

private def checkedSubjectsStrictlyOrdered :
    List CheckedCompensationSubject → Bool
  | [] | [_] => true
  | left :: right :: rest =>
      checkedSubjectBefore left right &&
        checkedSubjectsStrictlyOrdered (right :: rest)

private def checkedBoundarySubjects
    (subjects : List CheckedCompensationSubject) :
    List (NodeId × NodeId × CheckedCompensationBody) :=
  subjects.filterMap fun
    | .boundaryActivity subject boundary body => some (subject, boundary, body)
    | _ => none

private def checkedEventSubjects
    (subjects : List CheckedCompensationSubject) :
    List (NodeId × DefinitionScopeId × DefinitionScopeId ×
      CheckedCompensationBody) :=
  subjects.filterMap fun
    | .eventSubProcess parent parentScope handlerScope body =>
        some (parent, parentScope, handlerScope, body)
    | _ => none

private def bodyIdentityValues (body : CheckedCompensationBody) : List String :=
  [body.handlerElementId.value, body.effectElementId.value].eraseDups

private def subjectRetainedIdentityValues :
    CheckedCompensationSubject → List String
  | .boundaryActivity subject boundary body =>
      [subject.value, boundary.value] ++ bodyIdentityValues body
  | .eventSubProcess parent parentScope handlerScope body =>
      [parent.value, parentScope.value, handlerScope.value] ++
        bodyIdentityValues body ++
        match body.input with
        | .empty => []
        | .directRestoredProcessBinding sourceProperty targetInput =>
            [sourceProperty, targetInput]

private def bodyUnavailableToOrdinaryNodes
    (source : CheckedProcess) (body : CheckedCompensationBody) : Bool :=
  !source.nodes.any fun node =>
    node.id == body.handlerElementId || node.id == body.effectElementId

private def boundarySubjectValid (source : CheckedProcess)
    (rootScopeId : DefinitionScopeId)
    (subject boundary : NodeId) (body : CheckedCompensationBody) : Bool :=
  (source.nodes.filter fun
    | .userTask id _ none => id = subject
    | _ => false).length = 1 &&
    checkedNodeScope? source subject = some rootScopeId &&
    body.handlerElementId = body.effectElementId &&
    body.input = .empty && compensationDescriptorValid body.descriptor &&
    bodyUnavailableToOrdinaryNodes source body &&
    !source.nodes.any fun node => node.id == boundary

private def eventSubjectValid (source : CheckedProcess)
    (rootScopeId : DefinitionScopeId) (parent : NodeId)
    (parentScopeId handlerScopeId : DefinitionScopeId)
    (body : CheckedCompensationBody) : Bool :=
  parentScopeId.value = "scope:" ++ parent.value &&
    handlerScopeId.value = "scope:" ++ body.handlerElementId.value &&
    checkedNodeScope? source parent = some rootScopeId &&
    (source.nodes.filter fun
      | .embeddedSubProcess id childScope => id = parent && childScope = parentScopeId
      | _ => false).length = 1 &&
    checkedScope? source parentScopeId = some
      { id := parentScopeId, parentScopeId := some rootScopeId,
        originElementId := parent } &&
    checkedScope? source handlerScopeId = some
      { id := handlerScopeId, parentScopeId := some parentScopeId,
        originElementId := body.handlerElementId } &&
    body.handlerElementId ≠ body.effectElementId &&
    compensationDescriptorValid body.descriptor &&
    bodyUnavailableToOrdinaryNodes source body &&
    match body.input with
    | .empty => false
    | .directRestoredProcessBinding sourceProperty targetInput =>
        nonempty sourceProperty && nonempty targetInput &&
          sourceProperty ≠ targetInput

private def directDependencyValid (source : CheckedProcess)
    (boundaries : List (NodeId × NodeId × CheckedCompensationBody))
    (eventParent : NodeId) (dependency : CheckedCompensationDependency) : Bool :=
  dependency.reason = .sequenceFlow &&
    boundaries.any fun boundary => boundary.1 = dependency.predecessorElementId &&
    dependency.successorElementId = eventParent &&
    (source.sequenceFlows.filter fun flow =>
      flow.sourceId = dependency.predecessorElementId &&
        flow.targetId = dependency.successorElementId &&
        flow.condition.isNone).length = 1

private def rootScopeId? (source : CheckedProcess) : Option DefinitionScopeId :=
  match source.definitionScopes.filter fun scope =>
      scope.parentScopeId.isNone &&
        scope.originElementId.value = source.processId.value with
  | [scope] => some scope.id
  | _ => none

/-- The only nested definition-scope exception is the exact declaration-owned dormant handler. -/
def compensationDormantDefinitionScopeValid
    (source : CheckedProcess) (scope : DefinitionScope) : Bool :=
  match source.compensation with
  | none => false
  | some declaration =>
      (checkedEventSubjects declaration.subjects).any fun event =>
        let parent := event.1
        let parentScopeId := event.2.1
        let handlerScopeId := event.2.2.1
        let body := event.2.2.2
        scope.id = handlerScopeId &&
          scope.parentScopeId = some parentScopeId &&
          scope.originElementId = body.handlerElementId &&
          parentScopeId.value = "scope:" ++ parent.value &&
          handlerScopeId.value = "scope:" ++ body.handlerElementId.value &&
          !source.nodeScopes.any fun ownership => ownership.scopeId = handlerScopeId &&
          !source.sequenceFlowScopes.any fun ownership =>
            ownership.scopeId = handlerScopeId

/-- The ordinary checked graph is the exact source with its sole declaration-owned dormant scope removed. -/
def checkedProcessWithoutCompensationDormantScope
    (source : CheckedProcess) : CheckedProcess :=
  { source with definitionScopes := source.definitionScopes.filter fun scope =>
      !compensationDormantDefinitionScopeValid source scope }

private def selectedCheckedCompensationValid
    (source : CheckedProcess) (declaration : CheckedCompensation) : Bool :=
  match rootScopeId? source,
      checkedBoundarySubjects declaration.subjects,
      checkedEventSubjects declaration.subjects,
      declaration.dependencies with
  | some rootScopeId, boundaries, [(parent, parentScope, handlerScope, body)],
      [dependency] =>
      let retained := [declaration.triggerElementId.value] ++
        declaration.subjects.flatMap subjectRetainedIdentityValues
      rootScopeId.value = "scope:" ++ source.processId.value &&
        declaration.subjects.length = 3 && boundaries.length = 2 &&
        checkedSubjectsStrictlyOrdered declaration.subjects &&
        boundaries.all fun boundary =>
          boundarySubjectValid source rootScopeId boundary.1 boundary.2.1 boundary.2.2 &&
        eventSubjectValid source rootScopeId parent parentScope handlerScope body &&
        directDependencyValid source boundaries parent dependency &&
        declaration.triggerElementId.value ≠ "" &&
        (source.nodes.filter fun
          | .globalSynchronousCompensationThrowEvent id =>
              id = declaration.triggerElementId &&
                checkedNodeScope? source id = some rootScopeId
          | _ => false).length = 1 &&
        retained.all nonempty && retained.eraseDups.length = retained.length &&
        declaration.retentionLimits =
          { maxRecords := 2, maxCanonicalBytes := 4096 } &&
        declaration.snapshotLimits =
          { maxRecords := 1, maxCanonicalBytes := 8192 } &&
        declaration.executionLimits =
          { maxTriggers := 1, maxHandlers := 3, maxCanonicalBytes := 20480 }
  | _, _, _, _ => false

/-- Exact checked declaration admission and physical exclusion from every other profile. -/
def compensationSourceCheckedProfileValid (source : CheckedProcess) : Bool :=
  if source.identity.semanticProfile = compensationSourceCheckpointProfileId then
    match source.compensation with
    | some declaration => selectedCheckedCompensationValid source declaration
    | none => false
  else source.compensation.isNone

private def programBoundarySubjectCount : List CompensationSubjectDefinition → Nat
  | [] => 0
  | .boundaryActivity .. :: rest => programBoundarySubjectCount rest + 1
  | _ :: rest => programBoundarySubjectCount rest

private def programEventSubjectCount : List CompensationSubjectDefinition → Nat
  | [] => 0
  | .eventSubProcess .. :: rest => programEventSubjectCount rest + 1
  | _ :: rest => programEventSubjectCount rest

private def selectedProgramCompensationValid (program : Program) : Bool :=
  match program.compensationActivityRetention,
      program.compensationEventSubProcessSnapshots,
      program.compensationExecution with
  | some retention, some snapshots, some execution =>
      retention.definitionScopeId = execution.definitionScopeId &&
        retention.targets.length = 2 && retention.maxRecords = 2 &&
        retention.maxCanonicalBytes = 4096 &&
        snapshots.targets.length = 1 && snapshots.maxRecords = 1 &&
        snapshots.maxCanonicalBytes = 8192 &&
        execution.subjects.length = 3 &&
        programBoundarySubjectCount execution.subjects = 2 &&
        programEventSubjectCount execution.subjects = 1 &&
        execution.dependencies.length = 1 &&
        execution.limits =
          { maxTriggers := 1, maxHandlers := 3, maxCanonicalBytes := 20480 }
  | _, _, _ => false

/-- Exact Program declaration cardinalities and bounds, with old-profile physical omission. -/
def compensationSourceProgramProfileValid (program : Program) : Bool :=
  if program.identity.semanticProfile = compensationSourceCheckpointProfileId then
    selectedProgramCompensationValid program
  else
    program.compensationActivityRetention.isNone &&
      program.compensationEventSubProcessSnapshots.isNone &&
      program.compensationExecution.isNone

end BpmnSemantics.SemanticProcess
