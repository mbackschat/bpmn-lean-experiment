import BpmnSemantics.EnginePopulationScenario
import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.RootScopeFixtures

/-! # Engine-population scenario conformance

These small kernel-decided fixtures lock the population-level properties that singleton transition
tests cannot separate: ambiguity instead of lexical selection, complete-definition isolation,
non-target preservation, canonical permutation invariance, and exact definition binding.
-/

namespace BpmnSemantics.EnginePopulationScenarioConformance

open BpmnSemantics
open BpmnSemantics.EnginePopulationScenario
open BpmnSemantics.SemanticProcess

def sourceShaA : String :=
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

def sourceShaB : String :=
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

def processId : ProcessId := ⟨"Process_SettlementCorrelation"⟩

def channel : MessageChannel :=
  .operationMessage ⟨"Interface_Settlement"⟩
    ⟨"Operation_ConfirmSettlement"⟩ ⟨"Message_Settlement"⟩

def directOutput : DirectCatchEventPayloadOutput :=
  { associationId := "DataOutputAssociation_SettlementReference"
    sourceDataOutputId := "DataOutput_SettlementReference"
    sourceDataOutputName := some "Settlement reference"
    targetPropertyId := "Property_SettlementReference" }

def payloadSelector : CorrelationMessagePath :=
  { language := correlationScalarPathLanguage, body := "payload" }

def processPropertySelector : CorrelationProcessPropertyPath :=
  { language := correlationScalarPathLanguage
    body := "property:Property_SettlementReference"
    propertyId := "Property_SettlementReference" }

def resourceA : ResourceIdentity :=
  { id := ⟨"settlement-correlation"⟩
    relativePath := "scenarios/message-key-correlation/process.bpmn"
    sha256 := sourceShaA }

def resourceB : ResourceIdentity :=
  { id := ⟨"settlement-correlation-shadow"⟩
    relativePath := "scenarios/message-key-correlation/process-other-definition.bpmn"
    sha256 := sourceShaB }

def checkedProcessFor (resource : ResourceIdentity) : CheckedProcess :=
  { identity :=
      { semanticProfile := messageKeyCorrelationProfileId
        sourceId := resource.id
        sourceOverlay := resource.sourceOverlay
        sourceSha256 := resource.sha256 }
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [ ⟨"EndEvent_SettlementReviewed"⟩
      , ⟨"MessageCatch_CorrelatedSettlement"⟩
      , ⟨"MessageCatch_InitialSettlement"⟩
      , ⟨"StartEvent_SettlementCorrelation"⟩
      , ⟨"UserTask_ReviewSettlement"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"Flow_Correlated_Review"⟩
      , ⟨"Flow_Initial_Correlated"⟩
      , ⟨"Flow_Review_End"⟩
      , ⟨"Flow_Start_Initial"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_SettlementReviewed"⟩
      , .correlatedPayloadMessageCatchEvent
          ⟨"MessageCatch_CorrelatedSettlement"⟩ channel
          "CorrelationKey_SettlementReference"
          "CorrelationProperty_SettlementReference"
          payloadSelector processPropertySelector
      , .payloadMessageCatchEvent
          ⟨"MessageCatch_InitialSettlement"⟩ channel directOutput
      , .noneStartEvent ⟨"StartEvent_SettlementCorrelation"⟩
      , .userTask ⟨"UserTask_ReviewSettlement"⟩ (some "Review settlement") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Correlated_Review"⟩
          sourceId := ⟨"MessageCatch_CorrelatedSettlement"⟩
          targetId := ⟨"UserTask_ReviewSettlement"⟩ }
      , { id := ⟨"Flow_Initial_Correlated"⟩
          sourceId := ⟨"MessageCatch_InitialSettlement"⟩
          targetId := ⟨"MessageCatch_CorrelatedSettlement"⟩ }
      , { id := ⟨"Flow_Review_End"⟩
          sourceId := ⟨"UserTask_ReviewSettlement"⟩
          targetId := ⟨"EndEvent_SettlementReviewed"⟩ }
      , { id := ⟨"Flow_Start_Initial"⟩
          sourceId := ⟨"StartEvent_SettlementCorrelation"⟩
          targetId := ⟨"MessageCatch_InitialSettlement"⟩ } ] }

