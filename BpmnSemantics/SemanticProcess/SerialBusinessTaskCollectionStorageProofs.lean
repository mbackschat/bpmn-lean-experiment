import BpmnSemantics.SemanticProcess.SerialBusinessTaskDataProofs
import BpmnSemantics.SemanticProcess.CommandAdmissionLaws

/-! Serial and mixed-task root frontiers admit unique ordered committed collections.
Generic completion dispatch names the storage premise; reached consumers derive it from
the transported root and issuance frame plus their exact frontier position. -/

namespace BpmnSemantics.SemanticProcess.SerialBusinessTask

theorem program_analysis_declarations_absent (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    program.compensationActivityRetention = none ∧ program.compensationEventSubProcessSnapshots = none ∧
      program.compensationExecution = none ∧ program.interruptingMessageEventSubProcesses = [] := by
  unfold programAnalysis at analyzed
  split at analyzed
  · contradiction
  · rename_i admitted
    simp at admitted
    exact ⟨admitted.1.1.1.2, admitted.1.1.2, admitted.1.2, admitted.2⟩


/-- The serial frame excludes the foreign-family gates, so an admitted completion reaches its payload dispatcher exactly. -/
theorem serial_completion_admission_eq_dispatch (program : Program) (analysis : Analysis)
    (before : RuntimeState) (stimulus : Stimulus)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (analyzed : programAnalysis program = some analysis) (foreign : ForeignRuntimeEmpty before)
    (storage : committedStateCollectionAdmitted before = true)
    (guarded : serialBusinessCommandAdmitted program before stimulus = true)
    (completion : IsSerialCompletion stimulus) :
    admitStimulus program before stimulus = dispatchStimulus program before stimulus := by
  obtain ⟨_, snapshots, _, messages⟩ := program_analysis_declarations_absent program analysis analyzed
  have messageValid : interruptingMessageEventSubProcessStateValid program before = true := by
    simp_all [interruptingMessageEventSubProcessStateValid, ForeignRuntimeEmpty,
      serialBusinessTaskProfileId, interruptingMessageEventSubProcessProfileId]
  have incidents : before.effectIncidents = [] := foreign.2.2.1
  cases stimulus <;> simp only [IsSerialCompletion] at completion <;> try contradiction
  all_goals simp [admitStimulus, storage, dispatchStimulus, snapshots, guarded, messageValid, incidents,
    callDataRuntimeStateValid, SequentialScopeData.stimulusAdmitted, profile,
    serialBusinessTaskProfileId, callDataCheckpointProfileId]


def frontierFields (state : RuntimeState) :
    Bool × List ControlToken × List UserTaskWait × List EffectWait × List ActivityVariableScope :=
  (state.initiationPending, state.tokens, state.waits, state.effectWaits, state.variables.activities)

private theorem small_list_storage (values : List α) (before : α → α → Bool) (key : α → β)
    (small : values.length ≤ 1) : orderedBy before values = true ∧ (values.map key).Nodup := by
  cases values with
  | nil => simp [orderedBy]
  | cons head tail =>
    cases tail with
    | nil => simp [orderedBy]
    | cons next rest => simp at small

private theorem small_list_keys_unique (values : List α) (same : α → α → Bool)
    (self : ∀ value, same value value = true) (small : values.length ≤ 1) :
    values.all (occursOnce same values) = true := by
  cases values with
  | nil => rfl
  | cons head tail =>
    cases tail with
    | nil => simp [occursOnce, self]
    | cons next rest => simp at small

theorem root_frontier_collection_storage (state : RuntimeState) (owner : ScopeOccurrenceId)
    (framed : RootFrame owner state)
    (small : state.tokens.length ≤ 1 ∧ state.waits.length ≤ 1 ∧ state.effectWaits.length ≤ 1 ∧
      state.variables.activities.length ≤ 1) : committedStateCollectionAdmitted state = true := by
  have tokenStorage := small_list_storage state.tokens controlTokenBefore ControlToken.placeId small.1
  have waitStorage := small_list_storage state.waits userTaskWaitBefore UserTaskWait.activation small.2.1
  have effectStorage := small_list_storage state.effectWaits effectWaitBefore EffectWait.activation small.2.2.1
  have localStorage := small_list_storage state.variables.activities activityVariableScopeBefore
    ActivityVariableScope.owner small.2.2.2
  have waitKeys := small_list_keys_unique state.waits userTaskWaitKeyMatches
    (fun _ => by simp [userTaskWaitKeyMatches]) small.2.1
  have effectKeys := small_list_keys_unique state.effectWaits effectWaitKeyMatches
    (fun _ => by simp [effectWaitKeyMatches]) small.2.2.1
  obtain ⟨_, _, _, life, foreign, issued⟩ := framed
  rcases life with ⟨control, scopes⟩ | ⟨control, scopes, tokens, humans, effects, pending⟩
  all_goals simp_all [ForeignRuntimeEmpty, IssuanceFrame, committedStateCollectionAdmitted,
    committedStateCollectionDefects, canonicalCollectionOrder, uniqueCollectionKeys,
    waitIdentitiesUnique, activityIdentitiesUnique, orderedBy, parallelMultiInstanceControllersOrdered]

end BpmnSemantics.SemanticProcess.SerialBusinessTask
