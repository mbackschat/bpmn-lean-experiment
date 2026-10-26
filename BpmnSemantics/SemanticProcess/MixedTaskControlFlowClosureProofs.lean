module

public import BpmnSemantics.SemanticProcess.MixedTaskControlFlowProgressProofs
import BpmnSemantics.SemanticProcess.StructuredCompositionLifecycleProofs

/-! MTCF-PROGRESS-01 bounds whole scheduled runs: from the per-firing position progress in [`MixedTaskControlFlowProgressProofs`](MixedTaskControlFlowProgressProofs.lean), every scheduled closure from an admitted start is finite and its counters only grow. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.MixedTaskControlFlow

open SerialBusinessTask (RootFrame RootLifecycle ForeignRuntimeEmpty IssuanceFrame frontierFields)
open InternalCommutation in
open InternalCommutation in
open InternalCommutation in
open InternalCommutation in
open InternalCommutation in
open InternalCommutation in
open InternalCommutation in

open InternalCommutation in
/-- The actual singleton scheduler drains the indexed depth, preserving actual reachability independently of optional publication records. -/
theorem scheduled_closure (program : Program) (analysis : Analysis) (baseline state : RuntimeState)
    (owner : ScopeOccurrenceId) (commandId : SemanticId) (fuel index ordinal : Nat) (frontier : Option Vertex)
    (ordinaryProfile : program.identity.semanticProfile.value ≠ "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" ∧
      program.identity.semanticProfile.value ≠ "cibseven-2.2.0-embedded-subprocess-completion-draft")
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis) (scalar : programEffectMappingValuePolicy program = .scalar)
    (declared : SerialBusinessTask.DeclaredRoot program owner) (framed : RootFrame owner state)
    (position : Position program analysis state frontier)
    (available : match frontier with | some vertex => InputsAvailable analysis.vertices vertex.id state.variables.process.bindings | none => True)
    (canonical : SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) state.variables.process.bindings = true)
    (reachable : SerialBusinessTask.ExecutionReachable program baseline state) (within : positionDepth analysis state frontier ≤ fuel) :
    let closed := closeScheduledTraced fuel program commandId index ordinal [] state
    closed.failed = false ∧ SerialBusinessTask.ExecutionReachable program baseline closed.state ∧
      RootFrame owner closed.state ∧ AtPosition program analysis closed.state ∧
      (closed.state.waits ≠ [] ∨ closed.state.effectWaits ≠ [] ∨ closed.state.control = .completed owner.processInstanceId) := by
  induction fuel using Nat.strongRecOn generalizing state frontier index with
  | ind fuel ih =>
    have indexed : AtPosition program analysis state := ⟨frontier, position, by cases frontier <;> exact available, canonical⟩
    by_cases settled : state.waits ≠ [] ∨ state.effectWaits ≠ [] ∨ state.control = .completed owner.processInstanceId
    · rw [closeScheduledTraced_stable fuel program commandId index ordinal state
        (settled_frontier program analysis state ordinaryProfile owner wellFormed analyzed scalar declared framed indexed settled)]
      exact ⟨rfl, reachable, framed, indexed, settled⟩
    · have progress := position_progress program analysis state owner wellFormed analyzed scalar declared framed indexed
      have enabled : ∃ operation ∈ program.operations, ∃ after, fire? program operation state = some after := by
        rcases progress with human | effect | completed | enabled
        · exact False.elim (settled (Or.inl human))
        · exact False.elim (settled (Or.inr (Or.inl effect)))
        · exact False.elim (settled (Or.inr (Or.inr completed)))
        · exact enabled
      obtain ⟨operation, member, after, fired⟩ := enabled
      obtain ⟨afterFrame, next, nextPosition, nextAvailable, nextCanonical, decreased⟩ :=
        fire_preserves_position_with_depth program analysis operation state after frontier owner wellFormed analyzed scalar member
          declared framed position available canonical fired
      have selected : program.operations.find? (fun op => decide (op.id = operation.id)) = some operation := by
        rw [← List.head?_filter, filter_key_eq_singleton_of_nodup program.operations (·.id) operation
          (StructuredComposition.admitted_program_has_unique_identity_keys program wellFormed).1 member]
        rfl
      have nextReach := SerialBusinessTask.ExecutionReachable.step operation.id reachable
        (show SemanticProcess.step program state operation.id = some after by simp [SemanticProcess.step, selected, fired])
      cases fuel with
      | zero => omega
      | succ fuel =>
        have tail := ih fuel (by omega) after (index + 1) next afterFrame nextPosition
          (by cases next <;> exact nextAvailable) nextCanonical nextReach (by omega)
        obtain ⟨offer, successor, discovery, aligned⟩ := frontier_of_firing program analysis state after operation owner ordinaryProfile wellFormed analyzed scalar declared framed indexed member fired
        have equations := closeScheduledTraced_singleton_step fuel program commandId index ordinal state offer discovery aligned
        change (closeScheduledTraced (fuel + 1) program commandId index ordinal [] state).failed = false ∧ _
        rw [equations.2, equations.1]
        simpa only [successor] using tail

