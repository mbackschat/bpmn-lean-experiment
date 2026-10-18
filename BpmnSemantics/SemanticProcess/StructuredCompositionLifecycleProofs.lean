import BpmnSemantics.SemanticProcess.StructuredCompositionClosureProofs
import BpmnSemantics.SemanticProcess.GraphReachabilityLaws
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessRegistrationLaws

/-! SPC-CLOSURE-01 requires reachable lifecycle and exact Activity-local shape, beyond input availability and decreasing rank. These predicates describe the existing runtime and are preserved through its actual operations and command admission. -/

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

/-- Exact active lifetime fields exclude stale local owners and mismatched task/Activity joins. -/
def TaskLifetimeShape (program : Program) (state : RuntimeState) : Prop :=
  (state.waits = [] ∧ state.activityOccurrences = [] ∧ state.variables.activities = []) ∨
  ∃ wait operation, state.waits = [wait] ∧ operation ∈ program.operations ∧
    state.control = .running wait.processInstanceId ∧ wait.processInstanceId = wait.owner.processInstanceId ∧
    match operation with
    | .awaitUserTask _ _ _ output task =>
      wait.task = task ∧ wait.output = output ∧ wait.metadata = task.metadata ∧
        state.activityOccurrences = [] ∧ state.variables.activities = []
    | .awaitDataInputOutputUserTask _ _ _ output taskId taskName directInput _ =>
      wait.task = { id := taskId, name := taskName } ∧ wait.output = output ∧ wait.metadata = none ∧
      ∃ activityActivation binding,
        binding.name = directInput.targetDataInputId ∧
        variableValueAdmitted activityDataInputOutputUserTaskProfileId .processStart binding.value = true ∧
        state.activityOccurrences = [{
          processInstanceId := wait.processInstanceId
          activityElementId := ⟨taskId.value⟩
          activation := activityActivation
          owner := wait.owner
          body := .userTask {
            processInstanceId := wait.processInstanceId
            elementId := ⟨taskId.value⟩
            activation := wait.activation }
          attachedHandlers := [] }] ∧
        state.variables.activities = [{
          owner := .activityOccurrence {
            processInstanceId := wait.processInstanceId
            activityElementId := ⟨taskId.value⟩
            activation := activityActivation }
          bindings := [binding] }]
    | _ => False

theorem no_wait_has_no_activity_lifetime
    (program : Program) (state : RuntimeState) (shape : TaskLifetimeShape program state)
    (noWait : state.waits = []) : state.activityOccurrences = [] ∧ state.variables.activities = [] := by
  rcases shape with empty | ⟨wait, operation, single, _⟩
  · exact empty.2
  · simp [noWait] at single

theorem token_state_has_no_stale_local_owner
    (program : Program) (state : RuntimeState) (token : ControlToken) (owner : ActivityOccurrenceId)
    (shape : TaskLifetimeShape program state) (bounded : ControlUnitBound state) (live : token ∈ state.tokens) :
    state.variables.activities.any (activityOccurrenceScopeMatches owner) = false := by
  have noWait := (live_token_under_bound_is_single state token bounded live).2.1
  have noScopes := (no_wait_has_no_activity_lifetime program state shape noWait).2
  simp [noScopes]

