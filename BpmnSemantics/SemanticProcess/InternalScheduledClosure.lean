import BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import BpmnSemantics.SemanticProcess.InternalChoiceSchedule
import BpmnSemantics.SemanticProcess.InternalTransitionPublication
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessFlowNodeOccurrence

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
  else if frontier.occurrenceBatch.isSome then .execute frontier.offers schedule false
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

/-- A singleton uses no scheduling directive when its preparation names that same discovered alternative. -/
theorem selectInternalExecutionFrontier_singleton (mode : InternalSchedulingMode) (ordinal : Nat)
    (schedule : InternalChoiceSchedule) (offer : InternalExecutionOffer)
    (aligned : ∀ prepared, offer.preparation = some prepared → prepared.alternative = offer.alternative) :
    selectInternalExecutionFrontier mode ordinal schedule { offers := [offer] } =
      .execute [offer] schedule false := by
  cases preparation : offer.preparation with
  | none => simp [selectInternalExecutionFrontier, preparation, List.mapM_cons, List.mapM_nil]
  | some prepared =>
    simp [selectInternalExecutionFrontier, preparation, List.mapM_cons, List.mapM_nil,
      classifyPreparedInternalFrontier, sortBy, sortInsertBy, normalizingInternalPrepared,
      findInternalExecutionOffer?, aligned prepared preparation]

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
    · cases selected
      exact .inl ⟨rfl, rfl⟩
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

/-- PMIS-SELECT-01 publishes a singleton only after exact-owner replay and lifecycle acceptance. -/
def singletonOccurrencePublication? (program : Program) (commandId : SemanticId)
    (first : Nat) (state : RuntimeState) (offer : InternalExecutionOffer) (owner : ScopeOccurrenceId) :
    Option (InternalTransitionRecord × UnnumberedFlowNodeOccurrenceDelta) := do
  if !programWellFormed program || !SemanticProcessJson.isSafeWireNat state.logicalTimeMs then none else pure ()
  let record : InternalTransitionRecord := {
    operationId := offer.operation.id
    operationKind := offer.operation.kind
    origin := offer.operation.origin
    owner := owner }
  if replayInternalOperationOccurrence? program state record != some offer.successor then none else pure ()
  let instanceId ← hostingInstanceId? state
  let _ ← controlPositionDelta? program instanceId state offer.successor
  let candidate ← candidateFlowNodeOccurrenceDeltaForOwnedOperation? program state offer.successor
    offer.operation owner commandId first
  let lifecycle ← acceptFlowNodeOccurrenceCandidate? program state offer.successor candidate
  pure (record, lifecycle)

/-- Result-only singletons must not acquire publication admission: the Configured Task
pass-through mutation deliberately executes a wrong lowering without a publishable trace.
-/
private def singletonClosureStep (program : Program) (commandId : SemanticId)
    (first : Nat) (state : RuntimeState) (offer : InternalExecutionOffer) : InternalClosureStep :=
  let occurrence := match offer.alternative with
    | .operationOccurrence _ owner => singletonOccurrencePublication? program commandId first state offer owner
    | _ => none
  { state := offer.successor
    records := match offer.alternative with
      | .operationOccurrence .. => occurrence.map (fun publication => [publication.1])
      | .operation _ => (internalTransitionRecord? program state offer.operation).map List.singleton
      | .mergeInput .. => (selectInternalMerge? state offer.operation offer.alternative).map
          (fun selected => [selected.record])
    lifecycles := match offer.alternative with
      | .operationOccurrence .. => occurrence.map (fun publication => [publication.2])
      | .operation _ => (flowNodeOccurrenceDeltaForOperationWithMessageHandler? program state offer.successor
          offer.operation commandId first).map List.singleton
      | .mergeInput .. => do
          let instanceId ← hostingInstanceId? state
          let publication ← actualInternalAlternativePublication? program instanceId state offer.successor
            offer.operation offer.alternative commandId first
          some [publication.lifecycle] }

