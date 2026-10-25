module

public import BpmnSemantics.SemanticProcess.Lowering
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
public import BpmnSemantics.SemanticProcess.CommandAdmission
public import BpmnSemantics.SemanticProcess.MessageStartAdmission
public import BpmnSemantics.SemanticProcess.RuntimePositionValidity
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
public import BpmnSemantics.SemanticProcess.TimerStartAdmission

/-! Fixture definitions and executable checks of [`RuntimeStateInitializationConformance`](RuntimeStateInitializationConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.RuntimeStateInitializationConformance


open BpmnSemantics.SemanticProcess

def instanceId : SemanticId := ⟨"I"⟩

def ordinaryTrigger : Stimulus := .startProcess ⟨"C"⟩ ⟨"P"⟩ instanceId []

def channel : MessageChannel := .operationMessage ⟨"Interface"⟩ ⟨"Operation"⟩ ⟨"Message"⟩

def messageTrigger : Stimulus :=
  .triggerMessageStart ⟨"C"⟩ ⟨"P"⟩ instanceId ⟨"Start"⟩ channel

def timerTrigger : Stimulus := .triggerTimerStart ⟨"C"⟩ ⟨"P"⟩ instanceId ⟨"Start"⟩

def minimalProgram : Program := lowerCheckedProcess
  { identity :=
      { semanticProfile := ⟨"bpmn-2.0.2-activity-boundary-timer-draft"⟩
        sourceId := ⟨"initialization"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000000" }
    processId := ⟨"P"⟩
    definitionScopes := [rootDefinitionScope ⟨"P"⟩]
    nodeScopes := rootNodeScopes ⟨"P"⟩ [⟨"End"⟩, ⟨"Start"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes ⟨"P"⟩ [⟨"Flow"⟩]
    nodes := [.noneEndEvent ⟨"End"⟩, .noneStartEvent ⟨"Start"⟩]
    sequenceFlows := [{ id := ⟨"Flow"⟩, sourceId := ⟨"Start"⟩, targetId := ⟨"End"⟩ }] }

def withRootSnapshot (program : Program) (maxBytes : Nat := 4096) : Program :=
  { program with
    definitionScopes := program.definitionScopes ++
      [{ id := ⟨"scope:Z"⟩, parentScopeId := some ⟨"scope:P"⟩, originElementId := ⟨"Z"⟩ }]
    compensationEventSubProcessSnapshots := some
      { targets := [{ parentScopeId := ⟨"scope:P"⟩, handlerScopeId := ⟨"scope:Z"⟩ }]
        maxRecords := 1, maxCanonicalBytes := maxBytes } }

def rootProgram : Program := withRootSnapshot minimalProgram

def rawRootStart : RuntimeState :=
  (runningProgramStartState? rootProgram instanceId []).getD initialState

def committedRootStart : ExternalAdmission :=
  admitStimulusWithCompensationSnapshots rootProgram initialState ordinaryTrigger

def rootOccurrence : RuntimeScopeOccurrence :=
  { id := { processInstanceId := instanceId, definitionScopeId := ⟨"scope:P"⟩, activation := 1 }
    parent := none }

def raw_root_snapshot_counterexample_is_structurally_valid : Bool := decide <|
    programWellFormed rootProgram = true

def raw_root_snapshot_constructor_succeeds : Bool := decide <|
    runningProgramStartState? rootProgram instanceId [] = some rawRootStart

def raw_root_snapshot_position_is_valid : Bool := decide <|
    runtimePositionValid rootProgram instanceId rawRootStart = true

def actual_root_start_commits_exact_reservation_and_preserves_other_fields : Bool := decide <|
    committedRootStart.outcome = .committed ∧
      committedRootStart.state =
        { rawRootStart with compensationParentContextRetentions :=
          [.provisional rootOccurrence ⟨"scope:Z"⟩] }

def actual_root_start_has_complete_invariant : Bool := decide <|
    runtimeStateWellFormed rootProgram instanceId committedRootStart.state = true

def structural_start_fixture_does_not_claim_profile_capability_admission : Bool := decide <|
    programProfileCapabilitiesValid rootProgram = false

def valid_declaring_empty_state_has_complete_invariant : Bool := decide <|
    runtimePositionValid rootProgram instanceId initialState = true ∧
      runtimeStateWellFormed rootProgram instanceId initialState = true

def capacityProgram : Program := withRootSnapshot minimalProgram 2

def reservation_capacity_failure_is_the_canonical_byte_limit : Bool := decide <|
    reserveRootCompensationParentContextBeforeStart capacityProgram initialState
        ((runningProgramStartState? capacityProgram instanceId []).getD initialState) =
      .refused (.capacity .canonicalBytes 2
        (canonicalCompensationParentContextRetentionsUtf8Bytes
          [.provisional rootOccurrence ⟨"scope:Z"⟩])) initialState

def reservation_capacity_refusal_preserves_exact_initial_state : Bool := decide <|
    programWellFormed capacityProgram = true ∧
      (admitStimulusWithCompensationSnapshots capacityProgram initialState ordinaryTrigger).outcome =
        .rejected ∧
      (admitStimulusWithCompensationSnapshots capacityProgram initialState ordinaryTrigger).state =
        initialState

def legacy_root_snapshot_start_refuses_exactly : Bool := decide <|
    (admitStimulus rootProgram initialState ordinaryTrigger).outcome = .rejected ∧
      (admitStimulus rootProgram initialState ordinaryTrigger).state = initialState

def declaration_free_ordinary_start_commits_with_complete_invariant : Bool := decide <|
    (admitStimulusWithCompensationSnapshots minimalProgram initialState ordinaryTrigger).outcome =
        .committed ∧
      runtimeStateWellFormed minimalProgram instanceId
        (admitStimulusWithCompensationSnapshots minimalProgram initialState ordinaryTrigger).state =
          true

def taskProgram (profile : ProfileId) (start : CheckedNode) : Program := lowerCheckedProcess
  { identity :=
      { semanticProfile := profile, sourceId := ⟨"initialization-task"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000000" }
    processId := ⟨"P"⟩
    definitionScopes := [rootDefinitionScope ⟨"P"⟩]
    nodeScopes := rootNodeScopes ⟨"P"⟩ [⟨"End"⟩, ⟨"Start"⟩, ⟨"Task"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes ⟨"P"⟩ [⟨"Flow1"⟩, ⟨"Flow2"⟩]
    nodes := [.noneEndEvent ⟨"End"⟩, start, .userTask ⟨"Task"⟩ none]
    sequenceFlows :=
      [{ id := ⟨"Flow1"⟩, sourceId := ⟨"Start"⟩, targetId := ⟨"Task"⟩ },
       { id := ⟨"Flow2"⟩, sourceId := ⟨"Task"⟩, targetId := ⟨"End"⟩ }] }

def messageProgram : Program := taskProgram messageStartProfileId (.messageStartEvent ⟨"Start"⟩ channel)

def timerProgram : Program := taskProgram timerStartProfileId (.timerStartEvent ⟨"Start"⟩ "PT1S")

def message_positive_satisfies_structural_and_profile_admission : Bool := decide <|
    programWellFormed messageProgram = true ∧
      programProfileCapabilitiesValid messageProgram = true

def declaration_free_message_start_commits_with_complete_invariant : Bool := decide <|
    (admitStimulusWithCompensationSnapshots messageProgram initialState messageTrigger).outcome =
        .committed ∧
      runtimeStateWellFormed messageProgram instanceId
        (admitStimulusWithCompensationSnapshots messageProgram initialState messageTrigger).state =
          true

def timer_positive_satisfies_structural_and_profile_admission : Bool := decide <|
    programWellFormed timerProgram = true ∧
      programProfileCapabilitiesValid timerProgram = true

def declaration_free_timer_start_commits_with_complete_invariant : Bool := decide <|
    (admitStimulusWithCompensationSnapshots timerProgram initialState timerTrigger).outcome =
        .committed ∧
      runtimeStateWellFormed timerProgram instanceId
        (admitStimulusWithCompensationSnapshots timerProgram initialState timerTrigger).state =
          true

def declaring_message_start_is_excluded_by_existing_profile_and_refused : Bool := decide <|
    programWellFormed (withRootSnapshot messageProgram) = true ∧
      programProfileCapabilitiesValid (withRootSnapshot messageProgram) = false ∧
      (admitStimulusWithCompensationSnapshots (withRootSnapshot messageProgram)
        initialState messageTrigger).outcome = .rejected ∧
      (admitStimulusWithCompensationSnapshots (withRootSnapshot messageProgram)
        initialState messageTrigger).state = initialState

def declaring_timer_start_is_excluded_by_existing_profile_and_refused : Bool := decide <|
    programWellFormed (withRootSnapshot timerProgram) = true ∧
      programProfileCapabilitiesValid (withRootSnapshot timerProgram) = false ∧
      (admitStimulusWithCompensationSnapshots (withRootSnapshot timerProgram)
        initialState timerTrigger).outcome = .rejected ∧
      (admitStimulusWithCompensationSnapshots (withRootSnapshot timerProgram)
        initialState timerTrigger).state = initialState

def childBaseProgram : Program := lowerCheckedProcess
  { identity :=
      { semanticProfile := ⟨"bpmn-2.0.2-activity-boundary-timer-draft"⟩
        sourceId := ⟨"initialization-child"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000000" }
    processId := ⟨"P"⟩
    definitionScopes :=
      [{ id := ⟨"scope:C"⟩, parentScopeId := some ⟨"scope:P"⟩, originElementId := ⟨"Child"⟩ },
       rootDefinitionScope ⟨"P"⟩]
    nodeScopes :=
      [{ nodeId := ⟨"Child"⟩, scopeId := ⟨"scope:P"⟩ },
       { nodeId := ⟨"ChildEnd"⟩, scopeId := ⟨"scope:C"⟩ },
       { nodeId := ⟨"ChildStart"⟩, scopeId := ⟨"scope:C"⟩ },
       { nodeId := ⟨"End"⟩, scopeId := ⟨"scope:P"⟩ },
       { nodeId := ⟨"Start"⟩, scopeId := ⟨"scope:P"⟩ }]
    sequenceFlowScopes :=
      [{ sequenceFlowId := ⟨"FlowChild"⟩, scopeId := ⟨"scope:C"⟩ },
       { sequenceFlowId := ⟨"FlowEnd"⟩, scopeId := ⟨"scope:P"⟩ },
       { sequenceFlowId := ⟨"FlowStart"⟩, scopeId := ⟨"scope:P"⟩ }]
    nodes :=
      [.embeddedSubProcess ⟨"Child"⟩ ⟨"scope:C"⟩, .noneEndEvent ⟨"ChildEnd"⟩,
       .noneStartEvent ⟨"ChildStart"⟩, .noneEndEvent ⟨"End"⟩, .noneStartEvent ⟨"Start"⟩]
    sequenceFlows :=
      [{ id := ⟨"FlowChild"⟩, sourceId := ⟨"ChildStart"⟩, targetId := ⟨"ChildEnd"⟩ },
       { id := ⟨"FlowEnd"⟩, sourceId := ⟨"Child"⟩, targetId := ⟨"End"⟩ },
       { id := ⟨"FlowStart"⟩, sourceId := ⟨"Start"⟩, targetId := ⟨"Child"⟩ }] }

def childProgram : Program :=
  { childBaseProgram with
    definitionScopes := childBaseProgram.definitionScopes ++
      [{ id := ⟨"scope:Z"⟩, parentScopeId := some ⟨"scope:C"⟩, originElementId := ⟨"Z"⟩ }]
    compensationEventSubProcessSnapshots := some
      { targets := [{ parentScopeId := ⟨"scope:C"⟩, handlerScopeId := ⟨"scope:Z"⟩ }]
        maxRecords := 1, maxCanonicalBytes := 4096 } }

def child_only_snapshot_program_is_structurally_valid : Bool := decide <|
    programWellFormed childProgram = true

def child_only_snapshot_start_commits_without_manufacturing_root_reservation : Bool := decide <|
    (admitStimulusWithCompensationSnapshots childProgram initialState ordinaryTrigger).outcome =
        .committed ∧
      (admitStimulusWithCompensationSnapshots childProgram initialState ordinaryTrigger).state =
        (runningProgramStartState? childProgram instanceId []).getD initialState ∧
      (admitStimulusWithCompensationSnapshots childProgram initialState
        ordinaryTrigger).state.compensationParentContextRetentions = []

def child_only_snapshot_start_has_complete_invariant : Bool := decide <|
    runtimeStateWellFormed childProgram instanceId
      (admitStimulusWithCompensationSnapshots childProgram initialState ordinaryTrigger).state =
        true

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("raw_root_snapshot_counterexample_is_structurally_valid", raw_root_snapshot_counterexample_is_structurally_valid),
  ("raw_root_snapshot_constructor_succeeds", raw_root_snapshot_constructor_succeeds),
  ("raw_root_snapshot_position_is_valid", raw_root_snapshot_position_is_valid),
  ("actual_root_start_commits_exact_reservation_and_preserves_other_fields", actual_root_start_commits_exact_reservation_and_preserves_other_fields),
  ("actual_root_start_has_complete_invariant", actual_root_start_has_complete_invariant),
  ("structural_start_fixture_does_not_claim_profile_capability_admission", structural_start_fixture_does_not_claim_profile_capability_admission),
  ("valid_declaring_empty_state_has_complete_invariant", valid_declaring_empty_state_has_complete_invariant),
  ("reservation_capacity_failure_is_the_canonical_byte_limit", reservation_capacity_failure_is_the_canonical_byte_limit),
  ("reservation_capacity_refusal_preserves_exact_initial_state", reservation_capacity_refusal_preserves_exact_initial_state),
  ("legacy_root_snapshot_start_refuses_exactly", legacy_root_snapshot_start_refuses_exactly),
  ("declaration_free_ordinary_start_commits_with_complete_invariant", declaration_free_ordinary_start_commits_with_complete_invariant),
  ("message_positive_satisfies_structural_and_profile_admission", message_positive_satisfies_structural_and_profile_admission),
  ("declaration_free_message_start_commits_with_complete_invariant", declaration_free_message_start_commits_with_complete_invariant),
  ("timer_positive_satisfies_structural_and_profile_admission", timer_positive_satisfies_structural_and_profile_admission),
  ("declaration_free_timer_start_commits_with_complete_invariant", declaration_free_timer_start_commits_with_complete_invariant),
  ("declaring_message_start_is_excluded_by_existing_profile_and_refused", declaring_message_start_is_excluded_by_existing_profile_and_refused),
  ("declaring_timer_start_is_excluded_by_existing_profile_and_refused", declaring_timer_start_is_excluded_by_existing_profile_and_refused),
  ("child_only_snapshot_program_is_structurally_valid", child_only_snapshot_program_is_structurally_valid),
  ("child_only_snapshot_start_commits_without_manufacturing_root_reservation", child_only_snapshot_start_commits_without_manufacturing_root_reservation),
  ("child_only_snapshot_start_has_complete_invariant", child_only_snapshot_start_has_complete_invariant)
]

end BpmnSemantics.RuntimeStateInitializationConformance