theorem committed_start_has_task_lifetime_shape
    (program : Program) (analysis : Analysis) (commandId processId instanceId : SemanticId)
    (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    TaskLifetimeShape program (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).state := by
  have storageAdmitted := admitStimulus_committed_collection_storage program initialState _ committed
  simp only [initialState] at storageAdmitted
  obtain ⟨_, _, _, noSnapshots, _⟩ := program_analysis_excludes_foreign_declarations program analysis analyzed
  cases created : runningProgramStartState? program instanceId bindings with
  | none =>
    simp [admitStimulus, storageAdmitted, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid, noSnapshots, initialState, profile, created] at committed
    split at committed <;> first | contradiction | (split at committed <;> contradiction)
  | some started =>
    have shaped : TaskLifetimeShape program started := by
      simp only [runningProgramStartState?, bind, pure, Option.bind_eq_some_iff] at created
      obtain ⟨_, _, created⟩ := created
      cases Option.some.inj created
      exact Or.inl ⟨rfl, rfl, rfl⟩
    simp [admitStimulus, storageAdmitted, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid, noSnapshots, initialState, profile, created] at committed ⊢
    split at committed <;> first | contradiction | (split at committed <;> simp_all)

theorem root_owner_matches_running_instance
    (state : RuntimeState) (owner : ScopeOccurrenceId) (instanceId : SemanticId)
    (frame : LifecycleFrame state) (owned : RootOwnedControl owner state)
    (running : state.control = .running instanceId) : owner.processInstanceId = instanceId := by
  rcases frame.2 with ⟨root, control, scopes⟩ | ⟨completedId, control, _⟩
  · have same := owned.1 { id := root, parent := none } (by simp [scopes])
    change root = owner at same
    simpa [running, same] using control.symm
  · simp [running] at control

theorem ordinary_arming_preserves_task_lifetime_shape
    (program : Program) (before after : RuntimeState) (owner : ScopeOccurrenceId)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId) (task : UserTaskDefinition)
    (member : SemanticOperation.awaitUserTask id origin input output task ∈ program.operations)
    (frame : LifecycleFrame before) (owned : RootOwnedControl owner before)
    (bounded : ControlUnitBound before) (shape : TaskLifetimeShape program before)
    (fired : fire? program (.awaitUserTask id origin input output task) before = some after) :
    TaskLifetimeShape program after := by
  have step := fire_sound program _ before after fired
  cases step with
  | awaitUserTask _ _ _ _ _ _ _ active =>
    simp only [awaitUserTaskState?, bind, pure, Option.bind_eq_some_iff] at active
    obtain ⟨root, selected, instanceId, running, active⟩ := active
    have runningEq : before.control = .running instanceId := by
      cases control : before.control <;> simp [runningInstance?, control] at running
      case running actual => simp [running]
    have rootEq := selected_token_has_root_owner before owner root input owned bounded selected
    have instanceEq := root_owner_matches_running_instance before owner instanceId frame owned runningEq
    obtain ⟨_, _, noWait, _⟩ := enabled_token_under_bound_is_single before input root bounded selected
    obtain ⟨noRecords, noScopes⟩ := no_wait_has_no_activity_lifetime program before shape noWait
    cases Option.some.inj active
    apply Or.inr
    refine ⟨{
      processInstanceId := root.processInstanceId
      owner := root
      task
      activation := activationCount before task.id + 1
      output
      metadata := task.metadata }, .awaitUserTask id origin input output task, ?_⟩
    simp [activateUserTask, noWait, noRecords, noScopes, insertUserTaskWait, member,
      runningEq, rootEq, instanceEq]

theorem data_arming_preserves_task_lifetime_shape
    (program : Program) (before after : RuntimeState) (owner : ScopeOccurrenceId)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (taskId : TaskDefinitionId) (taskName : Option String)
    (directInput : DirectActivityDataInput) (directOutput : DirectActivityDataOutput)
    (member : SemanticOperation.awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput ∈ program.operations)
    (scalarPath : programPropertyPathValuePolicy program = .scalar)
    (frame : LifecycleFrame before) (owned : RootOwnedControl owner before)
    (bounded : ControlUnitBound before) (shape : TaskLifetimeShape program before)
    (fired : fire? program (.awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput) before = some after) :
    TaskLifetimeShape program after := by
  have step := fire_sound program _ before after fired
  cases step with
  | awaitDataInputOutputUserTask _ _ _ _ _ _ _ _ _ _ active =>
    simp only [activateDataInputOutputUserTask?, bind, pure, Option.bind_eq_some_iff] at active
    obtain ⟨root, selected, instanceId, running, source, available, active⟩ := active
    have runningEq : before.control = .running instanceId := by
      change (match before.control with | .running value => some value | _ => none) = some instanceId at running
      cases control : before.control <;> simp_all
    have rootEq := selected_token_has_root_owner before owner root input owned bounded selected
    have instanceEq := root_owner_matches_running_instance before owner instanceId frame owned runningEq
    have typed : variableValueAdmitted activityDataInputOutputUserTaskProfileId .processStart source.value = true := by
      have scalar := readActivityDataInput_scalar (scalarPath ▸ available)
      cases value : source.value <;> simp [processInterfaceScalar, variableValueAdmitted,
        activityDataInputOutputUserTaskProfileId, value] at scalar ⊢
    obtain ⟨_, _, noWait, _⟩ := enabled_token_under_bound_is_single before input root bounded selected
    obtain ⟨noRecords, noScopes⟩ := no_wait_has_no_activity_lifetime program before shape noWait
    split at active
    · contradiction
    · cases Option.some.inj active
      apply Or.inr
      refine ⟨{
        processInstanceId := root.processInstanceId
        owner := root
        task := { id := taskId, name := taskName }
        activation := activationCount before taskId + 1
        output }, .awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput, ?_⟩
      simp only [noWait, noRecords, noScopes, insertUserTaskWait, insertActivityOccurrence,
        addActivityOccurrenceVariableScope, insertActivityVariableScope]
      refine ⟨True.intro, member, by simpa [rootEq, instanceEq] using runningEq, True.intro, True.intro, True.intro, True.intro,
        activityActivationCount before taskId + 1, { name := directInput.targetDataInputId, value := source.value }, rfl, typed, rfl, rfl⟩


