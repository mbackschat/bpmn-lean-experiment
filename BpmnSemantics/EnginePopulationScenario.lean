import BpmnSemantics.SemanticProcess.Scenario

/-! # Engine-population scenarios

This module owns the bounded multi-instance scenario evaluator used to compare global Message key
correlation across the Lean interpreter, the TypeScript semantic core, and Temporal hosting. It
executes each Process independently until its correlated wait, matches the complete candidate
population once, and delivers only the exact retained unique candidate.
-/

namespace BpmnSemantics.EnginePopulationScenario

open BpmnSemantics
open BpmnSemantics.SemanticProcess

inductive EnginePopulationScenarioKind where
  | enginePopulationScenario
  deriving Repr, DecidableEq

inductive EnginePopulationPublicationKind where
  | publishCorrelatedPayloadMessage
  deriving Repr, DecidableEq

inductive EnginePopulationObservationKind where
  | publicationResults
  | processStates
  | ingressOrdinals
  deriving Repr, DecidableEq

structure EnginePopulationExecutionTargets where
  leanTarget : Bool
  typeScriptCore : Bool
  temporal : Bool
  cib : Option Bool
  deriving Repr, DecidableEq

structure EnginePopulationInstance where
  definitionId : SemanticId
  stimuli : List Stimulus
  deriving Repr, DecidableEq

structure EnginePopulationPublication where
  kind : EnginePopulationPublicationKind
  commandId : SemanticId
  address : CorrelatedMessageAddress
  payload : CorrelatedStringPayload
  deriving Repr, DecidableEq

structure EnginePopulationScenario where
  kind : EnginePopulationScenarioKind
  id : ScenarioId
  profile : ProfileId
  definitions : List ResourceIdentity
  instances : List EnginePopulationInstance
  publications : List EnginePopulationPublication
  observations : List EnginePopulationObservationKind
  executionTargets : EnginePopulationExecutionTargets
  provenance : ScenarioProvenance
  deriving Repr, DecidableEq

structure EnginePopulationTarget where
  processInstanceId : SemanticId
  subscriptionId : MessageSubscriptionId
  deriving Repr, DecidableEq

inductive EnginePopulationPublicationOutcome where
  | committed (target : EnginePopulationTarget)
  | rejectedNoMatch
  | rejectedAmbiguous
  deriving Repr, DecidableEq

structure EnginePopulationPublicationResult where
  commandId : SemanticId
  ingressOrdinal : Nat
  outcome : EnginePopulationPublicationOutcome
  deriving Repr, DecidableEq

structure EnginePopulationIngressOrdinal where
  commandId : SemanticId
  ingressOrdinal : Nat
  deriving Repr, DecidableEq

inductive EnginePopulationResultKind where
  | enginePopulationResult
  deriving Repr, DecidableEq

structure EnginePopulationResult where
  kind : EnginePopulationResultKind
  scenarioId : ScenarioId
  publicationResults : List EnginePopulationPublicationResult
  processStates : List StateObservation
  ingressOrdinals : List EnginePopulationIngressOrdinal
  deriving Repr, DecidableEq

private structure ProcessExecution where
  definitionId : SemanticId
  program : Program
  instanceId : SemanticId
  state : RuntimeState
  deriving Repr, DecidableEq

private def resourceIdentityValid (resource : ResourceIdentity) : Bool :=
  !resource.id.value.isEmpty && !resource.relativePath.isEmpty &&
    lowercaseHexSha256 resource.sha256 &&
    match resource.sourceOverlay with
    | none => true
    | some overlay =>
        !overlay.id.value.isEmpty && lowercaseHexSha256 overlay.sha256

private def programMatchesResource (profile : ProfileId)
    (resource : ResourceIdentity) (program : Program) : Bool :=
  programWellFormed program && programProfileCapabilitiesValid program &&
    program.identity.semanticProfile = profile &&
    program.identity.sourceId = resource.id &&
    program.identity.sourceSha256 = resource.sha256 &&
    program.identity.sourceOverlay = resource.sourceOverlay

private def exactProgramBinding? (profile : ProfileId)
    (resource : ResourceIdentity) (bindings : List (SemanticId × Program)) :
    Option Program :=
  match bindings.filter fun binding => binding.1 = resource.id with
  | [binding] =>
      if programMatchesResource profile resource binding.2 then some binding.2
      else none
  | _ => none

private def definitionsAndBindingsAgree (scenario : EnginePopulationScenario)
    (bindings : List (SemanticId × Program)) : Bool :=
  scenario.definitions.length = bindings.length &&
    decide (scenario.definitions.map fun resource => resource.id.value).Nodup &&
    decide (bindings.map fun binding => binding.1.value).Nodup &&
    scenario.definitions.all resourceIdentityValid &&
    (scenario.definitions.all fun resource =>
      (exactProgramBinding? scenario.profile resource bindings).isSome) &&
    (bindings.all fun binding =>
      (scenario.definitions.filter fun resource => resource.id = binding.1).length = 1)

