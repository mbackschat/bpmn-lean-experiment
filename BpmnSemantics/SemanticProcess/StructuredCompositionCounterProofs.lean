module

public import BpmnSemantics.SemanticProcess.StructuredCompositionLifecycleProofs
import BpmnSemantics.SemanticProcess.RuntimeStateCollectionCounterLaws
import BpmnSemantics.SemanticProcess.CommandAdmissionLaws
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessRegistrationLaws

/-! Structured composition reaches command boundaries with canonical retained counter storage.
The separate counter component follows the existing execution relation; lifecycle and task shape
supply the remaining collection facts without strengthening raw transition frame laws. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.StructuredComposition

def CounterStorageFrame (state : RuntimeState) : Prop :=
  orderedBy activationBefore state.activations = true ∧
  orderedBy activationBefore state.activityActivations = true ∧
  orderedBy scopeActivationBefore state.scopeActivations = true ∧
  (state.activations.map (·.taskId)).Nodup ∧
  (state.activityActivations.map (·.taskId)).Nodup ∧
  (state.scopeActivations.map (·.scopeId)).Nodup ∧
  state.messageActivations = [] ∧ state.timerActivations = [] ∧
  state.effectActivations = [] ∧ state.callActivations = [] ∧ state.eventRaceActivations = []

