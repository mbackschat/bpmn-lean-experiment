import BpmnSemantics.SemanticProcess.MessageStartAdmission
import BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import BpmnSemantics.SemanticProcess.StructuredCompositionCommandAdmission
import BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import BpmnSemantics.SemanticProcess.CallDataCommandAdmission
import BpmnSemantics.SemanticProcess.CompensationStartDataAdmission
import BpmnSemantics.SemanticProcess.ValueDomain

/-! Pure scenario admission is independent of execution and projection: profile-supported stimulus domains do not imply command acceptance. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def hasMultiInstanceDefinitions (program : Program) : Bool :=
  program.operations.any fun operation => match operation with
    | .awaitSequentialMultiInstanceUserTask .. | .awaitParallelMultiInstanceUserTask ..
    | .enterSequentialMultiInstanceScope .. | .enterParallelMultiInstanceScope .. => true
    | _ => false

private def requiredObservations (program : Program) : List ObservationKind :=
  let baseline :=
    [ .deployment
  , .commandResults
  , .processStatus
  , .activeWaits
  , .openUserTasks
  , .openTimers
  , .openEffects ]
  let multiInstance := if hasMultiInstanceDefinitions program then [.openMultiInstances] else []
  baseline ++ multiInstance ++
  [ .variables
  , .enabledInteractions
  , .logicalTime ]

private def isProcessStartStimulus : Stimulus → Bool
  | .startProcess .. | .triggerMessageStart .. | .triggerTimerStart .. => true
  | .completeUserTaskInstance .. | .deliverMessage .. | .deliverPayloadMessage ..
  | .deliverCorrelatedPayloadMessage ..
  | .fireTimer ..
  | .completeEffect .. | .reportEffectFailure .. | .retryIncident ..
  | .cancelIncidentProcess .. => false

/-- A scenario starts exactly once, in its first position, through one member of the closed start family. -/
def stimulusSequenceSupported : List Stimulus → Bool
  | .startProcess .. :: remaining
  | .triggerMessageStart .. :: remaining
  | .triggerTimerStart .. :: remaining =>
      remaining.all fun stimulus => !isProcessStartStimulus stimulus
  | _ => false

private def firstStimulusMatchesProgram (program : Program) :
    List Stimulus → Bool
  | stimulus :: _ => startStimulusMatchesProgram program stimulus
  | [] => false

/-- Business-task scenario support requires the same initial data as TypeScript support admission; command refusal remains a separate outcome. -/
private def businessTaskScenarioStartAdmitted (program : Program) (stimuli : List Stimulus) : Bool :=
  if program.identity.semanticProfile != serialBusinessTaskProfileId &&
      program.identity.semanticProfile != mixedTaskControlFlowProfileId &&
      program.identity.semanticProfile != mixedTaskBusinessErrorProfileId then true
  else match stimuli with
    | .startProcess _ _ instanceId bindings :: _ =>
        !instanceId.value.isEmpty &&
          if program.identity.semanticProfile == mixedTaskControlFlowProfileId || program.identity.semanticProfile == mixedTaskBusinessErrorProfileId then
            MixedTaskControlFlow.startBindingsAdmitted program bindings
          else SerialBusinessTask.startBindingsAdmitted program bindings
    | _ => false

/-- CDATA-RESUME-01 and COMPSTART-DATA-01 require the selected initializing data before a supported scenario can enter its first Process. -/
private def scenarioStartDataAdmitted (program : Program) : Stimulus → Bool
  | .startProcess _ _ instanceId bindings =>
      (program.identity.semanticProfile != callDataCheckpointProfileId ||
        callDataStartBindingsAdmitted program bindings) &&
      compensationStartDataAdmitted program instanceId bindings
  | _ => true

