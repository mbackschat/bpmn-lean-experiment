module

import BpmnSemantics.SemanticProcess.ParallelScopeBatchAnchorProofs
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.ParallelScopeData
public import BpmnSemantics.SemanticProcess.ParallelScopeBatchReadinessProofs
import BpmnSemantics.SemanticProcess.GraphReachabilityLaws
import BpmnSemantics.SemanticProcess.ParallelScopeCommandReplay
import BpmnSemantics.SemanticProcess.ParallelScopeReservedArmingReplay

/-! # Frozen arming preparation through raw prefixes

PMIS-SELECT-01 rechecks frozen writes after earlier reserved members.
Population and input frames below connect the actual preparer to the
certificate's token, anchor and local-frame separation without execution premises.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Raw reservation changes no population or Process/body data consulted by PMIS input evaluation. -/
theorem rawOccurrencePrefix_population_frame (state : RuntimeState) (prior : List InternalOccurrencePatch) :
    let current := prior.foldl (fun before patch => patch.apply before) state
    current.control = state.control ∧ current.scopeOccurrences = state.scopeOccurrences ∧
      current.activityOccurrences = state.activityOccurrences ∧
      current.parallelScopeControllers = state.parallelScopeControllers ∧
      current.variables.scopes = state.variables.scopes ∧ current.variables.process = state.variables.process := by
  induction prior generalizing state with
  | nil => exact ⟨rfl, rfl, rfl, rfl, rfl, rfl⟩
  | cons member rest ih =>
      have one := member.retirement_frame state
      have tail := ih (member.apply state)
      exact ⟨tail.1.trans one.1, tail.2.1.trans one.2.1, tail.2.2.1.trans one.2.2.1,
        tail.2.2.2.1.trans one.2.2.2.1, tail.2.2.2.2.1.trans one.2.2.2.2.1,
        tail.2.2.2.2.2.trans one.2.2.2.2.2⟩

/-- PMIS input evaluation reads the preserved population and Process/body frames, independently of newly inserted effect-local data. -/
theorem rawOccurrencePrefix_parallel_inputs (program : Program) (state : RuntimeState)
    (prior : List InternalOccurrencePatch) (owner : ScopeOccurrenceId) (mappings : List VariableMapping) :
    evaluateParallelScopeInputs? program (prior.foldl (fun before patch => patch.apply before) state) owner mappings =
      evaluateParallelScopeInputs? program state owner mappings := by
  let current := prior.foldl (fun before patch => patch.apply before) state
  obtain ⟨control, scopes, activities, controllers, locals, process⟩ := rawOccurrencePrefix_population_frame state prior
  have binding (entry : ParallelScopeEntry) := parallelScopeBinding_state_frame entry state current owner
    control scopes activities controllers (congrArg (fun values => values.map ScopeVariableScope.owner) locals)
  dsimp only [current] at binding
  simp only [evaluateParallelScopeInputs?, binding, process, readScopeVariable?, selectScopeVariables?, locals]