private def acceptOccurrencePublicationPrefixes? (program : Program) (state : RuntimeState) :
    List InstantiatedInternalTransitionPublication → List RuntimeState → Option Unit
  | [], [] => some ()
  | publication :: rest, next :: successors => do
      if replayInternalOperationOccurrence? program state publication.record != some next then none else pure ()
      let instanceId ← hostingInstanceId? state
      let position ← controlPositionDelta? program instanceId state next
      let lifecycle ← acceptFlowNodeOccurrenceCandidate? program state next publication.lifecycle
      if publication.logicalTimeMs != state.logicalTimeMs ||
          publication.positionDelta != position || publication.lifecycle != lifecycle then none
      else acceptOccurrencePublicationPrefixes? program next rest successors
  | _, _ => none

private def occurrenceBatchPublications? (program : Program) (commandId : SemanticId)
    (first : Nat) (state : RuntimeState) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState) : Option (List InstantiatedInternalTransitionPublication) := do
  if !programWellFormed program then none else pure ()
  let templates ← batch.members.mapM fun member => match member with
    | .arm patch => internalArmingPublicationTemplate? program state patch.operation patch
    | .token patch => do
        let owner := patch.tokens.owner
        let identity ← candidateOperationFlowNodeIdentity? program patch.operation owner owner patch.operation.origin.elementId
        let delta ← internalLocalControlPositionDelta? program patch.tokens
        pure ({
          record := {
            operationId := patch.operation.id
            operationKind := patch.operation.kind
            origin := patch.operation.origin
            owner := owner }
          logicalTimeMs := state.logicalTimeMs
          positionDelta := delta
          lifecycle := .instantaneous identity } : InternalTransitionPublicationTemplate)
  -- The reservation certificate already orders complete operation/owner identities (PMIS-SELECT-01).
  let publications := numberTransitionPublicationTemplates commandId first templates
  acceptOccurrencePublicationPrefixes? program state publications successors
  pure publications

/-- Execute the selected offers using the scheduler's actual singleton, reservation or revalidated-batch path. The cursor induction exposes this operation so preservation proofs can retain exact execution provenance. -/
def executeSelectedFrontier? (program : Program) (commandId : SemanticId)
    (first : Nat) (state : RuntimeState) (frontier : InternalExecutionFrontier)
    (offers : List InternalExecutionOffer) : Option InternalClosureStep :=
  match frontier.occurrenceBatch with
  | some batch => do
      let alternatives := batch.members.map fun patch =>
        InternalAlternative.operationOccurrence patch.operation.id patch.owner
      if offers.map (·.alternative) != alternatives then none else pure ()
      let successors ← applyInternalOccurrenceBatch? program state batch
      let final ← successors.getLast?
      let publications := occurrenceBatchPublications? program commandId first state batch successors
      pure {
        state := final
        records := publications.map (List.map (·.record))
        lifecycles := publications.map (List.map (·.lifecycle)) }
  | none =>
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

