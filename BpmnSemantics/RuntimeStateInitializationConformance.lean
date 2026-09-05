import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormedInitialization

/-! # Committed initialization assurance witnesses

`RINIT-START-01` is checked against actual admission, beside the false selected-root raw-constructor claim. These compact structural Programs exercise the theorem's admission domain; an ordinary start does not establish full profile-capability admission. Message and Timer positives use their exact one-task profiles. Their declaration-bearing controls retain those profiles' refusal rather than inventing a new admitted shape.
-/

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

theorem raw_root_snapshot_counterexample_is_structurally_valid :
    programWellFormed rootProgram = true := by decide +kernel

theorem raw_root_snapshot_constructor_succeeds :
    runningProgramStartState? rootProgram instanceId [] = some rawRootStart := by decide +kernel

theorem raw_root_snapshot_position_is_valid :
    runtimePositionValid rootProgram instanceId rawRootStart = true := by decide +kernel

theorem raw_root_snapshot_missing_reservation_refutes_full_invariant :
    compensationEventSubProcessSnapshotStateValid rootProgram rawRootStart = false ∧
      runtimeStateWellFormed rootProgram instanceId rawRootStart = false := by decide +kernel

theorem actual_root_start_commits_exact_reservation_and_preserves_other_fields :
    committedRootStart.outcome = .committed ∧
      committedRootStart.state =
        { rawRootStart with compensationParentContextRetentions :=
          [.provisional rootOccurrence ⟨"scope:Z"⟩] } := by decide +kernel

theorem actual_root_start_has_complete_invariant :
    runtimeStateWellFormed rootProgram instanceId committedRootStart.state = true := by
  decide +kernel

theorem structural_start_fixture_does_not_claim_profile_capability_admission :
    programProfileCapabilitiesValid rootProgram = false := by decide +kernel

theorem valid_declaring_empty_state_has_complete_invariant :
    runtimePositionValid rootProgram instanceId initialState = true ∧
      runtimeStateWellFormed rootProgram instanceId initialState = true := by decide +kernel

def capacityProgram : Program := withRootSnapshot minimalProgram 2

theorem reservation_capacity_failure_is_the_canonical_byte_limit :
    reserveRootCompensationParentContextBeforeStart capacityProgram initialState
        ((runningProgramStartState? capacityProgram instanceId []).getD initialState) =
      .refused (.capacity .canonicalBytes 2
        (canonicalCompensationParentContextRetentionsUtf8Bytes
          [.provisional rootOccurrence ⟨"scope:Z"⟩])) initialState := by decide +kernel

theorem reservation_capacity_refusal_preserves_exact_initial_state :
    programWellFormed capacityProgram = true ∧
      (admitStimulusWithCompensationSnapshots capacityProgram initialState ordinaryTrigger).outcome =
        .rejected ∧
      (admitStimulusWithCompensationSnapshots capacityProgram initialState ordinaryTrigger).state =
        initialState := by decide +kernel

theorem legacy_root_snapshot_start_refuses_exactly :
    (admitStimulus rootProgram initialState ordinaryTrigger).outcome = .rejected ∧
      (admitStimulus rootProgram initialState ordinaryTrigger).state = initialState := by
  decide +kernel

theorem declaration_free_ordinary_start_commits_with_complete_invariant :
    (admitStimulusWithCompensationSnapshots minimalProgram initialState ordinaryTrigger).outcome =
        .committed ∧
      runtimeStateWellFormed minimalProgram instanceId
        (admitStimulusWithCompensationSnapshots minimalProgram initialState ordinaryTrigger).state =
          true := by decide +kernel

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

theorem message_positive_satisfies_structural_and_profile_admission :
    programWellFormed messageProgram = true ∧
      programProfileCapabilitiesValid messageProgram = true := by decide +kernel

theorem declaration_free_message_start_commits_with_complete_invariant :
    (admitStimulusWithCompensationSnapshots messageProgram initialState messageTrigger).outcome =
        .committed ∧
      runtimeStateWellFormed messageProgram instanceId
        (admitStimulusWithCompensationSnapshots messageProgram initialState messageTrigger).state =
          true := by decide +kernel

theorem timer_positive_satisfies_structural_and_profile_admission :
    programWellFormed timerProgram = true ∧
      programProfileCapabilitiesValid timerProgram = true := by decide +kernel

theorem declaration_free_timer_start_commits_with_complete_invariant :
    (admitStimulusWithCompensationSnapshots timerProgram initialState timerTrigger).outcome =
        .committed ∧
      runtimeStateWellFormed timerProgram instanceId
        (admitStimulusWithCompensationSnapshots timerProgram initialState timerTrigger).state =
          true := by decide +kernel

theorem declaration_free_start_families_match_legacy_admission_exactly :
    admitStimulusWithCompensationSnapshots minimalProgram initialState ordinaryTrigger =
        admitStimulus minimalProgram initialState ordinaryTrigger ∧
      admitStimulusWithCompensationSnapshots messageProgram initialState messageTrigger =
        admitStimulus messageProgram initialState messageTrigger ∧
      admitStimulusWithCompensationSnapshots timerProgram initialState timerTrigger =
        admitStimulus timerProgram initialState timerTrigger := by
  exact ⟨admitStimulusWithCompensationSnapshots_withoutDeclaration _ _ _ rfl,
    admitStimulusWithCompensationSnapshots_withoutDeclaration _ _ _ rfl,
    admitStimulusWithCompensationSnapshots_withoutDeclaration _ _ _ rfl⟩

theorem declaring_message_start_is_excluded_by_existing_profile_and_refused :
    programWellFormed (withRootSnapshot messageProgram) = true ∧
      programProfileCapabilitiesValid (withRootSnapshot messageProgram) = false ∧
      (admitStimulusWithCompensationSnapshots (withRootSnapshot messageProgram)
        initialState messageTrigger).outcome = .rejected ∧
      (admitStimulusWithCompensationSnapshots (withRootSnapshot messageProgram)
        initialState messageTrigger).state = initialState := by decide +kernel

theorem declaring_timer_start_is_excluded_by_existing_profile_and_refused :
    programWellFormed (withRootSnapshot timerProgram) = true ∧
      programProfileCapabilitiesValid (withRootSnapshot timerProgram) = false ∧
      (admitStimulusWithCompensationSnapshots (withRootSnapshot timerProgram)
        initialState timerTrigger).outcome = .rejected ∧
      (admitStimulusWithCompensationSnapshots (withRootSnapshot timerProgram)
        initialState timerTrigger).state = initialState := by decide +kernel

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

theorem child_only_snapshot_program_is_structurally_valid :
    programWellFormed childProgram = true := by decide +kernel

theorem child_only_snapshot_start_commits_without_manufacturing_root_reservation :
    (admitStimulusWithCompensationSnapshots childProgram initialState ordinaryTrigger).outcome =
        .committed ∧
      (admitStimulusWithCompensationSnapshots childProgram initialState ordinaryTrigger).state =
        (runningProgramStartState? childProgram instanceId []).getD initialState ∧
      (admitStimulusWithCompensationSnapshots childProgram initialState
        ordinaryTrigger).state.compensationParentContextRetentions = [] := by decide +kernel

theorem child_only_snapshot_start_has_complete_invariant :
    runtimeStateWellFormed childProgram instanceId
      (admitStimulusWithCompensationSnapshots childProgram initialState ordinaryTrigger).state =
        true := by decide +kernel

end BpmnSemantics.RuntimeStateInitializationConformance