theorem task_lifetime_shape_frame
    (program : Program) (before after : RuntimeState) (shape : TaskLifetimeShape program before)
    (waits : after.waits = before.waits) (records : after.activityOccurrences = before.activityOccurrences)
    (scopes : after.variables.activities = before.variables.activities) (control : after.control = before.control) :
    TaskLifetimeShape program after := by
  simpa only [TaskLifetimeShape, waits, records, scopes, control] using shape

theorem admitted_fire_preserves_task_lifetime_shape
    (program : Program) (analysis : Analysis) (before after : RuntimeState)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId)
    (analyzed : programAnalysis program = some analysis) (member : operation ∈ program.operations)
    (scalarPath : programPropertyPathValuePolicy program = .scalar) (frame : LifecycleFrame before)
    (owned : RootOwnedControl owner before) (bounded : ControlUnitBound before)
    (shape : TaskLifetimeShape program before) (fired : fire? program operation before = some after) : TaskLifetimeShape program after := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have selected := allowed operation member
  have step := fire_sound program operation before after fired
  cases operation <;> simp only [OperationAllowed] at selected
  all_goals try contradiction
  case awaitUserTask id origin input output task =>
    exact ordinary_arming_preserves_task_lifetime_shape program before after owner id origin input output task
      member frame owned bounded shape fired
  case awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput =>
    exact data_arming_preserves_task_lifetime_shape program before after owner id origin input output taskId
      taskName directInput directOutput member scalarPath frame owned bounded shape fired
  case initiate id origin output =>
    cases step with
    | initiate _ _ _ _ _ active =>
      obtain ⟨_, _, active⟩ := Option.bind_eq_some_iff.mp active
      split at active
      · cases Option.some.inj active
        exact task_lifetime_shape_frame program before _ shape rfl rfl rfl rfl
      · contradiction
  case choose id origin input candidates output defaultOrigin =>
    cases step with
    | choose _ _ _ _ _ _ _ _ active =>
      simp only [chooseState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨_, _, _, _, active⟩ := active
      cases Option.some.inj active
      exact task_lifetime_shape_frame program before _ shape rfl rfl rfl rfl
  case mergeExclusive id origin inputs output =>
    have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
    rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ absent] at fired
    unfold mergeExclusiveState? at fired
    split at fired
    · cases Option.some.inj fired
      exact task_lifetime_shape_frame program before _ shape rfl rfl rfl rfl
    · contradiction
  case reachNoneEnd id origin input =>
    cases step with
    | reachNoneEnd _ _ _ _ _ active =>
      simp only [reachNoneEndState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨_, _, _, _, active⟩ := active
      cases Option.some.inj active
      exact task_lifetime_shape_frame program before _ shape rfl rfl rfl rfl
  case completeScope id origin scope output =>
    cases output with
    | some output => contradiction
    | none =>
      cases step with
      | completeScope _ _ _ _ _ _ completed =>
        rw [declared_scope_completion_delegates_to_root program before scope allowed] at completed
        unfold completeScopeState? at completed
        split at completed
        · rename_i occurrence selected
          have member : occurrence ∈ before.scopeOccurrences.filter (fun candidate =>
              decide (candidate.id.definitionScopeId = scope)) := by rw [selected]; simp
          have same := owned.1 occurrence (List.mem_filter.mp member).1
          split at completed
          · contradiction
          · rename_i quiet
            have noWait : before.waits = [] := by
              apply List.eq_nil_iff_forall_not_mem.mpr
              intro wait live
              have present : (before.waits.any fun wait => wait.owner == occurrence.id) = true :=
                List.any_eq_true.mpr ⟨wait, live, by simp [owned.2.2 wait live, same]⟩
              simp [scopeQuiescent, present] at quiet
            obtain ⟨noRecords, noScopes⟩ := no_wait_has_no_activity_lifetime program before shape noWait
            unfold completeQuiescentScope? at completed
            split at completed
            · split at completed
              · contradiction
              · cases Option.some.inj completed
                exact Or.inl ⟨noWait, noRecords, noScopes⟩
            · contradiction
            · contradiction
        · contradiction


theorem task_lifetime_collections_bounded
    (program : Program) (state : RuntimeState) (shape : TaskLifetimeShape program state) :
    state.activityOccurrences.length ≤ 1 ∧ state.variables.activities.length ≤ 1 := by
  rcases shape with ⟨_, records, scopes⟩ | ⟨wait, operation, _, _, _, _, details⟩
  · simp [records, scopes]
  · cases operation <;> simp only at details
    all_goals try contradiction
    case awaitUserTask => simp [details.2.2.2.1, details.2.2.2.2]
    case awaitDataInputOutputUserTask =>
      obtain ⟨_, _, _, _, _, _, _, records, scopes⟩ := details
      simp [records, scopes]

theorem data_completion_clears_task_lifetime
    (program : Program) (before after : RuntimeState) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (bindings : List VariableBinding)
    (bounded : ControlUnitBound before) (shape : TaskLifetimeShape program before)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation bindings = some after) :
    TaskLifetimeShape program after := by
  obtain ⟨recordBound, scopeBound⟩ := task_lifetime_collections_bounded program before shape
  obtain ⟨_, _, _, _, _, _, noWait, _⟩ :=
    data_completion_has_exact_continuation program before after instanceId taskId activation bindings bounded completed
  obtain ⟨_, _, _, wait, record, _, variables, _, _, _, _, joined, _, removed, _, _, records, written⟩ :=
    dataInputOutputCompletionJoin completed
  have scopes := writeActivityDataOutput_preserves_activities written
  apply Or.inl
  refine ⟨noWait, ?_, ?_⟩
  · cases values : before.activityOccurrences with
    | nil => simp [activityOccurrenceForTaskWait?, values] at joined
    | cons first rest =>
      have lengthBound : rest.length + 1 ≤ 1 := by simpa only [values, List.length_cons] using recordBound
      have restEmpty : rest = [] := List.eq_nil_of_length_eq_zero (by omega)
      by_cases named : recordBodyNamesWait wait first = true
      · have same : first = record := by simpa [activityOccurrenceForTaskWait?, values, restEmpty, named] using joined
        simp [records, values, restEmpty, same, sameActivityOccurrence]
      · simp [activityOccurrenceForTaskWait?, values, restEmpty, named] at joined
  · cases values : before.variables.activities with
    | nil => simp [removeActivityOccurrenceVariableScope, values] at removed
    | cons first rest =>
      have lengthBound : rest.length + 1 ≤ 1 := by simpa only [values, List.length_cons] using scopeBound
      have restEmpty : rest = [] := List.eq_nil_of_length_eq_zero (by omega)
      by_cases matched : activityOccurrenceScopeMatches (activityOwnerForRecord record) first = true
      · simp [removeActivityOccurrenceVariableScope, values, restEmpty, matched] at removed
        simp [scopes, ← removed]
      · simp [removeActivityOccurrenceVariableScope, values, restEmpty, matched] at removed

