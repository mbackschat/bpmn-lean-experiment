module

public import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeCommandReplay

/-! # Reserved arming replay of parallel scope bodies

PMIS-SELECT-01 reserved arming: token patches leave reservation validity unchanged, and revalidated reserved
arming retains its exact selection and readiness gates and matches ordinary occurrence execution. These facts
depend on no replay history, so they stay separate from the structural frames in `ParallelScopeReplayFrames`.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.ParallelScopeReplay

open BpmnSemantics

/-- Token patches change neither issuance counters nor retained wait anchors checked by PMIS-SELECT-01. -/
theorem token_patch_reservation_valid (before : RuntimeState)
    (patch : InternalCommutation.InternalOccurrenceTokenPatch) :
    InternalCommutation.occurrenceReservationStateValid
        (InternalCommutation.InternalOccurrencePatch.apply before (.token patch)) =
      InternalCommutation.occurrenceReservationStateValid before := by
  rfl

theorem reserved_guard_success {α : Type} (guard : Bool) (tail : Option α) (value : α)
    (successful : (if guard then none else tail) = some value) : (¬guard = true) ∧ tail = some value := by
  cases guard with
  | false => exact ⟨Bool.false_ne_true, successful⟩
  | true => cases successful

/-- The proof certificate retains the actual wait constructor and evaluated Service arguments. -/
def ReservedArmWriteShape (program : Program) (before : RuntimeState) (runtimeId : SemanticId)
    (owner : ScopeOccurrenceId) (activation : Nat) (operation : SemanticOperation)
    (write : InternalCommutation.InternalArmingWrite) : Prop :=
  match operation with
  | .awaitUserTask _ _ _ output task => write = .userTask {
      processInstanceId := runtimeId, owner, task, activation, output, metadata := task.metadata }
  | .awaitEffect _ _ _ output effect route => ∃ arguments,
      (if hasParallelScopeDefinition program owner then evaluateParallelScopeInputs? program before owner effect.inputMappings
        else evaluateEffectInputs? program before owner effect.inputMappings) = some arguments ∧
      write = .effect {
        processInstanceId := runtimeId, owner, elementId := effect.elementId, activation,
        descriptor := effect.descriptor, arguments, outputMappings := effect.outputMappings,
        output, bpmnErrorRoute := route } arguments
  | _ => False

