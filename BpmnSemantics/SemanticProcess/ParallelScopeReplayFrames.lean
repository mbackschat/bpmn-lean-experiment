import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.ParallelScopeCommandReplay
import BpmnSemantics.SemanticProcess.ParallelScopeReservedArmingReplay

/-! # Structural frames of actual parallel command replay

PMIS-END-01 uses actual replay provenance and the shared root frame independently
of pre-entry reachability and graph-progress proof consumers.
-/

namespace BpmnSemantics.SemanticProcess.ParallelScopeReplay

open BpmnSemantics

theorem resolved_operation_unique (program : Program) (state : RuntimeState)
    (candidate : InternalCommutation.InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : InternalCommutation.resolveInternalOperationOccurrence? program state candidate = some operation) :
    program.operations.filter (·.id == candidate.operationId) = [operation] := by
  unfold InternalCommutation.resolveInternalOperationOccurrence? at resolved
  obtain ⟨candidates, discovered, lookup⟩ := Option.bind_eq_some_iff.mp resolved
  unfold InternalCommutation.internalOperationOccurrences? at discovered
  split at discovered <;> try contradiction
  rename_i selected selectedEq
  split at lookup <;> try contradiction
  rw [← List.head?_filter, selectedEq] at lookup
  cases Option.some.inj lookup
  exact selectedEq

theorem replayed_retirement_execution (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord) (retirement : record.operationKind = .completeParallelMultiInstanceScope)
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after) :
    ∃ entry, entry ∈ program.operations.filterMap parallelScopeEntry? ∧
      completeParallelScope? entry before record.owner = some after := by
  obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
    InternalCommutation.replayInternalOperationOccurrence_sound program before after record replayed
  have key := (InternalCommutation.resolveInternalOperationOccurrence_declaration program before
    ⟨record.operationId, record.owner⟩ operation resolved).2
  have unique := resolved_operation_unique program before ⟨record.operationId, record.owner⟩ operation resolved
  rw [retirement] at metadata
  cases operation <;> simp only [SemanticOperation.kind] at metadata <;> try contradiction
  cases control : before.control <;> simp only [InternalCommutation.applyInternalOperationOccurrence?, control,
    resolved, bind, Option.bind_some] at applied <;> try contradiction
  simp only [key] at applied
  unfold applyParallelScopeOperation? at applied
  simp only [unique, bind, Option.bind_some] at applied
  split at applied <;> try contradiction
  rename_i entries entryOperation entrySelected
  obtain ⟨entry, entryDecoded, applied⟩ := Option.bind_eq_some_iff.mp applied
  split at applied <;> try contradiction
  split at applied <;> try contradiction
  split at applied <;> try contradiction
  split at applied <;> try contradiction
  split at applied <;> try contradiction
  split at applied <;> try contradiction
  split at applied <;> try contradiction
  refine ⟨entry, List.mem_filterMap.mpr ⟨entryOperation, ?_, entryDecoded⟩, applied⟩
  exact (List.mem_filter.mp (entrySelected.symm ▸ (show entryOperation ∈ [entryOperation] from by simp))).1

theorem replayed_structural_frame (program : Program) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (record : InternalTransitionRecord)
    (frame : ParallelScopeStructuralFrame parent before)
    (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after) :
    ParallelScopeStructuralFrame parent after := by
  rcases kind with body | retirement
  · obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
      InternalCommutation.replayInternalOperationOccurrence_sound program before after record replayed
    exact InternalCommutation.applyInternalOperationOccurrence_body_structural_parallel_frame program parent before after
      ⟨record.operationId, record.owner⟩ operation frame resolved (by rw [metadata]; exact body) applied
  · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    have bindingReady := completed
    unfold completeParallelScope? at bindingReady
    obtain ⟨binding, bound, _⟩ := Option.bind_eq_some_iff.mp bindingReady
    exact completeParallelScope_structural_parallel_frame entry parent record.owner before after binding frame bound completed

theorem admission_structural_frame (program : Program) (parent : ScopeOccurrenceId)
    (before : RuntimeState) (stimulus : Stimulus) (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus) (frame : ParallelScopeStructuralFrame parent before) :
    ParallelScopeStructuralFrame parent (admitStimulus program before stimulus).state := by
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first
      | exact frame
      | (solve | apply ParallelScopeCommand.completeTask_structural_parallel_frame <;> assumption)
      | split
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    all_goals
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first
      | exact frame
      | (solve | apply ParallelScopeCommand.completeEffect_structural_parallel_frame <;> assumption)
      | split