/-- The selected PMIS profile uses Process inputs outside repeated bodies, and raw patches preserve that source. -/
theorem rawOccurrencePrefix_effect_inputs (program : Program) (state : RuntimeState)
    (prior : List InternalOccurrencePatch) (owner : ScopeOccurrenceId) (mappings : List VariableMapping)
    (selected : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft") :
    evaluateEffectInputs? program (prior.foldl (fun before patch => patch.apply before) state) owner mappings =
      evaluateEffectInputs? program state owner mappings := by
  have process := (rawOccurrencePrefix_population_frame state prior).2.2.2.2.2
  have nonSequential : sequentialScopeProgramSelected program = false := by simp [sequentialScopeProgramSelected, selected]
  have notNested := nestedScopeDataProgram_of_profile_value selected
  simp only [evaluateEffectInputs?, nonSequential, notNested, Bool.false_and, Bool.false_eq_true, ↓reduceIte, process]

/-- Equal selected reads and frozen-write gates transport an actual successful reservation, rather than postulating later preparation. -/
theorem prepareReservedOccurrenceArm_read_frame (program : Program) (before after : RuntimeState)
    (candidate : InternalOperationOccurrence) (activation : Nat) (patch : InternalArmingPatch)
    (prepared : prepareReservedOccurrenceArm? program before candidate activation = some patch)
    (control : after.control = before.control) (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (time : after.logicalTimeMs = before.logicalTimeMs)
    (counts : (after.tokens.filter fun token => token.placeId == patch.input && token.owner == patch.owner).length =
      (before.tokens.filter fun token => token.placeId == patch.input && token.owner == patch.owner).length)
    (parallelInputs : ∀ mappings, evaluateParallelScopeInputs? program after candidate.owner mappings =
      evaluateParallelScopeInputs? program before candidate.owner mappings)
    (effectInputs : ∀ mappings, evaluateEffectInputs? program after candidate.owner mappings =
      evaluateEffectInputs? program before candidate.owner mappings)
    (anchor : openWaitAnchorAbsent after patch.write.occurrence = openWaitAnchorAbsent before patch.write.occurrence)
    (available : patch.write.available after = patch.write.available before)
    (activityReads : ∀ (runtime : SemanticId) (element : String) (slot : Nat),
      (after.variables.activities.any fun frame => match frame.owner with
        | .activityOccurrence id => id.processInstanceId == runtime && id.activityElementId.value == element && id.activation == slot
        | _ => false) =
      (before.variables.activities.any fun frame => match frame.owner with
        | .activityOccurrence id => id.processInstanceId == runtime && id.activityElementId.value == element && id.activation == slot
        | _ => false)) :
    prepareReservedOccurrenceArm? program after candidate activation = some patch := by
  have original := prepared
  obtain ⟨runtimeId, operation, input, running, _, _, resolved, inputEq, _, scopeProvenance, _, patchInput, patchOwner, _, _, _⟩ :=
    ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance program before candidate activation patch original
  rw [patchInput, patchOwner] at counts
  have discovery : resolveInternalOperationOccurrence? program after candidate = some operation := by
    simpa only [resolveInternalOperationOccurrence?, internalOperationOccurrences?, scopes] using resolved
  have ancestry := occurrenceOwnerRootValid_scope_frame program before after scopes
  have live : exactLiveOccurrence after candidate.owner = exactLiveOccurrence before candidate.owner := by
    simp only [exactLiveOccurrence, scopes]
  simp only [prepareReservedOccurrenceArm?, running, bind] at prepared
  obtain ⟨initialGuard, prepared⟩ := ParallelScopeReplay.reserved_guard_success _ _ _ prepared
  simp only [pure, Option.bind_some, resolved, inputEq] at prepared
  obtain ⟨origin, originEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  obtain ⟨tokenGuard, prepared⟩ := ParallelScopeReplay.reserved_guard_success _ _ _ prepared
  obtain ⟨inputOrigin, inputOriginEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  simp only [prepareReservedOccurrenceArm?, control, running, time, scopes, ancestry,
    initialGuard, pure, bind, Option.bind_some, discovery, inputEq, originEq,
    live, counts, tokenGuard, inputOriginEq, parallelInputs, effectInputs]
  cases parallel : hasParallelScopeDefinition program candidate.owner <;>
    simp only [parallel, Bool.false_eq_true, ↓reduceIte] at prepared ⊢
  all_goals try
    have nonSequential := (scopeProvenance parallel).1
    rw [nonSequential] at prepared ⊢
    simp only [Bool.false_eq_true, ↓reduceIte] at prepared ⊢
    obtain ⟨values, evaluated, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    rw [evaluated]
    simp only [Option.bind_some] at prepared ⊢
  all_goals
    cases operation <;> simp only [Option.bind_none] at prepared <;> try contradiction
    case awaitUserTask =>
      obtain ⟨finalGuard, returned⟩ := ParallelScopeReplay.reserved_guard_success _ _ _ prepared
      cases Option.some.inj returned
      simp only [anchor, available]
      split
      · rename_i refused
        apply False.elim
        apply finalGuard
        apply Eq.trans ?_ refused
        congr 1
        exact (activityReads _ _ _).symm
      · rfl
    case awaitEffect =>
      obtain ⟨arguments, evaluated, prepared⟩ := Option.bind_eq_some_iff.mp prepared
      simp only [evaluated, Option.bind_some]
      obtain ⟨finalGuard, returned⟩ := ParallelScopeReplay.reserved_guard_success _ _ _ prepared
      cases Option.some.inj returned
      simp only [anchor, available, finalGuard, Bool.false_eq_true, ↓reduceIte]

/-- Accepted complete reservation keeps each frozen Human/Service patch canonically preparable after every earlier raw member. -/
theorem preparedOccurrenceBatch_prefix_arm (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (prior rest : List InternalOccurrencePatch) (arm : InternalArmingPatch)
    (splitBatch : batch.members = prior ++ .arm arm :: rest) :
    prepareReservedOccurrenceArm? program (prior.foldl (fun before patch => patch.apply before) state)
      ⟨arm.operation.id, arm.owner⟩ arm.write.occurrence.activation = some arm := by
  have selected : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    apply Classical.byContradiction
    intro different
    simp [prepareInternalOccurrenceBatch?, different] at prepared
  obtain ⟨_, _, _, _, _, _, _, _, offers, _, trace, _⟩ :=
    prepareInternalOccurrenceBatch_certificate program state batch prepared
  have present : InternalOccurrencePatch.arm arm ∈ batch.members := by rw [splitBatch]; simp
  obtain ⟨_, initial⟩ := (trace.arm_prepared program state [] batch.members (offers.map Prod.fst) arm present).resolve_left (by simp)
  obtain ⟨control, scopes, time⟩ := rawOccurrencePrefix_token_read_frame state prior
  have separate := preparedOccurrenceBatch_prefix_anchor_separation program state batch prepared prior rest arm splitBatch
  apply prepareReservedOccurrenceArm_read_frame program state _ _ _ arm initial control scopes time
  · apply congrArg List.length
    exact preparedOccurrenceBatch_prefix_bucket program state batch prepared prior rest (.arm arm) splitBatch
      arm.owner arm.input (by simp [InternalOccurrencePatch.tokenKeys])
  · intro mappings
    exact rawOccurrencePrefix_parallel_inputs program state prior arm.owner mappings
  · intro mappings
    exact rawOccurrencePrefix_effect_inputs program state prior arm.owner mappings selected
  · exact rawOccurrencePrefix_anchor_frame state prior arm.write.occurrence separate
  · exact rawOccurrencePrefix_available_frame state prior arm.write separate
  · intro runtime element slot
    exact rawOccurrencePrefix_activity_frame state prior (fun id =>
      id.processInstanceId == runtime && id.activityElementId.value == element && id.activation == slot)

/-- Every accepted member supplies the actual predecessor revalidation evidence; Compensation absence is inherited from the scheduler. -/
theorem preparedOccurrenceBatch_prefix_step (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (wellFormed : programWellFormed program = true) (noCompensation : state.compensationHandlerEffectWaits = [])
    (prior rest : List InternalOccurrencePatch) (member : InternalOccurrencePatch)
    (splitBatch : batch.members = prior ++ member :: rest) :
    let current := prior.foldl (fun before patch => patch.apply before) state
    InternalOccurrencePatchStep program current (member.apply current) member := by
  let current := prior.foldl (fun before patch => patch.apply before) state
  cases member with
  | token patch => exact ⟨rfl, preparedOccurrenceBatch_prefix_token program state batch prepared prior rest patch splitBatch⟩
  | arm arm =>
      have armReady := preparedOccurrenceBatch_prefix_arm program state batch prepared prior rest arm splitBatch
      obtain ⟨_, positive, _, _, _⟩ := preparedOccurrenceBatch_arm_provenance program state batch prepared wellFormed prior rest arm splitBatch
      have next := preparedOccurrenceBatch_prefix_next_activation program state batch prepared prior rest arm splitBatch
      have valid := preparedOccurrenceBatch_prefix_reservation_valid program state batch prepared wellFormed noCompensation prior (.arm arm :: rest) splitBatch
      have rows := valid
      simp only [occurrenceReservationStateValid, Bool.and_eq_true] at rows
      have humanRows : occurrenceCounterRowsValid (current.activations.map fun row => (row.taskId.value, row.count)) = true := rows.1.1.1.1.1.1
      have effectRows : occurrenceCounterRowsValid (current.effectActivations.map fun row => (row.elementId.value, row.count)) = true := rows.1.1.1.1.1.2
      refine ⟨rfl, ?_, positive, armReady⟩
      generalize allocated : arm.write.occurrence.activation = activation at armReady
      obtain ⟨_, operation, _, _, _, _, _, _, _, _, declaration, _, _, shape, _, _⟩ :=
        ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance program current _ activation arm armReady
      rw [declaration]
      cases operation <;> simp only [ParallelScopeReplay.ReservedArmWriteShape] at shape <;> try contradiction
      case awaitUserTask id origin input output task declaration shape =>
        rw [shape] at next
        change (if !occurrenceCounterRowsValid (current.activations.map fun row => (row.taskId.value, row.count))
          then none else some ((((current.activations.map fun row => (row.taskId.value, row.count)).find?
            (·.1 == task.id.value)).map Prod.snd).getD 0)) = some (activation - 1)
        simp only [humanRows, Bool.not_true, Bool.false_eq_true, ↓reduceIte,
          taskActivationCount_string_lookup, Option.some.injEq]
        change activation = taskActivationCount current.activations task.id + 1 at next
        omega
      case awaitEffect id origin input output effect route declaration shape =>
        obtain ⟨arguments, _, write⟩ := shape
        rw [write] at next
        change (if !occurrenceCounterRowsValid (current.effectActivations.map fun row => (row.elementId.value, row.count))
          then none else some ((((current.effectActivations.map fun row => (row.elementId.value, row.count)).find?
            (·.1 == effect.elementId.value)).map Prod.snd).getD 0)) = some (activation - 1)
        simp only [effectRows, Bool.not_true, Bool.false_eq_true, ↓reduceIte,
          effectActivationCount_string_lookup, Option.some.injEq]
        change activation = effectActivationCount current effect.elementId + 1 at next
        omega

private theorem step_revalidated (program : Program) (state : RuntimeState) (member : InternalOccurrencePatch)
    (step : InternalOccurrencePatchStep program state (member.apply state) member) :
    occurrenceMemberRevalidated program state member = true := by
  cases member <;> simpa only [InternalOccurrencePatchStep, occurrenceMemberRevalidated,
    Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq, and_assoc, true_and] using step

private theorem reservedPrefix_ready (program : Program) (state : RuntimeState) (members : List InternalOccurrencePatch)
    (ready : ∀ prior member rest, members = prior ++ member :: rest →
      occurrenceMemberRevalidated program (prior.foldl (fun before patch => patch.apply before) state) member = true) :
    ∃ successors, applyReservedOccurrencePrefix? program state members = some successors := by
  induction members generalizing state with
  | nil => exact ⟨[], rfl⟩
  | cons member rest ih =>
      have headReady := ready [] member rest rfl
      simp only [List.foldl_nil] at headReady
      have tailReady : ∀ prior next suffix, rest = prior ++ next :: suffix →
          occurrenceMemberRevalidated program (prior.foldl (fun before patch => patch.apply before) (member.apply state)) next = true := by
        intro prior next suffix splitRest
        exact ready (member :: prior) next suffix (by simp only [List.cons_append, splitRest])
      obtain ⟨successors, applied⟩ := ih (member.apply state) tailReady
      refine ⟨member.apply state :: successors, ?_⟩
      simp only [applyReservedOccurrencePrefix?, headReady, Bool.not_true,
        Bool.false_eq_true, ↓reduceIte, applied, bind, Option.bind_some]

/-- PMIS-SELECT-01's admitted, Compensation-free preparation entails full batch application, without any prefix-success assumption. -/
theorem preparedOccurrenceBatch_applies (program : Program) (state : RuntimeState)
    (batch : InternalOccurrenceBatch) (prepared : prepareInternalOccurrenceBatch? program state = some batch)
    (wellFormed : programWellFormed program = true) (noCompensation : state.compensationHandlerEffectWaits = []) :
    ∃ successors, applyInternalOccurrenceBatch? program state batch = some successors ∧
      successors.length = batch.members.length := by
  obtain ⟨sameProgram, sameState, _⟩ := prepareInternalOccurrenceBatch_certificate program state batch prepared
  obtain ⟨successors, applied⟩ := reservedPrefix_ready program state batch.members (by
    intro prior member rest splitBatch
    exact step_revalidated program _ member
      (preparedOccurrenceBatch_prefix_step program state batch prepared wellFormed noCompensation prior rest member splitBatch))
  have batchApplied : applyInternalOccurrenceBatch? program state batch = some successors := by
    simpa only [applyInternalOccurrenceBatch?, sameProgram, sameState, prepared, bne_self_eq_false,
      Bool.false_or, Bool.false_eq_true, ↓reduceIte] using applied
  exact ⟨successors, batchApplied, (applyInternalOccurrenceBatch_steps_and_frames program state batch successors batchApplied).1⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