/-- A selected reservation reaches its last successor once identities align and the complete batch applies; absent publication remains a separate result. -/
theorem executeSelectedFrontier_reserved_batch_ready (program : Program) (commandId : SemanticId)
    (first : Nat) (state : RuntimeState) (frontier : InternalExecutionFrontier)
    (offers : List InternalExecutionOffer) (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (reserved : frontier.occurrenceBatch = some batch)
    (aligned : offers.map (·.alternative) = batch.members.map (fun patch =>
      InternalAlternative.operationOccurrence patch.operation.id patch.owner))
    (applied : applyInternalOccurrenceBatch? program state batch = some successors)
    (nonempty : successors ≠ []) :
    ∃ step, executeSelectedFrontier? program commandId first state frontier offers = some step ∧
      step.state = successors.getLast nonempty := by
  refine ⟨{
    state := successors.getLast nonempty
    records := (occurrenceBatchPublications? program commandId first state batch successors).map (List.map (·.record))
    lifecycles := (occurrenceBatchPublications? program commandId first state batch successors).map (List.map (·.lifecycle)) }, ?_, rfl⟩
  simp only [executeSelectedFrontier?, reserved, aligned, bne_self_eq_false, Bool.false_eq_true,
    ↓reduceIte, applied, List.getLast?_eq_some_getLast nonempty, bind, Option.bind_some, pure]

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

private theorem prependClosureStep_projections (step : InternalClosureStep) (closed : ScheduledClosureResult) :
    (prependClosureStep step closed).state = closed.state ∧
    (prependClosureStep step closed).failed = closed.failed := by
  unfold prependClosureStep
  split <;> simp [ScheduledClosureResult.failed]

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

/-- Stability is accepted before fuel is inspected, including at the exact zero-fuel boundary. -/
theorem closeScheduledTraced_stable (fuel : Nat) (program : Program) (commandId : SemanticId)
    (index ordinal : Nat) (state : RuntimeState)
    (frontier : deriveInternalExecutionFrontier program state = {}) :
    closeScheduledTraced fuel program commandId index ordinal [] state =
      { state, records := some [], lifecycles := some [] } := by
  unfold closeScheduledTraced
  simp [frontier]

/-- An executed nonempty selection consumes one fuel unit per member; optional publication cannot change the recursive state or failure verdict. -/
theorem closeScheduledTraced_selected_step (fuel : Nat) (program : Program) (commandId : SemanticId)
    (index ordinal : Nat) (schedule remaining : InternalChoiceSchedule) (state : RuntimeState)
    (first : InternalExecutionOffer) (rest : List InternalExecutionOffer) (consumed : Bool)
    (step : InternalClosureStep)
    (nonempty : (deriveInternalExecutionFrontier program state).offers.isEmpty = false)
    (selected : selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program state) = .execute (first :: rest) remaining consumed)
    (enough : rest.length ≤ fuel)
    (executed : executeSelectedFrontier? program commandId index state
      (deriveInternalExecutionFrontier program state) (first :: rest) = some step) :
    (closeScheduledTraced (fuel + 1) program commandId index ordinal schedule state).state =
      (closeScheduledTraced (fuel - rest.length) program commandId (index + rest.length + 1)
        (ordinal + if consumed then 1 else 0) remaining step.state).state ∧
    (closeScheduledTraced (fuel + 1) program commandId index ordinal schedule state).failed =
      (closeScheduledTraced (fuel - rest.length) program commandId (index + rest.length + 1)
        (ordinal + if consumed then 1 else 0) remaining step.state).failed := by
  rw [closeScheduledTraced]
  simp only [nonempty, Bool.false_and, Bool.false_eq_true, ↓reduceIte, selected,
    Nat.not_lt.mpr enough, executed]
  generalize closeScheduledTraced (fuel - rest.length) program commandId (index + rest.length + 1)
    (ordinal + if consumed then 1 else 0) remaining step.state = closed
  unfold prependClosureStep
  split <;> simp [ScheduledClosureResult.failed]

/-- Singleton execution preserves the recursive closure's result state and failure verdict, independently of optional publication output. -/
theorem closeScheduledTraced_singleton_step (fuel : Nat) (program : Program) (commandId : SemanticId)
    (index ordinal : Nat) (state : RuntimeState) (offer : InternalExecutionOffer)
    (frontier : deriveInternalExecutionFrontier program state = { offers := [offer] })
    (aligned : ∀ prepared, offer.preparation = some prepared → prepared.alternative = offer.alternative) :
    (closeScheduledTraced (fuel + 1) program commandId index ordinal [] state).state =
      (closeScheduledTraced fuel program commandId (index + 1) ordinal [] offer.successor).state ∧
    (closeScheduledTraced (fuel + 1) program commandId index ordinal [] state).failed =
      (closeScheduledTraced fuel program commandId (index + 1) ordinal [] offer.successor).failed := by
  rw [closeScheduledTraced]
  simp only [frontier, List.isEmpty_cons, Bool.false_and, Bool.false_eq_true, ↓reduceIte]
  rw [selectInternalExecutionFrontier_singleton _ _ _ offer aligned]
  simp only [List.length_nil, Nat.not_lt_zero, ↓reduceIte, executeSelectedFrontier?, Nat.sub_zero,
    singletonClosureStep, Nat.add_zero, Bool.false_eq_true]
  unfold prependClosureStep
  split <;> simp [ScheduledClosureResult.failed]

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