theorem ordinary_completion_clears_task_lifetime
    (program : Program) (before after : RuntimeState) (taskId : UserTaskInstanceId)
    (bindings : List VariableBinding) (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (accepted : structuredCompositionOrdinaryCompletionAdmitted program taskId bindings = true)
    (bounded : ControlUnitBound before) (shape : TaskLifetimeShape program before)
    (completed : completeUserTask before taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation = some after) :
    TaskLifetimeShape program after := by
  obtain ⟨id, origin, input, output, task, declared, key⟩ :=
    ordinary_completion_admission_has_declaration program taskId bindings profile accepted
  obtain ⟨liveWait, live, _, sameKey, noWait, _⟩ :=
    ordinary_completion_has_exact_continuation before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation bounded completed
  have noLifetime : before.activityOccurrences = [] ∧ before.variables.activities = [] := by
    rcases shape with ⟨waits, _, _⟩ | ⟨wait, operation, waits, member, _, _, details⟩
    · simp [waits] at live
    · have sameWait : liveWait = wait := by simpa [waits] using live
      have declares : operationDeclaresWaitKey operation (userTaskWaitDeclarationKey wait.task.id) = true := by
        cases operation <;> simp only at details
        all_goals try contradiction
        all_goals simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, details.1]
      have unique := programWellFormed_waitDeclarer program operation (userTaskWaitDeclarationKey wait.task.id)
        wellFormed member declares
      have other : SemanticOperation.awaitUserTask id origin input output task ∈
          program.operations.filter (fun candidate => operationDeclaresWaitKey candidate
            (userTaskWaitDeclarationKey wait.task.id)) := by
        apply List.mem_filter.mpr
        refine ⟨declared, ?_⟩
        have taskKey : task.id = wait.task.id := by
          have sameValue : task.id.value = wait.task.id.value := by
            simpa [sameWait] using key.trans (congrArg TaskDefinitionId.value sameKey).symm
          exact congrArg TaskDefinitionId.mk sameValue
        simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, taskKey]
      rw [unique] at other
      have same := List.mem_singleton.mp other
      subst operation
      exact ⟨details.2.2.2.1, details.2.2.2.2⟩
  unfold completeUserTask at completed
  split at completed
  · contradiction
  · cases Option.some.inj completed
    exact Or.inl ⟨noWait, noLifetime⟩