def programA : Program := lowerCheckedProcess (checkedProcessFor resourceA)
def programB : Program := lowerCheckedProcess (checkedProcessFor resourceB)

def initializedInstance (definitionId : SemanticId) (instanceId key : String) :
    EnginePopulationInstance :=
  { definitionId
    stimuli :=
      [ .startProcess ⟨"start-" ++ instanceId⟩ ⟨processId.value⟩
          ⟨instanceId⟩ []
      , .deliverPayloadMessage ⟨"initialize-" ++ instanceId⟩
          { processInstanceId := ⟨instanceId⟩
            elementId := ⟨"MessageCatch_InitialSettlement"⟩
            activation := 1 }
          channel (.string key) ] }

def publicationAddress (resource : ResourceIdentity) : CorrelatedMessageAddress :=
  { definition :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := messageKeyCorrelationProfileId
        sourceId := resource.id
        sourceOverlay := resource.sourceOverlay
        sourceSha256 := resource.sha256 }
    processId
    channel
    correlationKeyId := "CorrelationKey_SettlementReference" }

def scenarioFor (firstKey secondKey publishedKey : String) :
    EnginePopulationScenario :=
  { kind := .enginePopulationScenario
    id := ⟨"correlated-settlement-confirmation"⟩
    profile := messageKeyCorrelationProfileId
    definitions := [resourceA]
    instances :=
      [ initializedInstance resourceA.id "ProcessInstance_A" firstKey
      , initializedInstance resourceA.id "ProcessInstance_B" secondKey ]
    publications :=
      [{ kind := .publishCorrelatedPayloadMessage
         commandId := ⟨"publish-correlated-settlement"⟩
         address := publicationAddress resourceA
         payload := { value := publishedKey } }]
    observations := [.publicationResults, .processStates, .ingressOrdinals]
    executionTargets :=
      { leanTarget := true, typeScriptCore := true, temporal := true, cib := none }
    provenance :=
      { normativeRefs := ["BPMN20.xsd#tCorrelationKey"]
        cibRevision := "5a45b47ea22688d774de97277c3ff7013f54fdd2"
        cibRefs := [] } }

def bindingsA : List (SemanticId × Program) := [(resourceA.id, programA)]

def uniqueScenario : EnginePopulationScenario :=
  scenarioFor "settlement-42" "settlement-84" "settlement-42"

def zeroScenario : EnginePopulationScenario :=
  scenarioFor "settlement-42" "settlement-84" "settlement-00"

def ambiguousScenario : EnginePopulationScenario :=
  scenarioFor "settlement-42" "settlement-42" "settlement-42"

def crossDefinitionScenario : EnginePopulationScenario :=
  { scenarioFor "settlement-42" "settlement-42" "settlement-42" with
    definitions := [resourceA, resourceB]
    instances :=
      [ initializedInstance resourceA.id "ProcessInstance_A" "settlement-42"
      , initializedInstance resourceB.id "ProcessInstance_B" "settlement-42" ] }

def crossDefinitionBindings : List (SemanticId × Program) :=
  [(resourceA.id, programA), (resourceB.id, programB)]

def publicationOutcome? (scenario : EnginePopulationScenario)
    (bindings : List (SemanticId × Program)) :
    Option EnginePopulationPublicationOutcome := do
  let result ← runEnginePopulationScenario scenario bindings
  match result.publicationResults with
  | [publication] => some publication.outcome
  | _ => none

def processState? (scenario : EnginePopulationScenario)
    (bindings : List (SemanticId × Program)) (instanceId : String) :
    Option StateObservation := do
  let result ← runEnginePopulationScenario scenario bindings
  result.processStates.find? fun state => state.instanceId.value = instanceId

def driftedProgram : Program :=
  { programA with
    identity := { programA.identity with sourceSha256 := sourceShaB } }