/-- Actual reserved arming retains its exact selection and common readiness gates before either typed write. -/
theorem prepareReservedOccurrenceArm_gate_provenance (program : Program) (before : RuntimeState)
    (candidate : InternalCommutation.InternalOperationOccurrence) (activation : Nat)
    (patch : InternalCommutation.InternalArmingPatch)
    (prepared : InternalCommutation.prepareReservedOccurrenceArm? program before candidate activation = some patch) :
    ∃ runtimeId operation input, before.control = .running runtimeId ∧
      candidate.owner.processInstanceId = runtimeId ∧ SemanticProcessJson.isSafeWireNat activation = true ∧
      InternalCommutation.resolveInternalOperationOccurrence? program before candidate = some operation ∧
      InternalCommutation.internalArmInput? operation = some input ∧
      (before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1 ∧
      (hasParallelScopeDefinition program candidate.owner = true →
        hasSequentialScopeDefinition program candidate.owner = false ∧
          ∃ values, evaluateParallelScopeInputs? program before candidate.owner [] = some values) ∧
      patch.operation = operation ∧ patch.input = input ∧ patch.owner = candidate.owner ∧
      ReservedArmWriteShape program before runtimeId candidate.owner activation operation patch.write ∧
      InternalCommutation.openWaitAnchorAbsent before patch.write.occurrence = true ∧
      patch.write.available before = true := by
  open InternalCommutation in
    cases control : before.control <;> simp only [prepareReservedOccurrenceArm?, control, bind] at prepared <;> try contradiction
    rename_i runtimeId
    obtain ⟨initial, prepared⟩ := reserved_guard_success _ _ _ prepared
    simp only [Bool.or_eq_true, Bool.not_eq_true, bne_iff_ne, not_or] at initial
    rcases initial with ⟨⟨⟨⟨⟨⟨⟨⟨_, safe⟩, runtime⟩, _⟩, _⟩, _⟩, _⟩, _⟩, _⟩
    have runtimeEq := Classical.byContradiction runtime
    have activationSafe := congrArg Bool.not safe
    simp only [Bool.not_not, Bool.not_false] at activationSafe
    simp only [pure, Option.bind_some] at prepared
    obtain ⟨operation, resolved, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    obtain ⟨input, inputEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    obtain ⟨origin, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    obtain ⟨ready, prepared⟩ := reserved_guard_success _ _ _ prepared
    simp only [Bool.or_eq_true, Bool.not_eq_true, bne_iff_ne, not_or] at ready
    have unit := Classical.byContradiction ready.2
    try simp only [pure, Option.bind_some] at prepared
    obtain ⟨inputOrigin, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    have scopeReady : hasParallelScopeDefinition program candidate.owner = true →
        hasSequentialScopeDefinition program candidate.owner = false ∧
          ∃ values, evaluateParallelScopeInputs? program before candidate.owner [] = some values := by
      intro parallel
      rw [parallel] at prepared
      simp only [↓reduceIte] at prepared
      cases sequential : hasSequentialScopeDefinition program candidate.owner with
      | true =>
          simp only [sequential, ↓reduceIte, Option.bind_none] at prepared
          cases prepared
      | false =>
          simp only [sequential, Bool.false_eq_true, ↓reduceIte] at prepared
          obtain ⟨values, evaluated, _⟩ := Option.bind_eq_some_iff.mp prepared
          exact ⟨rfl, values, evaluated⟩
    cases parallel : hasParallelScopeDefinition program candidate.owner <;>
      simp only [parallel, Bool.false_eq_true, ↓reduceIte] at prepared
    all_goals try
      have nonSequential := (scopeReady parallel).1
      rw [nonSequential] at prepared
      simp only [Bool.false_eq_true, ↓reduceIte] at prepared
      obtain ⟨_, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
      try simp only [pure, Option.bind_some] at prepared
    all_goals
      cases operation <;> simp only [Option.bind_none] at prepared <;> try contradiction
      case awaitUserTask =>
        obtain ⟨guard, returned⟩ := reserved_guard_success _ _ _ prepared
        have checks := Bool.eq_false_iff.mpr guard
        simp only [Bool.or_eq_false_iff] at checks
        cases Option.some.inj returned
        refine ⟨runtimeId, _, input, rfl, runtimeEq, activationSafe, resolved, inputEq, unit,
          ?_, rfl, rfl, rfl, ?_, ?_, ?_⟩
        · simpa only [parallel] using scopeReady
        · rfl
        · simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not checks.1.1.2
        · simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not checks.1.2
      case awaitEffect =>
        obtain ⟨arguments, evaluated, returned⟩ := Option.bind_eq_some_iff.mp prepared
        obtain ⟨guard, returned⟩ := reserved_guard_success _ _ _ returned
        have checks := Bool.eq_false_iff.mpr guard
        simp only [Bool.or_eq_false_iff] at checks
        cases Option.some.inj returned
        refine ⟨runtimeId, _, input, rfl, runtimeEq, activationSafe, resolved, inputEq, unit,
          ?_, rfl, rfl, rfl, ⟨arguments, ?_, rfl⟩, ?_, ?_⟩
        · simpa only [parallel] using scopeReady
        · simpa only [parallel, Bool.false_eq_true, ↓reduceIte] using evaluated
        · simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not checks.1.1.2
        · simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not checks.1.2

/-- Revalidated reserved arming matches ordinary occurrence execution under predecessor reservation validity. -/
theorem arm_patch_step_application (program : Program) (before after : RuntimeState)
    (arm : InternalCommutation.InternalArmingPatch)
    (step : InternalCommutation.InternalOccurrencePatchStep program before after (.arm arm))
    (validState : InternalCommutation.occurrenceReservationStateValid before = true) :
    InternalCommutation.applyInternalOperationOccurrence? program before ⟨arm.operation.id, arm.owner⟩ = some after := by
  open InternalCommutation in
    have next := InternalOccurrencePatchStep.arm_activation program before after arm step
    rcases step with ⟨rfl, _, _, prepared⟩
    generalize allocated : arm.write.occurrence.activation = activation at prepared next
    obtain ⟨runtimeId, operation, input, control, runtimeEq, safe, resolved, inputEq, unit,
      scopeReady, declaration, patchInput, _, shape, _, _⟩ := prepareReservedOccurrenceArm_gate_provenance
        program before ⟨arm.operation.id, arm.owner⟩ activation arm prepared
    rw [declaration] at next
    rw [← runtimeEq] at shape
    have noOverlap : (hasParallelScopeDefinition program arm.owner && hasSequentialScopeDefinition program arm.owner) = false := by
      cases parallel : hasParallelScopeDefinition program arm.owner with
      | false => rfl
      | true => rw [(scopeReady parallel).1]; rfl
    simp only [InternalOccurrencePatch.apply, applyInternalOperationOccurrence?, control, resolved, bind, Option.bind_some]
    cases operation <;> simp only [ReservedArmWriteShape] at shape <;> try contradiction
    case awaitUserTask id origin declaredInput output task =>
      simp only [internalArmInput?, Option.some.injEq] at inputEq
      rw [← inputEq] at unit patchInput
      have safeNext : SemanticProcessJson.isSafeWireNat (activationCount before task.id + 1) = true := by rw [← next]; exact safe
      simp only [unit, beq_self_eq_true, Bool.not_true, validState, safeNext, noOverlap, Bool.false_or, Bool.false_eq_true, ↓reduceIte]
      cases parallel : hasParallelScopeDefinition program arm.owner with
      | false =>
          simp only [Bool.false_eq_true, ↓reduceIte, pure, Option.bind_some,
            activateUserTask, applyInternalArmingPatch, patchInput, shape, next]
      | true =>
          obtain ⟨_, values, evaluated⟩ := scopeReady parallel
          simp only [↓reduceIte, evaluated, Option.bind_some, pure,
            activateUserTask, applyInternalArmingPatch, patchInput, shape, next]
    case awaitEffect id origin declaredInput output effect route =>
      simp only [internalArmInput?, Option.some.injEq] at inputEq
      rw [← inputEq] at unit patchInput
      obtain ⟨arguments, evaluated, write⟩ := shape
      have safeNext : SemanticProcessJson.isSafeWireNat (effectActivationCount before effect.elementId + 1) = true := by rw [← next]; exact safe
      simp only [unit, beq_self_eq_true, Bool.not_true, validState, safeNext, noOverlap,
        Bool.false_or, Bool.false_eq_true, ↓reduceIte]
      cases parallel : hasParallelScopeDefinition program arm.owner <;>
        simp only [parallel, Bool.false_eq_true, ↓reduceIte] at evaluated ⊢ <;>
        simp only [evaluated, Option.bind_some, activateEffect, applyInternalArmingPatch,
          patchInput, write, next, addActivityVariableScope, effectWaitOccurrence]

end BpmnSemantics.SemanticProcess.ParallelScopeReplay