theorem completion_admission_preserves_task_lifetime_shape
    (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (bounded : ControlUnitBound before) (shape : TaskLifetimeShape program before) :
    TaskLifetimeShape program (admitStimulus program before (.completeUserTaskInstance commandId taskId bindings)).state := by
  rcases completion_admission_cases program analysis before commandId taskId bindings analyzed with
    refused | ⟨after, completed, _, result⟩ | ⟨after, completed, ordinary, _, result⟩ | ⟨after, _, call, _, _⟩
  · simpa [refused] using shape
  · rw [result]
    exact data_completion_clears_task_lifetime program before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation bindings bounded shape completed
  · rw [result]
    have cleared := ordinary_completion_clears_task_lifetime program before after taskId bindings
      wellFormed profile ordinary bounded shape completed
    exact task_lifetime_shape_frame program after _ cleared rfl rfl rfl rfl
  · simp [isCallActivityProgram, profile, structuredCompositionCheckpointProfileId] at call

theorem task_execution_preserves_task_lifetime_shape
    (program : Program) (analysis : Analysis) (initial reached : RuntimeState) (owner : ScopeOccurrenceId)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (frame : LifecycleFrame initial) (owned : RootOwnedControl owner initial)
    (bounded : ControlUnitBound initial) (shape : TaskLifetimeShape program initial)
    (reachable : TaskExecutionReachable program initial reached) : TaskLifetimeShape program reached := by
  induction reachable with
  | initial => exact shape
  | step choice reachable executed ih =>
    have currentBound := task_execution_reachable_preserves_control_unit_bound program analysis _ _ analyzed bounded reachable
    have currentFrame := task_execution_preserves_lifecycle_frame program analysis _ _ analyzed frame reachable
    have currentOwner := task_execution_preserves_root_ownership program analysis _ _ owner analyzed owned bounded reachable
    unfold SemanticProcess.step at executed
    split at executed
    · contradiction
    · rename_i operation selected
      exact admitted_fire_preserves_task_lifetime_shape program analysis _ _ operation owner analyzed (List.mem_of_find?_eq_some selected)
        (programPropertyPathValuePolicy_eq_scalar (by simp [profile])) currentFrame currentOwner currentBound ih executed
  | completion commandId taskId bindings reachable ih =>
    have currentBound := task_execution_reachable_preserves_control_unit_bound program analysis _ _ analyzed bounded reachable
    exact completion_admission_preserves_task_lifetime_shape program analysis _ commandId taskId bindings
      wellFormed profile analyzed currentBound ih

/-- The complete lifecycle invariant follows an actual accepted start and all actual task-command/internal histories. -/
theorem reached_state_has_exact_lifecycle
    (program : Program) (analysis : Analysis) (commandId processId instanceId : SemanticId)
    (bindings : List VariableBinding) (reached : RuntimeState)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state reached) :
    LifecycleFrame reached ∧ TaskLifetimeShape program reached := by
  have frame := committed_start_has_lifecycle_frame program analysis commandId processId instanceId bindings
    profile analyzed committed
  have shape := committed_start_has_task_lifetime_shape program analysis commandId processId instanceId bindings
    profile analyzed committed
  obtain ⟨owner, owned⟩ := committed_start_has_root_owner program commandId processId instanceId bindings
    profile committed
  have bounded := committed_start_task_execution_has_at_most_one_control_unit program analysis commandId processId
    instanceId bindings _ profile analyzed committed .initial
  exact ⟨task_execution_preserves_lifecycle_frame program analysis _ _ analyzed frame reachable,
    task_execution_preserves_task_lifetime_shape program analysis _ _ owner wellFormed profile analyzed
      frame owned bounded shape reachable⟩


