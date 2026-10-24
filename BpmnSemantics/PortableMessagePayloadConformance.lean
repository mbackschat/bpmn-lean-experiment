import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.MessagePayloadPreservation
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario

/-! # Structured Message-payload conformance

Finite checked witnesses of the structured Message-payload profile run the shipment-manifest intake
through the actual external dispatcher and its internal closure: the same checked payload-catch graph
is admitted under both payload profiles, so only the profile's Message-payload domain separates the
structured delivery from its refusal under the closed scalar profile. They do not discharge a
quantified law over arbitrary payloads; the 1,024-byte root-String bound is stated by
`portableMessagePayload_value_domain` instead of kernel-reducing boundary-sized values, and
restoration and caller aliasing are TypeScript and hosted claims; see the
[structured Message-payload amendment](../docs/capsules/PORTABLE-BUSINESS-VALUES-PROPOSAL.md#structured-message-payload-consuming-amendment).
-/

namespace BpmnSemantics.PortableMessagePayloadConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def channel : MessageChannel :=
  .operationMessage ⟨"Interface_Carrier"⟩ ⟨"Operation_SubmitManifest"⟩ ⟨"Message_ManifestReceived"⟩

def directOutput : DirectCatchEventPayloadOutput :=
  { associationId := "DataOutputAssociation_Manifest"
    sourceDataOutputId := "DataOutput_Manifest"
    sourceDataOutputName := some "Received manifest"
    targetPropertyId := "Property_ShipmentManifest" }

/-- Start, the payload catch *Manifest received*, *Review manifest*, End. -/
def checkedUnder (profile : ProfileId) : CheckedProcess :=
  { identity :=
      { semanticProfile := profile
        sourceId := ⟨"shipment-manifest-intake"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000001" }
    processId := ⟨"P"⟩
    definitionScopes := [rootDefinitionScope ⟨"P"⟩]
    nodeScopes := rootNodeScopes ⟨"P"⟩ [⟨"C"⟩, ⟨"E"⟩, ⟨"S"⟩, ⟨"T"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes ⟨"P"⟩ [⟨"f1"⟩, ⟨"f2"⟩, ⟨"f3"⟩]
    nodes :=
      [ .payloadMessageCatchEvent ⟨"C"⟩ channel directOutput
      , .noneEndEvent ⟨"E"⟩
      , .noneStartEvent ⟨"S"⟩
      , .userTask ⟨"T"⟩ (some "Review manifest") ]
    sequenceFlows :=
      [ { id := ⟨"f1"⟩, sourceId := ⟨"S"⟩, targetId := ⟨"C"⟩ }
      , { id := ⟨"f2"⟩, sourceId := ⟨"C"⟩, targetId := ⟨"T"⟩ }
      , { id := ⟨"f3"⟩, sourceId := ⟨"T"⟩, targetId := ⟨"E"⟩ } ] }

def checked : CheckedProcess := checkedUnder portableMessagePayloadProfileId

def program : Program := lowerCheckedProcess checked

def closedProgram : Program := lowerCheckedProcess (checkedUnder messagePayloadCatchProfileId)

def parcel (reference : String) (kilograms : Nat) : BusinessValue :=
  .map [("reference", .string reference), ("weightKg", .integer kilograms)]

/-- Two equal parcels then a different one, a negative scale-two Decimal, a nested Map with a present
Null, and a Boolean. -/
def manifest : VariableValue :=
  .map [("consignee", .map [("line1", .string "Harbour Road 4"), ("line2", .null)]),
        ("declaredValue", .decimal (-123455) 2),
        ("hazardous", .boolean false),
        ("parcels", .list [parcel "P-1" 12, parcel "P-1" 12, parcel "P-2" 3])]

def subscriptionId : MessageSubscriptionId :=
  { processInstanceId := ⟨"I"⟩, elementId := ⟨"C"⟩, activation := 1 }

def taskId : UserTaskInstanceId :=
  { processInstanceId := ⟨"I"⟩, elementId := ⟨"T"⟩, activation := 1 }

def start (target : Program) : StimulusResult :=
  applyStimulus 8 target initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"I"⟩ [])

def deliver (target : Program) (before : RuntimeState) (payload : VariableValue) :
    StimulusResult :=
  applyStimulus 8 target before (.deliverPayloadMessage ⟨"deliver"⟩ subscriptionId channel payload)

def waiting : StimulusResult := start program

def delivered : StimulusResult := deliver program waiting.state manifest

def completed : StimulusResult :=
  applyStimulus 8 program delivered.state (.completeUserTaskInstance ⟨"review"⟩ taskId [])

def refusedUnchanged (result : StimulusResult) (before : RuntimeState) : Bool :=
  result.outcome == .rejected && result.state == before

theorem shipment_manifest_definition_is_admitted :
    checkedWellFormed checked = true ∧ programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true ∧
      definitionBindingValid checked program = true := by
  decide +kernel

/-- PBV-MSG-01 and PBV-MSG-02 along the journey: delivery withdraws the only subscription and writes
the manifest exactly to the associated Property in one commit, and Review and End retain it. Each
step is one dispatcher evaluation; the conjuncts only read its result. -/
theorem structured_manifest_is_one_atomic_routed_write :
    (waiting.outcome == .committed && waiting.state.messageWaits.length == 1 &&
      delivered.outcome == .committed && delivered.state.messageWaits.isEmpty &&
      delivered.state.variables.process.bindings ==
        [{ name := directOutput.targetPropertyId, value := manifest }] &&
      delivered.state.waits.length == 1 &&
      completed.outcome == .committed && completed.state.control == .completed ⟨"I"⟩ &&
      completed.state.variables.process.bindings ==
        [{ name := directOutput.targetPropertyId, value := manifest }]) = true := by
  decide +kernel

/-- A root List, a root legacy `stringList` and a payload-free delivery are semantic rejections that
leave the committed state, and so the subscription, unchanged. -/
theorem out_of_domain_deliveries_refuse_with_the_subscription_live :
    refusedUnchanged (deliver program waiting.state (.list [.string "P-1"])) waiting.state = true ∧
      refusedUnchanged (deliver program waiting.state (.stringList ["P-1"])) waiting.state = true ∧
      refusedUnchanged
          (applyStimulus 8 program waiting.state (.deliverMessage ⟨"deliver"⟩ subscriptionId channel))
          waiting.state = true := by
  decide +kernel

/-- The closed payload-catch profile admits the same graph and still refuses the manifest while it
commits a scalar, so the separating difference is the profile's payload domain alone. -/
theorem closed_payload_catch_profile_refuses_the_manifest :
    (start closedProgram).outcome = .committed ∧
      refusedUnchanged (deliver closedProgram (start closedProgram).state manifest)
        (start closedProgram).state = true ∧
      (deliver closedProgram (start closedProgram).state (.string "ref")).outcome = .committed := by
  decide +kernel

def settled : RuntimeState :=
  (deliverPayloadMessage program waiting.state subscriptionId channel manifest).getD initialState

/-- The widened preservation theorem closes on the structured profile's admitted delivery. -/
theorem structured_delivery_preserves_runtimeStateWellFormed :
    runtimeStateWellFormed program subscriptionId.processInstanceId settled = true := by
  apply deliverPayloadMessage_preserves_runtimeStateWellFormed program
    subscriptionId.processInstanceId waiting.state settled subscriptionId channel manifest
  all_goals decide +kernel

end BpmnSemantics.PortableMessagePayloadConformance
