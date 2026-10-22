import BpmnSemantics.SemanticProcess.ParallelScopeReplayExecution
import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
import BpmnSemantics.SemanticProcess.ParallelScopeContinuationMarking

/-! PMIS-SELECT-01 checks command publication with the same exact-owner executor as closure; operation-only replay retains its existing ProgramStep domain. -/

namespace BpmnSemantics.SemanticProcess.ParallelScopeReplay

private theorem internalTransitions_ordered_steps (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (transitions : List CommittedTransition)
    (success : internalTransitions? program initial transitions = some final) :
    ∃ successors : List RuntimeState,
      successors.length = transitions.length ∧ (initial :: successors).getLast? = some final ∧
      ∀ pair ∈ transitions.zip ((initial :: successors).zip successors),
        ∃ record, pair.1 = .internalOperation record ∧
          InternalCommutation.replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2 := by
  induction transitions generalizing initial with
  | nil =>
      have equal : initial = final := by simpa [internalTransitions?] using success
      subst final
      exact ⟨[], by simp, by simp, by simp⟩
  | cons transition rest ih =>
      cases transition with
      | externalStimulus stimulus => simp [internalTransitions?] at success
      | internalOperation record =>
          simp only [internalTransitions?] at success
          obtain ⟨next, step, success⟩ := Option.bind_eq_some_iff.mp success
          obtain ⟨successors, length, last, aligned⟩ := ih next success
          refine ⟨next :: successors, by simp [length], ?_, ?_⟩
          · simpa using last
          · intro pair member
            simp only [List.zip_cons_cons, List.mem_cons] at member
            rcases member with equal | member
            · subst pair
              exact ⟨record, rfl, by simpa [internalTransition?, selected] using step⟩
            · exact aligned pair member

/-- Selected PMIS replay certifies the actual external admission and every ordered
exact-owner internal successor, with length equality preventing zip truncation. -/
theorem committedTransitions_ordered_steps (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (transitions : List CommittedTransition)
    (success : committedTransitions? program initial transitions = some final) :
    ∃ (stimulus : Stimulus) (rest : List CommittedTransition) (admitted : RuntimeState)
      (successors : List RuntimeState),
      transitions = .externalStimulus stimulus :: rest ∧
      (admitStimulus program initial stimulus).outcome = .committed ∧
      (admitStimulus program initial stimulus).state = admitted ∧
      successors.length = rest.length ∧ (admitted :: successors).getLast? = some final ∧
      ∀ pair ∈ rest.zip ((admitted :: successors).zip successors),
        ∃ record, pair.1 = .internalOperation record ∧
          InternalCommutation.replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2 := by
  unfold committedTransitions? at success
  simp only [selected, Bool.not_true, Bool.false_eq_true, ite_false] at success
  cases snapshot : program.compensationEventSubProcessSnapshots with
  | some value => simp [snapshot] at success
  | none =>
      cases transitions with
      | nil => simp [snapshot] at success
      | cons transition rest =>
          cases transition with
          | internalOperation record => simp [snapshot] at success
          | externalStimulus stimulus =>
              simp only [snapshot] at success
              split at success
              · rename_i committed
                obtain ⟨successors, length, last, aligned⟩ :=
                  internalTransitions_ordered_steps program selected _ final rest success
                exact ⟨stimulus, rest, (admitStimulus program initial stimulus).state,
                  successors, rfl, by simpa using committed, rfl, length, last, aligned⟩
              · contradiction

/-- Actual selected Human admission preserves marking whether it completes a body,
completes an ordinary parent wait, or refuses the command before closure. -/
theorem admitStimulus_parallel_scope_human_continuation_marking
    (program : Program) (before : RuntimeState) (commandId : SemanticId)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (selected : ParallelScopeStart.programSelected program = true)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking (admitStimulus program before
      (.completeUserTaskInstance commandId id values)).state owner place = continuationMarking before owner place := by
  cases snapshot : program.compensationEventSubProcessSnapshots <;>
    cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
  all_goals repeat' first
    | rfl
    | (apply ParallelScopeCommand.completeTask_continuation_marking; assumption)
    | split

/-- Actual selected Service-success admission preserves marking through both wait
routes and every refusal branch, independently of the submitted data patch. -/
theorem admitStimulus_parallel_scope_effect_continuation_marking
    (program : Program) (before : RuntimeState) (commandId : SemanticId)
    (id : EffectOccurrenceId) (values : List VariableBinding)
    (selected : ParallelScopeStart.programSelected program = true)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking (admitStimulus program before
      (.completeEffect commandId id (.success values))).state owner place = continuationMarking before owner place := by
  cases snapshot : program.compensationEventSubProcessSnapshots <;>
    cases control : before.control <;> simp [admitStimulus, snapshot, selected, control]
  all_goals repeat' first
    | rfl
    | (apply ParallelScopeCommand.completeEffect_continuation_marking; assumption)
    | split

/-- Published accounting resolves declared ports by the recorded operation and exact owner. -/
def transitionPortCharge (program : Program) (ports : SemanticOperation → List ControlPlaceId)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) : CommittedTransition → Nat
  | .externalStimulus _ => 0
  | .internalOperation record =>
      match program.operations.find? (·.id == record.operationId) with
      | none => 0
      | some operation => ownedPortCount (ports operation) record.owner owner place

def bodyTransition : CommittedTransition → Prop
  | .externalStimulus _ => False
  | .internalOperation record => record.operationKind ∈ [SemanticOperationKind.awaitUserTask,
      .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]

def waitCompletionStimulus : Stimulus → Prop
  | .completeUserTaskInstance .. | .completeEffect _ _ (.success _) => True
  | _ => False

private theorem resolved_scope_binding (program : Program) (state : RuntimeState)
    (candidate : InternalCommutation.InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : InternalCommutation.resolveInternalOperationOccurrence? program state candidate = some operation) :
    program.operationScopes.any (fun binding => binding.operationId == candidate.operationId &&
      binding.scopeId == candidate.owner.definitionScopeId) = true := by
  obtain ⟨candidates, discovered, member⟩ :=
    InternalCommutation.resolveInternalOperationOccurrence_requires_exact_candidate program state candidate operation resolved
  unfold InternalCommutation.internalOperationOccurrences? at discovered
  split at discovered <;> try contradiction
  split at discovered <;> try contradiction
  rename_i binding selected
  dsimp only at discovered
  split at discovered <;> try contradiction
  cases Option.some.inj discovered
  obtain ⟨owner, present, equal⟩ := List.mem_map.mp member
  have ownerEq : owner = candidate.owner := congrArg InternalCommutation.InternalOperationOccurrence.owner equal
  have scopeEq : owner.definitionScopeId = binding.scopeId := by
    exact beq_iff_eq.mp (List.mem_filter.mp ((InternalCommutation.mem_sortBy _ _ _).mp present)).2
  have selectedMember : binding ∈ program.operationScopes.filter (·.operationId == candidate.operationId) := by
    rw [selected]
    simp
  obtain ⟨declared, key⟩ := List.mem_filter.mp selectedMember
  apply List.any_eq_true.mpr
  refine ⟨binding, declared, ?_⟩
  simp [key, ← ownerEq, scopeEq]

/-- PMIS-SELECT-01's actual replay derives the declaration's scope from owner discovery, not token readiness. -/
theorem replayed_declaration_scope (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord)
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after) :
    ∃ operation, program.operations.find? (·.id == record.operationId) = some operation ∧
      operation.id = record.operationId ∧ operation.kind = record.operationKind ∧
      operation ∈ program.operations.filter (fun op => program.operationScopes.any
        (fun binding => binding.operationId == op.id && binding.scopeId == record.owner.definitionScopeId)) := by
  obtain ⟨operation, resolved, kind, _, _, _⟩ :=
    InternalCommutation.replayInternalOperationOccurrence_sound program before after record replayed
  have declaration := InternalCommutation.resolveInternalOperationOccurrence_declaration program before
    ⟨record.operationId, record.owner⟩ operation resolved
  have scope := resolved_scope_binding program before ⟨record.operationId, record.owner⟩ operation resolved
  have lookup : program.operations.find? (·.id == record.operationId) = some operation := by
    unfold InternalCommutation.resolveInternalOperationOccurrence? at resolved
    obtain ⟨candidates, _, lookup⟩ := Option.bind_eq_some_iff.mp resolved
    split at lookup <;> try contradiction
    exact lookup
  refine ⟨operation, lookup, declaration.2, kind, ?_⟩
  apply List.mem_filter.mpr
  exact ⟨declaration.1, by simpa only [declaration.2] using scope⟩