/-- The root retained by reachable ownership is the sole declared scope, not an arbitrary runtime owner. -/
theorem committed_start_has_declared_root_owner
    (program : Program) (analysis : Analysis) (commandId processId instanceId : SemanticId)
    (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    ∃ root owner, program.definitionScopes = [root] ∧ owner.definitionScopeId = root.id ∧
      RootOwnedControl owner (admitStimulus program initialState
        (.startProcess commandId processId instanceId bindings)).state := by
  have storageAdmitted := admitStimulus_committed_collection_storage program initialState _ committed
  simp only [initialState] at storageAdmitted
  obtain ⟨oneScope, _, _, noSnapshots, _⟩ := program_analysis_excludes_foreign_declarations program analysis analyzed
  obtain ⟨sole, soleEq⟩ := List.length_eq_one_iff.mp oneScope
  cases created : runningProgramStartState? program instanceId bindings with
  | none =>
    simp [admitStimulus, storageAdmitted, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid, noSnapshots, initialState, profile, created] at committed
    split at committed <;> first | contradiction | (split at committed <;> contradiction)
  | some started =>
    have owned : ∃ owner, owner.definitionScopeId = sole.id ∧ RootOwnedControl owner started := by
      simp only [runningProgramStartState?, bind, pure, Option.bind_eq_some_iff] at created
      obtain ⟨root, found, created⟩ := created
      have same : root = sole := by
        by_cases accepted : (sole.parentScopeId.isNone && decide (sole.originElementId.value = program.processId.value)) = true
        · simpa [rootDefinitionScope?, soleEq, accepted] using found.symm
        · simp [rootDefinitionScope?, soleEq, accepted] at found
      cases Option.some.inj created
      refine ⟨{ processInstanceId := instanceId, definitionScopeId := root.id, activation := 1 },
        by simp [same], ?_⟩
      simp [RootOwnedControl, runningStartState, initialState]
    obtain ⟨owner, key, owned⟩ := owned
    refine ⟨sole, owner, soleEq, key, ?_⟩
    simp [admitStimulus, storageAdmitted, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid, noSnapshots, initialState, profile, created] at committed ⊢
    split at committed <;> first | contradiction | (split at committed <;> simp_all)


theorem admitted_program_has_unique_identity_keys
    (program : Program) (wellFormed : programWellFormed program = true) :
    (program.operations.map (·.id)).Nodup ∧ (program.controlPlaces.map (·.id)).Nodup := by
  constructor
  · apply List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  · apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted program wellFormed)

theorem admitted_scope_lookup_is_exact
    (program : Program) (id : OperationId) (wellFormed : programWellFormed program = true) :
    (program.operationScopes.find? (fun binding => decide (binding.operationId = id))).map (·.scopeId) =
      operationOwningScope? program id := by
  obtain ⟨_, _, _, ownership⟩ := programGraphWellFormed_scopeContract program (programWellFormed_graph program wellFormed)
  simp only [scopedOwnershipComplete, Bool.and_eq_true, decide_eq_true_eq] at ownership
  have unique : (program.operationScopes.map (·.operationId)).Nodup := by
    rw [ownership.1.1]
    exact (admitted_program_has_unique_identity_keys program wellFormed).1
  cases found : program.operationScopes.find? (fun binding => decide (binding.operationId = id)) with
  | none =>
    have empty : program.operationScopes.filter (fun binding => decide (binding.operationId = id)) = [] := by
      apply List.filter_eq_nil_iff.mpr
      intro binding member selected
      have refused := List.find?_eq_none.mp found binding member
      simp [selected] at refused
    simp [operationOwningScope?, empty]
  | some binding =>
    have key : binding.operationId = id := by simpa only [decide_eq_true_eq] using List.find?_some found
    have singleton := filter_key_eq_singleton_of_nodup program.operationScopes (·.operationId) binding unique
      (List.mem_of_find?_eq_some found)
    rw [key] at singleton
    simp [operationOwningScope?, singleton]

