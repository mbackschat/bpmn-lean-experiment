module

import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import all BpmnSemantics.SemanticProcess.ParallelScopeData
public import BpmnSemantics.SemanticProcess.ParallelScopeCommandReplay
public import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceUserTaskProgramValidity
import BpmnSemantics.SemanticProcess.ParallelScopeReservedArmingReplay

/-! # Actual parallel body retirement accounting

PMIS-END-01 exchanges the parent's blocked continuation while disposing body
occurrences. The scope census is a decreasing resource independently of token
credit; this law does not assert whole-command phase correspondence or progress.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- All actual retirement branches remove their selected target and retain only predecessor scopes. -/
theorem completeParallelScope_scope_census (entry : ParallelScopeEntry)
    (before after : RuntimeState) (target : ScopeOccurrenceId)
    (completed : completeParallelScope? entry before target = some after) :
    after.scopeOccurrences.Sublist before.scopeOccurrences ∧
      ∀ occurrence ∈ after.scopeOccurrences, occurrence.id ≠ target := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, bound, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, evaluated, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨result, retired, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases result with
  | remaining successor selected first rest =>
      cases Option.some.inj completed
      exact ⟨cancelScopeSubtree_scopeOccurrences_sublist _ target .remove,
        cancelScopeSubtree_remove_target _ target⟩
  | naturalCompletion successor selected =>
      cases Option.some.inj completed
      exact ⟨cancelScopeSubtree_scopeOccurrences_sublist _ target .remove,
        cancelScopeSubtree_remove_target _ target⟩
  | earlyCompletion successor selected first rest =>
      cases Option.some.inj completed
      constructor
      · exact (cancelScopeSubtree_fold_scopeOccurrences_sublist (first :: rest) (·.scope) _).trans
          (cancelScopeSubtree_scopeOccurrences_sublist _ target .remove)
      · intro occurrence member
        exact cancelScopeSubtree_remove_target _ target occurrence
          ((cancelScopeSubtree_fold_scopeOccurrences_sublist (first :: rest) (·.scope) _).subset member)

private theorem bound_target_scope (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state target = some binding) :
    ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = target := by
  obtain ⟨iteration, member, same⟩ := parallelScopeBinding_member entry state target binding bound
  have body := List.all_eq_true.mp (parallelScopeBinding_population entry state target binding bound).2 iteration member
  rw [same] at body
  unfold parallelScopeBodyBound at body
  split at body <;> try contradiction
  rename_i occurrence selected
  have present : occurrence ∈ state.scopeOccurrences.filter (fun current => current.id == target) := by
    rw [selected]
    simp
  obtain ⟨member, same⟩ := List.mem_filter.mp present
  exact ⟨occurrence, member, by simpa using same⟩

/-- Actual retirement requires the selected target to be present in the predecessor scope census. -/
theorem completeParallelScope_target_scope (entry : ParallelScopeEntry)
    (before after : RuntimeState) (target : ScopeOccurrenceId)
    (completed : completeParallelScope? entry before target = some after) :
    ∃ occurrence ∈ before.scopeOccurrences, occurrence.id = target := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, bound, _⟩ := Option.bind_eq_some_iff.mp completed
  exact bound_target_scope entry before target binding bound

/-- Actual successful retirement strictly reduces the live scope census; binding derives the removed predecessor member. -/
theorem completeParallelScope_scope_count_lt (entry : ParallelScopeEntry)
    (before after : RuntimeState) (target : ScopeOccurrenceId)
    (completed : completeParallelScope? entry before target = some after) :
    after.scopeOccurrences.length < before.scopeOccurrences.length := by
  obtain ⟨sublist, absent⟩ := completeParallelScope_scope_census entry before after target completed
  obtain ⟨occurrence, member, identity⟩ := completeParallelScope_target_scope entry before after target completed
  apply Nat.lt_of_le_of_ne sublist.length_le
  intro equal
  have same := sublist.eq_of_length equal
  exact absent occurrence (same.symm ▸ member) identity

/-- The actual running Start constructor initializes reservation-valid counters and has no Compensation waits. -/
theorem runningProgramStartState_reservation_valid (program : Program) (instanceId : SemanticId)
    (values : List VariableBinding) (state : RuntimeState)
    (started : runningProgramStartState? program instanceId values = some state) :
    InternalCommutation.occurrenceReservationStateValid state = true ∧
      state.compensationHandlerEffectWaits = [] := by
  unfold runningProgramStartState? at started
  obtain ⟨root, _, started⟩ := Option.bind_eq_some_iff.mp started
  cases Option.some.inj started
  constructor
  · simp [InternalCommutation.occurrenceReservationStateValid, InternalCommutation.occurrenceCounterRowsValid,
      InternalCommutation.openWaitAnchors, runningStartState, initialState, emptyScopedVariables]
  · rfl