private theorem ordered_structural_frame (program : Program) (parent : ScopeOccurrenceId)
    (initial final : RuntimeState) (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length) (last : (initial :: successors).getLast? = some final)
    (aligned : ∀ pair ∈ records.zip ((initial :: successors).zip successors),
      ∃ record, pair.1 = .internalOperation record ∧
        InternalCommutation.replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record)
    (frame : ParallelScopeStructuralFrame parent initial) : ParallelScopeStructuralFrame parent final := by
  induction records generalizing initial successors with
  | nil =>
    have empty : successors = [] := by simpa using length
    subst successors
    have same : initial = final := by simpa using last
    simpa [← same] using frame
  | cons head rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      obtain ⟨record, same, actual⟩ := aligned (head, initial, next) (by simp)
      change head = .internalOperation record at same
      have nextFrame := replayed_structural_frame program parent initial next record frame
        (same ▸ kinds head (by simp)) actual
      exact ih next tail (by simpa using length) (by simpa using last)
        (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
        (fun record member => kinds record (by simp [member])) nextFrame

/-- The actual lifetime history retains the parentless live root through both command and internal-step constructors. -/
theorem ContinuationCommandHistory.structural_frame (program : Program) (owner parent : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (frame : ParallelScopeStructuralFrame parent initial) : ParallelScopeStructuralFrame parent final := by
  induction history with
  | initial => exact frame
  | @internalStep before after earlier record history replayed kind outside ih =>
    exact replayed_structural_frame program parent before after record ih kind replayed
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    obtain ⟨actualStimulus, actualRest, admitted, successors, shape, _, stateEq, length, last, aligned⟩ :=
      committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
    cases shape
    have admittedFrame := admission_structural_frame program parent before stimulus selected completion ih
    rw [stateEq] at admittedFrame
    exact ordered_structural_frame program parent admitted after rest successors length last aligned kinds admittedFrame

/-- Ordered actual replay evidence extends the existing history without assuming retirement-parent provenance. -/
theorem ContinuationCommandHistory.extend_ordered_replay
    (program : Program) (owner parent : ScopeOccurrenceId)
    (initial before after : RuntimeState) (earlier records : List CommittedTransition)
    (successors : List RuntimeState)
    (history : ContinuationCommandHistory program owner initial before earlier)
    (length : successors.length = records.length) (last : (before :: successors).getLast? = some after)
    (aligned : ∀ pair ∈ records.zip ((before :: successors).zip successors),
      ∃ record, pair.1 = .internalOperation record ∧
        InternalCommutation.replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record)
    (frame : ParallelScopeStructuralFrame parent before) (different : owner ≠ parent) :
    ContinuationCommandHistory program owner initial after (earlier ++ records) := by
  induction records generalizing before earlier successors with
  | nil =>
    have empty : successors = [] := by simpa using length
    subst successors
    have same : before = after := by simpa using last
    simpa [← same] using history
  | cons head rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      obtain ⟨record, identity, actual⟩ := aligned (head, before, next) (by simp)
      change head = .internalOperation record at identity
      have kind := identity ▸ kinds head (by simp)
      have outside : record.operationKind = .completeParallelMultiInstanceScope →
          ∀ entry binding, parallelScopeBinding? entry before record.owner = some binding → owner ≠ binding.activity.owner := by
        intro _ entry binding bound
        have parentEq := (frame.bound_outer entry parent record.owner before binding bound).2.2
        exact fun equal => different (equal.trans parentEq)
      have nextHistory := ContinuationCommandHistory.internalStep history actual kind outside
      have nextFrame := replayed_structural_frame program parent before next record frame kind actual
      have result := ih next (earlier ++ [.internalOperation record]) tail nextHistory
        (by simpa using length) (by simpa using last)
        (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
        (fun record member => kinds record (by simp [member])) nextFrame
      simpa [List.append_assoc, identity] using result

/-- An actual replay segment can start the existing lifetime history at its predecessor state. -/
theorem ContinuationCommandHistory.of_ordered_replay
    (program : Program) (owner parent : ScopeOccurrenceId)
    (before after : RuntimeState) (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length) (last : (before :: successors).getLast? = some after)
    (aligned : ∀ pair ∈ records.zip ((before :: successors).zip successors),
      ∃ record, pair.1 = .internalOperation record ∧
        InternalCommutation.replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record)
    (frame : ParallelScopeStructuralFrame parent before) (different : owner ≠ parent) :
    ContinuationCommandHistory program owner before after records := by
  simpa using (ContinuationCommandHistory.initial (program := program) (owner := owner) before).extend_ordered_replay
    program owner parent before before after [] records successors length last aligned kinds frame different

/-- Successful actual wait-command replay derives every retirement predecessor frame from the initial root frame. -/
theorem ContinuationCommandHistory.extend_wait_command
    (program : Program) (owner parent : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial before after : RuntimeState) (earlier rest : List CommittedTransition) (stimulus : Stimulus)
    (history : ContinuationCommandHistory program owner initial before earlier)
    (replayed : committedTransitions? program before (.externalStimulus stimulus :: rest) = some after)
    (completion : waitCompletionStimulus stimulus)
    (kinds : ∀ transition ∈ rest, bodyOrRetirementTransition transition)
    (frame : ParallelScopeStructuralFrame parent before) (different : owner ≠ parent) :
    ContinuationCommandHistory program owner initial after (earlier ++ rest) := by
  obtain ⟨actualStimulus, actualRest, admitted, successors, shape, outcome, stateEq, length, last, aligned⟩ :=
    committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
  cases shape
  have snapshots : program.compensationEventSubProcessSnapshots = none := by
    cases checked : program.compensationEventSubProcessSnapshots with
    | none => rfl
    | some value => simp [committedTransitions?, selected, checked] at replayed
  have admittedFrame := admission_structural_frame program parent before stimulus selected completion frame
  apply history.command_of_structural_frames program owner parent initial before after earlier rest stimulus replayed completion kinds different
  intro prior record suffix middle shape prefixReplay retirement
  have prefixCommitted : committedTransitions? program before (.externalStimulus stimulus :: prior) = some middle := by
    simpa [committedTransitions?, selected, snapshots, outcome] using prefixReplay
  obtain ⟨prefixStimulus, prefixRest, prefixState, prefixSuccessors, prefixShape, _, prefixStateEq,
    prefixLength, prefixLast, prefixAligned⟩ := committedTransitions_ordered_steps program selected before middle
      (.externalStimulus stimulus :: prior) prefixCommitted
  cases prefixShape
  have prefixKinds : ∀ transition ∈ prior, bodyOrRetirementTransition transition := by
    intro transition member
    exact kinds transition (by rw [shape]; simp [member])
  rw [prefixStateEq] at admittedFrame
  exact ordered_structural_frame program parent prefixState middle prior prefixSuccessors prefixLength prefixLast prefixAligned prefixKinds admittedFrame

/-- Actual Start replay selects the unique parentless owner and executes the existing initiation call. -/
theorem replayed_initiation_execution (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : record.operationKind = .initiate)
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after) :
    ∃ output root, SemanticOperation.initiate record.operationId record.origin output ∈ program.operations ∧
      before.scopeOccurrences.filter (·.parent.isNone) = [root] ∧ root.id = record.owner ∧
      rootScopeOccurrence? before = some record.owner ∧ initiateState? before output = some after := by
  obtain ⟨operation, resolved, metadata, originEq, _, applied⟩ :=
    InternalCommutation.replayInternalOperationOccurrence_sound program before after record replayed
  obtain ⟨member, key⟩ := InternalCommutation.resolveInternalOperationOccurrence_declaration program before
    ⟨record.operationId, record.owner⟩ operation resolved
  rw [kind] at metadata
  cases operation <;> simp only [SemanticOperation.kind] at metadata <;> try contradiction
  rename_i id origin output
  simp only [SemanticOperation.id] at key
  simp only [SemanticOperation.origin] at originEq
  cases control : before.control <;> simp only [InternalCommutation.applyInternalOperationOccurrence?, control,
    resolved, bind, Option.bind_some] at applied <;> try contradiction
  split at applied <;> try contradiction
  rename_i root roots
  split at applied <;> try contradiction
  rename_i ownerEq
  have owner : root.id = record.owner := by simpa only [beq_iff_eq] using ownerEq
  refine ⟨output, root, ?_, roots, owner, ?_, applied⟩
  · simpa only [key, originEq] using member
  · simp [rootScopeOccurrence?, roots, owner]

/-- Actual scope-completion replay supplies exact selected-scope ownership without claiming final root completion. -/
theorem replayed_scope_completion_execution (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : record.operationKind = .completeScope)
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after)
    (other : nestedScopeDataProgram program = false)
    (definitionAddressed : program.identity.semanticProfile.value ≠
      "cibseven-2.2.0-embedded-subprocess-completion-draft") :
    ∃ scopeId parentOutput selectedScope,
      SemanticOperation.completeScope record.operationId record.origin scopeId parentOutput ∈ program.operations ∧
      before.scopeOccurrences.filter (·.id.definitionScopeId == scopeId) = [selectedScope] ∧
      selectedScope.id = record.owner ∧ completeSelectedScope? program before scopeId parentOutput = some after := by
  obtain ⟨operation, resolved, metadata, originEq, _, applied⟩ :=
    InternalCommutation.replayInternalOperationOccurrence_sound program before after record replayed
  obtain ⟨member, key⟩ := InternalCommutation.resolveInternalOperationOccurrence_declaration program before
    ⟨record.operationId, record.owner⟩ operation resolved
  rw [kind] at metadata
  cases operation <;> simp only [SemanticOperation.kind] at metadata <;> try contradiction
  rename_i id origin scopeId parentOutput
  simp only [SemanticOperation.id] at key
  simp only [SemanticOperation.origin] at originEq
  have merge := isMergeTargetOperation_eq_false_of_profile program (.completeScope id origin scopeId parentOutput)
    definitionAddressed
  cases control : before.control <;> simp only [InternalCommutation.applyInternalOperationOccurrence?, control,
    resolved, bind, Option.bind_some, merge, Bool.false_eq_true, ↓reduceIte] at applied <;> try contradiction
  split at applied <;> try contradiction
  rename_i selectedScope scopes
  split at applied <;> try contradiction
  rename_i ownerEq
  rw [completeDeclaredScope?_other_profile program before scopeId parentOutput other] at applied
  refine ⟨scopeId, parentOutput, selectedScope, ?_, scopes, ?_, applied⟩
  · simpa only [key, originEq] using member
  · simpa only [beq_iff_eq] using ownerEq

/-- Successful admitted entry replay identifies the actual selected declaration and executes its exact owner. -/
theorem replayed_parallel_entry_execution (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (before after : RuntimeState) (record : InternalTransitionRecord)
    (kind : record.operationKind = .enterParallelMultiInstanceScope)
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after) :
    enterParallelScope? analysis.entry before record.owner = some after := by
  obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
    InternalCommutation.replayInternalOperationOccurrence_sound program before after record replayed
  have key := (InternalCommutation.resolveInternalOperationOccurrence_declaration program before
    ⟨record.operationId, record.owner⟩ operation resolved).2
  have unique := resolved_operation_unique program before ⟨record.operationId, record.owner⟩ operation resolved
  rw [kind] at metadata
  cases operation <;> simp only [SemanticOperation.kind] at metadata <;> try contradiction
  case enterParallelMultiInstanceScope id origin input childEntry childScope normalOutput collection item mappings condition ignored =>
    cases control : before.control <;> simp only [InternalCommutation.applyInternalOperationOccurrence?, control,
      resolved, bind, Option.bind_some] at applied <;> try contradiction
    simp only [SemanticOperation.id] at key
    rw [← key] at unique
    change program.operations.filter (fun operation => operation.id == id) =
      [.enterParallelMultiInstanceScope id origin input childEntry childScope normalOutput collection item mappings condition] at unique
    change applyParallelScopeOperation? program id before record.owner = some after at applied
    unfold applyParallelScopeOperation? at applied
    rw [unique] at applied
    simp only [bind, Option.bind_some] at applied
    rw [unique] at applied
    obtain ⟨entry, decoded, applied⟩ := Option.bind_eq_some_iff.mp applied
    have declared := (InternalCommutation.resolveInternalOperationOccurrence_declaration program before
      ⟨record.operationId, record.owner⟩ _ resolved).1
    have parsed : entry ∈ program.operations.filterMap parallelScopeEntry? := List.mem_filterMap.mpr ⟨_, declared, decoded⟩
    obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis admitted
    rw [entries] at parsed
    have identity : entry = analysis.entry := by simpa using parsed
    subst entry
    repeat' (split at applied <;> try contradiction)
    exact applied

private theorem cancellation_pending (state : RuntimeState) (iterations : List ParallelScopeIteration) :
    (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state).initiationPending =
      state.initiationPending := by
  induction iterations generalizing state with
  | nil => rfl
  | cons first rest ih =>
    exact (ih (cancelScopeSubtree state first.scope .remove)).trans (by rfl)

private theorem retirement_pending (entry : ParallelScopeEntry) (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (completed : completeParallelScope? entry before owner = some after) :
    after.initiationPending = before.initiationPending := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases retirement <;> cases Option.some.inj completed
  · rfl
  · rfl
  · exact cancellation_pending _ _

/-- Actual body and retirement replay never reopens the Start phase. -/
theorem replayed_initiation_pending_frame (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord) (kind : bodyOrRetirementTransition (.internalOperation record))
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after) :
    after.initiationPending = before.initiationPending := by
  rcases kind with body | retirement
  · obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
      InternalCommutation.replayInternalOperationOccurrence_sound program before after record replayed
    rcases InternalCommutation.applyInternalOperationOccurrence_body_effect program before after
      ⟨record.operationId, record.owner⟩ operation resolved (by rw [metadata]; exact body) applied with
      ⟨patch, _, _, equal⟩ | ⟨patch, increment, _, equal⟩
    · rw [equal]
      cases write : patch.write <;> simp [InternalCommutation.applyInternalArmingPatch, write]
    · rw [equal]
  · obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record retirement replayed
    exact retirement_pending entry before after record.owner completed

theorem task_pending (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after) :
    after.initiationPending = before.initiationPending := by
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

theorem effect_pending (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (result : EffectExecutionResult)
    (completed : ParallelScopeCommand.completeEffect? program before id result = some after) :
    after.initiationPending = before.initiationPending := by
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeEffect? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    rfl
  · unfold completeSerialEffect? at completed
    split at completed <;> try contradiction
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    rfl

private theorem admission_pending (program : Program) (before : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true) (completion : waitCompletionStimulus stimulus) :
    (admitStimulus program before stimulus).state.initiationPending = before.initiationPending := by
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first | rfl | (solve | apply task_pending <;> assumption) | split
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    all_goals
      cases snapshot : program.compensationEventSubProcessSnapshots <;>
        cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
    all_goals repeat' first | rfl | (solve | apply effect_pending <;> assumption) | split

private theorem ordered_pending (program : Program) (initial final : RuntimeState)
    (records : List CommittedTransition) (successors : List RuntimeState)
    (length : successors.length = records.length) (last : (initial :: successors).getLast? = some final)
    (aligned : ∀ pair ∈ records.zip ((initial :: successors).zip successors),
      ∃ record, pair.1 = .internalOperation record ∧
        InternalCommutation.replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2)
    (kinds : ∀ record ∈ records, bodyOrRetirementTransition record) :
    final.initiationPending = initial.initiationPending := by
  induction records generalizing initial successors with
  | nil =>
    have empty : successors = [] := by simpa using length
    subst successors
    have same : initial = final := by simpa using last
    rw [same]
  | cons head rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      obtain ⟨record, identity, actual⟩ := aligned (head, initial, next) (by simp)
      change head = .internalOperation record at identity
      have nextFlag := replayed_initiation_pending_frame program initial next record (identity ▸ kinds head (by simp)) actual
      exact (ih next tail (by simpa using length) (by simpa using last)
        (fun pair member => aligned pair (by simpa only [List.zip_cons_cons, List.mem_cons] using Or.inr member))
        (fun record member => kinds record (by simp [member]))).trans nextFlag

/-- Existing actual lifetime histories retain the predecessor's Start-phase flag through waits, body work and retirement. -/
theorem ContinuationCommandHistory.initiation_pending_frame (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    final.initiationPending = initial.initiationPending := by
  induction history with
  | initial => rfl
  | @internalStep before after earlier record history replayed kind outside ih =>
    exact (replayed_initiation_pending_frame program before after record kind replayed).trans ih
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    obtain ⟨actualStimulus, actualRest, admitted, successors, shape, _, stateEq, length, last, aligned⟩ :=
      committedTransitions_ordered_steps program selected before after (.externalStimulus stimulus :: rest) replayed
    cases shape
    have flag := ordered_pending program admitted after rest successors length last aligned kinds
    rw [← stateEq] at flag
    exact flag.trans ((admission_pending program before stimulus selected completion).trans ih)

private theorem issued_pending (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (items : List String) (index : Nat) (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations)) :
    after.initiationPending = before.initiationPending := by
  induction items generalizing index before after iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; rfl
  | cons item items ih =>
    unfold issueParallelBodies? at issued
    obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
    obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
    cases Option.some.inj issued
    have preserved := ih _ _ _ _ generated
    exact preserved

/-- Actual parallel entry preserves the Start flag for empty and nonempty collections. -/
theorem enterParallelScope_initiation_pending_frame (entry : ParallelScopeEntry)
    (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (entered : enterParallelScope? entry before parent = some after) :
    after.initiationPending = before.initiationPending := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    rfl
  · obtain ⟨⟨issued, iterations⟩, generated, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
      cases Option.some.inj installed
      have preserved := issued_pending _ _ _ _ _ _ _ generated
      exact preserved

/-- Actual initiation followed by both actual lifetime phases and entry cannot initiate again. -/
theorem ContinuationCommandHistory.no_reinitiation_through_entry
    (program : Program) (owner : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (ready initial before issued final : RuntimeState) (output : ControlPlaceId)
    (initiated : initiateState? ready output = some initial)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (priorRecords suffix : List CommittedTransition)
    (preceding : ContinuationCommandHistory program owner initial before priorRecords)
    (entered : enterParallelScope? entry before parent = some issued)
    (following : ContinuationCommandHistory program owner issued final suffix) :
    final.initiationPending = false ∧ ∀ output, initiateState? final output = none := by
  have initialFlag : initial.initiationPending = false := by
    unfold initiateState? at initiated
    obtain ⟨root, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
    split at initiated <;> try contradiction
    cases Option.some.inj initiated
    rfl
  have finalFlag := (following.initiation_pending_frame program owner selected issued final suffix).trans
    ((enterParallelScope_initiation_pending_frame entry parent before issued entered).trans
      (preceding.initiation_pending_frame program owner selected initial before priorRecords))
  rw [initialFlag] at finalFlag
  refine ⟨finalFlag, ?_⟩
  intro next
  simp [initiateState?, finalFlag]

theorem admitted_completion_unwrapped (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) (scopeId : DefinitionScopeId) :
    isMonitoredScopeDefinition program scopeId = false ∧ boundedScopeDefinitionForChild? program scopeId = none := by
  have monitored : monitoredScopeDefinitions program = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    have allowed := ParallelScopeStart.analyzeProgram_operation_allowed program analysis admitted operation member
    cases operation <;> simp [SequentialScopeProgram.operationAllowed] at allowed ⊢
  have bounded : boundedScopeOperations program = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    have allowed := ParallelScopeStart.analyzeProgram_operation_allowed program analysis admitted operation member
    cases operation <;> simp [SequentialScopeProgram.operationAllowed] at allowed ⊢
  simp [isMonitoredScopeDefinition, monitored, boundedScopeDefinitionForChild?, bounded]

/-- PMIS admission permits only parentless ordinary completion and excludes deadline wrappers. -/
theorem replayed_final_root_completion (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (before after : RuntimeState) (record : InternalTransitionRecord)
    (kind : record.operationKind = .completeScope)
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after) :
    ∃ root instanceId, root.id = record.owner ∧ root.parent = none ∧
      root ∈ before.scopeOccurrences ∧ after.control = .completed instanceId ∧
      ∀ next, InternalCommutation.replayInternalOperationOccurrence? program after next = none := by
  obtain ⟨scopeId, parentOutput, root, member, unique, owner, completed⟩ :=
    replayed_scope_completion_execution program before after record kind replayed (ParallelScopeStart.analyzed_not_nested program analysis admitted)
        (ParallelScopeStart.analyzed_not_embedded_completion program analysis admitted)
  have allowed := ParallelScopeStart.analyzeProgram_operation_allowed program analysis admitted _ member
  have output : parentOutput = none := by
    cases parentOutput <;> simp [SequentialScopeProgram.operationAllowed] at allowed ⊢
  subst parentOutput
  obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted scopeId
  rw [completeSelectedScope?, unmonitored, completeBoundedScope_eq_completeScope_of_unbounded program before scopeId none unbounded] at completed
  have unique' : before.scopeOccurrences.filter (fun candidate => decide (candidate.id.definitionScopeId = scopeId)) = [root] := by
    simpa only [Bool.beq_eq_decide_eq] using unique
  obtain ⟨_, updated⟩ := completeScopeState_selected_update before after scopeId none root unique' completed
  cases parent : root.parent <;> cases control : before.control <;> simp only [parent, control] at updated <;> try contradiction
  split at updated <;> try contradiction
  cases Option.some.inj updated
  refine ⟨root, _, owner, parent, ?_, rfl, ?_⟩
  · have present : root ∈ before.scopeOccurrences.filter (·.id.definitionScopeId == scopeId) := by rw [unique]; simp
    exact (List.mem_filter.mp present).1
  · intro next
    cases result : InternalCommutation.replayInternalOperationOccurrence? program _ next with
    | none => rfl
    | some successor =>
      obtain ⟨_, _, _, _, _, applied⟩ := InternalCommutation.replayInternalOperationOccurrence_sound program _ successor next result
      simp [InternalCommutation.applyInternalOperationOccurrence?] at applied

/-- Actual exact-owner singleton execution supplies replay metadata independently of publication acceptance. -/
theorem applyInternalOperationOccurrence_replay_record (program : Program) (before after : RuntimeState)
    (candidate : InternalCommutation.InternalOperationOccurrence)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (applied : InternalCommutation.applyInternalOperationOccurrence? program before candidate = some after) :
    ∃ operation, InternalCommutation.resolveInternalOperationOccurrence? program before candidate = some operation ∧
      operation.id = candidate.operationId ∧
      InternalCommutation.replayInternalOperationOccurrence? program before
        { operationId := candidate.operationId, operationKind := operation.kind,
          origin := operation.origin, owner := candidate.owner, mergeInput := none } = some after := by
  have executed := applied
  cases control : before.control <;> simp only [InternalCommutation.applyInternalOperationOccurrence?, control,
    bind] at executed <;> try contradiction
  obtain ⟨operation, resolved, _⟩ := Option.bind_eq_some_iff.mp executed
  refine ⟨operation, resolved,
    (InternalCommutation.resolveInternalOperationOccurrence_declaration program before candidate operation resolved).2, ?_⟩
  simpa only [InternalCommutation.replayInternalOperationOccurrence?, resolved, bind, Option.bind_some,
    profile, true_or, and_self, ↓reduceIte] using applied

/-- A result-only body or retirement singleton extends the existing accounting history with derived exact metadata. -/
theorem ContinuationCommandHistory.extend_occurrence_application
    (program : Program) (owner parent : ScopeOccurrenceId) (initial before after : RuntimeState)
    (earlier : List CommittedTransition) (candidate : InternalCommutation.InternalOperationOccurrence)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (history : ContinuationCommandHistory program owner initial before earlier)
    (applied : InternalCommutation.applyInternalOperationOccurrence? program before candidate = some after)
    (phase : ∀ operation, InternalCommutation.resolveInternalOperationOccurrence? program before candidate = some operation →
      operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] ∨
        operation.kind = .completeParallelMultiInstanceScope)
    (frame : ParallelScopeStructuralFrame parent before) (different : owner ≠ parent) :
    ∃ operation, InternalCommutation.resolveInternalOperationOccurrence? program before candidate = some operation ∧
      operation.id = candidate.operationId ∧
      ContinuationCommandHistory program owner initial after
        (earlier ++ [.internalOperation {
          operationId := candidate.operationId, operationKind := operation.kind,
          origin := operation.origin, owner := candidate.owner, mergeInput := none }]) := by
  obtain ⟨operation, resolved, identity, replayed⟩ := applyInternalOperationOccurrence_replay_record
    program before after candidate profile applied
  let record : InternalTransitionRecord := {
    operationId := candidate.operationId, operationKind := operation.kind,
    origin := operation.origin, owner := candidate.owner, mergeInput := none }
  have kind : bodyOrRetirementTransition (.internalOperation record) := by
    simpa only [bodyOrRetirementTransition, bodyTransition, record] using phase operation resolved
  have outside : record.operationKind = .completeParallelMultiInstanceScope →
      ∀ entry binding, parallelScopeBinding? entry before record.owner = some binding → owner ≠ binding.activity.owner := by
    intro _ entry binding bound
    have parentEq := (frame.bound_outer entry parent record.owner before binding bound).2.2
    exact fun same => different (same.trans parentEq)
  exact ⟨operation, resolved, identity, ContinuationCommandHistory.internalStep history replayed kind outside⟩

/-- Actual token preparation refines the singleton dispatcher without publication or replay premises. -/
theorem prepareOccurrenceTokenPatch_application (program : Program) (before : RuntimeState)
    (candidate : InternalCommutation.InternalOperationOccurrence)
    (patch : InternalCommutation.InternalOccurrenceTokenPatch)
    (prepared : InternalCommutation.prepareOccurrenceTokenPatch? program before candidate = some patch) :
    InternalCommutation.applyInternalOperationOccurrence? program before candidate =
      some (InternalCommutation.InternalOccurrencePatch.apply before (.token patch)) ∧
      InternalCommutation.resolveInternalOperationOccurrence? program before candidate = some patch.operation ∧
      patch.operation.kind ∈ [SemanticOperationKind.duplicate, .synchronize, .reachNoneEnd] := by
  open InternalCommutation in
    cases control : before.control <;> simp only [prepareOccurrenceTokenPatch?, control, bind] at prepared <;> try contradiction
    obtain ⟨operation, resolved, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases operation <;> simp only [Option.bind_none] at prepared <;> try contradiction
    all_goals try (split at prepared <;> try contradiction)
    all_goals simp only [Option.bind_some] at prepared
    all_goals
      split at prepared <;> try contradiction
      rename_i valid
      simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at valid
      have units := congrArg Bool.not valid.1.2
      have unique := congrArg Bool.not valid.1.1.1.2
      simp only [Bool.not_not, Bool.not_false, List.all_cons, List.all_nil, Bool.and_true] at units unique
      split at prepared <;> try contradiction
      try simp only [pure, Option.bind_some] at prepared
      obtain ⟨_, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
      cases Option.some.inj prepared
      refine ⟨?_, resolved, by simp [SemanticOperation.kind]⟩
      simp only [applyInternalOperationOccurrence?, control, resolved, bind, Option.bind_some]
      simp_all only [Bool.not_false, Bool.false_or, Bool.or_false, ↓reduceIte,
        InternalOccurrencePatch.apply, TokenPatch.apply, duplicateToken, synchronizeTokens,
        reachNoneEndToken, removeTokens, addTokens, List.foldl_cons, List.foldl_nil,
        List.foldr_cons, List.foldr_nil, List.all_cons, List.all_nil, Bool.and_true, Nat.add_zero]

/-- An actual prepared token step extends the same accounting history through derived exact replay metadata. -/
theorem ContinuationCommandHistory.extend_token_patch_step
    (program : Program) (owner parent : ScopeOccurrenceId) (initial before after : RuntimeState)
    (earlier : List CommittedTransition) (patch : InternalCommutation.InternalOccurrenceTokenPatch)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (history : ContinuationCommandHistory program owner initial before earlier)
    (step : InternalCommutation.InternalOccurrencePatchStep program before after (.token patch))
    (frame : ParallelScopeStructuralFrame parent before) (different : owner ≠ parent) :
    ContinuationCommandHistory program owner initial after
      (earlier ++ [.internalOperation {
        operationId := patch.operation.id, operationKind := patch.operation.kind,
        origin := patch.operation.origin, owner := patch.tokens.owner, mergeInput := none }]) := by
  rcases step with ⟨rfl, prepared⟩
  obtain ⟨applied, selected, kind⟩ := prepareOccurrenceTokenPatch_application program before
    ⟨patch.operation.id, patch.tokens.owner⟩ patch prepared
  obtain ⟨operation, resolved, _, extended⟩ := ContinuationCommandHistory.extend_occurrence_application
    program owner parent initial before _ earlier ⟨patch.operation.id, patch.tokens.owner⟩
    profile history applied (by
      intro operation resolved
      rw [selected] at resolved
      cases Option.some.inj resolved
      apply Or.inl
      simp only [List.mem_cons] at kind ⊢
      exact Or.inr (Or.inr kind)) frame different
  rw [selected] at resolved
  cases Option.some.inj resolved
  exact extended

end BpmnSemantics.SemanticProcess.ParallelScopeReplay