theorem admitted_shared_port_has_same_operation_scope
    (program : Program) (left right : SemanticOperation) (place : ControlPlaceId)
    (wellFormed : programWellFormed program = true)
    (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (leftSame : operationControlPlacesShareOwner left = true)
    (rightSame : operationControlPlacesShareOwner right = true)
    (leftPort : place ∈ operationControlPlaces left) (rightPort : place ∈ operationControlPlaces right) :
    operationOwningScope? program left.id = operationOwningScope? program right.id := by
  obtain ⟨operations, places⟩ := admitted_program_has_unique_identity_keys program wellFormed
  obtain ⟨leftOwner, _, leftBinding, leftPlace, _⟩ := programGraphWellFormed_operationControlPlaceScope program left place
    (programWellFormed_graph program wellFormed) operations places leftMember leftSame leftPort
  obtain ⟨rightOwner, _, rightBinding, rightPlace, _⟩ := programGraphWellFormed_operationControlPlaceScope program right place
    (programWellFormed_graph program wellFormed) operations places rightMember rightSame rightPort
  have owners : leftOwner = rightOwner := by simpa using leftPlace.symm.trans rightPlace
  simp [operationOwningScope?, leftBinding, rightBinding, owners]

theorem admitted_completion_scope_is_declared_root
    (program : Program) (root : DefinitionScope) (id : OperationId) (origin : BpmnElementOrigin)
    (scope : DefinitionScopeId)
    (wellFormed : programWellFormed program = true) (definitions : program.definitionScopes = [root])
    (member : SemanticOperation.completeScope id origin scope none ∈ program.operations) :
    operationOwningScope? program id = some root.id := by
  obtain ⟨entryRoot, _, _, ownership⟩ := programGraphWellFormed_scopeContract program (programWellFormed_graph program wellFormed)
  simp only [scopedOwnershipComplete, Bool.and_eq_true] at ownership
  have respects := List.all_eq_true.mp ownership.2 _ member
  obtain ⟨_, definition, _, _, declared, _⟩ := programGraphWellFormed_completion_binding program id origin scope none
    (programWellFormed_graph program wellFormed) member
  have same : definition = root := by simpa [definitions] using List.mem_of_find?_eq_some declared
  have key : definition.id = scope := by simpa only [decide_eq_true_eq] using List.find?_some declared
  have rootKey : scope = root.id := by simpa [same] using key.symm
  unfold operationRespectsScopes at respects
  dsimp only at respects
  split at respects
  · contradiction
  · rename_i owner found
    simp only [Bool.and_eq_true, decide_eq_true_eq] at respects
    change (program.operationScopes.find? (fun binding => decide (binding.operationId = id))).map (·.scopeId) = some owner at found
    rw [admitted_scope_lookup_is_exact program id wellFormed] at found
    simpa only [← respects.1, rootKey] using found


/-- The admitted connected graph transports the anchored root scope through exact shared ports. -/
theorem admitted_operations_share_declared_root
    (program : Program) (analysis : Analysis) (root : DefinitionScope)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (definitions : program.definitionScopes = [root]) :
    ∀ operation ∈ program.operations, operationOwningScope? program operation.id = some root.id := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have sameScope : ∀ operation ∈ program.operations, ∀ place ∈ operationControlPlaces operation,
      operationControlPlacesShareOwner operation = true := by
    intro operation member place port
    have selected := allowed operation member
    cases operation <;> simp only [OperationAllowed] at selected
    all_goals try contradiction
    all_goals try rfl
    case completeScope id origin scope output => cases output <;> first | contradiction | exact List.not_mem_nil port
  have noHandlers : program.interruptingMessageEventSubProcesses = [] := by
    by_cases absent : program.interruptingMessageEventSubProcesses = []
    · exact absent
    · simpa [definitions] using message_declarations_require_two_scopes program wellFormed absent
  have graph := programWellFormed_graph program wellFormed
  have witness : ∃ start edges,
      operationOwningScope? program start = some root.id ∧
      (∀ edge ∈ edges, operationOwningScope? program edge.source = some root.id →
        operationOwningScope? program edge.target = some root.id) ∧
      ∀ operation ∈ program.operations, GraphReaches edges start operation.id := by
    unfold programGraphWellFormedForProgram programGraphWellFormedWithScopeLifecycle at graph
    dsimp only at graph
    split at graph
    · rename_i start starts
      split at graph
      · rename_i entryRoot rootFound
        simp only [Bool.and_eq_true] at graph
        have allReach := graph.1.1.2
        have rootEq : entryRoot = root.id := by
          by_cases accepted : (root.parentScopeId.isNone && decide (root.originElementId.value = program.processId.value)) = true
          · simpa [programEntryRootScopeId?, definitions, accepted] using rootFound.symm
          · simp [programEntryRootScopeId?, definitions, accepted] at rootFound
        have paths := fun (operation : SemanticOperation) (member : operation ∈ program.operations) =>
          reachableWithin_sound _ _ _ _
            (List.all_eq_true.mp allReach operation.id (List.mem_map.mpr ⟨operation, member, rfl⟩))
        refine ⟨start, _, ?_, ?_, paths⟩
        · rw [← admitted_scope_lookup_is_exact program start wellFormed]
          have anchor := of_decide_eq_true graph.1.1.1.1.1.1.1.1.1.1.1
          change (program.operationScopes.find? (fun binding => decide (binding.operationId = start))).map (·.scopeId) = some entryRoot at anchor
          simpa only [rootEq] using anchor
        · intro edge included predecessor
          rcases List.mem_append.mp included with coreEdge | callEdge
          · rcases List.mem_append.mp coreEdge with ordinaryEdge | parallelEdge
            · rcases List.mem_append.mp ordinaryEdge with portEdge | completionEdge
              · change edge ∈ program.interruptingMessageEventSubProcesses.flatMap _ ++ _ at portEdge
                simp only [noHandlers, List.flatMap_nil, List.nil_append] at portEdge
                obtain ⟨place, _, portEdge⟩ := List.mem_flatMap.mp portEdge
                obtain ⟨producer, produces, portEdge⟩ := List.mem_flatMap.mp portEdge
                obtain ⟨consumer, consumes, edgeEq⟩ := List.mem_map.mp portEdge
                obtain ⟨producerOp, producerMember, producerId, producerPort⟩ :=
                  producer_direct_output_witness program.operations place.id producer produces
                    (fun id origin entry member => by simpa [OperationAllowed] using allowed _ member)
                    (fun id origin entry member => by simpa [OperationAllowed] using allowed _ member)
                obtain ⟨consumerOp, consumerMember, consumed⟩ := List.mem_filterMap.mp consumes
                split at consumed
                · rename_i consumerPort
                  have consumerId := Option.some.inj consumed
                  have leftPort : place.id ∈ operationControlPlaces producerOp :=
                    List.mem_append_right _ producerPort
                  have rightPort : place.id ∈ operationControlPlaces consumerOp :=
                    List.mem_append_left _ (by simpa using consumerPort)
                  have equal := admitted_shared_port_has_same_operation_scope program producerOp consumerOp place.id
                    wellFormed producerMember consumerMember (sameScope producerOp producerMember _ leftPort)
                    (sameScope consumerOp consumerMember _ rightPort) leftPort rightPort
                  cases edgeEq
                  rw [producerId, consumerId] at equal
                  exact equal.symm.trans predecessor
                · contradiction
              · obtain ⟨operation, member, produced⟩ := List.mem_filterMap.mp completionEdge
                have selected := allowed operation member
                cases operation <;> simp only [OperationAllowed] at selected
                all_goals try contradiction
                all_goals try { simp only at produced; contradiction }
                case reachNoneEnd id origin input =>
                  obtain ⟨scope, _, produced⟩ := Option.bind_eq_some_iff.mp produced
                  obtain ⟨completion, found, produced⟩ := Option.bind_eq_some_iff.mp produced
                  obtain ⟨completionOp, completionMember, names⟩ := List.exists_of_findSome?_eq_some found
                  have completionAllowed := allowed _ completionMember
                  cases completionOp <;> simp only [OperationAllowed] at completionAllowed names
                  all_goals try contradiction
                  case completeScope completionId completionOrigin completionScope output =>
                    split at names
                    · have completionKey := Option.some.inj names
                      cases output with
                      | some output => contradiction
                      | none =>
                        cases Option.some.inj produced
                        simpa only [← completionKey] using admitted_completion_scope_is_declared_root program root
                          completionId completionOrigin completionScope wellFormed definitions completionMember
                    · contradiction
            · obtain ⟨operation, member, produced⟩ := List.mem_filterMap.mp parallelEdge
              have selected := allowed operation member
              cases operation <;> simp_all [OperationAllowed]
          · obtain ⟨pair, pairMember, _⟩ := List.mem_map.mp callEdge
            obtain ⟨operation, member, produced⟩ := List.mem_filterMap.mp pairMember
            have selected := allowed operation member
            cases operation <;> simp_all [OperationAllowed]
      · contradiction
    · contradiction
  obtain ⟨start, edges, anchor, preserved, reachable⟩ := witness
  intro operation member
  have path := reachable operation member
  generalize operation.id = target at path ⊢
  induction path with
  | refl => exact anchor
  | step path edge ih => exact preserved _ edge ih

end BpmnSemantics.SemanticProcess.StructuredComposition
