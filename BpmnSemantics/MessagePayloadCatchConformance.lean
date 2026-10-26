module

public import BpmnSemantics.MessagePayloadCatchConformanceCheckFixtures
import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.InternalCommutationCensus
import BpmnSemantics.SemanticProcess.MessagePayloadPreservation
import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
/-! # Message payload Catch Event conformance

This module closes the bounded direct-output Message Catch Event account. Its settlement witness
keeps the Catch Event, Message, source `DataOutput`, association target `Property`, and supplied
payload identities pairwise distinct so an implementation that merges any of them cannot satisfy
the routed-write evidence by coincidence.
-/

@[expose] public section

namespace BpmnSemantics.MessagePayloadCatchConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
/-- The executable settlement is also an instance of the declarative fill-and-route relation. -/
theorem exactDeliveryHasDeclarativePayloadStep :
    PayloadMessageDeliveryStep program messageWaitingResult.state subscriptionId channel payload
      payloadSettledState := by
  apply deliverPayloadMessage_sound program messageWaitingResult.state payloadSettledState
  decide +kernel

/-- The generic preservation theorem closes on the exact admitted program and armed state. -/
theorem exactSuccessfulDeliveryPreservesRuntimeStateWellFormed :
    runtimeStateWellFormed program subscriptionId.processInstanceId payloadSettledState = true := by
  apply deliverPayloadMessage_preserves_runtimeStateWellFormed program
    subscriptionId.processInstanceId messageWaitingResult.state payloadSettledState subscriptionId
    channel payload
  all_goals decide +kernel

end BpmnSemantics.MessagePayloadCatchConformance