open InternalCommutation in
/-- An actual committed Start supplies the scheduler invariant and its eight-step budget; neither is an extra readiness premise. -/
theorem committed_start_scheduled_closure (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding) (index ordinal : Nat)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    let started := (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state
    let closed := closeScheduledTraced scenarioClosureLimit program commandId index ordinal [] started
    closed.failed = false ∧ AtPosition program analysis closed.state ∧
      (closed.state.waits ≠ [] ∨ closed.state.effectWaits ≠ [] ∨ closed.state.control = .completed instanceId) := by
  have scalar := mixedProfile_effectMapping_scalar program profile
  have ordinaryProfile : program.identity.semanticProfile.value ≠ "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" ∧
      program.identity.semanticProfile.value ≠ "cibseven-2.2.0-embedded-subprocess-completion-draft" := by
    rcases profile with profile | profile <;> simp [profile, mixedTaskControlFlowProfileId, mixedTaskBusinessErrorProfileId]
  dsimp only
  obtain ⟨owner, instanceEq, declared, framed, frontier, position, available, canonical⟩ :=
    committed_start_has_invariant program analysis commandId processId instanceId bindings profile analyzed committed
  have within := position_depth_bounded program analysis _ frontier analyzed position
  obtain ⟨success, _, _, indexed, settled⟩ := scheduled_closure program analysis _ _ owner commandId scenarioClosureLimit index ordinal
    frontier ordinaryProfile wellFormed analyzed scalar declared framed position (by cases frontier <;> exact available) canonical .initial within
  exact ⟨success, indexed, by simpa [instanceEq] using settled⟩

/-- Accepted start derives the one exact Process owner, foreign-state absence, graph position, writer-free input presence and captured local lifetime together. -/
theorem reached_invariant (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding) (reached : RuntimeState)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reachable : SerialBusinessTask.ExecutionReachable program (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).state reached) :
    ∃ owner, owner.processInstanceId = instanceId ∧ instanceId.value ≠ "" ∧ SerialBusinessTask.DeclaredRoot program owner ∧ RootFrame owner reached ∧ AtPosition program analysis reached ∧
      serialRuntimeAssociationsValid program reached (program.identity.semanticProfile == mixedTaskBusinessErrorProfileId) = true ∧ runtimeStateWellFormed program instanceId reached = true ∧
      ∀ stimulus, SerialBusinessTask.AdmissibleCompletion program reached stimulus → (admitStimulus program reached stimulus).outcome = .committed := by
  have scalar := mixedProfile_effectMapping_scalar program profile
  have guarded := serial_committed_ingress_has_checked_predecessor program initialState
    (.startProcess commandId processId instanceId bindings) committed
  obtain ⟨wellFormed, capabilities⟩ := guarded_program_admission program initialState
    (.startProcess commandId processId instanceId bindings) profile guarded
  have nonempty := guarded_start_instance_nonempty program initialState commandId processId instanceId bindings profile guarded
  obtain ⟨owner, instanceEq, declared, framed, initialPosition⟩ :=
    committed_start_has_invariant program analysis commandId processId instanceId bindings profile analyzed committed
  have joint : RootFrame owner reached ∧ AtPosition program analysis reached := by
    induction reachable with
    | initial => exact ⟨framed, initialPosition⟩
    | step choice reachable executed ih =>
        unfold SemanticProcess.step at executed
        split at executed
        · contradiction
        · rename_i operation selected
          have member := List.mem_of_find?_eq_some selected
          obtain ⟨frontier, position, available, canonical⟩ := ih.2
          obtain ⟨frame, next, nextPosition, nextAvailable, nextCanonical, _⟩ :=
            fire_preserves_position_with_depth program analysis operation _ _ frontier owner wellFormed analyzed scalar member
              declared ih.1 position (by cases frontier <;> exact available) canonical executed
          exact ⟨frame, next, nextPosition, nextAvailable, nextCanonical⟩
    | human commandId taskId bindings reachable ih =>
        exact human_admission_preserves_position program analysis _ commandId taskId bindings profile wellFormed analyzed ih.2 owner ih.1
    | effect commandId effectId result reachable ih =>
        exact effect_admission_preserves_position program analysis _ commandId effectId result profile wellFormed analyzed ih.2 owner ih.1
  have associations := (position_wait_guards program analysis reached owner wellFormed declared joint.1 joint.2 analyzed).1
  have runtime := position_runtime_guard program analysis reached owner wellFormed analyzed
    (by simpa [instanceEq] using nonempty) declared joint.1 joint.2
  refine ⟨owner, instanceEq, nonempty, declared, joint.1, joint.2, associations, by simpa [instanceEq] using runtime, ?_⟩
  intro stimulus admissible
  have completion : SerialBusinessTask.IsSerialCompletion stimulus := by
    cases admissible <;> trivial
  have guarded := indexed_completion_guard program analysis reached owner stimulus profile wellFormed capabilities
    joint.1 joint.2 associations runtime completion
  rw [serial_completion_admission_eq_dispatch program analysis reached stimulus profile analyzed joint.1.2.2.2.2.1
    (indexed_collection_storage program analysis reached owner joint.1 joint.2) guarded completion]
  exact admissible_completion_dispatch_commits program analysis reached owner stimulus profile analyzed joint.1 joint.2 admissible