private def publicationProgramBindingAgrees (scenario : EnginePopulationScenario)
    (bindings : List (SemanticId × Program)) : Bool :=
  match scenario.publications with
  | [publication] =>
      match scenario.definitions.filter fun resource =>
          resource.id = publication.address.definition.sourceId &&
            resource.sha256 = publication.address.definition.sourceSha256 &&
            resource.sourceOverlay = publication.address.definition.sourceOverlay with
      | [resource] =>
          match exactProgramBinding? scenario.profile resource bindings with
          | some program => program.processId = publication.address.processId
          | none => false
      | _ => false
  | _ => false

private def programForDefinition? (scenario : EnginePopulationScenario)
    (bindings : List (SemanticId × Program)) (definitionId : SemanticId) :
    Option Program := do
  let resource ← match scenario.definitions.filter fun definition =>
      definition.id = definitionId with
    | [resource] => some resource
    | _ => none
  exactProgramBinding? scenario.profile resource bindings

private def stimulusCommandId : Stimulus → SemanticId
  | .startProcess commandId _ _ _
  | .triggerMessageStart commandId _ _ _ _
  | .triggerTimerStart commandId _ _ _
  | .completeUserTaskInstance commandId _ _
  | .deliverMessage commandId _ _
  | .deliverPayloadMessage commandId _ _ _
  | .deliverCorrelatedPayloadMessage { commandId, .. }
  | .fireTimer commandId _ _
  | .completeEffect commandId _ _
  | .reportEffectFailure commandId _ _
  | .retryIncident commandId _
  | .cancelIncidentProcess commandId _ _ => commandId

private def scenarioCommandIds (scenario : EnginePopulationScenario) : List String :=
  scenario.instances.flatMap (fun processInstance =>
      processInstance.stimuli.map fun stimulus => (stimulusCommandId stimulus).value) ++
    scenario.publications.map fun publication => publication.commandId.value

private def publicationShapeValid (scenario : EnginePopulationScenario) : Bool :=
  match scenario.publications with
  | [publication] =>
      publication.kind = .publishCorrelatedPayloadMessage &&
        !publication.commandId.value.isEmpty && !publication.payload.value.isEmpty &&
        correlatedMessageAddressValid publication.address &&
        publication.address.definition.semanticProfile = scenario.profile &&
        (scenario.definitions.filter fun resource =>
          resource.id = publication.address.definition.sourceId &&
            resource.sha256 = publication.address.definition.sourceSha256 &&
            resource.sourceOverlay =
              publication.address.definition.sourceOverlay).length = 1
  | _ => false

private def provenanceValid (provenance : ScenarioProvenance) : Bool :=
  !provenance.normativeRefs.isEmpty &&
    provenance.normativeRefs.all (fun reference => !reference.isEmpty) &&
    !provenance.cibRevision.isEmpty &&
    provenance.cibRefs.all (fun reference => !reference.isEmpty)

private def scenarioShapeValid (scenario : EnginePopulationScenario) : Bool :=
  scenario.kind = .enginePopulationScenario &&
    scenario.id.value != "" && scenario.profile = messageKeyCorrelationProfileId &&
    (scenario.definitions.length = 1 || scenario.definitions.length = 2) &&
    scenario.instances.length = 2 && scenario.publications.length = 1 &&
    (scenario.definitions.all fun definition =>
      scenario.instances.any fun processInstance =>
        processInstance.definitionId = definition.id) &&
    scenario.observations =
      [.publicationResults, .processStates, .ingressOrdinals] &&
    scenario.executionTargets =
      { leanTarget := true, typeScriptCore := true, temporal := true, cib := none } &&
    publicationShapeValid scenario &&
    provenanceValid scenario.provenance &&
    (scenarioCommandIds scenario).all (fun id => !id.isEmpty) &&
    decide (scenarioCommandIds scenario).Nodup

private def committedResult (result : StimulusResult) : Bool :=
  result.outcome = .committed && !result.internalStepBoundExceeded &&
    !result.ambiguousInternalChoice

private def initializeInstance? (scenario : EnginePopulationScenario)
    (bindings : List (SemanticId × Program))
    (processInstance : EnginePopulationInstance) : Option ProcessExecution := do
  let program ← programForDefinition? scenario bindings processInstance.definitionId
  match processInstance.stimuli with
  | [start@(.startProcess _ processId instanceId _),
      openingDelivery@(.deliverPayloadMessage _ subscriptionId _ _)] =>
      if instanceId.value.isEmpty || processId.value != program.processId.value ||
          subscriptionId.processInstanceId != instanceId then none else pure ()
      let started := applyStimulus scenarioClosureLimit program initialState start
      if !committedResult started then none else pure ()
      let _startedState ← observeStableState program started.state
      let initialized :=
        applyStimulus scenarioClosureLimit program started.state openingDelivery
      if !committedResult initialized then none else pure ()
      let _initializedState ← observeStableState program initialized.state
      let candidate ← projectCorrelatedMessageCandidate program initialized.state
      if candidate.processInstanceId != instanceId then none else pure ()
      some
        { definitionId := processInstance.definitionId
          program
          instanceId
          state := initialized.state }
  | _ => none