/-- SMI/PMI completion kinds remain separate from declaration-bound task results; see SMI-ADMIT-01 and PMI-REFUSE-01. -/
private def scenarioProcessDataBindingsSupported (profile : ProfileId) (surface : ProcessDataIngress)
    (bindings : List VariableBinding) : Bool :=
  if surface == .userTaskCompletion &&
      (profile == sequentialMultiInstanceUserTaskProfileId || profile == parallelMultiInstanceUserTaskProfileId) then
    bindings.all fun binding => match binding.value with | .string _ => true | _ => false
  else if surface == .processStart && profile == parallelMultiInstanceUserTaskProfileId then
    bindings.all fun binding => match binding.value with | .string _ | .stringList _ => true | _ => false
  else processDataBindingsAdmitted profile surface bindings

/-- The mapped profiles' frozen external-domain declarations and SBT-RESULT-01 select kinds, while mapping names/cardinality remain command refusals. -/
private def scenarioEffectBindingsSupported (profile : ProfileId) (bindings : List VariableBinding) : Bool :=
  if profile.value == "cibseven-2.0.0-mapped-success-service-task-draft" then
    bindings.all fun binding => match binding.value with | .string _ => true | _ => false
  else if profile.value == "cibseven-2.0.0-mapped-boundary-error-service-task-draft" ||
      profile == serialBusinessTaskProfileId || profile == mixedTaskControlFlowProfileId ||
      profile == mixedTaskBusinessErrorProfileId ||
      profile.value == "cibseven-2.2.0-sequential-multi-instance-subprocess-draft" ||
      profile.value == "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" then
    bindings.all (fun binding => SerialBusinessTask.scalar binding.value)
  else bindings.isEmpty

/-- Whole-scenario support scans every stimulus independently of execution; supported-domain wrong names, occurrences and result sets remain executable negative commands. -/
private def scenarioStimulusDomainSupported (program : Program) (stimulus : Stimulus) : Bool :=
  let profile := program.identity.semanticProfile
  match stimulus with
    | .startProcess _ _ _ bindings =>
        scenarioProcessDataBindingsSupported profile .processStart bindings
    | .completeUserTaskInstance _ _ bindings =>
        scenarioProcessDataBindingsSupported profile .userTaskCompletion bindings
    | .completeEffect _ _ (.success bindings)
    | .completeEffect _ _ (.bpmnError _ _ bindings) =>
        scenarioEffectBindingsSupported profile bindings
    | .triggerMessageStart .. | .triggerTimerStart .. | .deliverMessage .. | .fireTimer .. => true
    | .deliverPayloadMessage _ _ _ payload => variableValueAdmitted profile .messagePayload payload
    | .deliverCorrelatedPayloadMessage _ => profile == messageKeyCorrelationProfileId
    | .reportEffectFailure .. | .retryIncident .. =>
        profile == serviceTaskIncidentCheckpointProfileId || profile == serviceTaskIncidentCancellationCheckpointProfileId
    | .cancelIncidentProcess .. => profile == serviceTaskIncidentCancellationCheckpointProfileId

/-- Admit only the `scenario` document kind for a structurally well-formed, profile-capability-valid program whose profile and source identity match the scenario and whose requested observations are exactly the required observation list. -/
def supportsScenario (program : Program) (scenario : Scenario) : Bool :=
  programWellFormed program &&
    programProfileCapabilitiesValid program &&
    scenario.stimuli.all (scenarioStimulusDomainSupported program) &&
    (scenario.stimuli.head?.all (scenarioStartDataAdmitted program)) &&
    (scenario.stimuli.head?.all (SequentialScopeData.stimulusAdmitted program)) &&
    structuredCompositionScenarioStartAdmitted program scenario.stimuli &&
    businessTaskScenarioStartAdmitted program scenario.stimuli &&
    stimulusSequenceSupported scenario.stimuli &&
    firstStimulusMatchesProgram program scenario.stimuli &&
    decide (
      scenario.kind = .scenario &&
        scenario.profile = program.identity.semanticProfile &&
        scenario.bpmn.id = program.identity.sourceId &&
        scenario.bpmn.sha256 = program.identity.sourceSha256 &&
        scenario.bpmn.sourceOverlay = program.identity.sourceOverlay &&
        scenario.observations = requiredObservations program)

end BpmnSemantics.SemanticProcess