private theorem replayed_body_balance (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord) (body : bodyTransition (.internalOperation record))
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking after owner place + transitionPortCharge program bodyConsumedPorts owner place (.internalOperation record) =
      continuationMarking before owner place + transitionPortCharge program bodyProducedPorts owner place (.internalOperation record) := by
  obtain ⟨operation, resolved, kind, _, _, applied⟩ :=
    InternalCommutation.replayInternalOperationOccurrence_sound program before after record replayed
  have lookup : program.operations.find? (·.id == record.operationId) = some operation := by
    unfold InternalCommutation.resolveInternalOperationOccurrence? at resolved
    obtain ⟨candidates, _, lookup⟩ := Option.bind_eq_some_iff.mp resolved
    split at lookup <;> try contradiction
    exact lookup
  have balance := applyInternalOperationOccurrence_continuation_balance program before after
    ⟨record.operationId, record.owner⟩ operation resolved (by rw [kind]; exact body) applied owner place
  simpa only [transitionPortCharge, lookup] using balance

theorem internalTransitions_body_balance (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (before after : RuntimeState) (transitions : List CommittedTransition)
    (replayed : internalTransitions? program before transitions = some after)
    (body : ∀ transition ∈ transitions, bodyTransition transition)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking after owner place + (transitions.map (transitionPortCharge program bodyConsumedPorts owner place)).sum =
      continuationMarking before owner place + (transitions.map (transitionPortCharge program bodyProducedPorts owner place)).sum := by
  induction transitions generalizing before with
  | nil =>
    have same : before = after := by simpa [internalTransitions?] using replayed
    subst after
    simp
  | cons transition rest ih =>
    cases transition with
    | externalStimulus stimulus => simp [internalTransitions?] at replayed
    | internalOperation record =>
      simp only [internalTransitions?] at replayed
      obtain ⟨next, step, replayed⟩ := Option.bind_eq_some_iff.mp replayed
      have first := replayed_body_balance program before next record (body _ (by simp))
        (by simpa [internalTransition?, selected] using step) owner place
      have later := ih next replayed (fun transition member => body transition (by simp [member]))
      simp only [List.map_cons, List.sum_cons]
      omega

private theorem waitCompletion_admission_marking (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (selected : ParallelScopeStart.programSelected program = true)
    (completion : waitCompletionStimulus stimulus) (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking (admitStimulus program before stimulus).state owner place = continuationMarking before owner place := by
  cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
  case completeUserTaskInstance commandId id values =>
    exact admitStimulus_parallel_scope_human_continuation_marking program before commandId id values selected owner place
  case completeEffect commandId id result =>
    cases result <;> simp only at completion <;> try contradiction
    exact admitStimulus_parallel_scope_effect_continuation_marking program before commandId id _ selected owner place

/-- Actual Human or Service-success command replay telescopes the exact body-record
port charges; entry and retirement suffixes are outside this conservation domain. -/
theorem committedTransitions_body_continuation_balance (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (before after : RuntimeState) (stimulus : Stimulus) (rest : List CommittedTransition)
    (replayed : committedTransitions? program before (.externalStimulus stimulus :: rest) = some after)
    (completion : waitCompletionStimulus stimulus)
    (body : ∀ transition ∈ rest, bodyTransition transition)
    (owner : ScopeOccurrenceId) (place : ControlPlaceId) :
    continuationMarking after owner place + (rest.map (transitionPortCharge program bodyConsumedPorts owner place)).sum =
      continuationMarking before owner place + (rest.map (transitionPortCharge program bodyProducedPorts owner place)).sum := by
  unfold committedTransitions? at replayed
  simp only [selected, Bool.not_true, Bool.false_eq_true, ite_false] at replayed
  cases snapshot : program.compensationEventSubProcessSnapshots with
  | some value => simp [snapshot] at replayed
  | none =>
    simp only [snapshot] at replayed
    split at replayed <;> try contradiction
    have balance := internalTransitions_body_balance program selected _ after rest replayed body owner place
    rw [waitCompletion_admission_marking program before stimulus selected completion owner place] at balance
    exact balance

def bodyOrRetirementTransition (transition : CommittedTransition) : Prop :=
  bodyTransition transition ∨ match transition with
    | .internalOperation record => record.operationKind = .completeParallelMultiInstanceScope
    | _ => False

/-- PMIS retirement excludes the queried parent at each actual replay predecessor. -/
def retirementParentsOutside (program : Program) (initial : RuntimeState)
    (transitions : List CommittedTransition) (owner : ScopeOccurrenceId) : Prop :=
  ∀ priorRecords record suffix middle successor,
    transitions = priorRecords ++ .internalOperation record :: suffix →
    internalTransitions? program initial priorRecords = some middle →
    InternalCommutation.replayInternalOperationOccurrence? program middle record = some successor →
    record.operationKind = .completeParallelMultiInstanceScope →
    ∀ entry binding, parallelScopeBinding? entry middle record.owner = some binding →
      owner ≠ binding.activity.owner

private theorem replayed_retirement_le (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord)
    (kind : record.operationKind = .completeParallelMultiInstanceScope)
    (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after)
    (outside : ∀ entry binding, parallelScopeBinding? entry before record.owner = some binding →
      owner ≠ binding.activity.owner)
    (place : ControlPlaceId) :
    continuationMarking after owner place + transitionPortCharge program bodyConsumedPorts owner place (.internalOperation record) ≤
      continuationMarking before owner place + transitionPortCharge program bodyProducedPorts owner place (.internalOperation record) := by
  obtain ⟨operation, resolved, metadata, _, _, applied⟩ :=
    InternalCommutation.replayInternalOperationOccurrence_sound program before after record replayed
  have key := (InternalCommutation.resolveInternalOperationOccurrence_declaration program before
    ⟨record.operationId, record.owner⟩ operation resolved).2
  have unique : program.operations.filter (·.id == record.operationId) = [operation] := by
    unfold InternalCommutation.resolveInternalOperationOccurrence? at resolved
    obtain ⟨candidates, discovered, lookup⟩ := Option.bind_eq_some_iff.mp resolved
    unfold InternalCommutation.internalOperationOccurrences? at discovered
    split at discovered <;> try contradiction
    rename_i selected selectedEq
    split at lookup <;> try contradiction
    rw [← List.head?_filter, selectedEq] at lookup
    cases Option.some.inj lookup
    exact selectedEq
  have lookup : program.operations.find? (·.id == record.operationId) = some operation := by
    rw [← List.head?_filter, unique]
    rfl
  rw [kind] at metadata
  cases operation <;> simp only [SemanticOperation.kind] at metadata <;> try contradiction
  cases control : before.control <;> simp only [InternalCommutation.applyInternalOperationOccurrence?, control,
    resolved, bind, Option.bind_some] at applied <;> try contradiction
  simp only [key] at applied
  unfold applyParallelScopeOperation? at applied
  simp only [unique, bind, Option.bind_some] at applied
  split at applied <;> try contradiction
  obtain ⟨entry, _, applied⟩ := Option.bind_eq_some_iff.mp applied
  split at applied <;> try contradiction
  split at applied <;> try contradiction
  split at applied <;> try contradiction
  split at applied <;> try contradiction
  split at applied <;> try contradiction
  split at applied <;> try contradiction
  split at applied <;> try contradiction
  have completed := applied
  unfold completeParallelScope? at completed
  obtain ⟨binding, bound, _⟩ := Option.bind_eq_some_iff.mp completed
  have smaller := completeParallelScope_foreign_continuationMarking_le entry record.owner owner before after binding
    bound applied (outside entry binding bound) place
  simpa [transitionPortCharge, lookup, bodyConsumedPorts, SequentialScopeControl.inputs,
    bodyProducedPorts, ownedPortCount] using smaller

private theorem internalTransitions_body_retirement_le (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (before after : RuntimeState) (transitions : List CommittedTransition)
    (replayed : internalTransitions? program before transitions = some after)
    (kinds : ∀ transition ∈ transitions, bodyOrRetirementTransition transition)
    (outside : retirementParentsOutside program before transitions owner) (place : ControlPlaceId) :
    continuationMarking after owner place + (transitions.map (transitionPortCharge program bodyConsumedPorts owner place)).sum ≤
      continuationMarking before owner place + (transitions.map (transitionPortCharge program bodyProducedPorts owner place)).sum := by
  induction transitions generalizing before with
  | nil =>
    have same : before = after := by simpa [internalTransitions?] using replayed
    subst after
    simp
  | cons transition rest ih =>
    cases transition with
    | externalStimulus stimulus => simp [internalTransitions?] at replayed
    | internalOperation record =>
      simp only [internalTransitions?] at replayed
      obtain ⟨next, step, replayed⟩ := Option.bind_eq_some_iff.mp replayed
      have actual : InternalCommutation.replayInternalOperationOccurrence? program before record = some next :=
        by simpa [internalTransition?, selected] using step
      have first : continuationMarking next owner place + transitionPortCharge program bodyConsumedPorts owner place (.internalOperation record) ≤
          continuationMarking before owner place + transitionPortCharge program bodyProducedPorts owner place (.internalOperation record) := by
        rcases kinds (.internalOperation record) (by simp) with body | retirement
        · exact Nat.le_of_eq (replayed_body_balance program before next record body actual owner place)
        · exact replayed_retirement_le program before next record retirement actual
            (outside [] record rest before next rfl rfl actual retirement) place
      have tailOutside : retirementParentsOutside program next rest owner := by
        intro priorRecords candidate suffix middle successor shape priorRecordsReplay candidateReplay retirement entry binding bound
        apply outside (.internalOperation record :: priorRecords) candidate suffix middle successor
          (by simp [shape]) _ candidateReplay retirement entry binding bound
        simpa only [internalTransitions?, step, bind, Option.bind_some] using priorRecordsReplay
      have later := ih next replayed (fun transition member => kinds transition (by simp [member])) tailOutside
      simp only [List.map_cons, List.sum_cons]
      omega

/-- A history retains actual successful commands and cumulative internal records,
starting at an arbitrary issued-body marking rather than resetting command credit. -/
inductive ContinuationCommandHistory (program : Program) (owner : ScopeOccurrenceId) :
    RuntimeState → RuntimeState → List CommittedTransition → Prop where
  | initial (state : RuntimeState) : ContinuationCommandHistory program owner state state []
  | internalStep {initial before after : RuntimeState} {earlier : List CommittedTransition}
      {record : InternalTransitionRecord}
      (history : ContinuationCommandHistory program owner initial before earlier)
      (replayed : InternalCommutation.replayInternalOperationOccurrence? program before record = some after)
      (kind : bodyOrRetirementTransition (.internalOperation record))
      (outside : record.operationKind = .completeParallelMultiInstanceScope →
        ∀ entry binding, parallelScopeBinding? entry before record.owner = some binding →
          owner ≠ binding.activity.owner) :
      ContinuationCommandHistory program owner initial after (earlier ++ [.internalOperation record])
  | command {initial before after : RuntimeState} {earlier rest : List CommittedTransition} {stimulus : Stimulus}
      (history : ContinuationCommandHistory program owner initial before earlier)
      (replayed : committedTransitions? program before (.externalStimulus stimulus :: rest) = some after)
      (completion : waitCompletionStimulus stimulus)
      (kinds : ∀ transition ∈ rest, bodyOrRetirementTransition transition)
      (outside : retirementParentsOutside program (admitStimulus program before stimulus).state rest owner) :
      ContinuationCommandHistory program owner initial after (earlier ++ rest)

/-- Actual committed wait admission extends lifetime history before internal closure, without requiring a published command trace. -/
theorem ContinuationCommandHistory.extend_wait_admission
    (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (initial before : RuntimeState) (records : List CommittedTransition) (stimulus : Stimulus)
    (history : ContinuationCommandHistory program owner initial before records)
    (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program before stimulus).outcome = .committed) :
    ContinuationCommandHistory program owner initial (admitStimulus program before stimulus).state records := by
  have replayed : committedTransitions? program before [.externalStimulus stimulus] =
      some (admitStimulus program before stimulus).state := by
    simp [committedTransitions?, selected, snapshots, committed, internalTransitions?]
  simpa only [List.append_nil] using ContinuationCommandHistory.command history replayed completion
    (by simp) (by simp [retirementParentsOutside])

private theorem internalTransitions_record_replayed (program : Program)
    (selected : ParallelScopeStart.programSelected program = true)
    (before after : RuntimeState) (transitions : List CommittedTransition)
    (success : internalTransitions? program before transitions = some after)
    (record : InternalTransitionRecord) (member : .internalOperation record ∈ transitions) :
    ∃ predecessor successor, InternalCommutation.replayInternalOperationOccurrence? program predecessor record = some successor := by
  induction transitions generalizing before with
  | nil => simp at member
  | cons head rest ih =>
    cases head with
    | externalStimulus stimulus => simp [internalTransitions?] at success
    | internalOperation first =>
      simp only [internalTransitions?] at success
      obtain ⟨next, step, success⟩ := Option.bind_eq_some_iff.mp success
      rcases List.mem_cons.mp member with same | later
      · cases same
        exact ⟨before, next, by simpa [internalTransition?, selected] using step⟩
      · exact ih next success later

/-- Every lifetime record retains its actual replay witness across command boundaries. -/
private theorem ContinuationCommandHistory.record_replayed
    (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (record : InternalTransitionRecord) (member : .internalOperation record ∈ records) :
    ∃ predecessor successor, InternalCommutation.replayInternalOperationOccurrence? program predecessor record = some successor := by
  induction history with
  | initial => simp at member
  | @internalStep before after earlier current history replayed kind outside ih =>
    rcases List.mem_append.mp member with old | last
    · exact ih old
    · have same : record = current := by simpa using last
      subst current
      exact ⟨before, after, replayed⟩
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    rcases List.mem_append.mp member with old | later
    · exact ih old
    · unfold committedTransitions? at replayed
      simp only [selected, Bool.not_true, Bool.false_eq_true, ite_false] at replayed
      cases snapshot : program.compensationEventSubProcessSnapshots with
      | some value => simp [snapshot] at replayed
      | none =>
        simp only [snapshot] at replayed
        split at replayed <;> try contradiction
        exact internalTransitions_record_replayed program selected _ after rest replayed record later

/-- Actual lifetime records belong to the operation population selected by their recorded owner's definition scope. -/
theorem ContinuationCommandHistory.record_declaration_scope
    (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (record : InternalTransitionRecord) (member : .internalOperation record ∈ records) :
    ∃ operation, program.operations.find? (·.id == record.operationId) = some operation ∧
      operation.id = record.operationId ∧ operation.kind = record.operationKind ∧
      operation ∈ program.operations.filter (fun op => program.operationScopes.any
        (fun binding => binding.operationId == op.id && binding.scopeId == record.owner.definitionScopeId)) := by
  obtain ⟨predecessor, successor, replayed⟩ := history.record_replayed program owner selected initial final records record member
  exact replayed_declaration_scope program predecessor successor record replayed

/-- PMIS-END-01's shared structural frame identifies the parent at actual retirement predecessors. -/
def retirementFrames (program : Program) (parent : ScopeOccurrenceId) (initial : RuntimeState)
    (transitions : List CommittedTransition) : Prop :=
  ∀ priorRecords record suffix middle,
    transitions = priorRecords ++ .internalOperation record :: suffix →
    internalTransitions? program initial priorRecords = some middle →
    record.operationKind = .completeParallelMultiInstanceScope →
    ParallelScopeStructuralFrame parent middle

/-- The shared root frame discharges retirement-parent provenance when extending a body lifetime. -/
theorem ContinuationCommandHistory.command_of_structural_frames
    (program : Program) (owner parent : ScopeOccurrenceId)
    (initial before after : RuntimeState) (earlier rest : List CommittedTransition) (stimulus : Stimulus)
    (history : ContinuationCommandHistory program owner initial before earlier)
    (replayed : committedTransitions? program before (.externalStimulus stimulus :: rest) = some after)
    (completion : waitCompletionStimulus stimulus)
    (kinds : ∀ transition ∈ rest, bodyOrRetirementTransition transition)
    (different : owner ≠ parent)
    (frames : retirementFrames program parent (admitStimulus program before stimulus).state rest) :
    ContinuationCommandHistory program owner initial after (earlier ++ rest) := by
  apply ContinuationCommandHistory.command history replayed completion kinds
  intro priorRecords record suffix middle successor shape prefixReplay _ retirement entry binding bound
  have frame := frames priorRecords record suffix middle shape prefixReplay retirement
  have parentEq := (frame.bound_outer entry parent record.owner middle binding bound).2.2
  exact fun equal => different (equal.trans parentEq)

/-- Actual replayed command histories conserve lifetime body credit up to discarded
retirement continuations; entry and the initial one-credit boundary remain separate. -/
theorem ContinuationCommandHistory.continuation_budget (program : Program) (owner : ScopeOccurrenceId)
    (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) (place : ControlPlaceId) :
    continuationMarking final owner place + (records.map (transitionPortCharge program bodyConsumedPorts owner place)).sum ≤
      continuationMarking initial owner place + (records.map (transitionPortCharge program bodyProducedPorts owner place)).sum := by
  induction history with
  | initial => simp
  | @internalStep before after earlier record history replayed kind outside ih =>
    have step : continuationMarking after owner place + transitionPortCharge program bodyConsumedPorts owner place (.internalOperation record) ≤
        continuationMarking before owner place + transitionPortCharge program bodyProducedPorts owner place (.internalOperation record) := by
      rcases kind with body | retirement
      · exact Nat.le_of_eq (replayed_body_balance program before after record body replayed owner place)
      · exact replayed_retirement_le program before after record retirement replayed (outside retirement) place
    simp only [List.map_append, List.sum_append, List.map_cons, List.map_nil, List.sum_cons, List.sum_nil, Nat.add_zero]
    omega
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    unfold committedTransitions? at replayed
    simp only [selected, Bool.not_true, Bool.false_eq_true, ite_false] at replayed
    cases snapshot : program.compensationEventSubProcessSnapshots with
    | some value => simp [snapshot] at replayed
    | none =>
      simp only [snapshot] at replayed
      split at replayed <;> try contradiction
      have command := internalTransitions_body_retirement_le program selected _ after rest replayed kinds outside place
      rw [waitCompletion_admission_marking program before stimulus selected completion owner place] at command
      simp only [List.map_append, List.sum_append]
      omega


def declarationFiringCharge (owner : ScopeOccurrenceId) (id : OperationId) : CommittedTransition → Nat
  | .externalStimulus _ => 0
  | .internalOperation record => if record.owner == owner && record.operationId == id then 1 else 0

def declarationFiringCount (records : List CommittedTransition) (owner : ScopeOccurrenceId) (id : OperationId) : Nat :=
  (records.map (declarationFiringCharge owner id)).sum

private theorem sum_map_mono (values : List CommittedTransition) (left right : CommittedTransition → Nat)
    (bound : ∀ value ∈ values, left value ≤ right value) :
    (values.map left).sum ≤ (values.map right).sum := by
  induction values with
  | nil => simp
  | cons head tail ih =>
    have first := bound head (by simp)
    have rest := ih (fun value member => bound value (by simp [member]))
    simp only [List.map_cons, List.sum_cons]
    omega

private theorem unique_port_bound (ports : List ControlPlaceId) (unique : ports.Nodup) (place : ControlPlaceId) :
    (ports.filter (· == place)).length ≤ 1 := by
  induction ports with
  | nil => simp
  | cons head tail ih =>
    obtain ⟨absent, unique⟩ := List.nodup_cons.mp unique
    by_cases same : head = place
    · subst head
      have empty : tail.filter (· == place) = [] := List.filter_eq_nil_iff.mpr (by
        intro value member same
        exact absent ((show value = place by simpa using same) ▸ member))
      simp [empty]
    · simpa [same] using ih unique

private theorem body_output_is_producer (program : Program) (operation : SemanticOperation)
    (member : operation ∈ program.operations) (place : ControlPlaceId)
    (output : place ∈ bodyProducedPorts operation) : operation.id ∈ producers program.operations place := by
  unfold producers
  apply List.mem_filterMap.mpr
  refine ⟨operation, member, ?_⟩
  cases operation <;> simp only [bodyProducedPorts] at output <;> try contradiction
  all_goals try rw [List.mem_singleton] at output
  all_goals simp [operationOutputs, output]

theorem same_declaration (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (left right : SemanticOperation) (leftMember : left ∈ program.operations)
    (rightMember : right ∈ program.operations) (same : left.id = right.id) : left = right := by
  have sorted := programWellFormed_operationIdsSorted program
    (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1
  have population := filter_key_eq_singleton_of_nodup program.operations (fun operation => operation.id.value)
    right (strictlySortedStrings_nodup _ sorted) rightMember
  have present : left ∈ program.operations.filter (fun operation => decide (operation.id.value = right.id.value)) := by
    simp [leftMember, same]
  rw [population] at present
  simpa using present

/-- Exact record attribution supplies declared port/count bounds independently of the queried history owner. -/
theorem attributed_port_firing_counts (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (records : List CommittedTransition) (parent : ScopeOccurrenceId)
    (attributed : ∀ record, .internalOperation record ∈ records →
      ∃ operation, program.operations.find? (·.id == record.operationId) = some operation ∧
        operation.id = record.operationId ∧ operation ∈ program.operations)
    (consumer : SemanticOperation) (consumerMember : consumer ∈ program.operations)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (input : place.id ∈ bodyConsumedPorts consumer) :
    ∃ producerId, producers program.operations place.id = [producerId] ∧
      declarationFiringCount records parent consumer.id ≤
        (records.map (transitionPortCharge program bodyConsumedPorts parent place.id)).sum ∧
      (records.map (transitionPortCharge program bodyProducedPorts parent place.id)).sum ≤
        declarationFiringCount records parent producerId := by
  have incidence := (ParallelScopeStart.analyzeProgram_place_incidence program analysis admitted place declared).1
  cases population : producers program.operations place.id with
  | nil => simp [population] at incidence
  | cons producerId tail =>
    have empty : tail = [] := by
      have length : tail.length = 0 := by simpa [population] using incidence
      simpa using length
    subst tail
    refine ⟨producerId, rfl, ?_, ?_⟩
    · apply sum_map_mono
      intro transition member
      cases transition with
      | externalStimulus stimulus => simp [declarationFiringCharge]
      | internalOperation record =>
        obtain ⟨operation, lookup, key, operationMember⟩ := attributed record member
        by_cases same : record.owner = parent ∧ record.operationId = consumer.id
        · have equal := same_declaration program analysis admitted operation consumer operationMember consumerMember (key.trans same.2)
          subst operation
          have present : place.id ∈ (bodyConsumedPorts consumer).filter (· == place.id) := by simp [input]
          have positive : 0 < ((bodyConsumedPorts consumer).filter (· == place.id)).length := List.length_pos_of_mem present
          simp only [transitionPortCharge, lookup]
          have bound : 1 ≤ ((bodyConsumedPorts consumer).filter (· == place.id)).length := by omega
          simpa [declarationFiringCharge, ownedPortCount, same.1, same.2] using bound
        · simp [declarationFiringCharge, same]
    · apply sum_map_mono
      intro transition member
      cases transition with
      | externalStimulus stimulus => simp [transitionPortCharge, declarationFiringCharge]
      | internalOperation record =>
        obtain ⟨operation, lookup, key, operationMember⟩ := attributed record member
        by_cases same : record.owner = parent
        · by_cases output : place.id ∈ bodyProducedPorts operation
          · have producerMember := body_output_is_producer program operation operationMember place.id output
            rw [population] at producerMember
            have producerEq : operation.id = producerId := by simpa using producerMember
            have unique : (bodyProducedPorts operation).Nodup := by
              cases operation <;> simp [bodyProducedPorts]
              exact (ParallelScopeStart.analyzeProgram_fork_join_ports_nodup program analysis admitted).1 _ _ _ _ operationMember
            have bound := unique_port_bound _ unique place.id
            simp only [transitionPortCharge, lookup]
            have recorded : record.operationId = producerId := key.symm.trans producerEq
            simpa [declarationFiringCharge, ownedPortCount, same, recorded] using bound
          · have zero : (bodyProducedPorts operation).filter (· == place.id) = [] := List.filter_eq_nil_iff.mpr (by
              intro value member equal
              exact output ((show value = place.id by simpa using equal) ▸ member))
            simp [transitionPortCharge, lookup, ownedPortCount, same, zero]
        · rw [show transitionPortCharge program bodyProducedPorts parent place.id (.internalOperation record) = 0 by
            simp only [transitionPortCharge, lookup]
            exact ownedPortCount_foreign _ _ _ _ same]
          exact Nat.zero_le _

/-- Actual lifetime replay counts every consumed input and bounds a port's credits
by its unique admitted producer; retired continuations contribute no new credit. -/
theorem ContinuationCommandHistory.port_firing_budget
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records)
    (consumer : SemanticOperation) (consumerMember : consumer ∈ program.operations)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (input : place.id ∈ bodyConsumedPorts consumer) :
    ∃ producerId,
      producers program.operations place.id = [producerId] ∧
      declarationFiringCount records owner consumer.id ≤
        (records.map (transitionPortCharge program bodyConsumedPorts owner place.id)).sum ∧
      (records.map (transitionPortCharge program bodyProducedPorts owner place.id)).sum ≤
        declarationFiringCount records owner producerId ∧
      declarationFiringCount records owner consumer.id ≤
        continuationMarking initial owner place.id + declarationFiringCount records owner producerId := by
  have attributed : ∀ record, .internalOperation record ∈ records →
      ∃ operation, program.operations.find? (·.id == record.operationId) = some operation ∧
        operation.id = record.operationId ∧ operation ∈ program.operations := by
    intro record member
    obtain ⟨operation, lookup, key, _, population⟩ := history.record_declaration_scope
      program owner selected initial final records record member
    exact ⟨operation, lookup, key, (List.mem_filter.mp population).1⟩
  obtain ⟨producerId, unique, consumed, produced⟩ := attributed_port_firing_counts program analysis admitted
    records owner attributed consumer consumerMember place declared input
  have budget := history.continuation_budget program owner selected initial final records place.id
  exact ⟨producerId, unique, consumed, produced, by omega⟩

theorem admitted_body_input_declared (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (body : List SemanticOperation) (operation : SemanticOperation)
    (member : operation ∈ program.operations) (vertex : StructuredParallelBody.Vertex)
    (converted : SequentialScopeControl.bodyVertex? body operation = some vertex)
    (port : ControlPlaceId) (input : port ∈ bodyConsumedPorts operation) :
    ∃ place ∈ program.controlPlaces, place.id = port := by
  have valid := List.all_eq_true.mp (programWellFormed_operations program
    (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1) operation member
  have declared : program.controlPlaces.any (fun place => place.id == port) = true := by
    cases operation <;> simp only [SequentialScopeControl.bodyVertex?, bind, Option.bind_some,
      Option.bind_none] at converted <;> try contradiction
    all_goals simp only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton] at input
    all_goals simp only [operationWellFormed, Bool.and_eq_true] at valid
    all_goals first
      | (subst port; first | exact valid.2 | exact valid.1.2 | exact valid.1.1.2 | exact valid.1.1.1.2 | exact valid.1.1.1.1.2)
      | exact List.all_eq_true.mp valid.1.2 port input
  simpa only [beq_iff_eq] using List.any_eq_true.mp declared

theorem declared_output_producer (program : Program) (operation : SemanticOperation)
    (member : operation ∈ program.operations) (port : ControlPlaceId)
    (output : port ∈ operationOutputs operation) : operation.id ∈ producers program.operations port := by
  apply List.mem_filterMap.mpr
  refine ⟨operation, member, ?_⟩
  cases operation <;> simp_all [operationOutputs]

/-- Actual admission identifies the sole entry declaration and its issued child port. -/
theorem admitted_entry_declaration (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) :
    ∃ operation ∈ program.operations, operation.id = analysis.entry.id ∧
      operation.kind = .enterParallelMultiInstanceScope ∧ analysis.entry.childEntry ∈ operationOutputs operation := by
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ :=
    ParallelScopeStart.analyzeProgram_body_certificate program analysis admitted
  have entryMember : analysis.entry ∈ program.operations.filterMap parallelScopeEntry? := by rw [entries]; simp
  obtain ⟨operation, member, entryEq⟩ := List.mem_filterMap.mp entryMember
  refine ⟨operation, member, ?_⟩
  cases operation <;> simp only [parallelScopeEntry?] at entryEq <;> try contradiction
  have same := Option.some.inj entryEq
  refine ⟨congrArg ParallelScopeEntry.id same, rfl, ?_⟩
  simp only [operationOutputs, List.mem_singleton]
  exact (congrArg ParallelScopeEntry.childEntry same).symm

/-- Actual admitted predecessors bound lifetime consumer firings without reseeding a resumed command. -/
theorem ContinuationCommandHistory.admitted_predecessor_budget
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    ∃ child completion body first converted ordered,
      child = program.operations.filter (fun operation => program.operationScopes.any
        (fun binding => binding.operationId == operation.id && binding.scopeId == analysis.entry.childScopeId)) ∧
      child.filter (fun operation => match operation with
        | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion] ∧
      body = child.filter (·.id != completion.id) ∧
      body.mapM (SequentialScopeControl.bodyVertex? body) = some converted ∧
      StructuredParallelBody.structureOrder (⟨analysis.entry.id.value, .start, [first]⟩ :: converted) = some ordered ∧
      ∀ consumer ∈ body,
        (declarationFiringCount records owner consumer.id ≤ continuationMarking initial owner analysis.entry.childEntry +
          declarationFiringCount records owner analysis.entry.id) ∨
        ∃ producer ∈ body, ∃ port ∈ bodyConsumedPorts consumer,
          port ∈ operationOutputs producer ∧
          declarationFiringCount records owner consumer.id ≤ continuationMarking initial owner port +
            declarationFiringCount records owner producer.id ∧
          ∃ earlier middle suffix, ordered.map (·.id) =
            earlier ++ producer.id.value :: middle ++ consumer.id.value :: suffix := by
  obtain ⟨child, completion, body, first, converted, ordered, childEq, completionEq,
    bodyEq, convertedEq, orderEq, chosen⟩ :=
    ParallelScopeStart.analyzeProgram_chosen_input_predecessor program analysis admitted
  have population : ∀ operation ∈ body, operation ∈ program.operations := by
    intro operation member
    rw [bodyEq] at member
    have childMember := (List.mem_filter.mp member).1
    rw [childEq] at childMember
    exact (List.mem_filter.mp childMember).1
  have entryPopulation := admitted_entry_declaration program analysis admitted
  refine ⟨child, completion, body, first, converted, ordered, childEq, completionEq,
    bodyEq, convertedEq, orderEq, ?_⟩
  intro consumer consumerMember
  obtain ⟨port, input, source⟩ := chosen consumer consumerMember
  have convertedMember : ∃ vertex ∈ converted, SequentialScopeControl.bodyVertex? body consumer = some vertex := by
    exact ParallelScopeStart.mapped_member _ _ _ convertedEq consumer consumerMember
  obtain ⟨vertex, _, vertexEq⟩ := convertedMember
  obtain ⟨place, declared, placeEq⟩ := admitted_body_input_declared program analysis admitted body consumer
    (population consumer consumerMember) vertex vertexEq port input
  obtain ⟨producerId, unique, _, _, budget⟩ := history.port_firing_budget program analysis admitted owner selected
    initial final records consumer (population consumer consumerMember) place declared (by simpa only [SequentialScopeControl.inputs, bodyConsumedPorts, placeEq] using input)
  rw [placeEq] at unique budget
  rcases source with entryPort | ⟨producer, producerMember, output, orderedBefore⟩
  · obtain ⟨entryOperation, entryMember, entryId, _, entryOutput⟩ := entryPopulation
    have producerPresent := declared_output_producer program entryOperation entryMember port (by simpa [entryPort] using entryOutput)
    rw [unique] at producerPresent
    have same : analysis.entry.id = producerId := by simpa [entryId] using producerPresent
    exact Or.inl (by simpa [entryPort, ← same] using budget)
  · have producerPresent := declared_output_producer program producer (population producer producerMember) port output
    rw [unique] at producerPresent
    have same : producer.id = producerId := by simpa using producerPresent
    exact Or.inr ⟨producer, producerMember, port, input, output, by simpa [← same] using budget, orderedBefore⟩


theorem ContinuationCommandHistory.record_body_or_retirement
    (program : Program) (owner : ScopeOccurrenceId) (initial final : RuntimeState)
    (records : List CommittedTransition) (history : ContinuationCommandHistory program owner initial final records)
    (record : InternalTransitionRecord) (member : .internalOperation record ∈ records) :
    bodyOrRetirementTransition (.internalOperation record) := by
  induction history with
  | initial => simp at member
  | @internalStep before after earlier current history replayed kind outside ih =>
    rcases List.mem_append.mp member with old | last
    · exact ih old
    · have same : record = current := by simpa using last
      subst current
      exact kind
  | @command before after earlier rest stimulus history replayed completion kinds outside ih =>
    rcases List.mem_append.mp member with old | later
    · exact ih old
    · exact kinds _ later

/-- Retained body-lifetime records exclude the actual parent entry declaration,
so counting resumed commands cannot introduce additional entry firings. -/
theorem ContinuationCommandHistory.entry_firing_count_zero
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner : ScopeOccurrenceId) (selected : ParallelScopeStart.programSelected program = true)
    (initial final : RuntimeState) (records : List CommittedTransition)
    (history : ContinuationCommandHistory program owner initial final records) :
    declarationFiringCount records owner analysis.entry.id = 0 := by
  obtain ⟨entryOperation, entryMember, entryId, entryKind, _⟩ :=
    admitted_entry_declaration program analysis admitted
  have entryFields := And.intro entryId entryKind
  have zero : ∀ transition ∈ records, declarationFiringCharge owner analysis.entry.id transition = 0 := by
    intro transition member
    cases transition with
    | externalStimulus stimulus => rfl
    | internalOperation record =>
      have allowed := history.record_body_or_retirement program owner initial final records record member
      obtain ⟨operation, lookup, key, kind, population⟩ :=
        history.record_declaration_scope program owner selected initial final records record member
      have operationMember := (List.mem_filter.mp population).1
      by_cases same : record.operationId = analysis.entry.id
      · have declaration := same_declaration program analysis admitted operation entryOperation
          operationMember entryMember (key.trans (same.trans entryFields.1.symm))
        have entryKind : record.operationKind = .enterParallelMultiInstanceScope :=
          kind.symm.trans ((congrArg SemanticOperation.kind declaration).trans entryFields.2)
        simp [bodyOrRetirementTransition, bodyTransition, entryKind] at allowed
      · simp [declarationFiringCharge, same]
  unfold declarationFiringCount
  clear history
  induction records with
  | nil => rfl
  | cons head tail ih =>
    have first := zero head (by simp)
    have rest := ih (fun transition member => zero transition (by simp [member]))
    simp only [List.map_cons, List.sum_cons, first, rest, Nat.zero_add]

theorem internalTransition_of_unselected (program : Program) (state : RuntimeState)
    (record : InternalTransitionRecord) (unselected : ParallelScopeStart.programSelected program = false) :
    internalTransition? program state record = replayInternalTransition? program state record := by
  simp [internalTransition?, unselected]

theorem committedTransitions_of_unselected (program : Program) (initial : RuntimeState)
    (transitions : List CommittedTransition) (unselected : ParallelScopeStart.programSelected program = false) :
    committedTransitions? program initial transitions = replayCommittedTransitions program initial transitions := by
  simp [committedTransitions?, unselected]

end BpmnSemantics.SemanticProcess.ParallelScopeReplay