open InternalCommutation in
/-- Accepted start and actual reachability suffice for bounded closure, including every actual User/effect resumption. -/
theorem reached_scheduled_closure_is_bounded (program : Program) (analysis : Analysis)
    (startCommandId commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (state : RuntimeState) (fuel index ordinal : Nat)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState (.startProcess startCommandId processId instanceId bindings)).outcome = .committed)
    (reachable : SerialBusinessTask.ExecutionReachable program (admitStimulus program initialState (.startProcess startCommandId processId instanceId bindings)).state state)
    (within : scenarioClosureLimit ≤ fuel) :
    let closed := closeScheduledTraced fuel program commandId index ordinal [] state
    closed.failed = false ∧ SerialBusinessTask.ExecutionReachable program
      (admitStimulus program initialState (.startProcess startCommandId processId instanceId bindings)).state closed.state ∧
      (closed.state.waits ≠ [] ∨ closed.state.effectWaits ≠ [] ∨ closed.state.control = .completed instanceId) := by
  have scalar := mixedProfile_effectMapping_scalar program profile
  have ordinaryProfile : program.identity.semanticProfile.value ≠ "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" ∧
      program.identity.semanticProfile.value ≠ "cibseven-2.2.0-embedded-subprocess-completion-draft" := by
    rcases profile with profile | profile <;> simp [profile, mixedTaskControlFlowProfileId, mixedTaskBusinessErrorProfileId]
  obtain ⟨owner, instanceEq, _, declared, framed, indexed, _⟩ :=
    reached_invariant program analysis startCommandId processId instanceId bindings state profile analyzed committed reachable
  have static := guarded_program_admission program initialState (.startProcess startCommandId processId instanceId bindings) profile
    (serial_committed_ingress_has_checked_predecessor program initialState _ committed)
  have wellFormed := static.1
  obtain ⟨frontier, position, available, canonical⟩ := indexed
  have bound := position_depth_bounded program analysis state frontier analyzed position
  obtain ⟨success, reached, _, _, settled⟩ := scheduled_closure program analysis _ state owner commandId fuel index ordinal frontier
    ordinaryProfile wellFormed analyzed scalar declared framed position (by cases frontier <;> exact available) canonical reachable (Nat.le_trans bound within)
  exact ⟨success, reached, by simpa [instanceEq] using settled⟩

/-- High-water marks survive every later execution prefix, including refused and accepted completions; together with strict issuance increments, revisiting a task cannot reuse an earlier occurrence. -/
theorem reached_counters_monotone (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding) (before after : RuntimeState)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId) (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reached : SerialBusinessTask.ExecutionReachable program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state before)
    (continued : SerialBusinessTask.ExecutionReachable program before after) : CountersMonotone before after := by
  have scalar := mixedProfile_effectMapping_scalar program profile
  induction continued with
  | initial => exact ⟨fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩
  | step choice continued executed ih =>
      unfold SemanticProcess.step at executed
      split at executed
      · contradiction
      · rename_i operation selected
        exact counters_trans ih (fire_counters_monotone program analysis operation _ _ analyzed scalar (List.mem_of_find?_eq_some selected) executed)
  | human command taskId patch continued ih =>
      obtain ⟨_, _, _, _, frame, _⟩ := reached_invariant program analysis commandId processId instanceId bindings _ profile analyzed committed
        (execution_reachable_trans program _ before _ reached continued)
      exact counters_frame ih (completion_preserves_issuance program analysis _ (.completeUserTaskInstance command taskId patch)
        profile analyzed frame.2.2.2.2.1 trivial)
  | effect command effectId result continued ih =>
      obtain ⟨_, _, _, _, frame, _⟩ := reached_invariant program analysis commandId processId instanceId bindings _ profile analyzed committed
        (execution_reachable_trans program _ before _ reached continued)
      exact counters_frame ih (completion_preserves_issuance program analysis _ (.completeEffect command effectId result)
        profile analyzed frame.2.2.2.2.1 trivial)

end BpmnSemantics.SemanticProcess.MixedTaskControlFlow
