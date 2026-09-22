import BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import BpmnSemantics.SemanticProcess.InternalChoiceSchedule
import BpmnSemantics.SemanticProcess.InternalTransitionPublication

/-! Bounded closure consumes explicit choices only after universally independent normalization,
under the [approved choice account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#explicit-observable-choice).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive InternalFrontierSelection where
  | ambiguous
  | scheduleFailure (failure : InternalChoiceScheduleFailure)
  | execute (offers : List InternalExecutionOffer) (remaining : InternalChoiceSchedule)
      (consumedChoice : Bool)

def selectInternalExecutionFrontier (mode : InternalSchedulingMode) (ordinal : Nat)
    (schedule : InternalChoiceSchedule) (frontier : InternalExecutionFrontier) : InternalFrontierSelection :=
  if frontier.preparationFailed then .ambiguous
  else
    match frontier.offers.mapM (·.preparation) with
    | none => match frontier.offers with
      | [offer] => .execute [offer] schedule false
      | _ => .ambiguous
    | some prepared =>
      match classifyPreparedInternalFrontier prepared with
      | some (.independentBatch members) =>
          match members.mapM (fun member => findInternalExecutionOffer? frontier member.alternative) with
          | some offers => .execute offers schedule false
          | none => .ambiguous
      | some (.observableChoice members) =>
          match mode with
          | .rejectObservableChoice => .ambiguous
          | .requireChoiceSchedule =>
              match consumeInternalChoiceDirective ordinal (members.map (·.alternative)) schedule with
              | .error failure => .scheduleFailure failure
              | .ok (selected, remaining) =>
                  match findInternalExecutionOffer? frontier selected with
                  | some offer => .execute [offer] remaining true
                  | none => .ambiguous
      | _ => .ambiguous

/-- Normalization consumes no directive. A choice consumes one exact head for the complete
canonical prepared frontier and selects exactly the alternative named by that head.
-/
theorem selectInternalExecutionFrontier_consumption (mode : InternalSchedulingMode) (ordinal : Nat)
    (schedule : InternalChoiceSchedule) (frontier : InternalExecutionFrontier)
    (offers : List InternalExecutionOffer) (remaining : InternalChoiceSchedule) (consumed : Bool)
    (selected : selectInternalExecutionFrontier mode ordinal schedule frontier =
      .execute offers remaining consumed) :
    (consumed = false ∧ remaining = schedule) ∨
      ∃ prepared members directive offer,
        frontier.offers.mapM (·.preparation) = some prepared ∧
        classifyPreparedInternalFrontier prepared = some (.observableChoice members) ∧
        schedule = directive :: remaining ∧ directive.ordinal = ordinal ∧
        directive.alternatives = members.map (·.alternative) ∧
        directive.selected ∈ members.map (·.alternative) ∧
        offers = [offer] ∧ offer.alternative = directive.selected ∧ consumed = true := by
  unfold selectInternalExecutionFrontier at selected
  split at selected
  · contradiction
  · split at selected
    · split at selected
      · cases selected
        exact .inl ⟨rfl, rfl⟩
      · contradiction
    · rename_i prepared preparedEq
      split at selected
      · split at selected
        · cases selected
          exact .inl ⟨rfl, rfl⟩
        · contradiction
      · rename_i members classified
        split at selected
        · contradiction
        · split at selected
          · contradiction
          · rename_i alternative rest consumedEq
            split at selected
            · rename_i offer found
              cases selected
              obtain ⟨directive, scheduleEq, ordinalEq, alternativesEq, selectedEq, member⟩ :=
                (consumeInternalChoiceDirective_iff _ _ _ _ _).mp consumedEq
              refine .inr ⟨prepared, members, directive, offer, preparedEq, classified,
                scheduleEq, ordinalEq, alternativesEq, ?_, rfl, ?_, rfl⟩
              · simpa only [selectedEq] using member
              · have same : offer.alternative = alternative := by
                  simpa [findInternalExecutionOffer?] using List.find?_some found
                exact same.trans selectedEq.symm
            · contradiction
      · contradiction

/-- Every prefix checks the complete fresh frontier and retains the original value-bearing artifact.
The publication is still independently projected from the actual successor.
-/
def runRevalidatedTransitionBatch? (program : Program) (instanceId commandId : SemanticId)
    (indexForOperation : OperationId → Nat) (state : RuntimeState)
    (frontier : InternalExecutionFrontier) : List PreparedInternalTransition →
    Option (RuntimeState × List InstantiatedInternalTransitionPublication)
  | [] => some (state, [])
  | head :: tail => do
      if frontier.preparationFailed then none else do
        let fresh ← findInternalExecutionOffer? frontier head.alternative
        if fresh.preparation ≠ some head then none else do
          let next ← applyPreparedInternalTransition? program state head
          let publication ← actualInternalAlternativePublication? program instanceId state next
            head.operation head.alternative commandId (indexForOperation head.operation.id)
          let (final, publications) ← runRevalidatedTransitionBatch? program instanceId commandId
            indexForOperation next (deriveInternalExecutionFrontier program next) tail
          some (final, publication :: publications)

def acceptedRevalidatedTransitionBatch? (program : Program) (instanceId commandId : SemanticId)
    (first : Nat) (state : RuntimeState) (frontier : InternalExecutionFrontier)
    (prepared : List PreparedInternalTransition) :
    Option (RuntimeState × List InstantiatedInternalTransitionPublication) := do
  let templates ← prepared.mapM (preparedTransitionPublicationTemplate? program state)
  let (final, publications) ← runRevalidatedTransitionBatch? program instanceId commandId
    (internalTransitionPublicationIndex first templates) state frontier prepared
  some (final, canonicalInstantiatedTransitionPublications publications)

/-- Revalidation adds refusal checks without changing any successful state or publication. -/
theorem runRevalidatedTransitionBatch_refines (program : Program) (instanceId commandId : SemanticId)
    (indexForOperation : OperationId → Nat) (state : RuntimeState)
    (frontier : InternalExecutionFrontier) (prepared : List PreparedInternalTransition)
    (result : RuntimeState × List InstantiatedInternalTransitionPublication)
    (accepted : runRevalidatedTransitionBatch? program instanceId commandId indexForOperation
      state frontier prepared = some result) :
    runPreparedTransitionBatchPublication? program instanceId commandId indexForOperation
      state prepared = some result := by
  induction prepared generalizing state frontier result with
  | nil => exact accepted
  | cons head tail ih =>
      simp only [runRevalidatedTransitionBatch?] at accepted
      split at accepted
      · simp at accepted
      · obtain ⟨fresh, _, accepted⟩ := Option.bind_eq_some_iff.mp accepted
        split at accepted
        · simp at accepted
        · obtain ⟨next, applied, accepted⟩ := Option.bind_eq_some_iff.mp accepted
          obtain ⟨publication, published, accepted⟩ := Option.bind_eq_some_iff.mp accepted
          obtain ⟨⟨final, publications⟩, recursed, accepted⟩ := Option.bind_eq_some_iff.mp accepted
          cases accepted
          simp only [runPreparedTransitionBatchPublication?, applied, published, bind, Option.bind]
          rw [ih _ _ _ recursed]

theorem acceptedRevalidatedTransitionBatch_refines (program : Program) (instanceId commandId : SemanticId)
    (first : Nat) (state : RuntimeState) (frontier : InternalExecutionFrontier)
    (prepared : List PreparedInternalTransition)
    (result : RuntimeState × List InstantiatedInternalTransitionPublication)
    (accepted : acceptedRevalidatedTransitionBatch? program instanceId commandId first
      state frontier prepared = some result) :
    acceptedPreparedTransitionBatch? program instanceId commandId first state prepared = some result := by
  unfold acceptedRevalidatedTransitionBatch? at accepted
  obtain ⟨templates, templated, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨⟨final, publications⟩, executed, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  cases accepted
  simp only [acceptedPreparedTransitionBatch?, templated, bind, Option.bind]
  rw [runRevalidatedTransitionBatch_refines _ _ _ _ _ _ _ _ executed]

structure InternalClosureStep where
  state : RuntimeState
  records : Option (List InternalTransitionRecord)
  lifecycles : Option (List UnnumberedFlowNodeOccurrenceDelta)

/-- Result-only singletons must not acquire publication admission: the Configured Task
pass-through mutation deliberately executes a wrong lowering without a publishable trace.
-/
private def singletonClosureStep (program : Program) (commandId : SemanticId)
    (first : Nat) (state : RuntimeState) (offer : InternalExecutionOffer) : InternalClosureStep :=
  { state := offer.successor
    records := match offer.alternative with
      | .operation _ => (internalTransitionRecord? program state offer.operation).map List.singleton
      | .mergeInput .. => (selectInternalMerge? state offer.operation offer.alternative).map
          (fun selected => [selected.record])
    lifecycles := match offer.alternative with
      | .operation _ => (flowNodeOccurrenceDeltaForOperation? program state offer.successor
          offer.operation commandId first).map List.singleton
      | .mergeInput .. => do
          let instanceId ← hostingInstanceId? state
          let publication ← actualInternalAlternativePublication? program instanceId state offer.successor
            offer.operation offer.alternative commandId first
          some [publication.lifecycle] }

private def executeSelectedFrontier? (program : Program) (commandId : SemanticId)
    (first : Nat) (state : RuntimeState) (frontier : InternalExecutionFrontier)
    (offers : List InternalExecutionOffer) : Option InternalClosureStep :=
  match offers with
  | [offer] => some (singletonClosureStep program commandId first state offer)
  | _ =>
  match offers.mapM (·.preparation) with
  | some prepared => do
      let instanceId ← hostingInstanceId? state
      let (state, publications) ← acceptedRevalidatedTransitionBatch? program instanceId commandId
        first state frontier prepared
      some { state
             records := some (publications.map (·.record))
             lifecycles := some (publications.map (·.lifecycle)) }
  | none => none

structure ScheduledClosureResult where
  state : RuntimeState
  hitBound : Bool := false
  ambiguousChoice : Bool := false
  scheduleFailure : Option InternalChoiceScheduleFailure := none
  records : Option (List InternalTransitionRecord) := none
  lifecycles : Option (List UnnumberedFlowNodeOccurrenceDelta) := none
  deriving Repr

def ScheduledClosureResult.failed (result : ScheduledClosureResult) : Bool :=
  result.hitBound || result.ambiguousChoice || result.scheduleFailure.isSome

private def prependClosureStep (step : InternalClosureStep) (closed : ScheduledClosureResult) :
    ScheduledClosureResult :=
  if closed.failed then closed
  else { closed with
    records := do pure ((← step.records) ++ (← closed.records))
    lifecycles := do pure ((← step.lifecycles) ++ (← closed.lifecycles)) }

/-- Fuel counts operations, including every member of an independent batch. Stable closure is
checked before fuel; fuel is checked before preparation ambiguity or directive inspection.
-/
def closeScheduledTraced (fuel : Nat) (program : Program) (commandId : SemanticId)
    (transitionIndex ordinal : Nat) (schedule : InternalChoiceSchedule)
    (state : RuntimeState) : ScheduledClosureResult :=
  let frontier := deriveInternalExecutionFrontier program state
  if frontier.offers.isEmpty && !frontier.preparationFailed then
    if schedule.isEmpty then { state, records := some [], lifecycles := some [] }
    else { state, scheduleFailure := some .unusedDirective }
  else match fuel with
    | 0 => { state, hitBound := true }
    | fuel + 1 =>
        match selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule frontier with
        | .ambiguous => { state, ambiguousChoice := true }
        | .scheduleFailure failure => { state, scheduleFailure := some failure }
        | .execute [] _ _ => { state, ambiguousChoice := true }
        | .execute (first :: rest) remaining consumedChoice =>
            if rest.length > fuel then { state, hitBound := true }
            else match executeSelectedFrontier? program commandId transitionIndex state frontier (first :: rest) with
              | none => { state, ambiguousChoice := true }
              | some step =>
                  prependClosureStep step (closeScheduledTraced (fuel - rest.length) program commandId
                    (transitionIndex + rest.length + 1) (ordinal + if consumedChoice then 1 else 0)
                    remaining step.state)
termination_by fuel
decreasing_by exact Nat.lt_succ_of_le (Nat.sub_le _ _)

/-- A complete execution ends on an empty schedule; every step is the actual frontier selection
and checked execution, rather than an independently chosen interleaving.
-/
inductive InternalScheduleExecution (program : Program) (commandId : SemanticId) :
    Nat → Nat → InternalChoiceSchedule → RuntimeState → RuntimeState → Nat → Prop where
  | stable (index ordinal : Nat) (state : RuntimeState)
      (stable : ((deriveInternalExecutionFrontier program state).offers.isEmpty &&
        !(deriveInternalExecutionFrontier program state).preparationFailed) = true) :
      InternalScheduleExecution program commandId index ordinal [] state state ordinal
  | step (index ordinal : Nat) (schedule remaining : InternalChoiceSchedule)
      (state : RuntimeState) (first : InternalExecutionOffer) (rest : List InternalExecutionOffer)
      (consumed : Bool) (step : InternalClosureStep) (final : RuntimeState) (finalOrdinal : Nat)
      (selected : selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
        (deriveInternalExecutionFrontier program state) = .execute (first :: rest) remaining consumed)
      (executed : executeSelectedFrontier? program commandId index state
        (deriveInternalExecutionFrontier program state) (first :: rest) = some step)
      (tail : InternalScheduleExecution program commandId (index + rest.length + 1)
        (ordinal + if consumed then 1 else 0) remaining step.state final finalOrdinal) :
      InternalScheduleExecution program commandId index ordinal schedule state final finalOrdinal

/-- Every successful bounded closure consumes all supplied directives, each once, in exact ordinal
order. The selection lemma binds each consumed head to the full canonical choice frontier.
-/
theorem closeScheduledTraced_exact_consumption (fuel : Nat) (program : Program) (commandId : SemanticId)
    (index ordinal : Nat) (schedule : InternalChoiceSchedule) (state : RuntimeState)
    (succeeded : (closeScheduledTraced fuel program commandId index ordinal schedule state).failed = false) :
    InternalScheduleExecution program commandId index ordinal schedule state
      (closeScheduledTraced fuel program commandId index ordinal schedule state).state
      (ordinal + schedule.length) := by
  induction fuel using Nat.strongRecOn generalizing index ordinal schedule state with
  | ind fuel ih =>
      generalize closedEq : closeScheduledTraced fuel program commandId index ordinal schedule state = closed
        at succeeded ⊢
      unfold closeScheduledTraced at closedEq
      dsimp only at closedEq
      split at closedEq
      · rename_i stable
        split at closedEq
        · rename_i empty
          have nil : schedule = [] := by simpa using empty
          subst schedule
          cases closedEq
          exact InternalScheduleExecution.stable index ordinal state stable
        · cases closedEq
          simp [ScheduledClosureResult.failed] at succeeded
      · cases fuel with
        | zero =>
            cases closedEq
            simp [ScheduledClosureResult.failed] at succeeded
        | succ fuel =>
            simp only at closedEq
            split at closedEq
            · cases closedEq
              simp [ScheduledClosureResult.failed] at succeeded
            · cases closedEq
              simp [ScheduledClosureResult.failed] at succeeded
            · cases closedEq
              simp [ScheduledClosureResult.failed] at succeeded
            · rename_i first rest remaining consumed selected
              split at closedEq
              · cases closedEq
                simp [ScheduledClosureResult.failed] at succeeded
              · split at closedEq
                · cases closedEq
                  simp [ScheduledClosureResult.failed] at succeeded
                · rename_i step executed
                  have tailSuccess : (closeScheduledTraced (fuel - rest.length) program commandId
                      (index + rest.length + 1) (ordinal + if consumed then 1 else 0)
                      remaining step.state).failed = false := by
                    cases failed : (closeScheduledTraced (fuel - rest.length) program commandId
                        (index + rest.length + 1) (ordinal + if consumed then 1 else 0)
                        remaining step.state).failed with
                    | false => rfl
                    | true =>
                        simp only [prependClosureStep, failed, ↓reduceIte] at closedEq
                        rw [closedEq] at failed
                        simp [succeeded] at failed
                  have tail := ih (fuel - rest.length) (Nat.lt_succ_of_le (Nat.sub_le _ _))
                    (index + rest.length + 1) (ordinal + if consumed then 1 else 0)
                    remaining step.state tailSuccess
                  have lengthEq : (ordinal + if consumed then 1 else 0) + remaining.length =
                      ordinal + schedule.length := by
                    rcases selectInternalExecutionFrontier_consumption _ _ _ _ _ _ _ selected with
                      unchanged | ⟨_, _, directive, _, _, _, scheduleEq, _, _, _, _, _, consumedEq⟩
                    · rcases unchanged with ⟨rfl, rfl⟩
                      simp
                    · rw [scheduleEq, consumedEq]
                      simp [Nat.add_comm, Nat.add_left_comm]
                  rw [lengthEq] at tail
                  simp only [prependClosureStep, tailSuccess, Bool.false_eq_true, ↓reduceIte] at closedEq
                  cases closedEq
                  exact InternalScheduleExecution.step _ _ _ _ _ _ _ _ _ _ _ selected executed tail

end BpmnSemantics.SemanticProcess.InternalCommutation