/-- The schedule relation ends only at a complete stable frontier, including refusal checks. -/
theorem InternalScheduleExecution.final_stable
    {program : Program} {commandId : SemanticId} {index ordinal finalOrdinal : Nat}
    {schedule : InternalChoiceSchedule} {before after : RuntimeState}
    (execution : InternalScheduleExecution program commandId index ordinal schedule before after finalOrdinal) :
    ((deriveInternalExecutionFrontier program after).offers.isEmpty &&
      !(deriveInternalExecutionFrontier program after).preparationFailed) = true := by
  induction execution with
  | stable _ _ _ stable => exact stable
  | step _ _ _ _ _ _ _ _ _ _ _ _ _ _ ih => exact ih

/-- Successful actual closure supplies the stable-frontier premise needed by reachable-state laws. -/
theorem closeScheduledTraced_success_stable (fuel : Nat) (program : Program) (commandId : SemanticId)
    (index ordinal : Nat) (schedule : InternalChoiceSchedule) (state : RuntimeState)
    (succeeded : (closeScheduledTraced fuel program commandId index ordinal schedule state).failed = false) :
    let after := (closeScheduledTraced fuel program commandId index ordinal schedule state).state
    ((deriveInternalExecutionFrontier program after).offers.isEmpty &&
      !(deriveInternalExecutionFrontier program after).preparationFailed) = true := by
  exact (closeScheduledTraced_exact_consumption fuel program commandId index ordinal schedule state
    succeeded).final_stable

/-- An actual recursive-call prefix retains the exact fuel and choice cursor. Refused selections
and insufficient fuel cannot extend it, even when optional publication records are absent.
-/
inductive ScheduledClosurePrefix (program : Program) (commandId : SemanticId)
    (initialFuel initialIndex initialOrdinal : Nat) (initialSchedule : InternalChoiceSchedule)
    (initialState : RuntimeState) : Nat → Nat → Nat → InternalChoiceSchedule → RuntimeState → Prop where
  | initial : ScheduledClosurePrefix program commandId initialFuel initialIndex initialOrdinal
      initialSchedule initialState initialFuel initialIndex initialOrdinal initialSchedule initialState
  | step {fuel index ordinal : Nat} {schedule remaining : InternalChoiceSchedule}
      {state : RuntimeState} {first : InternalExecutionOffer} {rest : List InternalExecutionOffer}
      {consumed : Bool} {next : InternalClosureStep}
      (earlier : ScheduledClosurePrefix program commandId initialFuel initialIndex initialOrdinal
        initialSchedule initialState (fuel + 1) index ordinal schedule state)
      (unstable : ¬ ((deriveInternalExecutionFrontier program state).offers.isEmpty &&
        !(deriveInternalExecutionFrontier program state).preparationFailed) = true)
      (selected : selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
        (deriveInternalExecutionFrontier program state) = .execute (first :: rest) remaining consumed)
      (enough : rest.length ≤ fuel)
      (executed : executeSelectedFrontier? program commandId index state
        (deriveInternalExecutionFrontier program state) (first :: rest) = some next) :
      ScheduledClosurePrefix program commandId initialFuel initialIndex initialOrdinal initialSchedule initialState
        (fuel - rest.length) (index + rest.length + 1) (ordinal + if consumed then 1 else 0) remaining next.state