theorem admitted_fire_preserves_counter_storage
    (program : Program) (analysis : Analysis) (before after : RuntimeState) (operation : SemanticOperation)
    (analyzed : programAnalysis program = some analysis) (member : operation ∈ program.operations)
    (storage : CounterStorageFrame before) (fired : fire? program operation before = some after) :
    CounterStorageFrame after := by
  have selected := program_analysis_operations_allowed program analysis analyzed operation member
  have step := fire_sound program operation before after fired
  cases operation <;> simp only [OperationAllowed] at selected
  all_goals try contradiction
  case initiate id origin output =>
    cases step with
    | initiate _ _ _ _ _ active =>
      obtain ⟨_, _, active⟩ := Option.bind_eq_some_iff.mp active
      split at active
      · cases Option.some.inj active
        exact storage
      · contradiction
  case awaitUserTask id origin input output task =>
    cases step with
    | awaitUserTask _ _ _ _ _ _ _ active =>
      simp only [awaitUserTaskState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨_, _, _, _, active⟩ := active
      cases Option.some.inj active
      have updated := task_counter_storage before.activations task.id (activationCount before task.id + 1)
        storage.1 storage.2.2.2.1
      exact ⟨updated.1, storage.2.1, storage.2.2.1, updated.2, storage.2.2.2.2⟩
  case awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput =>
    cases step with
    | awaitDataInputOutputUserTask _ _ _ _ _ _ _ _ _ _ active =>
      simp only [activateDataInputOutputUserTask?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨_, _, _, _, _, _, active⟩ := active
      split at active
      · contradiction
      · cases Option.some.inj active
        have task := task_counter_storage before.activations taskId (activationCount before taskId + 1)
          storage.1 storage.2.2.2.1
        have activity := task_counter_storage before.activityActivations taskId
          (activityActivationCount before taskId + 1) storage.2.1 storage.2.2.2.2.1
        exact ⟨task.1, activity.1, storage.2.2.1, task.2, activity.2, storage.2.2.2.2.2⟩
  case choose id origin input candidates output defaultOrigin =>
    cases step with
    | choose _ _ _ _ _ _ _ _ active =>
      simp only [chooseState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨_, _, _, _, active⟩ := active
      cases Option.some.inj active
      exact storage
  case mergeExclusive id origin inputs output =>
    have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
    rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ absent] at fired
    unfold mergeExclusiveState? at fired
    split at fired
    · cases Option.some.inj fired
      exact storage
    · contradiction
  case reachNoneEnd id origin input =>
    cases step with
    | reachNoneEnd _ _ _ _ _ active =>
      simp only [reachNoneEndState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨_, _, _, _, active⟩ := active
      cases Option.some.inj active
      exact storage
  case completeScope id origin scope output =>
    cases output with
    | some output => contradiction
    | none =>
      cases step with
      | completeScope _ _ _ _ _ _ completed =>
        change completeSelectedScope? program before scope none = some after at completed
        rw [selected_scope_completion_delegates_to_root program before scope
          (program_analysis_operations_allowed program analysis analyzed)] at completed
        unfold completeScopeState? at completed
        split at completed
        · split at completed
          · contradiction
          · unfold completeQuiescentScope? at completed
            split at completed
            · split at completed
              · contradiction
              · cases Option.some.inj completed
                exact storage
            · contradiction
            · contradiction
        · contradiction

theorem ordinary_completion_preserves_counter_storage
    (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (storage : CounterStorageFrame before)
    (completed : completeUserTask before instanceId taskId activation = some after) : CounterStorageFrame after := by
  unfold completeUserTask at completed
  split at completed
  · contradiction
  · cases Option.some.inj completed
    exact storage

theorem data_completion_preserves_counter_storage
    (program : Program) (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (bindings : List VariableBinding) (storage : CounterStorageFrame before)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation bindings = some after) :
    CounterStorageFrame after := by
  simp only [completeDataInputOutputUserTask?, bind, pure, Option.bind_eq_some_iff] at completed
  obtain ⟨_, _, _, _, _, _, _, _, _, _, completed⟩ := completed
  split at completed
  · simp only [Option.bind_eq_some_iff] at completed
    obtain ⟨_, _, _, _, completed⟩ := completed
    split at completed
    · obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
      cases Option.some.inj completed
      exact storage
    · contradiction
  · contradiction

theorem task_execution_preserves_counter_storage
    (program : Program) (analysis : Analysis) (initial reached : RuntimeState)
    (analyzed : programAnalysis program = some analysis) (storage : CounterStorageFrame initial)
    (reachable : TaskExecutionReachable program initial reached) : CounterStorageFrame reached := by
  induction reachable with
  | initial => exact storage
  | step choice reachable executed ih =>
    unfold SemanticProcess.step at executed
    split at executed
    · contradiction
    · rename_i operation selected
      exact admitted_fire_preserves_counter_storage program analysis _ _ operation analyzed
        (List.mem_of_find?_eq_some selected) ih executed
  | completion commandId taskId bindings reachable ih =>
    rename_i before
    rcases completion_admission_cases program analysis before commandId taskId bindings analyzed with refused |
      ⟨after, completed, _, result⟩ | ⟨after, completed, _, _, result⟩ | ⟨after, completed, _, _, result⟩
    · simpa [refused] using ih
    · rw [result]
      exact data_completion_preserves_counter_storage program _ after taskId.processInstanceId
        ⟨taskId.elementId.value⟩ taskId.activation bindings ih completed
    · rw [result]
      exact ordinary_completion_preserves_counter_storage _ after taskId.processInstanceId
        ⟨taskId.elementId.value⟩ taskId.activation ih completed
    · rw [result]
      exact ordinary_completion_preserves_counter_storage _ after taskId.processInstanceId
        ⟨taskId.elementId.value⟩ taskId.activation ih completed


theorem committed_start_has_counter_storage
    (program : Program) (analysis : Analysis) (commandId processId instanceId : SemanticId)
    (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    CounterStorageFrame (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).state := by
  have storageAdmitted := admitStimulus_committed_collection_storage program initialState _ committed
  simp only [initialState] at storageAdmitted
  obtain ⟨_, _, _, noSnapshots, _⟩ := program_analysis_excludes_foreign_declarations program analysis analyzed
  have noListeners := committed_foreign_profile_has_no_message_declarations program initialState _
    (by rw [profile]; decide +kernel) committed
  cases created : runningProgramStartState? program instanceId bindings with
  | none =>
    simp [admitStimulus, storageAdmitted, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid,
      noListeners, noSnapshots, initialState, profile, created] at committed
    split at committed <;> first | contradiction | (split at committed <;> contradiction)
  | some started =>
    have storage : CounterStorageFrame started := by
      simp only [runningProgramStartState?, bind, pure, Option.bind_eq_some_iff] at created
      obtain ⟨root, _, created⟩ := created
      cases Option.some.inj created
      simp [CounterStorageFrame, runningStartState, initialState, orderedBy, noListeners]
    simp [admitStimulus, storageAdmitted, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid,
      noListeners, noSnapshots, initialState, profile, created] at committed ⊢
    split at committed
    · simp_all
    · contradiction

theorem reached_state_has_counter_storage
    (program : Program) (analysis : Analysis) (commandId processId instanceId : SemanticId)
    (bindings : List VariableBinding) (reached : RuntimeState)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state reached) :
    CounterStorageFrame reached :=
  task_execution_preserves_counter_storage program analysis _ reached analyzed
    (committed_start_has_counter_storage program analysis commandId processId instanceId bindings profile analyzed committed) reachable

theorem exact_lifecycle_collection_storage
    (program : Program) (state : RuntimeState) (frame : LifecycleFrame state)
    (shape : TaskLifetimeShape program state) (bounded : ControlUnitBound state)
    (storage : CounterStorageFrame state) : committedStateCollectionAdmitted state = true := by
  have tokenOrder : orderedBy controlTokenBefore state.tokens = true := by
    cases tokens : state.tokens with
    | nil => rfl
    | cons head tail =>
      cases tail with
      | nil => rfl
      | cons next rest =>
        simp [ControlUnitBound, tokens] at bounded
        omega
  obtain ⟨⟨foreign, _⟩, life⟩ := frame
  simp only [CounterStorageFrame] at storage
  rcases shape with ⟨waits, records, locals⟩ | ⟨wait, operation, waits, member, running, processOwner, details⟩
  · rcases life with ⟨owner, control, scopes⟩ | ⟨instanceId, control, scopes⟩
    all_goals simp_all [ForeignRuntimeEmpty, committedStateCollectionAdmitted, committedStateCollectionDefects,
      canonicalCollectionOrder, uniqueCollectionKeys, waitIdentitiesUnique, activityIdentitiesUnique,
      orderedBy, parallelMultiInstanceControllersOrdered]
  · cases operation <;> simp only at details
    all_goals try contradiction
    all_goals try obtain ⟨_, _, _, activityActivation, binding, _, _, records, locals⟩ := details
    all_goals rcases life with ⟨owner, control, scopes⟩ | ⟨instanceId, control, scopes⟩
    all_goals simp_all [ForeignRuntimeEmpty, committedStateCollectionAdmitted, committedStateCollectionDefects,
      canonicalCollectionOrder, uniqueCollectionKeys, waitIdentitiesUnique, occursOnce,
      userTaskWaitKeyMatches, activityIdentitiesUnique, sameActivityOccurrence,
      orderedBy, parallelMultiInstanceControllersOrdered]

end BpmnSemantics.SemanticProcess.StructuredComposition
