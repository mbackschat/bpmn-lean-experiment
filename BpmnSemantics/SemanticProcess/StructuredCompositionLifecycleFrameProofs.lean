module

public import BpmnSemantics.SemanticProcess.StructuredCompositionControlProofs
import BpmnSemantics.SemanticProcess.CommandAdmissionLaws
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessRegistrationLaws

/-! SPC-CLOSURE-01's lifecycle frame: a reached composition holds no foreign execution state and keeps its one live Process root until completion retires it, preserved through the actual operations and command admission. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.StructuredComposition

/-- SPC-CLOSURE-01 excludes foreign execution state, including listeners refused by command admission. -/
def ForeignRuntimeEmpty (state : RuntimeState) : Prop :=
  state.messageWaits = [] ∧ state.timerWaits = [] ∧ state.effectWaits = [] ∧
    state.effectIncidents = [] ∧ state.selectedBranchSets = [] ∧ state.eventRaces = [] ∧
    state.calledProcessOccurrences = [] ∧ state.sequentialMultiInstanceControllers = [] ∧
    state.parallelMultiInstanceControllers = [] ∧ state.compensationActivityRetentions = [] ∧
    state.compensationParentContextRetentions = [] ∧ state.compensationTriggers = [] ∧
    state.compensationHandlerEffectWaits = [] ∧ state.eventSubProcessMessageSubscriptions = []

/-- A running composition has its one live Process root; completion retires that root. -/
def RootLifecycle (state : RuntimeState) : Prop :=
  (∃ owner, state.control = .running owner.processInstanceId ∧
    state.scopeOccurrences = [{ id := owner, parent := none }]) ∨
  (∃ instanceId, state.control = .completed instanceId ∧ state.scopeOccurrences = [])

def LifecycleFrame (state : RuntimeState) : Prop :=
  (ForeignRuntimeEmpty state ∧ state.logicalTimeMs = 0) ∧ RootLifecycle state