namespace ParallelScopeReplay

/-- Retirement records consume one unit of the live-scope resource; body records consume none. -/
def retirementCharge : CommittedTransition → Nat
  | .externalStimulus _ => 0
  | .internalOperation record => if record.operationKind == .completeParallelMultiInstanceScope then 1 else 0

private theorem human_scope_frame (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after) :
    after.scopeOccurrences = before.scopeOccurrences := by
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    rfl
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    rfl

private theorem effect_scope_frame (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeEffect? program before id (.success values) = some after) :
    after.scopeOccurrences = before.scopeOccurrences := by
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i wait selected
  split at completed
  · simp only [completeParallelScopeEffect?, selected] at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    rfl
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    rfl

theorem admission_scope_frame (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus) :
    (admitStimulus program before stimulus).state.scopeOccurrences = before.scopeOccurrences := by
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first
      | rfl
      | (apply human_scope_frame; assumption)
      | split
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    all_goals
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first
      | rfl
      | (apply effect_scope_frame; assumption)
      | split

private theorem replayed_scope_budget (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after) :
    after.scopeOccurrences.length + retirementCharge (.internalOperation record) ≤ before.scopeOccurrences.length := by
  obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
    InternalCommutation.replayInternalOperationOccurrence_sound program before after record replayed
  rcases kind with body | retirement
  · have frame := (InternalCommutation.applyInternalOperationOccurrence_body_retirement_frame program before after
      ⟨record.operationId, record.owner⟩ operation resolved (by rw [metadata]; exact body) applied).2.1
    have different : record.operationKind ≠ .completeParallelMultiInstanceScope := by
      simp [bodyTransition] at body
      rcases body with same | same | same | same | same <;> simp [same]
    simp [retirementCharge, different, frame]
  · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    have smaller := completeParallelScope_scope_count_lt entry before after record.owner completed
    simp only [retirementCharge, retirement, beq_self_eq_true, ite_true]
    omega