/-- These concrete population fixtures evaluate equality over `String`-valued definition, Process,
subscription, command, and correlation-key identities. Kernel `decide` reaches its reduction boundary
while walking those executable strings, so the session-authorized single `native_decide` site checks
the complete fixture matrix once; every public theorem below is only a projection of this fact. -/
theorem enginePopulationFixtureFacts :
    ([checkedProcessFor resourceA, checkedProcessFor resourceB].all
        (fun source => checkedWellFormed source) = true ∧
      [programA, programB].all programWellFormed = true ∧
      [programA, programB].all programProfileCapabilitiesValid = true) ∧
    (publicationOutcome? uniqueScenario bindingsA =
        some (.committed
          { processInstanceId := ⟨"ProcessInstance_A"⟩
            subscriptionId :=
              { processInstanceId := ⟨"ProcessInstance_A"⟩
                elementId := ⟨"MessageCatch_CorrelatedSettlement"⟩
                activation := 1 } }) ∧
        (processState? uniqueScenario bindingsA "ProcessInstance_A").map
            (fun state =>
              (state.openMessageSubscriptions.length,
                state.openUserTasks.map fun task => task.id.elementId.value,
                state.variables)) =
          some
            (0, ["UserTask_ReviewSettlement"],
              [{ name := "Property_SettlementReference"
                 value := .string "settlement-42" }]) ∧
        (processState? uniqueScenario bindingsA "ProcessInstance_B").map
            (fun state =>
              (state.openMessageSubscriptions.map fun wait => wait.id.elementId.value,
                state.openUserTasks.length,
                state.variables)) =
          some
            (["MessageCatch_CorrelatedSettlement"], 0,
              [{ name := "Property_SettlementReference"
                 value := .string "settlement-84" }])) ∧
    (publicationOutcome? zeroScenario bindingsA = some .rejectedNoMatch ∧
      ["ProcessInstance_A", "ProcessInstance_B"].all fun instanceId =>
        (processState? zeroScenario bindingsA instanceId).any fun state =>
          state.openMessageSubscriptions.length = 1 && state.openUserTasks.isEmpty) ∧
    (publicationOutcome? ambiguousScenario bindingsA = some .rejectedAmbiguous ∧
      ["ProcessInstance_A", "ProcessInstance_B"].all fun instanceId =>
        (processState? ambiguousScenario bindingsA instanceId).any fun state =>
          state.openMessageSubscriptions.length = 1 && state.openUserTasks.isEmpty) ∧
    (publicationOutcome? crossDefinitionScenario crossDefinitionBindings =
        some (.committed
          { processInstanceId := ⟨"ProcessInstance_A"⟩
            subscriptionId :=
              { processInstanceId := ⟨"ProcessInstance_A"⟩
                elementId := ⟨"MessageCatch_CorrelatedSettlement"⟩
                activation := 1 } }) ∧
      (processState? crossDefinitionScenario crossDefinitionBindings
          "ProcessInstance_B").any fun state =>
        state.openMessageSubscriptions.length = 1 && state.openUserTasks.isEmpty) ∧
    (runEnginePopulationScenario crossDefinitionScenario crossDefinitionBindings =
      runEnginePopulationScenario
        { crossDefinitionScenario with
          definitions := crossDefinitionScenario.definitions.reverse
          instances := crossDefinitionScenario.instances.reverse }
        crossDefinitionBindings.reverse) ∧
    ([ runEnginePopulationScenario uniqueScenario []
      , runEnginePopulationScenario uniqueScenario [(resourceA.id, driftedProgram)]
      , runEnginePopulationScenario uniqueScenario [(⟨"wrong-definition"⟩, programA)]
      , runEnginePopulationScenario uniqueScenario
          [(resourceA.id, programA), (⟨"unexpected"⟩, programA)] ].all
        Option.isNone = true) := by
  native_decide

/-- Both checked definitions and their canonical lowerings satisfy the exact selected profile. -/
theorem definitionFixturesAreAdmitted :
    [checkedProcessFor resourceA, checkedProcessFor resourceB].all
        (fun source => checkedWellFormed source) = true ∧
      [programA, programB].all programWellFormed = true ∧
      [programA, programB].all programProfileCapabilitiesValid = true := by
  exact enginePopulationFixtureFacts.1