theorem admitted_fire_preserves_lifecycle_frame
    (program : Program) (analysis : Analysis) (before after : RuntimeState) (operation : SemanticOperation)
    (analyzed : programAnalysis program = some analysis) (member : operation ∈ program.operations)
    (empty : LifecycleFrame before) (fired : fire? program operation before = some after) :
    LifecycleFrame after := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have selected := allowed operation member
  have step := fire_sound program operation before after fired
  cases operation <;> simp only [OperationAllowed] at selected
  all_goals try contradiction
  case initiate id origin output =>
    cases step with
    | initiate _ _ _ _ _ active =>
      obtain ⟨_, _, active⟩ := Option.bind_eq_some_iff.mp active
      split at active
      · cases Option.some.inj active
        exact empty
      · contradiction
  case awaitUserTask id origin input output task =>
    cases step with
    | awaitUserTask _ _ _ _ _ _ _ active =>
      simp only [awaitUserTaskState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨_, _, _, _, active⟩ := active
      cases Option.some.inj active
      exact empty
  case awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput =>
    cases step with
    | awaitDataInputOutputUserTask _ _ _ _ _ _ _ _ _ _ active =>
      simp only [activateDataInputOutputUserTask?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨_, _, _, _, _, _, active⟩ := active
      split at active
      · contradiction
      · cases Option.some.inj active
        exact empty
  case choose id origin input candidates output defaultOrigin =>
    cases step with
    | choose _ _ _ _ _ _ _ _ active =>
      simp only [chooseState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨_, _, _, _, active⟩ := active
      cases Option.some.inj active
      exact empty
  case mergeExclusive id origin inputs output =>
    have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
    rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ absent] at fired
    unfold mergeExclusiveState? at fired
    split at fired
    · cases Option.some.inj fired
      exact empty
    · contradiction
  case reachNoneEnd id origin input =>
    cases step with
    | reachNoneEnd _ _ _ _ _ active =>
      simp only [reachNoneEndState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨_, _, _, _, active⟩ := active
      cases Option.some.inj active
      exact empty
  case completeScope id origin scope output =>
    cases output with
    | some output => contradiction
    | none =>
      cases step with
      | completeScope _ _ _ _ _ _ completed =>
        rw [declared_scope_completion_delegates_to_root program before scope allowed] at completed
        unfold completeScopeState? at completed
        split at completed
        · split at completed
          · contradiction
          · unfold completeQuiescentScope? at completed
            split at completed
            · split at completed
              · contradiction
              · cases Option.some.inj completed
                simp_all [LifecycleFrame, ForeignRuntimeEmpty, RootLifecycle]
            · contradiction
            · contradiction
        · contradiction

theorem ordinary_completion_preserves_lifecycle_frame
    (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (empty : LifecycleFrame before)
    (completed : completeUserTask before instanceId taskId activation = some after) : LifecycleFrame after := by
  unfold completeUserTask at completed
  split at completed
  · contradiction
  · cases Option.some.inj completed
    exact empty

theorem data_completion_preserves_lifecycle_frame
    (program : Program) (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (bindings : List VariableBinding) (empty : LifecycleFrame before)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation bindings = some after) :
    LifecycleFrame after := by
  simp only [completeDataInputOutputUserTask?, bind, pure, Option.bind_eq_some_iff] at completed
  obtain ⟨_, _, _, _, _, _, _, _, _, _, completed⟩ := completed
  split at completed
  · simp only [Option.bind_eq_some_iff] at completed
    obtain ⟨_, _, _, _, completed⟩ := completed
    split at completed
    · obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
      cases Option.some.inj completed
      exact empty
    · contradiction
  · contradiction

theorem completion_admission_preserves_lifecycle_frame
    (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (analyzed : programAnalysis program = some analysis) (empty : LifecycleFrame before) :
    LifecycleFrame (admitStimulus program before (.completeUserTaskInstance commandId taskId bindings)).state := by
  rcases completion_admission_cases program analysis before commandId taskId bindings analyzed with refused |
    ⟨after, completed, _, result⟩ | ⟨after, completed, _, _, result⟩ | ⟨after, completed, _, _, result⟩
  · simpa [refused] using empty
  · rw [result]
    exact data_completion_preserves_lifecycle_frame program before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation bindings empty completed
  · rw [result]
    exact ordinary_completion_preserves_lifecycle_frame before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation empty completed
  · rw [result]
    exact ordinary_completion_preserves_lifecycle_frame before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation empty completed

theorem task_execution_preserves_lifecycle_frame
    (program : Program) (analysis : Analysis) (initial reached : RuntimeState)
    (analyzed : programAnalysis program = some analysis) (empty : LifecycleFrame initial)
    (reachable : TaskExecutionReachable program initial reached) : LifecycleFrame reached := by
  induction reachable with
  | initial => exact empty
  | step choice reachable executed ih =>
    unfold SemanticProcess.step at executed
    split at executed
    · contradiction
    · rename_i operation selected
      exact admitted_fire_preserves_lifecycle_frame program analysis _ _ operation analyzed
        (List.mem_of_find?_eq_some selected) ih executed
  | completion commandId taskId bindings reachable ih =>
    exact completion_admission_preserves_lifecycle_frame program analysis _ commandId taskId bindings analyzed ih

theorem committed_start_has_lifecycle_frame
    (program : Program) (analysis : Analysis) (commandId processId instanceId : SemanticId)
    (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    LifecycleFrame (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).state := by
  have storageAdmitted := admitStimulus_committed_collection_storage program initialState _ committed
  simp only [initialState] at storageAdmitted
  obtain ⟨_, _, noRetention, noSnapshots, _⟩ := program_analysis_excludes_foreign_declarations program analysis analyzed
  have noListeners := committed_foreign_profile_has_no_message_declarations program initialState _
    (by rw [profile]; decide +kernel) committed
  cases created : runningProgramStartState? program instanceId bindings with
  | none =>
    simp [admitStimulus, storageAdmitted, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid, noListeners, noSnapshots, initialState, profile, created] at committed
    split at committed <;> first | contradiction | (split at committed <;> contradiction)
  | some started =>
    have framed : LifecycleFrame started := by
      simp only [runningProgramStartState?, bind, pure, Option.bind_eq_some_iff] at created
      obtain ⟨root, _, created⟩ := created
      cases Option.some.inj created
      refine ⟨by simp [ForeignRuntimeEmpty, noRetention, noListeners, runningStartState, initialState], Or.inl ?_⟩
      exact ⟨{ processInstanceId := instanceId, definitionScopeId := root.id, activation := 1 }, rfl, rfl⟩
    simp [admitStimulus, storageAdmitted, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid, noListeners, noSnapshots, initialState, profile, created] at committed ⊢
    split at committed
    · simp_all
    · contradiction

theorem reached_state_has_lifecycle_frame
    (program : Program) (analysis : Analysis) (commandId processId instanceId : SemanticId)
    (bindings : List VariableBinding) (reached : RuntimeState)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state reached) :
    LifecycleFrame reached :=
  task_execution_preserves_lifecycle_frame program analysis _ reached analyzed
    (committed_start_has_lifecycle_frame program analysis commandId processId instanceId bindings profile analyzed committed) reachable

end BpmnSemantics.SemanticProcess.StructuredComposition
