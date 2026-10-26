module

import BpmnSemantics.SemanticProcess.ParallelScopeInitialEntryProofs
import BpmnSemantics.SemanticProcess.ParallelScopeBodyAccounting
import BpmnSemantics.SemanticProcess.ParallelScopeData
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.ParallelScopeProgress
import BpmnSemantics.SemanticProcess.ParallelScopeReservedArmingReplay
import BpmnSemantics.SemanticProcess.ParallelScopeRuntimeLaws
public import BpmnSemantics.SemanticProcess.InternalScheduledClosure
public import BpmnSemantics.SemanticProcess.ParallelScopeEntryReachability
import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames

/-! # Initial parallel entry through real closure draining

The closure-level consequence of the [initial entry blockers](ParallelScopeInitialEntryProofs.lean): real initial
draining retains an ingress-free body replay, so every issued child stays non-quiescent.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

private theorem patch_replay (program : Program) (before after : RuntimeState)
    (patch : InternalOccurrencePatch)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (step : InternalOccurrencePatchStep program before after patch)
    (valid : occurrenceReservationStateValid before = true) :
    ∃ record, reservedPatchTransition patch = .internalOperation record ∧
      replayInternalOperationOccurrence? program before record = some after ∧ bodyTransition (.internalOperation record) := by
  have actual : applyInternalOperationOccurrence? program before ⟨patch.operation.id, patch.owner⟩ = some after := by
    cases patch with
    | arm arm => exact arm_patch_step_application program before after arm step valid
    | token token =>
      rw [step.1]
      exact (prepareOccurrenceTokenPatch_application program before ⟨token.operation.id, token.tokens.owner⟩ token step.2).1
  obtain ⟨operation, resolved, key, replayed⟩ := applyInternalOperationOccurrence_replay_record program before after
    ⟨patch.operation.id, patch.owner⟩ profile actual
  simp only [InternalOccurrencePatch.operation, InternalOccurrencePatch.owner] at resolved key replayed
  have declared : operation = patch.operation := by
    cases patch with
    | token token =>
      have chosen := (prepareOccurrenceTokenPatch_application program before
        ⟨token.operation.id, token.tokens.owner⟩ token step.2).2.1
      rw [resolved] at chosen
      exact Option.some.inj chosen
    | arm arm =>
      obtain ⟨_, selected, _, _, _, _, chosen, _, _, _, declaration, _, _, _, _, _⟩ :=
        prepareReservedOccurrenceArm_gate_provenance program before ⟨arm.operation.id, arm.owner⟩
          arm.write.occurrence.activation arm step.2.2.2
      rw [resolved] at chosen
      exact (Option.some.inj chosen).trans declaration.symm
  subst operation
  have kind : patch.operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd] := by
    cases patch with
    | token token =>
      have kind := (prepareOccurrenceTokenPatch_application program before
        ⟨token.operation.id, token.tokens.owner⟩ token step.2).2.2
      change token.operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]
      simp only [List.mem_cons, List.not_mem_nil] at kind ⊢
      rcases kind with kind | kind | kind <;> simp [kind]
    | arm arm =>
      have kind := InternalOccurrencePatchStep.arm_activation program before after arm step
      change arm.operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]
      cases operation : arm.operation <;> simp only [operation] at kind <;>
        simp [SemanticOperation.kind] <;> contradiction
  exact ⟨_, rfl, replayed, kind⟩

private theorem ordered_batch_replay (program : Program) (members : List InternalOccurrencePatch)
    (before final : RuntimeState) (successors : List RuntimeState)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (wellFormed : programWellFormed program = true)
    (valid : occurrenceReservationStateValid before = true)
    (absent : before.compensationHandlerEffectWaits = [])
    (length : successors.length = members.length) (last : (before :: successors).getLast? = some final)
    (steps : ∀ pair ∈ members.zip ((before :: successors).zip successors),
      InternalOccurrencePatchStep program pair.2.1 pair.2.2 pair.1) :
    internalTransitions? program before (members.map reservedPatchTransition) = some final ∧
      ∀ transition ∈ members.map reservedPatchTransition, bodyTransition transition := by
  induction members generalizing before successors with
  | nil =>
    have empty : successors = [] := List.length_eq_zero_iff.mp (by simpa using length)
    subst successors
    have same : before = final := by simpa using last
    subst final
    simp [internalTransitions?]
  | cons patch rest ih =>
    cases successors with
    | nil => simp at length
    | cons next tail =>
      have step := steps (patch, before, next) (by simp)
      change InternalOccurrencePatchStep program before next patch at step
      obtain ⟨record, metadata, replayed, body⟩ := patch_replay program before next patch profile step valid
      have nextValid := reserved_patch_step_reservation_valid program before next patch wellFormed step valid absent
      have nextAbsent : next.compensationHandlerEffectWaits = [] := by
        rw [step.1]
        exact (reserved_patch_compensation_waits before patch).trans absent
      have tailSteps : ∀ pair ∈ rest.zip ((next :: tail).zip tail),
          InternalOccurrencePatchStep program pair.2.1 pair.2.2 pair.1 := by
        intro pair member
        exact steps pair (by simp only [List.zip_cons_cons, List.mem_cons]; exact Or.inr member)
      obtain ⟨tailReplay, tailBody⟩ := ih next tail nextValid nextAbsent (by simpa using length) (by simpa using last) tailSteps
      have selected : ParallelScopeStart.programSelected program = true := by simp [ParallelScopeStart.programSelected, profile]
      refine ⟨?_, ?_⟩
      · simp only [List.map_cons, metadata, internalTransitions?, internalTransition?, selected, replayed,
          ↓reduceIte, bind, Option.bind_some, tailReplay]
      · intro transition member
        simp only [List.map_cons, metadata, List.mem_cons] at member
        rcases member with rfl | member
        · exact body
        · exact tailBody transition member

