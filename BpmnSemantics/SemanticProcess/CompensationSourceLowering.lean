import BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import BpmnSemantics.SemanticProcess.LoweringIdentity

/-! # Checked Compensation source lowering -/

namespace BpmnSemantics.SemanticProcess

private def rootScopeId (source : CheckedProcess) : DefinitionScopeId :=
  (source.definitionScopes.find? fun scope =>
    scope.parentScopeId.isNone &&
      scope.originElementId.value = source.processId.value).map (fun scope => scope.id)
    |>.getD ⟨""⟩

private def lowerInput : CheckedCompensationInput → CompensationHandlerInput
  | .empty => .empty
  | .directRestoredProcessBinding sourcePropertyId targetDataInputId =>
      .restoredProcessBinding sourcePropertyId targetDataInputId

private def lowerBody (body : CheckedCompensationBody) :
    SingleEffectCompensationHandlerBody :=
  { handlerElementId := body.handlerElementId
    effectElementId := body.effectElementId
    descriptor := body.descriptor
    input := lowerInput body.input }

private def lowerRetentionTarget? : CheckedCompensationSubject →
    Option BoundaryCompensationTarget
  | .boundaryActivity subjectElementId boundaryEventElementId body =>
      some
        { activityElementId := subjectElementId
          boundaryEventElementId
          compensationActivityElementId := body.handlerElementId }
  | .eventSubProcess .. => none

private def lowerSnapshotTarget? : CheckedCompensationSubject →
    Option CompensationEventSubProcessSnapshotTarget
  | .eventSubProcess _ parentScopeId handlerScopeId _ =>
      some { parentScopeId, handlerScopeId }
  | .boundaryActivity .. => none

private def lowerSubject : CheckedCompensationSubject →
    CompensationSubjectDefinition
  | .boundaryActivity subjectElementId _ body =>
      .boundaryActivity subjectElementId (lowerBody body)
  | .eventSubProcess _ parentScopeId handlerScopeId body =>
      .eventSubProcess parentScopeId handlerScopeId (lowerBody body)

private def lowerDependency
    (dependency : CheckedCompensationDependency) : CompensationDependency :=
  { predecessorElementId := dependency.predecessorElementId
    successorElementId := dependency.successorElementId }

def lowerCheckedCompensationActivityRetention
    (source : CheckedProcess) : Option CompensationActivityRetentionDeclaration :=
  source.compensation.map fun declaration =>
    { definitionScopeId := rootScopeId source
      targets := declaration.subjects.filterMap lowerRetentionTarget?
      maxRecords := declaration.retentionLimits.maxRecords
      maxCanonicalBytes := declaration.retentionLimits.maxCanonicalBytes }

def lowerCheckedCompensationSnapshots
    (source : CheckedProcess) : Option CompensationEventSubProcessSnapshotDeclaration :=
  source.compensation.map fun declaration =>
    { targets := declaration.subjects.filterMap lowerSnapshotTarget?
      maxRecords := declaration.snapshotLimits.maxRecords
      maxCanonicalBytes := declaration.snapshotLimits.maxCanonicalBytes }

def lowerCheckedCompensationExecution
    (source : CheckedProcess) : Option CompensationExecutionDeclaration :=
  source.compensation.map fun declaration =>
    { definitionScopeId := rootScopeId source
      triggerOperationId := nodeOperationId declaration.triggerElementId
      subjects := declaration.subjects.map lowerSubject
      dependencies := declaration.dependencies.map lowerDependency
      limits :=
        { maxTriggers := declaration.executionLimits.maxTriggers
          maxHandlers := declaration.executionLimits.maxHandlers
          maxCanonicalBytes := declaration.executionLimits.maxCanonicalBytes } }

def lowerGlobalSynchronousCompensationThrow
    (source : CheckedProcess) (id : NodeId)
    (input output : ControlPlaceId) : SemanticOperation :=
  .triggerCompensation (nodeOperationId id) { elementId := id }
    (rootScopeId source) input output

def checkedScopeIsCompensationDormant
    (source : CheckedProcess) (scope : DefinitionScope) : Bool :=
  compensationDormantDefinitionScopeValid source scope

end BpmnSemantics.SemanticProcess