theorem ScheduledClosurePrefix.trans
    {program : Program} {commandId : SemanticId} {f₀ i₀ o₀ f₁ i₁ o₁ f₂ i₂ o₂ : Nat}
    {q₀ q₁ q₂ : InternalChoiceSchedule} {s₀ s₁ s₂ : RuntimeState}
    (earlier : ScheduledClosurePrefix program commandId f₀ i₀ o₀ q₀ s₀ f₁ i₁ o₁ q₁ s₁)
    (later : ScheduledClosurePrefix program commandId f₁ i₁ o₁ q₁ s₁ f₂ i₂ o₂ q₂ s₂) :
    ScheduledClosurePrefix program commandId f₀ i₀ o₀ q₀ s₀ f₂ i₂ o₂ q₂ s₂ := by
  induction later with
  | initial => exact earlier
  | step _ unstable selected enough executed ih => exact .step ih unstable selected enough executed

theorem ScheduledClosurePrefix.budget
    {program : Program} {commandId : SemanticId} {f₀ i₀ o₀ fuel index ordinal : Nat}
    {q₀ schedule : InternalChoiceSchedule} {s₀ state : RuntimeState}
    (path : ScheduledClosurePrefix program commandId f₀ i₀ o₀ q₀ s₀ fuel index ordinal schedule state) :
    fuel ≤ f₀ ∧ index = i₀ + (f₀ - fuel) := by
  induction path with
  | initial => simp
  | step _ _ _ enough _ ih => omega

/-- A retained prefix identifies the same final state and failure verdict as its actual suffix;
publication concatenation does not affect either projection (`prependClosureStep`).
-/
theorem ScheduledClosurePrefix.continuation
    {program : Program} {commandId : SemanticId} {f₀ i₀ o₀ fuel index ordinal : Nat}
    {q₀ schedule : InternalChoiceSchedule} {s₀ state : RuntimeState}
    (path : ScheduledClosurePrefix program commandId f₀ i₀ o₀ q₀ s₀ fuel index ordinal schedule state) :
    (closeScheduledTraced f₀ program commandId i₀ o₀ q₀ s₀).state =
      (closeScheduledTraced fuel program commandId index ordinal schedule state).state ∧
    (closeScheduledTraced f₀ program commandId i₀ o₀ q₀ s₀).failed =
      (closeScheduledTraced fuel program commandId index ordinal schedule state).failed := by
  induction path with
  | initial => exact ⟨rfl, rfl⟩
  | step _ unstable selected enough executed ih =>
      rw [ih.1, ih.2]
      rw [closeScheduledTraced]
      simp only [unstable, ↓reduceIte, selected, Nat.not_lt.mpr enough, executed]
      exact prependClosureStep_projections _ _

