module

public import BpmnSemantics.SemanticProcess.InternalPreparedFrontier

/-! Discovery retains every exact Merge offer before classification under the
[complete-frontier account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#exact-merge-frontier-outcome).
Families outside the prepared account retain their existing singleton evaluator path.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

structure InternalExecutionOffer where
  alternative : InternalAlternative
  operation : SemanticOperation
  successor : RuntimeState
  preparation : Option PreparedInternalTransition
  deriving Repr

structure InternalExecutionFrontier where
  offers : List InternalExecutionOffer := []
  preparationFailed : Bool := false
  occurrenceBatch : Option InternalOccurrenceBatch := none
  deriving Repr

def ordinaryExecutionFrontier (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : InternalExecutionFrontier :=
  if program.identity.semanticProfile.value == "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" then
    match internalOperationOccurrenceOffers? program state operation with
    | none => { preparationFailed := true }
    | some candidates => { offers := candidates.map fun (candidate, successor) =>
        { alternative := .operationOccurrence candidate.operationId candidate.owner,
          operation, successor, preparation := none } }
  -- CEA-OCCUR-01 and CEA-QUIESCE-01: merge-target operations are offered per owning occurrence and unprepared,
  -- so they publish only as singleton frontiers; the definition-addressed path refuses a second live occurrence.
  else if isMergeTargetOperation program operation then
    match internalOperationOccurrences? program state operation.id with
    | none => { preparationFailed := true }
    | some candidates => { offers := candidates.filterMap fun candidate =>
        (applyInternalOperationOccurrence? program state candidate).map fun successor =>
          { alternative := .operationOccurrence candidate.operationId candidate.owner,
            operation, successor, preparation := none } }
  else
  -- The approved ordinary-End account retains the single-unit selector. Its broader raw
  -- relation must not bypass that executable restriction when preparation is unavailable.
  let selected := match operation with
    | .reachNoneEnd .. => (selectInternalEnd? state operation).isSome
    | _ => true
  if !selected then {} else
  match fire? program operation state with
  | none => {}
  | some successor =>
      { offers := [{ alternative := .operation operation.id, operation, successor
                     preparation := prepareInternalTransition? program state operation }] }

def mergeExecutionFrontier (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : InternalExecutionFrontier :=
  if program.identity.semanticProfile.value == "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" then
    { preparationFailed := true }
  else
  let alternatives := internalMergeInputAlternatives state operation
  let prepared := alternatives.mapM fun alternative => do
    let merge ← prepareInternalMerge? program state operation alternative
    let member := PreparedInternalTransition.mergeInput merge
    let successor ← applyPreparedInternalTransition? program state member
    pure ({ alternative, operation, successor, preparation := some member } : InternalExecutionOffer)
  match prepared with
  | some offers => { offers }
  | none =>
      match program.compensationEventSubProcessSnapshots, alternatives, fire? program operation state with
      | some _, [alternative], some successor =>
          { offers := [{ alternative, operation, successor, preparation := none }] }
      | _, _, _ => { preparationFailed := true }

def deriveInternalExecutionFrontier (program : Program) (state : RuntimeState) : InternalExecutionFrontier :=
  match state.control with
  | .cancelled _ | .failed .. => {}
  | _ =>
      let discovered := program.operations.foldl (fun frontier operation =>
        let next := match operation, state.control with
          | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
          | _, _ => ordinaryExecutionFrontier program state operation
        { frontier with
          offers := frontier.offers ++ next.offers
          preparationFailed := frontier.preparationFailed || next.preparationFailed }) ({} : InternalExecutionFrontier)
      let offers := sortBy (fun left right => internalAlternativeBefore left.alternative right.alternative) discovered.offers
      { offers
        occurrenceBatch := if offers.length < 2 || discovered.preparationFailed then none
          else prepareInternalOccurrenceBatch? program state
        preparationFailed := discovered.preparationFailed ||
          !decide (offers.Pairwise (fun left right => left.alternative ≠ right.alternative)) }

def findInternalExecutionOffer? (frontier : InternalExecutionFrontier) (alternative : InternalAlternative) :
    Option InternalExecutionOffer :=
  frontier.offers.find? (fun offer => offer.alternative == alternative)

private theorem fold_empty_discoveries (operations : List SemanticOperation)
    (next : SemanticOperation → InternalExecutionFrontier)
    (empty : ∀ operation ∈ operations, next operation = {}) (initial : InternalExecutionFrontier) :
    operations.foldl (fun frontier operation =>
      { frontier with
        offers := frontier.offers ++ (next operation).offers
        preparationFailed := frontier.preparationFailed || (next operation).preparationFailed }) initial = initial := by
  induction operations generalizing initial with
  | nil => rfl
  | cons operation rest ih =>
    simp only [List.foldl_cons, empty operation (by simp), List.append_nil, Bool.or_false]
    exact ih (fun candidate member => empty candidate (List.mem_cons_of_mem _ member)) initial

/-- Empty per-operation discovery cannot acquire offers or a preparation failure in aggregation. -/
theorem deriveInternalExecutionFrontier_empty (program : Program) (state : RuntimeState)
    (empty : ∀ operation ∈ program.operations,
      (match operation, state.control with
        | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
        | _, _ => ordinaryExecutionFrontier program state operation) = {}) :
    deriveInternalExecutionFrontier program state = {} := by
  unfold deriveInternalExecutionFrontier
  split
  · rfl
  · rfl
  · dsimp only
    rw [fold_empty_discoveries _ _ empty]
    rfl

/-- Unique declaration membership is necessary: discovering the same singleton twice must still fail the duplicate-alternative check. -/
theorem deriveInternalExecutionFrontier_singleton (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (offer : InternalExecutionOffer)
    (active : (match state.control with | .cancelled _ | .failed .. => false | _ => true) = true)
    (unique : program.operations.Nodup) (member : operation ∈ program.operations)
    (selected : (match operation, state.control with
      | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
      | _, _ => ordinaryExecutionFrontier program state operation) = { offers := [offer] })
    (empty : ∀ candidate ∈ program.operations, candidate ≠ operation →
      (match candidate, state.control with
        | .mergeExclusive .., .running _ => mergeExecutionFrontier program state candidate
        | _, _ => ordinaryExecutionFrontier program state candidate) = {}) :
    deriveInternalExecutionFrontier program state = { offers := [offer] } := by
  let next := fun (candidate : SemanticOperation) => match candidate, state.control with
    | .mergeExclusive .., .running _ => mergeExecutionFrontier program state candidate
    | _, _ => ordinaryExecutionFrontier program state candidate
  obtain ⟨beforeOps, afterOps, splitList⟩ := List.mem_iff_append.mp member
  rw [splitList] at unique
  obtain ⟨_, afterOpsUnique, separated⟩ := List.nodup_append.mp unique
  have beforeOpsEmpty : ∀ candidate ∈ beforeOps, next candidate = {} := by
    intro candidate present
    exact empty candidate (by rw [splitList]; simp [present])
      (separated candidate present operation (by simp))
  have afterOpsEmpty : ∀ candidate ∈ afterOps, next candidate = {} := by
    intro candidate present
    exact empty candidate (by rw [splitList]; simp [present])
      (fun same => (List.nodup_cons.mp afterOpsUnique).1 (same ▸ present))
  have folded : program.operations.foldl (fun frontier candidate =>
      { frontier with
        offers := frontier.offers ++ (next candidate).offers
        preparationFailed := frontier.preparationFailed || (next candidate).preparationFailed })
      ({} : InternalExecutionFrontier) = { offers := [offer] } := by
    rw [splitList, List.foldl_append, fold_empty_discoveries _ _ beforeOpsEmpty, List.foldl_cons]
    change afterOps.foldl _ ({ offers := (next operation).offers, preparationFailed := (next operation).preparationFailed } : InternalExecutionFrontier) = _
    rw [fold_empty_discoveries _ _ afterOpsEmpty]
    simp only [show next operation = { offers := [offer] } from selected]
  unfold deriveInternalExecutionFrontier
  split
  · cases state.control <;> simp_all
  · cases state.control <;> simp_all
  · dsimp only
    -- `erw`: the unfolded definition's fold and `folded` carry different matchers (docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#module-matcher-defect).
    erw [folded]
    rfl

private theorem sortBy_empty_reflects (before : α → α → Bool) (values : List α)
    (empty : sortBy before values = []) : values = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro value present
  have sorted := (mem_sortBy before value values).mpr present
  rw [empty] at sorted
  contradiction

private theorem fold_discovery_reflects (operations : List SemanticOperation)
    (next : SemanticOperation → InternalExecutionFrontier) (initial : InternalExecutionFrontier)
    (empty : (operations.foldl (fun frontier operation => { frontier with
      offers := frontier.offers ++ (next operation).offers
      preparationFailed := frontier.preparationFailed || (next operation).preparationFailed }) initial).offers = [])
    (successful : (operations.foldl (fun frontier operation => { frontier with
      offers := frontier.offers ++ (next operation).offers
      preparationFailed := frontier.preparationFailed || (next operation).preparationFailed }) initial).preparationFailed = false) :
    initial.offers = [] ∧ initial.preparationFailed = false ∧
      ∀ operation ∈ operations, (next operation).offers = [] ∧ (next operation).preparationFailed = false := by
  induction operations generalizing initial with
  | nil => exact ⟨empty, successful, by simp⟩
  | cons head tail ih =>
    obtain ⟨empty, successful, rest⟩ := ih _ empty successful
    have parts : initial.offers = [] ∧ (next head).offers = [] := by simpa using empty
    obtain ⟨initialEmpty, headEmpty⟩ := parts
    obtain ⟨initialSuccess, headSuccess⟩ := Bool.or_eq_false_iff.mp successful
    refine ⟨initialEmpty, initialSuccess, ?_⟩
    intro operation member
    rcases List.mem_cons.mp member with rfl | member
    · exact ⟨headEmpty, headSuccess⟩
    · exact rest operation member

/-- Empty successful aggregation reflects every declaration's actual discovery. -/
theorem deriveInternalExecutionFrontier_empty_reflects (program : Program) (state : RuntimeState)
    (active : (match state.control with | .cancelled _ | .failed .. => false | _ => true) = true)
    (empty : (deriveInternalExecutionFrontier program state).offers = [])
    (successful : (deriveInternalExecutionFrontier program state).preparationFailed = false)
    (operation : SemanticOperation) (member : operation ∈ program.operations) :
    (match operation, state.control with
      | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
      | _, _ => ordinaryExecutionFrontier program state operation).offers = [] ∧
    (match operation, state.control with
      | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
      | _, _ => ordinaryExecutionFrontier program state operation).preparationFailed = false := by
  unfold deriveInternalExecutionFrontier at empty successful
  cases control : state.control <;> simp [control] at active
  all_goals
    simp only [control] at empty successful
    have unsortedEmpty := sortBy_empty_reflects _ _ empty
    have reflected := (fold_discovery_reflects _ _ _ unsortedEmpty
      (Bool.or_eq_false_iff.mp successful).1).2.2 operation member
    cases operation <;> exact reflected

private theorem occurrenceMapM_member (values : List α) (project : α → Option β)
    (results : List β) (mapped : values.mapM project = some results)
    (value : α) (member : value ∈ values) :
    ∃ result ∈ results, project value = some result := by
  induction values generalizing results with
  | nil => simp at member
  | cons head tail ih =>
    simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
    obtain ⟨first, firstEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
    obtain ⟨rest, restEq, resultEq⟩ := Option.bind_eq_some_iff.mp mapped
    simp only [pure, Pure.pure, Option.some.injEq] at resultEq
    subst results
    rcases List.mem_cons.mp member with rfl | member
    · exact ⟨first, List.mem_cons_self, firstEq⟩
    · obtain ⟨result, present, resultEq⟩ := ih rest restEq member
      exact ⟨result, List.mem_cons_of_mem _ present, resultEq⟩

/-- Successful discovery retains every successful exact execution, including scope retirement. -/
theorem internalOperationOccurrenceOffers_complete (program : Program) (state after : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (offers : List (InternalOperationOccurrence × RuntimeState))
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (applied : applyInternalOperationOccurrence? program state candidate = some after)
    (discovered : internalOperationOccurrenceOffers? program state operation = some offers) :
    (candidate, after) ∈ offers := by
  obtain ⟨candidates, candidatesEq, member⟩ :=
    resolveInternalOperationOccurrence_requires_exact_candidate program state candidate operation resolved
  have key := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).2
  cases operation <;> simp only [internalOperationOccurrenceOffers?] at discovered <;> try contradiction
  all_goals
    obtain ⟨owners, ownersEq, discovered⟩ := Option.bind_eq_some_iff.mp discovered
    rw [key, candidatesEq] at ownersEq
    cases Option.some.inj ownersEq
    obtain ⟨pieces, mapped, flattened⟩ := Option.bind_eq_some_iff.mp discovered
    simp only [pure, Pure.pure, Option.some.injEq] at flattened
    obtain ⟨piece, present, pieceEq⟩ := occurrenceMapM_member _ _ pieces mapped candidate member
    simp only [applied] at pieceEq
    cases Option.some.inj pieceEq
    rw [← flattened]
    exact List.mem_flatten.mpr ⟨[(candidate, after)], present, by simp⟩

/-- A resolved candidate cannot execute when the selected PMIS frontier is empty and successful. -/
theorem deriveInternalExecutionFrontier_empty_occurrence_refusal (program : Program) (state : RuntimeState)
    (selected : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (empty : (deriveInternalExecutionFrontier program state).offers = [])
    (successful : (deriveInternalExecutionFrontier program state).preparationFailed = false) :
    applyInternalOperationOccurrence? program state candidate = none := by
  cases applied : applyInternalOperationOccurrence? program state candidate with
  | none => rfl
  | some after =>
    have running : ∃ process, state.control = .running process := by
      cases control : state.control <;> simp [applyInternalOperationOccurrence?, control] at applied
      exact ⟨_, rfl⟩
    obtain ⟨process, running⟩ := running
    have reflection := deriveInternalExecutionFrontier_empty_reflects program state
      (by simp [running]) empty successful operation
      (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).1
    have ordinary : (ordinaryExecutionFrontier program state operation).offers = [] ∧
        (ordinaryExecutionFrontier program state operation).preparationFailed = false := by
      cases operation <;> simp only [running] at reflection <;> try exact reflection
      simp [mergeExecutionFrontier, selected] at reflection
    simp only [ordinaryExecutionFrontier, selected, beq_self_eq_true, ↓reduceIte] at ordinary
    cases discovery : internalOperationOccurrenceOffers? program state operation with
    | none => simp [discovery] at ordinary
    | some offers =>
      have present := internalOperationOccurrenceOffers_complete program state after candidate operation offers resolved applied discovery
      simp only [discovery] at ordinary
      have noOffers : offers = [] := by simpa using ordinary.1
      rw [noOffers] at present
      contradiction

private theorem mapM_output_witness {α β : Type} (values : List α) (project : α → Option β)
    (results : List β) (mapped : values.mapM project = some results)
    (result : β) (member : result ∈ results) : ∃ value ∈ values, project value = some result := by
  induction values generalizing results with
  | nil => simp at mapped; subst results; contradiction
  | cons first rest ih =>
    simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
    obtain ⟨head, headEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
    obtain ⟨tail, tailEq, resultEq⟩ := Option.bind_eq_some_iff.mp mapped
    simp only [pure, Pure.pure, Option.some.injEq] at resultEq
    subst results
    rcases List.mem_cons.mp member with rfl | member
    · exact ⟨first, by simp, headEq⟩
    · obtain ⟨value, present, chosen⟩ := ih tail tailEq member
      exact ⟨value, by simp [present], chosen⟩

private theorem occurrence_offers_sound (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (offers : List (InternalOperationOccurrence × RuntimeState))
    (discovered : internalOperationOccurrenceOffers? program state operation = some offers)
    (candidate : InternalOperationOccurrence) (after : RuntimeState) (member : (candidate, after) ∈ offers) :
    applyInternalOperationOccurrence? program state candidate = some after := by
  unfold internalOperationOccurrenceOffers? at discovered
  cases operation <;> simp only at discovered <;> try contradiction
  all_goals
    obtain ⟨candidates, _, discovered⟩ := Option.bind_eq_some_iff.mp discovered
    obtain ⟨chunks, mapped, resultEq⟩ := Option.bind_eq_some_iff.mp discovered
    simp only [pure, Pure.pure, Option.some.injEq] at resultEq
    subst offers
    obtain ⟨chunk, chunkMember, pairMember⟩ := List.mem_flatten.mp member
    obtain ⟨selected, _, chosen⟩ := mapM_output_witness candidates _ chunks mapped chunk chunkMember
    cases applied : applyInternalOperationOccurrence? program state selected with
    | some successor =>
      simp only [applied, Option.some.injEq] at chosen
      subst chunk
      simp only [List.mem_singleton] at pairMember
      cases pairMember
      exact applied
    | none =>
      simp only [applied] at chosen
      split at chosen <;> simp_all

private theorem fold_offers_property (operations : List SemanticOperation)
    (next : SemanticOperation → InternalExecutionFrontier) (initial : InternalExecutionFrontier)
    (property : InternalExecutionOffer → Prop)
    (initialValid : ∀ offer ∈ initial.offers, property offer)
    (discoveredValid : ∀ operation ∈ operations, ∀ offer ∈ (next operation).offers, property offer) :
    ∀ offer ∈ (operations.foldl (fun frontier operation => { frontier with
      offers := frontier.offers ++ (next operation).offers,
      preparationFailed := frontier.preparationFailed || (next operation).preparationFailed }) initial).offers,
      property offer := by
  induction operations generalizing initial with
  | nil => exact initialValid
  | cons first rest ih =>
    apply ih
    · intro offer member
      rcases List.mem_append.mp member with previous | discovered
      · exact initialValid offer previous
      · exact discoveredValid first (by simp) offer discovered
    · intro operation member
      exact discoveredValid operation (by simp [member])

/-- Every selected PMIS offer carries the actual exact-owner execution, including result-only offers. -/
theorem deriveInternalExecutionFrontier_occurrence_sound (program : Program) (state : RuntimeState)
    (selected : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (offer : InternalExecutionOffer) (member : offer ∈ (deriveInternalExecutionFrontier program state).offers) :
    ∃ candidate, offer.alternative = .operationOccurrence candidate.operationId candidate.owner ∧
      applyInternalOperationOccurrence? program state candidate = some offer.successor ∧ offer.preparation = none := by
  let property := fun offer : InternalExecutionOffer => ∃ candidate,
    offer.alternative = .operationOccurrence candidate.operationId candidate.owner ∧
    applyInternalOperationOccurrence? program state candidate = some offer.successor ∧ offer.preparation = none
  have ordinary : ∀ operation, ∀ offer ∈ (ordinaryExecutionFrontier program state operation).offers, property offer := by
    intro operation offer member
    simp only [ordinaryExecutionFrontier, selected] at member
    cases discovered : internalOperationOccurrenceOffers? program state operation with
    | none => simp [discovered] at member
    | some offers =>
      simp only [discovered] at member
      obtain ⟨⟨candidate, successor⟩, present, equal⟩ := List.mem_map.mp member
      cases equal
      exact ⟨candidate, rfl, occurrence_offers_sound program state operation offers discovered candidate successor present, rfl⟩
  have discovered : ∀ (operation : SemanticOperation), ∀ offer ∈ (match operation, state.control with
      | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
      | _, _ => ordinaryExecutionFrontier program state operation).offers, property offer := by
    intro operation offer member
    cases operation <;> cases control : state.control <;> simp only [control] at member <;> try exact ordinary _ _ member
    simp [mergeExecutionFrontier, selected] at member
  unfold deriveInternalExecutionFrontier at member
  split at member <;> try contradiction
  dsimp only at member
  have present := (mem_sortBy _ offer _).mp member
  exact fold_offers_property program.operations _ {} property (by simp) (fun operation _ => discovered operation) offer present

end BpmnSemantics.SemanticProcess.InternalCommutation