private def initializeInstances? (scenario : EnginePopulationScenario)
    (bindings : List (SemanticId × Program)) :
    List EnginePopulationInstance → Option (List ProcessExecution)
  | [] => some []
  | processInstance :: remaining => do
      let execution ← initializeInstance? scenario bindings processInstance
      let rest ← initializeInstances? scenario bindings remaining
      some (execution :: rest)

private def candidates? :
    List ProcessExecution → Option (List CorrelatedMessageCandidate)
  | [] => some []
  | execution :: remaining => do
      let candidate ← projectCorrelatedMessageCandidate execution.program execution.state
      let rest ← candidates? remaining
      some (candidate :: rest)

private def deliverUnique? (publication : EnginePopulationPublication)
    (selected : CorrelatedMessageCandidate) :
    List ProcessExecution → Option (List ProcessExecution × Bool)
  | [] => some ([], false)
  | execution :: remaining => do
      let current ← projectCorrelatedMessageCandidate execution.program execution.state
      let targetsSelected := current = selected
      let updated ← if targetsSelected then
          let delivery : DeliverCorrelatedPayloadMessageStimulus :=
            { commandId := publication.commandId
              address := publication.address
              ingressOrdinal := 1
              subscriptionId := selected.subscriptionId
              correlationPropertyId := selected.correlationPropertyId
              processPropertyId := selected.processPropertyId
              payload := publication.payload }
          let delivered := applyStimulus scenarioClosureLimit execution.program
            execution.state (.deliverCorrelatedPayloadMessage delivery)
          if !committedResult delivered then none else pure ()
          let _state ← observeStableState execution.program delivered.state
          some
            { execution with
              state := delivered.state }
        else some execution
      let rest ← deliverUnique? publication selected remaining
      if targetsSelected && rest.2 then none
      else some (updated :: rest.1, targetsSelected || rest.2)

private def insertExecutionByInstanceId (execution : ProcessExecution) :
    List ProcessExecution → List ProcessExecution
  | [] => [execution]
  | candidate :: remaining =>
      if execution.instanceId.value < candidate.instanceId.value then
        execution :: candidate :: remaining
      else candidate :: insertExecutionByInstanceId execution remaining

private def canonicalExecutions : List ProcessExecution → List ProcessExecution
  | [] => []
  | execution :: remaining =>
      insertExecutionByInstanceId execution (canonicalExecutions remaining)

private def finalStates? (executions : List ProcessExecution) :
    Option (List StateObservation) :=
  (canonicalExecutions executions).mapM fun execution =>
    observeStableState execution.program execution.state

/-- Execute the exact bounded population contract. Any malformed scenario, incomplete definition
binding, failed initialization, unavailable candidate, invalid matcher evidence, or failed selected
delivery refuses the entire run with `none`; semantic zero and ambiguity remain ordinary results. -/
def runEnginePopulationScenario (scenario : EnginePopulationScenario)
    (bindings : List (SemanticId × Program)) : Option EnginePopulationResult := do
  if !scenarioShapeValid scenario ||
      !definitionsAndBindingsAgree scenario bindings ||
      !publicationProgramBindingAgrees scenario bindings then none else pure ()
  let executions ← initializeInstances? scenario bindings scenario.instances
  if !(decide (executions.map fun execution => execution.instanceId.value).Nodup) then
    none
  else pure ()
  let candidates ← candidates? executions
  let publication ← match scenario.publications with
    | [publication] => some publication
    | _ => none
  let matched ← matchCorrelatedMessageCandidates publication.address
    publication.payload candidates
  let resolved ← match matched with
    | .noMatch =>
        some (EnginePopulationPublicationOutcome.rejectedNoMatch, executions)
    | .ambiguous =>
        some (EnginePopulationPublicationOutcome.rejectedAmbiguous, executions)
    | .unique selected => do
        let delivered ← deliverUnique? publication selected executions
        if !delivered.2 then none else
          some
            (EnginePopulationPublicationOutcome.committed
              { processInstanceId := selected.processInstanceId
                subscriptionId := selected.subscriptionId }, delivered.1)
  let states ← finalStates? resolved.2
  some
    { kind := .enginePopulationResult
      scenarioId := scenario.id
      publicationResults :=
        [{ commandId := publication.commandId
           ingressOrdinal := 1
           outcome := resolved.1 }]
      processStates := states
      ingressOrdinals :=
        [{ commandId := publication.commandId, ingressOrdinal := 1 }] }

end BpmnSemantics.EnginePopulationScenario