/-- Induction follows the evaluator's actual fuel-checked recursive calls, including failing
closures whose executed prefix has no published records.
-/
theorem closeScheduledTraced_cursor_induction (program : Program) (commandId : SemanticId)
    (predicate : Nat → Nat → Nat → InternalChoiceSchedule → RuntimeState → Prop)
    (advance : ∀ fuel index ordinal schedule state first rest remaining consumed step,
      predicate (fuel + 1) index ordinal schedule state →
      (¬ ((deriveInternalExecutionFrontier program state).offers.isEmpty &&
        !(deriveInternalExecutionFrontier program state).preparationFailed) = true) →
      selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
        (deriveInternalExecutionFrontier program state) = .execute (first :: rest) remaining consumed →
      rest.length ≤ fuel →
      executeSelectedFrontier? program commandId index state
        (deriveInternalExecutionFrontier program state) (first :: rest) = some step →
      predicate (fuel - rest.length) (index + rest.length + 1)
        (ordinal + if consumed then 1 else 0) remaining step.state)
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule) (state : RuntimeState)
    (initial : predicate fuel index ordinal schedule state) :
    ∃ remainingFuel nextIndex nextOrdinal nextSchedule,
      ScheduledClosurePrefix program commandId fuel index ordinal schedule state
        remainingFuel nextIndex nextOrdinal nextSchedule
        (closeScheduledTraced fuel program commandId index ordinal schedule state).state ∧
      predicate remainingFuel nextIndex nextOrdinal nextSchedule
        (closeScheduledTraced fuel program commandId index ordinal schedule state).state := by
  induction fuel using Nat.strongRecOn generalizing index ordinal schedule state with
  | ind fuel ih =>
      generalize closedEq : closeScheduledTraced fuel program commandId index ordinal schedule state = closed
      unfold closeScheduledTraced at closedEq
      dsimp only at closedEq
      split at closedEq
      · split at closedEq <;> cases closedEq <;> exact ⟨_, _, _, _, .initial, initial⟩
      · rename_i unstable
        cases fuel with
        | zero => cases closedEq; exact ⟨_, _, _, _, .initial, initial⟩
        | succ fuel =>
            simp only at closedEq
            split at closedEq
            · cases closedEq; exact ⟨_, _, _, _, .initial, initial⟩
            · cases closedEq; exact ⟨_, _, _, _, .initial, initial⟩
            · cases closedEq; exact ⟨_, _, _, _, .initial, initial⟩
            · rename_i first rest remaining consumed selected
              split at closedEq
              · cases closedEq; exact ⟨_, _, _, _, .initial, initial⟩
              · rename_i enough
                split at closedEq
                · cases closedEq; exact ⟨_, _, _, _, .initial, initial⟩
                · rename_i step executed
                  have next := advance fuel index ordinal schedule state first rest remaining consumed step
                    initial unstable selected (Nat.le_of_not_gt enough) executed
                  obtain ⟨remainingFuel, nextIndex, nextOrdinal, nextSchedule, path, preserved⟩ := ih (fuel - rest.length)
                    (Nat.lt_succ_of_le (Nat.sub_le _ _)) (index + rest.length + 1)
                    (ordinal + if consumed then 1 else 0) remaining step.state next
                  have endpoint : closed.state = (closeScheduledTraced (fuel - rest.length) program commandId
                      (index + rest.length + 1) (ordinal + if consumed then 1 else 0) remaining step.state).state := by
                    rw [← closedEq]
                    exact (prependClosureStep_projections _ _).1
                  rw [endpoint]
                  exact ⟨remainingFuel, nextIndex, nextOrdinal, nextSchedule,
                    (ScheduledClosurePrefix.step .initial unstable selected (Nat.le_of_not_gt enough) executed).trans path, preserved⟩

