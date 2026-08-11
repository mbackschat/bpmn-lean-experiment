import BpmnSemantics.SemanticProcess.LoweringIdentity

/-! # Configured Task lowering

This module owns the endpoint-only specialization from a distinct configured checked Task to the
existing neutral effect operation. Admission supplies the one input, one output, containing scope,
and exact Probe descriptor.
-/

namespace BpmnSemantics.SemanticProcess

/-- Lower one configured Task without adding an operation family, mappings, or BPMN Error route. -/
def lowerConfiguredTask? (scopeId : Option DefinitionScopeId)
    (id : NodeId) (descriptor : EffectDescriptor)
    (input output : ControlPlaceId) :
    Option (SemanticOperation × DefinitionScopeId) :=
  scopeId.map fun ownedScopeId =>
    ( .awaitEffect
        (nodeOperationId id)
        { elementId := id }
        input
        output
        { elementId := id
          descriptor
          inputMappings := []
          outputMappings := [] }
        none
    , ownedScopeId )

end BpmnSemantics.SemanticProcess