/-- Exactly one same-definition key match advances only that target and publishes no caller-chosen
identity beyond the selected Process and subscription occurrence. -/
theorem uniquePublicationSelectsOnlyMatchingProcess :
    publicationOutcome? uniqueScenario bindingsA =
      some (.committed
        { processInstanceId := ⟨"ProcessInstance_A"⟩
          subscriptionId :=
            { processInstanceId := ⟨"ProcessInstance_A"⟩
              elementId := ⟨"MessageCatch_CorrelatedSettlement"⟩
              activation := 1 } }) ∧
      (processState? uniqueScenario bindingsA "ProcessInstance_A").map
          (fun state =>
            (state.openMessageSubscriptions.length,
              state.openUserTasks.map fun task => task.id.elementId.value,
              state.variables)) =
        some
          (0, ["UserTask_ReviewSettlement"],
            [{ name := "Property_SettlementReference"
               value := .string "settlement-42" }]) ∧
      (processState? uniqueScenario bindingsA "ProcessInstance_B").map
          (fun state =>
            (state.openMessageSubscriptions.map fun wait => wait.id.elementId.value,
              state.openUserTasks.length,
              state.variables)) =
        some
          (["MessageCatch_CorrelatedSettlement"], 0,
            [{ name := "Property_SettlementReference"
               value := .string "settlement-84" }]) := by
  exact enginePopulationFixtureFacts.2.1

/-- No candidate matching the published key is a semantic rejection and preserves both waits. -/
theorem zeroMatchPreservesEveryProcess :
    publicationOutcome? zeroScenario bindingsA = some .rejectedNoMatch ∧
      ["ProcessInstance_A", "ProcessInstance_B"].all fun instanceId =>
        (processState? zeroScenario bindingsA instanceId).any fun state =>
          state.openMessageSubscriptions.length = 1 && state.openUserTasks.isEmpty := by
  exact enginePopulationFixtureFacts.2.2.1

/-- Two equal-key candidates are ambiguous and unchanged; lexical input order cannot choose one. -/
theorem duplicateKeysAreAmbiguousAndPreserved :
    publicationOutcome? ambiguousScenario bindingsA = some .rejectedAmbiguous ∧
      ["ProcessInstance_A", "ProcessInstance_B"].all fun instanceId =>
        (processState? ambiguousScenario bindingsA instanceId).any fun state =>
          state.openMessageSubscriptions.length = 1 && state.openUserTasks.isEmpty := by
  exact enginePopulationFixtureFacts.2.2.2.1

/-- Equal local ids and key under another source digest remain outside the addressed population. -/
theorem completeDefinitionAddressIsolatesEqualLocalIds :
    publicationOutcome? crossDefinitionScenario crossDefinitionBindings =
      some (.committed
        { processInstanceId := ⟨"ProcessInstance_A"⟩
          subscriptionId :=
            { processInstanceId := ⟨"ProcessInstance_A"⟩
              elementId := ⟨"MessageCatch_CorrelatedSettlement"⟩
              activation := 1 } }) ∧
      (processState? crossDefinitionScenario crossDefinitionBindings
          "ProcessInstance_B").any fun state =>
        state.openMessageSubscriptions.length = 1 && state.openUserTasks.isEmpty := by
  exact enginePopulationFixtureFacts.2.2.2.2.1

/-- Definition, instance, and binding insertion order cannot affect the canonical result. -/
theorem resultIsInvariantUnderPopulationPermutation :
    runEnginePopulationScenario crossDefinitionScenario crossDefinitionBindings =
      runEnginePopulationScenario
        { crossDefinitionScenario with
          definitions := crossDefinitionScenario.definitions.reverse
          instances := crossDefinitionScenario.instances.reverse }
        crossDefinitionBindings.reverse := by
  exact enginePopulationFixtureFacts.2.2.2.2.2.1

/-- Missing, drifted, miskeyed, and surplus program bindings all fail before execution. -/
theorem malformedDefinitionBindingsAreRefused :
    [ runEnginePopulationScenario uniqueScenario []
    , runEnginePopulationScenario uniqueScenario [(resourceA.id, driftedProgram)]
    , runEnginePopulationScenario uniqueScenario [(⟨"wrong-definition"⟩, programA)]
    , runEnginePopulationScenario uniqueScenario
        [(resourceA.id, programA), (⟨"unexpected"⟩, programA)] ].all Option.isNone = true := by
  exact enginePopulationFixtureFacts.2.2.2.2.2.2

end BpmnSemantics.EnginePopulationScenarioConformance
