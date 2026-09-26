import BpmnSemantics.SemanticProcess.LoweringIdentity

/-! # Child-owned Transaction lowering -/
namespace BpmnSemantics.SemanticProcess

/-- The new declaration selects the child register; existing root Compensation lowering remains separate. -/
def lowerTransactionRetention (s : CheckedProcess) : Option CompensationActivityRetentionDeclaration := do
  let d ← s.transactionCancellation
  let .boundaryActivity eligible boundary body := d.subject | none
  pure
    { definitionScopeId := d.definitionScopeId
      targets :=
        [{ activityElementId := eligible
           boundaryEventElementId := boundary
           compensationActivityElementId := body.handlerElementId }]
      maxRecords := d.retentionLimits.maxRecords
      maxCanonicalBytes := d.retentionLimits.maxCanonicalBytes }

def lowerTransactionExecution (s : CheckedProcess) : Option CompensationExecutionDeclaration := do
  let d ← s.transactionCancellation
  let .boundaryActivity eligible _ body := d.subject | none
  pure
    { definitionScopeId := d.definitionScopeId
      triggerOperationId := nodeOperationId d.triggerElementId
      subjects := [.boundaryActivity eligible
        { handlerElementId := body.handlerElementId
          effectElementId := body.effectElementId
          descriptor := body.descriptor
          input := .empty }]
      dependencies := []
      limits :=
        { maxTriggers := d.executionLimits.maxTriggers
          maxHandlers := d.executionLimits.maxHandlers
          maxCanonicalBytes := d.executionLimits.maxCanonicalBytes } }

/-- Cancel emits to the attached Boundary's direct-parent place, never to the Transaction's normal output. -/
def lowerTransactionCancel (s : CheckedProcess) (id : NodeId) (input : ControlPlaceId) :
    Option (SemanticOperation × DefinitionScopeId) := do
  let d ← s.transactionCancellation
  if d.triggerElementId != id then none else
  let transaction ← s.nodes.findSome? fun
    | .transactionSubProcess transaction scope _ => if scope == d.definitionScopeId then some transaction else none
    | _ => none
  let (boundary, output) ← s.nodes.findSome? fun
    | .cancelBoundaryEvent boundary attached output => if attached == transaction then some (boundary, output) else none
    | _ => none
  pure (.cancelTransaction (nodeOperationId id) { elementId := id }
    d.definitionScopeId input (flowControlPlaceId output) boundary, d.definitionScopeId)

end BpmnSemantics.SemanticProcess