/-- Fuel refusal identifies the actual stopped cursor, including whole-batch overflow.
The witness survives missing publication and does not assume successful closure. -/
theorem closeScheduledTraced_hitBound_cursor (program : Program) (commandId : SemanticId)
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule) (state : RuntimeState)
    (hit : (closeScheduledTraced fuel program commandId index ordinal schedule state).hitBound = true) :
    ∃ remainingFuel nextIndex nextOrdinal nextSchedule,
      let final := (closeScheduledTraced fuel program commandId index ordinal schedule state).state
      ScheduledClosurePrefix program commandId fuel index ordinal schedule state
        remainingFuel nextIndex nextOrdinal nextSchedule final ∧
      (¬ ((deriveInternalExecutionFrontier program final).offers.isEmpty &&
        !(deriveInternalExecutionFrontier program final).preparationFailed) = true) ∧
      (remainingFuel = 0 ∨ ∃ offers remaining consumed,
        selectInternalExecutionFrontier program.internalSchedulingMode nextOrdinal nextSchedule
          (deriveInternalExecutionFrontier program final) = .execute offers remaining consumed ∧
        remainingFuel < offers.length) := by
  induction fuel using Nat.strongRecOn generalizing index ordinal schedule state with
  | ind fuel ih =>
      generalize closedEq : closeScheduledTraced fuel program commandId index ordinal schedule state = closed at hit ⊢
      unfold closeScheduledTraced at closedEq
      dsimp only at closedEq
      split at closedEq
      · split at closedEq <;> cases closedEq <;> contradiction
      · rename_i unstable
        cases fuel with
        | zero => cases closedEq; exact ⟨0, index, ordinal, schedule, .initial, unstable, Or.inl rfl⟩
        | succ fuel =>
            simp only at closedEq
            split at closedEq
            · cases closedEq; contradiction
            · cases closedEq; contradiction
            · cases closedEq; contradiction
            · rename_i first rest remaining consumed selected
              split at closedEq
              · rename_i overflow
                cases closedEq
                exact ⟨fuel + 1, index, ordinal, schedule, .initial, unstable,
                  Or.inr ⟨first :: rest, remaining, consumed, selected, by simp only [List.length_cons]; omega⟩⟩
              · rename_i enough
                split at closedEq
                · cases closedEq; contradiction
                · rename_i step executed
                  have suffixHit : (closeScheduledTraced (fuel - rest.length) program commandId
                      (index + rest.length + 1) (ordinal + if consumed then 1 else 0) remaining step.state).hitBound = true := by
                    have preserved (suffix : ScheduledClosureResult) :
                        (prependClosureStep step suffix).hitBound = suffix.hitBound := by
                      unfold prependClosureStep
                      split <;> rfl
                    rw [← closedEq] at hit
                    exact (preserved _).symm.trans hit
                  obtain ⟨remainingFuel, nextIndex, nextOrdinal, nextSchedule, path, stopped, deficit⟩ :=
                    ih (fuel - rest.length) (Nat.lt_succ_of_le (Nat.sub_le _ _))
                      (index + rest.length + 1) (ordinal + if consumed then 1 else 0) remaining step.state suffixHit
                  have endpoint := (prependClosureStep_projections step
                    (closeScheduledTraced (fuel - rest.length) program commandId
                      (index + rest.length + 1) (ordinal + if consumed then 1 else 0) remaining step.state)).1
                  rw [closedEq] at endpoint
                  rw [endpoint]
                  exact ⟨remainingFuel, nextIndex, nextOrdinal, nextSchedule,
                    (ScheduledClosurePrefix.step .initial unstable selected (Nat.le_of_not_gt enough) executed).trans path,
                    stopped, deficit⟩

/-- The index-only accounting interface derives spent fuel from the exact recursive-call prefix. -/
theorem closeScheduledTraced_prefix_induction (program : Program) (commandId : SemanticId)
    (predicate : Nat → RuntimeState → Prop)
    (advance : ∀ index ordinal schedule state offers remaining consumed step,
      predicate index state → offers ≠ [] →
      selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
        (deriveInternalExecutionFrontier program state) = .execute offers remaining consumed →
      executeSelectedFrontier? program commandId index state
        (deriveInternalExecutionFrontier program state) offers = some step →
      predicate (index + offers.length) step.state)
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule) (state : RuntimeState)
    (initial : predicate index state) :
    ∃ spent ≤ fuel, predicate (index + spent)
      (closeScheduledTraced fuel program commandId index ordinal schedule state).state := by
  obtain ⟨remainingFuel, nextIndex, _, _, path, preserved⟩ := closeScheduledTraced_cursor_induction program commandId
    (fun _ position _ _ current => predicate position current) (by
      intro _ position nextOrdinal nextSchedule before first rest remaining consumed step earlier _ selected _ executed
      simpa only [List.length_cons, Nat.add_assoc] using
        advance position nextOrdinal nextSchedule before (first :: rest) remaining consumed step earlier (by simp) selected executed)
    fuel index ordinal schedule state initial
  exact ⟨fuel - remainingFuel, Nat.sub_le _ _, path.budget.2 ▸ preserved⟩