private theorem replay_append (program : Program) (before middle after : RuntimeState)
    (earlier later : List CommittedTransition)
    (first : internalTransitions? program before earlier = some middle)
    (second : internalTransitions? program middle later = some after) :
    internalTransitions? program before (earlier ++ later) = some after := by
  induction earlier generalizing before with
  | nil => have same : before = middle := by simpa [internalTransitions?] using first
           simpa [same] using second
  | cons transition rest ih =>
    cases transition with
    | externalStimulus stimulus => simp [internalTransitions?] at first
    | internalOperation record =>
      simp only [internalTransitions?] at first
      obtain ⟨next, step, first⟩ := Option.bind_eq_some_iff.mp first
      simpa only [List.cons_append, internalTransitions?, step, bind, Option.bind_some] using ih next first

/-- Real initial draining retains an ingress-free body replay and every issued child
blocker through singleton and reserved-batch steps, including failed closure outcomes. -/
theorem closeScheduledTraced_initial_entry_nonquiescent (program : Program) (commandId : SemanticId)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial before issued : RuntimeState) (startId : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready) (initiated : initiateState? ready output = some initial)
    (prior : List CommittedTransition) (preceding : ContinuationCommandHistory program owner initial before prior)
    (parents : ParallelScopeParentHistory program analysis.entry parent before) (entered : enterParallelScope? analysis.entry before parent = some issued)
    (child : RuntimeScopeOccurrence) (member : child ∈ issued.scopeOccurrences) (childScope : child.id.definitionScopeId = analysis.entry.childScopeId)
    (absent : issued.compensationHandlerEffectWaits = []) (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule) :
    scopeQuiescent (closeScheduledTraced fuel program commandId index ordinal schedule issued).state child.id = false ∧
      completeParallelScope? analysis.entry (closeScheduledTraced fuel program commandId index ordinal schedule issued).state child.id = none ∧
      ∃ records, internalTransitions? program issued records =
        some (closeScheduledTraced fuel program commandId index ordinal schedule issued).state ∧
        (∀ transition ∈ records, bodyTransition transition) ∧
        (closeScheduledTraced fuel program commandId index ordinal schedule issued).state.compensationHandlerEffectWaits = [] ∧
        ∀ occurrence ∈ (closeScheduledTraced fuel program commandId index ordinal schedule issued).state.scopeOccurrences,
          occurrence.id.definitionScopeId = analysis.entry.childScopeId →
          scopeQuiescent (closeScheduledTraced fuel program commandId index ordinal schedule issued).state occurrence.id = false := by
  have selected := parallelScopeStart_selected_of_admitted program analysis admitted
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  let predicate : Nat → RuntimeState → Prop := fun _ state => ∃ records,
    internalTransitions? program issued records = some state ∧
      (∀ transition ∈ records, bodyTransition transition) ∧ state.compensationHandlerEffectWaits = []
  have initialPredicate : predicate index issued := ⟨[], rfl, by simp, absent⟩
  have retained := closeScheduledTraced_prefix_induction program commandId predicate (by
    intro position nextOrdinal nextSchedule current offers remaining consumed step invariant nonempty chosen executed
    obtain ⟨records, replayed, body, currentAbsent⟩ := invariant
    have following := body_replay_history program selected issued current records replayed body owner
    have scopes := (initialEntry_body_history_waits program selected issued current records replayed body owner).1
    have mechanics := executeSelectedFrontier_parallel_scope_steps program commandId position nextOrdinal nextSchedule current
      offers remaining consumed step profile nonempty chosen executed
    have added : ∃ added, internalTransitions? program current added = some step.state ∧
        (∀ transition ∈ added, bodyTransition transition) ∧ step.state.compensationHandlerEffectWaits = [] := by
      rcases mechanics with ⟨offer, candidate, _, _, _, applied, _⟩ | ⟨batch, successors, _, applied, _, last, _, _⟩
      · obtain ⟨operation, record, resolved, _, _, metadata, actual, phases⟩ := preceding.post_entry_occurrence_phases
          program analysis admitted owner parent instanceId values root ready initial before issued current step.state startId origin output
          startDeclared rootSelected parentIdentity started initiated prior records parents entered following candidate applied
        have ordinary : bodyTransition (.internalOperation record) := by
          rcases phases with bodyKind | ⟨rootKind, _⟩
          · rcases bodyKind with ordinary | retirement
            · exact ordinary
            · obtain ⟨entry, entryMember, completed⟩ := replayed_retirement_execution program current step.state record retirement actual
              obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis admitted
              rw [entries] at entryMember
              have same : entry = analysis.entry := List.mem_singleton.mp entryMember
              subst entry
              obtain ⟨occurrence, currentMember, identity⟩ := completeParallelScope_target_scope analysis.entry current step.state record.owner completed
              have bound := completed
              unfold completeParallelScope? at bound
              obtain ⟨binding, bound, _⟩ := Option.bind_eq_some_iff.mp bound
              obtain ⟨iteration, iterationMember, targetEq⟩ := parallelScopeBinding_member analysis.entry current record.owner binding bound
              have bodyBound := List.all_eq_true.mp (parallelScopeBinding_population analysis.entry current record.owner binding bound).2 iteration iterationMember
              rw [targetEq] at bodyBound
              unfold parallelScopeBodyBound at bodyBound
              split at bodyBound <;> try contradiction
              have definition : occurrence.id.definitionScopeId = analysis.entry.childScopeId := by
                simp only [Bool.and_eq_true, beq_iff_eq] at bodyBound
                exact identity.symm ▸ bodyBound.1.1.1
              have refused := initial_entry_retirement_refused program analysis admitted parent before issued current parents entered
                occurrence (scopes ▸ currentMember) definition records replayed body
              rw [identity] at refused
              rw [refused] at completed
              contradiction
          · exact False.elim (initialEntry_root_completion_refused program analysis admitted parent before issued current step.state
              parents entered child member childScope scopes record rootKind actual)
        exact ⟨[.internalOperation record], by simp [internalTransitions?, internalTransition?, selected, actual],
          by intro transition present; simpa using (List.mem_singleton.mp present ▸ ordinary),
          applyInternalOperationOccurrence_compensation_absent program analysis admitted current step.state candidate applied currentAbsent⟩
      · have valid : occurrenceReservationStateValid current = true := by
          cases checked : occurrenceReservationStateValid current with
          | true => rfl
          | false => simp [applyInternalOccurrenceBatch?, prepareInternalOccurrenceBatch?, checked] at applied
        obtain ⟨length, steps⟩ := applyInternalOccurrenceBatch_ordered_steps program current batch successors applied
        obtain ⟨batchReplay, batchBody⟩ := ordered_batch_replay program batch.members current step.state successors profile
          (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1 valid currentAbsent length
          (by simpa only [List.getLast?_cons, last, Option.getD_some] using (show (current :: successors).getLast? = some step.state from by simp [last])) steps
        have noCompensation := applyInternalOccurrenceBatch_prefix_induction program current batch successors
          (fun state => state.compensationHandlerEffectWaits = []) currentAbsent
          (by intro state patch member prepared absent; exact (reserved_patch_compensation_waits state patch).trans absent) applied
        have finalMember : step.state ∈ successors := List.mem_of_getLast? last
        exact ⟨_, batchReplay, batchBody, noCompensation _ finalMember⟩
    obtain ⟨added, actual, addedBody, nextAbsent⟩ := added
    exact ⟨records ++ added, replay_append program issued current step.state records added replayed actual,
      by intro transition present; rcases List.mem_append.mp present with old | new
         · exact body transition old
         · exact addedBody transition new,
      nextAbsent⟩
    ) fuel index ordinal schedule issued initialPredicate
  obtain ⟨_, _, records, replayed, body, noCompensation⟩ := retained
  refine ⟨initial_entry_body_replay_nonquiescent program analysis admitted parent before issued _ parents entered child member childScope records replayed body,
    initial_entry_retirement_refused program analysis admitted parent before issued _ parents entered child member childScope records replayed body,
    records, replayed, body, noCompensation, ?_⟩
  intro occurrence present definition
  have scopes := (initialEntry_body_history_waits program selected issued _ records replayed body owner).1
  exact initial_entry_body_replay_nonquiescent program analysis admitted parent before issued _ parents entered
    occurrence (scopes ▸ present) definition records replayed body

end BpmnSemantics.SemanticProcess