private theorem ordered_scope_budget (program : Program) (initial final : RuntimeState)
    (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length) (last : (initial :: successors).getLast? = some final)
    (aligned : ∀ pair ∈ records.zip ((initial :: successors).zip successors),
      ∃ record, pair.1 = .internalOperation record ∧
        InternalCommutation.replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record) :
    final.scopeOccurrences.length + (records.map retirementCharge).sum ≤ initial.scopeOccurrences.length := by
  induction records generalizing initial successors with
  | nil =>
    have empty : successors = [] := by simpa using length
    subst successors
    have same : initial = final := by simpa using last
    simp [same]
  | cons head rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      obtain ⟨record, same, actual⟩ := aligned (head, initial, next) (by simp)
      change head = .internalOperation record at same
      have first := replayed_scope_budget program initial next record (same ▸ kinds head (by simp)) actual
      have later := ih next tail (by simpa using length) (by simpa using last)
        (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
        (fun record member => kinds record (by simp [member]))
      simp only [List.map_cons, List.sum_cons]
      rw [same] at ⊢
      omega

/-- Actual lifetime replay bounds retirement records by the initially live scope census, including internal steps before the first completion command. -/
theorem ContinuationCommandHistory.retirement_budget (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    final.scopeOccurrences.length + (records.map retirementCharge).sum ≤ initial.scopeOccurrences.length := by
  induction history with
  | initial => simp
  | @internalStep before after earlier record history replayed kind outside ih =>
    have step := replayed_scope_budget program before after record kind replayed
    simp only [List.map_append, List.sum_append, List.map_cons, List.map_nil, List.sum_cons, List.sum_nil, Nat.add_zero]
    omega
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    obtain ⟨actualStimulus, actualRest, admitted, successors, shape, committed, stateEq, length, last, aligned⟩ :=
      committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
    cases shape
    have command := ordered_scope_budget program admitted after rest successors length last aligned kinds
    have scopes := admission_scope_frame program before stimulus selected completion
    rw [← stateEq, scopes] at command
    simp only [List.map_append, List.sum_append]
    omega

/-- The preserved live root contributes one scope independently of the bodies' retirement budget. -/
theorem ContinuationCommandHistory.retirement_budget_with_root (program : Program) (owner parent : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (frame : ParallelScopeStructuralFrame parent initial) :
    1 + (records.map retirementCharge).sum ≤ initial.scopeOccurrences.length := by
  have finalFrame := history.structural_frame program owner parent selected initial final records frame
  have present : 1 ≤ final.scopeOccurrences.length := by
    have filtered := (List.filter_sublist (p := fun occurrence : RuntimeScopeOccurrence => decide (occurrence.id = parent))
      (l := final.scopeOccurrences)).length_le
    rw [finalFrame.root] at filtered
    simpa using filtered
  have budget := history.retirement_budget program owner selected initial final records
  omega

/-- Reserved body patches cannot introduce the Compensation anchors included in reservation validity. -/
theorem reserved_patch_compensation_waits (before : RuntimeState)
    (patch : InternalCommutation.InternalOccurrencePatch) :
    (patch.apply before).compensationHandlerEffectWaits = before.compensationHandlerEffectWaits := by
  cases patch with
  | token token => rfl
  | arm arm =>
      cases write : arm.write <;>
        simp only [InternalCommutation.InternalOccurrencePatch.apply, InternalCommutation.applyInternalArmingPatch, write]

/-- Actual revalidated body steps preserve reservation validity when the selected family has no Compensation waits. -/
theorem reserved_patch_step_reservation_valid (program : Program) (before after : RuntimeState)
    (patch : InternalCommutation.InternalOccurrencePatch)
    (wellFormed : programWellFormed program = true)
    (step : InternalCommutation.InternalOccurrencePatchStep program before after patch)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid after = true := by
  open InternalCommutation in
    cases patch with
    | token token =>
        rw [step.1, token_patch_reservation_valid]
        exact valid
    | arm arm =>
        have next := InternalOccurrencePatchStep.arm_activation program before after arm step
        rcases step with ⟨rfl, _, positive, prepared⟩
        generalize allocated : arm.write.occurrence.activation = activation at prepared next
        obtain ⟨runtimeId, operation, input, _, _, safe, resolved, _, _, _, declaration,
          _, _, shape, absent, available⟩ := prepareReservedOccurrenceArm_gate_provenance program before
            ⟨arm.operation.id, arm.owner⟩ activation arm prepared
        have member := (resolveInternalOperationOccurrence_declaration program before _ operation resolved).1
        have nonempty := programWellFormed_internalArm_element_nonempty program operation wellFormed member
        rw [declaration] at next
        have fresh : arm.write.occurrence ∉ openWaitAnchors before := by
          simpa [openWaitAnchorAbsent] using absent
        apply applyInternalArmingPatch_reservation_valid before arm valid _ positive
          (by rw [allocated]; exact safe) _ (by simpa only [noCompensation, List.map_nil, List.append_nil] using fresh) available
        all_goals cases operation <;> simp only [ReservedArmWriteShape] at shape <;> try contradiction
        case awaitUserTask =>
          simp only [shape, InternalArmingWrite.elementId]
          simpa only [Bool.not_eq_true'] using nonempty
        case awaitEffect =>
          obtain ⟨arguments, _, write⟩ := shape
          simp only [write, InternalArmingWrite.elementId]
          simpa only [Bool.not_eq_true'] using nonempty
        case awaitUserTask =>
          simp only [shape]
          omega
        case awaitEffect =>
          obtain ⟨arguments, _, write⟩ := shape
          simp only [write]
          omega

/-- A revalidated reserved body step joins the lifetime history through actual execution, independently of publication. -/
theorem ContinuationCommandHistory.extend_reserved_patch_step
    (program : Program) (owner parent : ScopeOccurrenceId) (initial before after : RuntimeState)
    (earlier : List CommittedTransition) (patch : InternalCommutation.InternalOccurrencePatch)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (history : ContinuationCommandHistory program owner initial before earlier)
    (step : InternalCommutation.InternalOccurrencePatchStep program before after patch)
    (validState : InternalCommutation.occurrenceReservationStateValid before = true)
    (frame : ParallelScopeStructuralFrame parent before) (different : owner ≠ parent) :
    ContinuationCommandHistory program owner initial after
      (earlier ++ [.internalOperation {
        operationId := patch.operation.id, operationKind := patch.operation.kind,
        origin := patch.operation.origin, owner := patch.owner, mergeInput := none }]) := by
  cases patch with
  | token token =>
      exact history.extend_token_patch_step program owner parent initial before after earlier token
        profile step frame different
  | arm arm =>
      have applied := arm_patch_step_application program before after arm step validState
      obtain ⟨_, operation, _, _, _, _, resolved, _, _, _, declaration, _, _, _, _, _⟩ :=
        prepareReservedOccurrenceArm_gate_provenance program before
          ⟨arm.operation.id, arm.owner⟩ arm.write.occurrence.activation arm step.2.2.2
      rw [← declaration] at resolved
      have kind : arm.operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
          .duplicate, .synchronize, .reachNoneEnd] := by
        have next := InternalCommutation.InternalOccurrencePatchStep.arm_activation program before after arm step
        cases chosen : arm.operation <;> simp only [chosen] at next <;>
          simp only [SemanticOperation.kind] <;> try contradiction
        all_goals simp
      obtain ⟨selected, selectedEq, _, extended⟩ := history.extend_occurrence_application
        program owner parent initial before after earlier ⟨arm.operation.id, arm.owner⟩ profile applied
        (by
          intro selected selectedEq
          rw [resolved] at selectedEq
          cases Option.some.inj selectedEq
          exact Or.inl kind) frame different
      rw [resolved] at selectedEq
      cases Option.some.inj selectedEq
      exact extended

/-- Reserved patches retain exact declaration metadata for the existing lifetime replay history. -/
def reservedPatchTransition (patch : InternalCommutation.InternalOccurrencePatch) : CommittedTransition :=
  .internalOperation {
    operationId := patch.operation.id, operationKind := patch.operation.kind,
    origin := patch.operation.origin, owner := patch.owner, mergeInput := none }

private theorem reserved_patch_structural_frame (parent : ScopeOccurrenceId) (before : RuntimeState)
    (patch : InternalCommutation.InternalOccurrencePatch) (frame : ParallelScopeStructuralFrame parent before) :
    ParallelScopeStructuralFrame parent (patch.apply before) := by
  obtain ⟨_, scopes, activities, controllers, _, _⟩ := patch.retirement_frame before
  have calls : (patch.apply before).calledProcessOccurrences = before.calledProcessOccurrences := by
    cases patch with
    | token token => rfl
    | arm arm =>
      cases write : arm.write <;>
        simp only [InternalCommutation.InternalOccurrencePatch.apply, InternalCommutation.applyInternalArmingPatch, write]
  exact ParallelScopeStructuralFrame.frame parent before _ frame calls scopes activities controllers

private theorem ordered_reserved_prefix_history (program : Program) (owner parent : ScopeOccurrenceId)
    (initial before : RuntimeState) (earlier : List CommittedTransition)
    (members : List InternalCommutation.InternalOccurrencePatch) (successors : List RuntimeState)
    (length : successors.length = members.length)
    (steps : ∀ pair ∈ members.zip ((before :: successors).zip successors),
      InternalCommutation.InternalOccurrencePatchStep program pair.2.1 pair.2.2 pair.1)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (history : ContinuationCommandHistory program owner initial before earlier)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = [])
    (frame : ParallelScopeStructuralFrame parent before) (different : owner ≠ parent) :
    ∀ n current, (before :: successors)[n]? = some current →
      InternalCommutation.occurrenceReservationStateValid current = true ∧
      current.compensationHandlerEffectWaits = [] ∧ ParallelScopeStructuralFrame parent current ∧
      ContinuationCommandHistory program owner initial current
        (earlier ++ (members.take n).map reservedPatchTransition) := by
  induction members generalizing before earlier successors with
  | nil =>
    cases successors with
    | cons next tail => simp at length
    | nil =>
      intro n current selected
      cases n with
      | zero => simp at selected; subst current; simpa using ⟨valid, noCompensation, frame, history⟩
      | succ n => simp at selected
  | cons patch rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      have tailLength : tail.length = rest.length := by simpa using length
      have first : InternalCommutation.InternalOccurrencePatchStep program before next patch :=
        steps (patch, before, next) (by simp)
      have nextValid := reserved_patch_step_reservation_valid program before next patch wellFormed first valid noCompensation
      have nextNoCompensation : next.compensationHandlerEffectWaits = [] := by
        rw [first.1, reserved_patch_compensation_waits]; exact noCompensation
      have nextFrame : ParallelScopeStructuralFrame parent next := by
        rw [first.1]; exact reserved_patch_structural_frame parent before patch frame
      have nextHistory := history.extend_reserved_patch_step program owner parent initial before next earlier patch
        profile first valid frame different
      have later : ∀ pair ∈ rest.zip ((next :: tail).zip tail),
          InternalCommutation.InternalOccurrencePatchStep program pair.2.1 pair.2.2 pair.1 := by
        intro pair member
        exact steps pair (by simp only [List.zip_cons_cons, List.mem_cons]; exact Or.inr member)
      intro n current selected
      cases n with
      | zero => simp at selected; subst current; simpa using ⟨valid, noCompensation, frame, history⟩
      | succ n =>
        have tailSelected : (next :: tail)[n]? = some current := by simpa using selected
        have retained := ih next (earlier ++ [reservedPatchTransition patch]) tail tailLength later nextHistory
          nextValid nextNoCompensation nextFrame n current tailSelected
        simpa only [List.take_succ_cons, List.map_cons, List.append_assoc, List.cons_append, List.nil_append] using retained

/-- Every actual reserved-batch prefix retains reservation validity and extends the same lifetime history, independently of publication. -/
theorem ContinuationCommandHistory.extend_reserved_batch (program : Program)
    (owner parent : ScopeOccurrenceId) (initial before : RuntimeState) (earlier : List CommittedTransition)
    (batch : InternalCommutation.InternalOccurrenceBatch) (successors : List RuntimeState)
    (applied : InternalCommutation.applyInternalOccurrenceBatch? program before batch = some successors)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (history : ContinuationCommandHistory program owner initial before earlier)
    (noCompensation : before.compensationHandlerEffectWaits = [])
    (frame : ParallelScopeStructuralFrame parent before) (different : owner ≠ parent) :
    (∀ n current, (before :: successors)[n]? = some current →
      InternalCommutation.occurrenceReservationStateValid current = true ∧
      current.compensationHandlerEffectWaits = [] ∧ ParallelScopeStructuralFrame parent current ∧
      ContinuationCommandHistory program owner initial current
        (earlier ++ (batch.members.take n).map reservedPatchTransition)) ∧
    ContinuationCommandHistory program owner initial (successors.getLast?.getD before)
      (earlier ++ batch.members.map reservedPatchTransition) := by
  have valid : InternalCommutation.occurrenceReservationStateValid before = true := by
    cases checked : InternalCommutation.occurrenceReservationStateValid before with
    | true => rfl
    | false =>
      simp [InternalCommutation.applyInternalOccurrenceBatch?,
        InternalCommutation.prepareInternalOccurrenceBatch?, checked] at applied
  obtain ⟨length, steps⟩ := InternalCommutation.applyInternalOccurrenceBatch_ordered_steps program before batch successors applied
  have prefixes := ordered_reserved_prefix_history program owner parent initial before earlier batch.members successors
    length steps wellFormed profile history valid noCompensation frame different
  refine ⟨prefixes, ?_⟩
  have endpoint : (before :: successors)[batch.members.length]? = some (successors.getLast?.getD before) := by
    rw [← length]
    have last := (List.getLast?_eq_getElem? (l := before :: successors)).symm.trans (List.getLast?_cons (a := before))
    simpa only [List.length_cons, Nat.add_sub_cancel] using last
  simpa only [List.take_length] using (prefixes batch.members.length _ endpoint).2.2.2

/-- Actual cancellation restricts every retained issuance family and never changes its counters. -/
theorem cancelScopeSubtree_reservation_valid (before : RuntimeState) (target : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid (cancelScopeSubtree before target disposition) = true ∧
      (cancelScopeSubtree before target disposition).compensationHandlerEffectWaits = [] := by
  constructor
  · apply InternalCommutation.occurrenceReservationStateValid_restrict before (cancelScopeSubtree before target disposition) valid rfl rfl
    all_goals exact List.filter_sublist
  · simp only [cancelScopeSubtree, noCompensation, List.filter_nil]

private theorem cancellation_fold_reservation (iterations : List ParallelScopeIteration) (before : RuntimeState)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid
      (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) before) = true ∧
    (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) before).compensationHandlerEffectWaits = [] := by
  induction iterations generalizing before with
  | nil => exact ⟨valid, noCompensation⟩
  | cons iteration rest ih =>
    obtain ⟨valid, absent⟩ := cancelScopeSubtree_reservation_valid before iteration.scope .remove valid noCompensation
    exact ih _ valid absent

private theorem reservation_data_frame (before : RuntimeState) (variables : ScopedVariables)
    (activities : variables.activities = before.variables.activities)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid { before with variables } = true ∧
      ({ before with variables } : RuntimeState).compensationHandlerEffectWaits = [] := by
  refine ⟨InternalCommutation.occurrenceReservationStateValid_restrict before _ valid rfl rfl
    (List.Sublist.refl _) (List.Sublist.refl _) (List.Sublist.refl _) (List.Sublist.refl _)
    (List.Sublist.refl _) (List.Sublist.refl _) ?_, noCompensation⟩
  rw [activities]
  exact List.Sublist.refl _

/-- Actual initiation changes only pending control and root tokens, leaving issuance reservations intact. -/
theorem initiateState_reservation_valid (before after : RuntimeState) (output : ControlPlaceId)
    (initiated : initiateState? before output = some after)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid after = true ∧ after.compensationHandlerEffectWaits = [] := by
  unfold initiateState? at initiated
  obtain ⟨owner, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
  split at initiated <;> try contradiction
  cases Option.some.inj initiated
  exact ⟨valid, noCompensation⟩

/-- Actual remaining, natural and early parallel retirement preserve issuance reservations while restricting all cancelled families. -/
theorem completeParallelScope_reservation_valid (entry : ParallelScopeEntry) (before after : RuntimeState)
    (target : ScopeOccurrenceId) (completed : completeParallelScope? entry before target = some after)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid after = true ∧ after.compensationHandlerEffectWaits = [] := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨result, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  have activities : variables.activities = before.variables.activities := by
    unfold removeScopeVariables? at removed
    obtain ⟨scope, _, removed⟩ := Option.bind_eq_some_iff.mp removed
    cases Option.some.inj removed
    rfl
  have disposed := reservation_data_frame before variables activities valid noCompensation
  let detached : RuntimeState := { before with
    variables := variables,
    activityOccurrences := before.activityOccurrences.filter (· != binding.activity),
    parallelScopeControllers := before.parallelScopeControllers.filter (· != binding.controller) }
  cases result with
  | remaining successor selected first rest =>
    cases Option.some.inj completed
    exact cancelScopeSubtree_reservation_valid _ target .remove disposed.1 disposed.2
  | naturalCompletion successor selected =>
    cases Option.some.inj completed
    have cancelled := cancelScopeSubtree_reservation_valid detached target .remove disposed.1 disposed.2
    exact ⟨(InternalCommutation.occurrenceReservationStateValid_tokens _ _).trans cancelled.1, cancelled.2⟩
  | earlyCompletion successor selected first rest =>
    cases Option.some.inj completed
    have cancelled := cancelScopeSubtree_reservation_valid detached target .remove disposed.1 disposed.2
    have folded := cancellation_fold_reservation (first :: rest) _ cancelled.1 cancelled.2
    exact ⟨(InternalCommutation.occurrenceReservationStateValid_tokens _ _).trans folded.1, folded.2⟩


private theorem initialized_activity_frame (before after : ScopedVariables) (owner : ScopeOccurrenceId)
    (inputs : List VariableMapping) (initialized : initializeScopeVariables? before owner inputs = some after) :
    after.activities = before.activities := by
  unfold initializeScopeVariables? at initialized
  split at initialized <;> try contradiction
  obtain ⟨bindings, _, initialized⟩ := Option.bind_eq_some_iff.mp initialized
  split at initialized <;> try contradiction
  cases Option.some.inj initialized
  rfl

private theorem issued_reservation_valid (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (items : List String) (index : Nat) (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations))
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid after = true ∧ after.compensationHandlerEffectWaits = [] := by
  induction items generalizing index before after iterations with
  | nil => cases Option.some.inj issued; exact ⟨valid, noCompensation⟩
  | cons item items ih =>
    simp only [issueParallelBodies?] at issued
    obtain ⟨variables, initialized, issued⟩ := Option.bind_eq_some_iff.mp issued
    obtain ⟨result, recursed, issued⟩ := Option.bind_eq_some_iff.mp issued
    cases Option.some.inj issued
    have retained := reservation_data_frame before variables
      (initialized_activity_frame _ _ _ _ initialized) valid noCompensation
    exact ih _ _ _ _ recursed retained.1 retained.2

/-- Actual entry creates only scope-local data and scope tokens, leaving all wait reservations intact. -/
theorem enterParallelScope_reservation_valid (entry : ParallelScopeEntry) (before after : RuntimeState)
    (parent : ScopeOccurrenceId) (entered : enterParallelScope? entry before parent = some after)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid after = true ∧ after.compensationHandlerEffectWaits = [] := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    exact ⟨(InternalCommutation.occurrenceReservationStateValid_tokens _ _).trans valid, noCompensation⟩
  · obtain ⟨result, issued, entered⟩ := Option.bind_eq_some_iff.mp entered
    split at entered <;> try contradiction
    cases Option.some.inj entered
    have retained := issued_reservation_valid entry parent _ _
      { before with tokens := removeToken before.tokens entry.input parent } _ _ issued
      ((InternalCommutation.occurrenceReservationStateValid_tokens _ _).trans valid) noCompensation
    exact retained


/-- Retaining the submitted command lets preservation consumers use its admission evidence. -/
theorem admitStimulus_wait_preserves_input (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus)
    (predicate : RuntimeState → Prop) (initial : predicate before)
    (human : ∀ commandId id values after, stimulus = .completeUserTaskInstance commandId id values →
      ParallelScopeCommand.completeTask? program before id values = some after → predicate after)
    (effect : ∀ commandId id values after, stimulus = .completeEffect commandId id (.success values) →
      ParallelScopeCommand.completeEffect? program before id (.success values) = some after → predicate after) :
    predicate (admitStimulus program before stimulus).state := by
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first
      | exact initial
      | (apply human commandId id values _ rfl <;> assumption)
      | split
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    all_goals
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first
      | exact initial
      | (apply effect commandId id _ _ rfl <;> assumption)
      | split

/-- PMIS wait-command dispatch preserves any predicate retained by its actual completion routes and unchanged refusals. -/
theorem admitStimulus_wait_preserves (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus)
    (predicate : RuntimeState → Prop) (initial : predicate before)
    (human : ∀ id values after, ParallelScopeCommand.completeTask? program before id values = some after → predicate after)
    (effect : ∀ id values after, ParallelScopeCommand.completeEffect? program before id (.success values) = some after → predicate after) :
    predicate (admitStimulus program before stimulus).state :=
  admitStimulus_wait_preserves_input program before stimulus selected completion predicate initial
    (fun _ id values after _ => human id values after)
    (fun _ id values after _ => effect id values after)


/-- PMIS wait-command admission preserves reservations even when an ingress guard rejects unchanged. -/
theorem admitStimulus_wait_reservation_valid (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid (admitStimulus program before stimulus).state = true ∧
      (admitStimulus program before stimulus).state.compensationHandlerEffectWaits = [] := by
  apply admitStimulus_wait_preserves program before stimulus selected completion
    (fun state => InternalCommutation.occurrenceReservationStateValid state = true ∧ state.compensationHandlerEffectWaits = [])
    ⟨valid, noCompensation⟩
  · intro id values after completed
    exact ParallelScopeCommand.completeTask_reservation_valid program before after id values completed valid noCompensation
  · intro id values after completed
    exact ParallelScopeCommand.completeEffect_success_reservation_valid program before after id values completed valid noCompensation


private theorem completeScopeState_reservation_valid (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (completed : completeScopeState? before scopeId parentOutput = some after)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid after = true ∧ after.compensationHandlerEffectWaits = [] := by
  unfold completeScopeState? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  unfold completeQuiescentScope? at completed
  split at completed <;> try contradiction
  all_goals split at completed <;> try contradiction
  all_goals
    cases Option.some.inj completed
    exact ⟨valid, noCompensation⟩

/-- Admitted PMIS final-scope execution uses shared completion without monitored or bounded deadline wrappers. -/
theorem completeSelectedScope_reservation_valid (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (before after : RuntimeState) (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (completed : completeSelectedScope? program before scopeId parentOutput = some after)
    (valid : InternalCommutation.occurrenceReservationStateValid before = true)
    (noCompensation : before.compensationHandlerEffectWaits = []) :
    InternalCommutation.occurrenceReservationStateValid after = true ∧ after.compensationHandlerEffectWaits = [] := by
  obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted scopeId
  rw [completeSelectedScope?, unmonitored,
    completeBoundedScope_eq_completeScope_of_unbounded program before scopeId parentOutput unbounded] at completed
  exact completeScopeState_reservation_valid before after scopeId parentOutput completed valid noCompensation


/-- Actual body arming and token execution cannot create Compensation waits; the shared body-effect classification settles both cases. -/
theorem applyInternalOperationOccurrence_body_compensation_frame (program : Program)
    (before after : RuntimeState) (candidate : InternalCommutation.InternalOperationOccurrence)
    (operation : SemanticOperation)
    (resolved : InternalCommutation.resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : InternalCommutation.applyInternalOperationOccurrence? program before candidate = some after) :
    after.compensationHandlerEffectWaits = before.compensationHandlerEffectWaits := by
  rcases InternalCommutation.applyInternalOperationOccurrence_body_effect program before after candidate operation
    resolved bodyOperation applied with ⟨patch, _, _, updated⟩ | ⟨patch, increment, _, updated⟩
  · rw [updated]
    cases write : patch.write <;> simp only [InternalCommutation.applyInternalArmingPatch, write] <;> rfl
  · rw [updated]


private theorem issued_compensation_frame (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (items : List String) (index : Nat) (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations)) :
    after.compensationHandlerEffectWaits = before.compensationHandlerEffectWaits := by
  induction items generalizing index before after iterations with
  | nil => cases Option.some.inj issued; rfl
  | cons item items ih =>
    simp only [issueParallelBodies?] at issued
    obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
    obtain ⟨result, recursed, issued⟩ := Option.bind_eq_some_iff.mp issued
    cases Option.some.inj issued
    have retained := ih _ _ _ _ recursed
    exact retained

private theorem entry_compensation_frame (entry : ParallelScopeEntry) (before after : RuntimeState)
    (parent : ScopeOccurrenceId) (entered : enterParallelScope? entry before parent = some after) :
    after.compensationHandlerEffectWaits = before.compensationHandlerEffectWaits := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered; rfl
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at entered
    | cons first rest =>
      cases Option.some.inj entered
      have retained := issued_compensation_frame _ _ _ _ _ _ _ generated
      exact retained

private theorem cancel_compensation_absent (before : RuntimeState) (target : ScopeOccurrenceId)
    (absent : before.compensationHandlerEffectWaits = []) :
    (cancelScopeSubtree before target .remove).compensationHandlerEffectWaits = [] := by
  simp only [cancelScopeSubtree, absent, List.filter_nil]

private theorem cancel_fold_compensation_absent (iterations : List ParallelScopeIteration) (before : RuntimeState)
    (absent : before.compensationHandlerEffectWaits = []) :
    (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) before).compensationHandlerEffectWaits = [] := by
  induction iterations generalizing before with
  | nil => exact absent
  | cons iteration rest ih => exact ih _ (cancel_compensation_absent before iteration.scope absent)

private theorem retirement_compensation_absent (entry : ParallelScopeEntry) (before after : RuntimeState)
    (target : ScopeOccurrenceId) (completed : completeParallelScope? entry before target = some after)
    (absent : before.compensationHandlerEffectWaits = []) : after.compensationHandlerEffectWaits = [] := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨result, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases result with
  | remaining successor selected first rest =>
    cases Option.some.inj completed
    exact cancel_compensation_absent _ target absent
  | naturalCompletion successor selected =>
    cases Option.some.inj completed
    exact cancel_compensation_absent _ target absent
  | earlyCompletion successor selected first rest =>
    cases Option.some.inj completed
    exact cancel_fold_compensation_absent (first :: rest) _ (cancel_compensation_absent _ target absent)

private theorem scope_completion_compensation_frame (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId)
    (completed : completeScopeState? before scopeId output = some after) :
    after.compensationHandlerEffectWaits = before.compensationHandlerEffectWaits := by
  unfold completeScopeState? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  unfold completeQuiescentScope? at completed
  split at completed <;> try contradiction
  all_goals split at completed <;> try contradiction
  all_goals cases Option.some.inj completed; rfl

/-- Admitted exact-owner internal execution preserves Compensation-wait absence independently of reservation validity. -/
theorem applyInternalOperationOccurrence_compensation_absent (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (before after : RuntimeState) (candidate : InternalCommutation.InternalOperationOccurrence)
    (applied : InternalCommutation.applyInternalOperationOccurrence? program before candidate = some after)
    (absent : before.compensationHandlerEffectWaits = []) : after.compensationHandlerEffectWaits = [] := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at admitted
    | true => simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using chosen
  have merge (operation : SemanticOperation) : isMergeTargetOperation program operation = false :=
    isMergeTargetOperation_eq_false_of_profile program operation (by rw [profile]; decide +kernel)
  obtain ⟨operation, resolved, identity, replayed⟩ := applyInternalOperationOccurrence_replay_record
    program before after candidate profile applied
  let record : InternalTransitionRecord := {
    operationId := candidate.operationId, operationKind := operation.kind,
    origin := operation.origin, owner := candidate.owner, mergeInput := none }
  have replay : InternalCommutation.replayInternalOperationOccurrence? program before record = some after := replayed
  by_cases body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]
  · exact (applyInternalOperationOccurrence_body_compensation_frame program before after candidate operation resolved body applied).trans absent
  · cases operation <;> simp [SemanticOperation.kind] at body
    case initiate =>
      obtain ⟨output, root, _, _, _, _, initiated⟩ := replayed_initiation_execution program before after record rfl replay
      unfold initiateState? at initiated
      obtain ⟨owner, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
      split at initiated <;> try contradiction
      cases Option.some.inj initiated
      exact absent
    case enterParallelMultiInstanceScope =>
      have entered := replayed_parallel_entry_execution program analysis admitted before after record rfl replay
      exact (entry_compensation_frame _ _ _ _ entered).trans absent
    case completeParallelMultiInstanceScope =>
      obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record rfl replay
      exact retirement_compensation_absent entry before after candidate.owner completed absent
    case completeScope =>
      obtain ⟨scopeId, output, root, _, _, _, completed⟩ := replayed_scope_completion_execution program before after record rfl replay (ParallelScopeStart.analyzed_not_nested program analysis admitted)
          (ParallelScopeStart.analyzed_not_embedded_completion program analysis admitted)
      obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted scopeId
      rw [completeSelectedScope?, unmonitored, completeBoundedScope_eq_completeScope_of_unbounded program before scopeId output unbounded] at completed
      exact (scope_completion_compensation_frame before after scopeId output completed).trans absent
    all_goals cases control : before.control <;>
      simp only [InternalCommutation.applyInternalOperationOccurrence?, control, resolved, bind, Option.bind_some,
        merge, Bool.false_eq_true, Bool.false_and, ↓reduceIte] at applied <;> contradiction

/-- PMIS wait admission either uses its checked predecessor reservations or refuses without changing Compensation waits. -/
theorem admitStimulus_wait_compensation_absent (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus)
    (absent : before.compensationHandlerEffectWaits = []) :
    (admitStimulus program before stimulus).state.compensationHandlerEffectWaits = [] := by
  by_cases valid : InternalCommutation.occurrenceReservationStateValid before = true
  · exact (admitStimulus_wait_reservation_valid program before stimulus selected completion valid absent).2
  · have refused : ParallelScopeCommand.stimulusAdmitted program before stimulus = false := by
      simp [ParallelScopeCommand.stimulusAdmitted, selected, valid]
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      simp [admitStimulus, snapshot, refused, absent]

end ParallelScopeReplay

end BpmnSemantics.SemanticProcess