/-- Selected PMIS execution exposes actual singleton or ordered reserved-batch steps even when publication is absent. -/
theorem executeSelectedFrontier_parallel_scope_steps (program : Program) (commandId : SemanticId)
    (index ordinal : Nat) (schedule : InternalChoiceSchedule) (state : RuntimeState)
    (offers : List InternalExecutionOffer) (remaining : InternalChoiceSchedule) (consumed : Bool)
    (step : InternalClosureStep)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (nonempty : offers ≠ [])
    (selected : selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program state) = .execute offers remaining consumed)
    (executed : executeSelectedFrontier? program commandId index state
      (deriveInternalExecutionFrontier program state) offers = some step) :
    (∃ offer candidate, offers = [offer] ∧ offers.length = 1 ∧
      offer.alternative = .operationOccurrence candidate.operationId candidate.owner ∧
      applyInternalOperationOccurrence? program state candidate = some step.state ∧ offer.preparation = none) ∨
    (∃ batch successors,
      (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch ∧
      applyInternalOccurrenceBatch? program state batch = some successors ∧
      successors.length = offers.length ∧ successors.getLast? = some step.state ∧
      offers.map (·.alternative) = batch.members.map (fun patch =>
        InternalAlternative.operationOccurrence patch.operation.id patch.owner) ∧
      ∀ pair ∈ batch.members.zip ((state :: successors).zip successors),
        InternalOccurrencePatchStep program pair.2.1 pair.2.2 pair.1) := by
  let frontier := deriveInternalExecutionFrontier program state
  change selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule frontier = _ at selected
  change executeSelectedFrontier? program commandId index state frontier offers = _ at executed
  have sound : ∀ offer ∈ frontier.offers, ∃ candidate,
      offer.alternative = .operationOccurrence candidate.operationId candidate.owner ∧
      applyInternalOperationOccurrence? program state candidate = some offer.successor ∧ offer.preparation = none :=
    fun offer present => deriveInternalExecutionFrontier_occurrence_sound program state profile offer present
  cases batch : frontier.occurrenceBatch with
  | some certificate =>
    simp only [executeSelectedFrontier?, batch] at executed
    split at executed <;> try contradiction
    rename_i aligned
    have alternatives : offers.map (·.alternative) = certificate.members.map (fun patch =>
        InternalAlternative.operationOccurrence patch.operation.id patch.owner) := by
      exact Classical.byContradiction (fun different => aligned (by simpa only [bne_iff_ne] using different))
    obtain ⟨successors, applied, executed⟩ := Option.bind_eq_some_iff.mp executed
    obtain ⟨final, last, executed⟩ := Option.bind_eq_some_iff.mp executed
    cases Option.some.inj executed
    obtain ⟨length, steps⟩ := applyInternalOccurrenceBatch_ordered_steps program state certificate successors applied
    have identities := congrArg List.length alternatives
    simp only [List.length_map] at identities
    exact Or.inr ⟨certificate, successors, rfl, applied, by omega, last, alternatives, steps⟩
  | none =>
    cases discovered : frontier.offers with
    | nil =>
      simp [selectInternalExecutionFrontier, batch, discovered, classifyPreparedInternalFrontier, sortBy] at selected
    | cons first rest =>
      obtain ⟨candidate, alternative, applied, preparation⟩ := sound first (by rw [discovered]; simp)
      have unprepared : frontier.offers.mapM (·.preparation) = none := by
        simp [discovered, List.mapM_cons, preparation]
      simp only [selectInternalExecutionFrontier, batch, Option.isSome_none, Bool.false_eq_true,
        if_false] at selected
      rw [unprepared, discovered] at selected
      split at selected <;> try contradiction
      cases rest with
      | nil =>
        cases selected
        simp only [executeSelectedFrontier?, batch] at executed
        cases Option.some.inj executed
        exact Or.inl ⟨first, candidate, rfl, rfl, alternative, applied, preparation⟩
      | cons next tail => contradiction

end BpmnSemantics.SemanticProcess.InternalCommutation
