import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import BpmnSemantics.SemanticProcess.InclusiveGateway
import BpmnSemantics.SemanticProcess.LoweringIdentity

/-! # Timer Start Event lowering

This module owns endpoint-derived Timer Start fan-out and exact `PT1S` normalization. Checked admission establishes the selected source shape before this total projection is used.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Canonical Timer Start outputs derived only from checked Sequence Flow source endpoints. -/
def lowerTimerStartOutputs (source : CheckedProcess) (nodeId : NodeId) :
    List ControlPlaceId :=
  canonicalControlPlaceOrder
    (source.sequenceFlows.filterMap fun flow =>
      if flow.sourceId = nodeId then some (flowControlPlaceId flow.id)
      else none)

/-- Preserve exact Timer Start origin and independently normalize only the admitted `PT1S` literal. -/
def lowerTimerStartOperation (source : CheckedProcess) (id : NodeId)
    (durationLiteral : String) : SemanticOperation :=
  .initiateTimer
    (nodeOperationId id)
    { elementId := id }
    (if durationLiteral = "PT1S" then 1000 else 0)
    (lowerTimerStartOutputs source id)

end BpmnSemantics.SemanticProcess
