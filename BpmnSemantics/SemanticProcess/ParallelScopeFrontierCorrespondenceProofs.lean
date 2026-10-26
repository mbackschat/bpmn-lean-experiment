module

public import BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import BpmnSemantics.SemanticProcess.InternalTransitionAlternativeOrder
import BpmnSemantics.SemanticProcess.InternalOccurrenceRegionLaws
import BpmnSemantics.SemanticProcess.InternalLocalControlPositionTemplateOrder

/-! PMIS-SELECT-01 discovery traversals retain the same exact operation/owner offers.
The bridge compares their canonical alternatives without choosing an execution or weakening
the failed-wait and duplicate-alternative guards.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

def occurrenceAlternative (pair : InternalOperationOccurrence × RuntimeState) :
    InternalAlternative := .operationOccurrence pair.1.operationId pair.1.owner

private theorem mapM_success (values : List α) (f : α → Option (List β)) (pieces : List (List β))
    (mapped : values.mapM f = some pieces) :
    pieces = values.map (fun value => (f value).getD []) ∧
      ∀ value ∈ values, ∃ piece, f value = some piece := by
  induction values generalizing pieces with
  | nil => simp only [List.mapM_nil, pure, Pure.pure, Option.some.injEq] at mapped; subst pieces; simp
  | cons head tail ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨first, firstEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨rest, restEq, resultEq⟩ := Option.bind_eq_some_iff.mp mapped
      simp only [pure, Pure.pure, Option.some.injEq] at resultEq
      subst pieces
      obtain ⟨restValues, restSuccess⟩ := ih rest restEq
      refine ⟨by simp [firstEq, restValues], ?_⟩
      intro value present
      rcases List.mem_cons.mp present with rfl | present
      · exact ⟨first, firstEq⟩
      · exact restSuccess value present

private theorem insert_map (before : α → α → Bool) (after : β → β → Bool) (f : α → β)
    (preserves : ∀ a b, after (f a) (f b) = before a b) (value : α) (values : List α) :
    (sortInsertBy before value values).map f = sortInsertBy after (f value) (values.map f) := by
  induction values with
  | nil => rfl
  | cons head tail ih =>
      simp only [sortInsertBy, List.map_cons, preserves]
      split <;> simp_all

private theorem sort_map (before : α → α → Bool) (after : β → β → Bool) (f : α → β)
    (preserves : ∀ a b, after (f a) (f b) = before a b) (values : List α) :
    (sortBy before values).map f = sortBy after (values.map f) := by
  induction values with
  | nil => rfl
  | cons head tail ih => simp only [sortBy, List.map_cons, insert_map before after f preserves, ih]

private theorem insert_eq_canonical (before : α → α → Bool) (value : α) (values : List α) :
    sortInsertBy before value values = canonicalInsertBy before value values := by
  induction values with
  | nil => rfl
  | cons head tail ih => simp only [sortInsertBy, canonicalInsertBy, ih]

private theorem alternatives_sort_perm (left right : List InternalAlternative)
    (permutation : left.Perm right) :
    sortBy internalAlternativeBefore left = sortBy internalAlternativeBefore right := by
  induction permutation with
  | nil => rfl
  | cons head _ ih => simp only [sortBy, ih]
  | swap first second tail =>
      simp only [sortBy, insert_eq_canonical]
      by_cases same : second = first
      · subst second; rfl
      · exact canonicalInsertBy_commutes_of_strict_order internalAlternativeBefore
          internalAlternativeBefore_asymm internalAlternativeBefore_trans second first
          (internalAlternativeBefore_total second first same) _
  | trans _ _ ihFirst ihSecond => exact ihFirst.trans ihSecond

private theorem insert_alternatives_strict (value : InternalAlternative) (values : List InternalAlternative)
    (ordered : values.Pairwise (fun left right => internalAlternativeBefore left right = true))
    (fresh : value ∉ values) :
    (sortInsertBy internalAlternativeBefore value values).Pairwise
      (fun left right => internalAlternativeBefore left right = true) := by
  induction values with
  | nil => simp [sortInsertBy]
  | cons head tail ih =>
      obtain ⟨before, tailOrder⟩ := List.pairwise_cons.mp ordered
      by_cases lt : internalAlternativeBefore value head = true
      · simp only [sortInsertBy, lt, ite_true, List.pairwise_cons]
        refine ⟨?_, before, tailOrder⟩
        intro other member
        rcases List.mem_cons.mp member with rfl | member
        · exact lt
        · exact internalAlternativeBefore_trans value head other lt (before other member)
      · simp only [sortInsertBy, lt, Bool.false_eq_true, ite_false, List.pairwise_cons]
        refine ⟨?_, ih tailOrder (fun member => fresh (by simp [member]))⟩
        intro other member
        rcases (mem_sortInsertBy _ _ _ _).mp member with same | member
        · subst other
          exact (internalAlternativeBefore_total head value (by intro same; exact fresh (by simp [same]))).resolve_right lt
        · exact before other member

private theorem sort_alternatives_strict (values : List InternalAlternative) (unique : values.Nodup) :
    (sortBy internalAlternativeBefore values).Pairwise
      (fun left right => internalAlternativeBefore left right = true) := by
  induction values with
  | nil => simp [sortBy]
  | cons head tail ih =>
      obtain ⟨fresh, tailUnique⟩ := List.nodup_cons.mp unique
      exact insert_alternatives_strict head _ (ih tailUnique)
        (fun present => fresh ((mem_sortBy _ _ _).mp present))

private theorem sorted_alternatives_fixed (values : List InternalAlternative)
    (ordered : values.Pairwise (fun left right => internalAlternativeBefore left right = true)) :
    sortBy internalAlternativeBefore values = values := by
  induction values with
  | nil => rfl
  | cons head tail ih =>
      obtain ⟨before, tailOrder⟩ := List.pairwise_cons.mp ordered
      rw [sortBy, ih tailOrder]
      cases tail with
      | nil => rfl
      | cons next rest => simp [sortInsertBy, before next (by simp)]

private theorem mapM_keys_sublist (values : List α) (f : α → Option (List β))
    (source : α → γ) (key : β → γ) (pieces : List (List β))
    (singleton : ∀ value piece, f value = some piece → (piece.map key).Sublist [source value])
    (mapped : values.mapM f = some pieces) :
    (pieces.flatten.map key).Sublist (values.map source) := by
  induction values generalizing pieces with
  | nil => simp at mapped; subst pieces; simp
  | cons head tail ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨first, firstEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨rest, restEq, resultEq⟩ := Option.bind_eq_some_iff.mp mapped
      simp only [pure, Pure.pure, Option.some.injEq] at resultEq
      subst pieces
      simpa only [List.flatten_cons, List.map_append, List.map_cons, List.singleton_append] using
        (singleton head first firstEq).append (ih rest restEq)

private theorem mapM_flatten_length_le (values : List α) (f : α → Option (List β))
    (pieces : List (List β)) (bound : Nat)
    (each : ∀ value piece, f value = some piece → piece.length ≤ bound)
    (mapped : values.mapM f = some pieces) :
    pieces.flatten.length ≤ values.length * bound := by
  induction values generalizing pieces with
  | nil => simp at mapped; subst pieces; simp
  | cons head tail ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨first, firstEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨rest, restEq, resultEq⟩ := Option.bind_eq_some_iff.mp mapped
      simp only [pure, Pure.pure, Option.some.injEq] at resultEq
      subst pieces
      have firstBound := each head first firstEq
      have tailBound := ih rest restEq
      simp only [List.flatten_cons, List.length_append, List.length_cons, Nat.succ_mul]
      omega

private theorem occurrence_candidates_length_le_population (program : Program) (state : RuntimeState)
    (id : OperationId) (candidates : List InternalOperationOccurrence)
    (discovered : internalOperationOccurrences? program state id = some candidates) :
    candidates.length ≤ state.scopeOccurrences.length := by
  unfold internalOperationOccurrences? at discovered
  split at discovered <;> try contradiction
  split at discovered <;> try contradiction
  dsimp only at discovered
  split at discovered <;> try contradiction
  cases Option.some.inj discovered
  simp only [List.length_map]
  rw [(sortBy_permutation _ _).length_eq]
  simpa only [List.length_map] using List.length_filter_le _ (state.scopeOccurrences.map (·.id))

private theorem occurrence_candidates_ordered (program : Program) (state : RuntimeState) (id : OperationId)
    (candidates : List InternalOperationOccurrence)
    (discovered : internalOperationOccurrences? program state id = some candidates) :
    (candidates.map fun candidate => InternalAlternative.operationOccurrence candidate.operationId candidate.owner).Pairwise
      (fun left right => internalAlternativeBefore left right = true) ∧
      ∀ candidate ∈ candidates, candidate.operationId = id := by
  unfold internalOperationOccurrences? at discovered
  split at discovered <;> try contradiction
  split at discovered <;> try contradiction
  dsimp only at discovered
  split at discovered <;> try contradiction
  rename_i unique
  cases Option.some.inj discovered
  refine ⟨?_, ?_⟩
  · simp only [List.map_map, Function.comp_def]
    rw [sort_map scopeBefore internalAlternativeBefore (fun owner => .operationOccurrence id owner)
      (by intro left right; simp [internalAlternativeBefore])]
    apply sort_alternatives_strict
    apply List.pairwise_map.mpr
    have rawUnique := (sortBy_permutation scopeBefore _).nodup_iff.mp unique
    exact rawUnique.imp (by intro left right different same; exact different (by simpa using same))
  · intro candidate member
    obtain ⟨owner, _, same⟩ := List.mem_map.mp member
    cases same
    rfl

private theorem occurrence_offer_candidates_sublist (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : internalOperationOccurrenceOffers? program state operation = some pairs) :
    ∃ candidates, internalOperationOccurrences? program state operation.id = some candidates ∧
      (pairs.map occurrenceAlternative).Sublist
        (candidates.map fun candidate => InternalAlternative.operationOccurrence candidate.operationId candidate.owner) := by
  unfold internalOperationOccurrenceOffers? at discovered
  cases operation <;> simp only at discovered <;> try contradiction
  all_goals
    obtain ⟨candidates, candidatesEq, discovered⟩ := Option.bind_eq_some_iff.mp discovered
    obtain ⟨pieces, mapped, flattened⟩ := Option.bind_eq_some_iff.mp discovered
    simp only [pure, Pure.pure, Option.some.injEq] at flattened
    cases flattened
    have sublist := mapM_keys_sublist candidates _
      (fun candidate => InternalAlternative.operationOccurrence candidate.operationId candidate.owner)
      occurrenceAlternative pieces (by
        intro candidate piece chosen
        cases applied : applyInternalOperationOccurrence? program state candidate with
        | some successor =>
            simp only [applied, Option.some.injEq] at chosen
            cases chosen
            exact List.Sublist.refl _
        | none =>
            simp only [applied] at chosen
            split at chosen <;> try contradiction
            cases Option.some.inj chosen
            exact List.nil_sublist _) mapped
    exact ⟨candidates, candidatesEq, sublist⟩

private theorem occurrence_offer_block_ordered (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : internalOperationOccurrenceOffers? program state operation = some pairs) :
    (pairs.map occurrenceAlternative).Pairwise (fun left right => internalAlternativeBefore left right = true) ∧
      ∀ alternative ∈ pairs.map occurrenceAlternative,
        ∃ owner, alternative = .operationOccurrence operation.id owner := by
  obtain ⟨candidates, candidatesEq, sublist⟩ := occurrence_offer_candidates_sublist program state operation pairs discovered
  obtain ⟨ordered, identity⟩ := occurrence_candidates_ordered program state _ candidates candidatesEq
  refine ⟨ordered.sublist sublist, ?_⟩
  intro alternative member
  obtain ⟨candidate, present, same⟩ := List.mem_map.mp (sublist.subset member)
  exact ⟨candidate.owner, by rw [← same, identity candidate present]⟩

private theorem occurrence_offer_length_le_population (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : internalOperationOccurrenceOffers? program state operation = some pairs) :
    pairs.length ≤ state.scopeOccurrences.length := by
  obtain ⟨candidates, candidatesEq, sublist⟩ := occurrence_offer_candidates_sublist program state operation pairs discovered
  have filtered := sublist.length_le
  simp only [List.length_map] at filtered
  exact Nat.le_trans filtered (occurrence_candidates_length_le_population program state operation.id candidates candidatesEq)

/-- Owner filtering preserves each block's canonical order; unique declaration identities separate the operation blocks. -/
theorem deriveInternalOccurrenceFrontier_ordered (program : Program) (state : RuntimeState)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (unique : (program.operations.map (fun operation => operation.id.value)).Nodup)
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs) :
    (pairs.map fun pair => InternalAlternative.operationOccurrence pair.1.operationId pair.1.owner).Pairwise
      (fun left right => internalAlternativeBefore left right = true) := by
  change (pairs.map occurrenceAlternative).Pairwise _
  unfold deriveInternalOccurrenceFrontier? at discovered
  obtain ⟨pieces, piecesEq, flattened⟩ := Option.bind_eq_some_iff.mp discovered
  simp only [pure, Pure.pure, Option.some.injEq] at flattened
  obtain ⟨pieceValues, allSuccess⟩ := mapM_success _ _ pieces piecesEq
  let operations := sortBy (fun left right : SemanticOperation => left.id.value < right.id.value) program.operations
  let keys := fun operation => ((internalOperationOccurrenceOffers? program state operation).getD []).map occurrenceAlternative
  have blocks : ∀ operation ∈ operations,
      (keys operation).Pairwise (fun left right => internalAlternativeBefore left right = true) ∧
        ∀ alternative ∈ keys operation, ∃ owner, alternative = .operationOccurrence operation.id owner := by
    intro operation present
    obtain ⟨block, blockEq⟩ := allSuccess operation present
    simpa only [keys, blockEq, Option.getD_some] using occurrence_offer_block_ordered program state operation block blockEq
  have operationOrder := localControl_sort_flow_strict (fun operation : SemanticOperation => operation.id.value)
    program.operations unique
  have pairKeys : pairs.map occurrenceAlternative = (operations.map keys).flatten := by
    rw [← flattened, pieceValues]
    simp [keys, operations, List.map_flatten, List.map_map, Function.comp_def]
  rw [pairKeys]
  apply List.pairwise_flatten.mpr
  refine ⟨?_, List.pairwise_map.mpr ?_⟩
  · intro block present
    obtain ⟨operation, member, same⟩ := List.mem_map.mp present
    cases same
    exact (blocks operation member).1
  · apply operationOrder.imp_of_mem
    intro left right leftMember rightMember less first firstMember second secondMember
    obtain ⟨firstOwner, firstEq⟩ := (blocks left leftMember).2 first firstMember
    obtain ⟨secondOwner, secondEq⟩ := (blocks right rightMember).2 second secondMember
    rw [firstEq, secondEq]
    have different : left.id ≠ right.id := by intro same; simp [same] at less
    simp [internalAlternativeBefore, different, less]

/-- Successful raw discovery offers at most one result per operation and retained scope occurrence. -/
theorem deriveInternalOccurrenceFrontier_length_le_population (program : Program) (state : RuntimeState)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs) :
    pairs.length ≤ program.operations.length * state.scopeOccurrences.length := by
  unfold deriveInternalOccurrenceFrontier? at discovered
  obtain ⟨pieces, piecesEq, flattened⟩ := Option.bind_eq_some_iff.mp discovered
  simp only [pure, Pure.pure, Option.some.injEq] at flattened
  cases flattened
  have bound := mapM_flatten_length_le _ _ pieces state.scopeOccurrences.length
    (fun operation offers offered => occurrence_offer_length_le_population program state operation offers offered) piecesEq
  have sortedLength := (sortBy_permutation
    (fun left right : SemanticOperation => left.id.value < right.id.value) program.operations).length_eq
  simpa only [sortedLength] using bound

def selectedDiscovery (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : InternalExecutionFrontier :=
  match operation, state.control with
  | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
  | _, _ => ordinaryExecutionFrontier program state operation

private theorem selectedDiscovery_keys (program : Program) (state : RuntimeState)
    (operation : SemanticOperation)
    (selected : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (success : ∃ pairs, internalOperationOccurrenceOffers? program state operation = some pairs) :
    (selectedDiscovery program state operation).offers.map InternalExecutionOffer.alternative =
      ((internalOperationOccurrenceOffers? program state operation).getD []).map occurrenceAlternative := by
  obtain ⟨pairs, offered⟩ := success
  cases operation
  case mergeExclusive => simp [internalOperationOccurrenceOffers?] at offered
  all_goals simp [selectedDiscovery, ordinaryExecutionFrontier, selected, offered, occurrenceAlternative,
    List.map_map, Function.comp_def]

private theorem fold_keys (operations : List SemanticOperation) (next : SemanticOperation → InternalExecutionFrontier)
    (keys : SemanticOperation → List InternalAlternative)
    (agrees : ∀ operation ∈ operations, (next operation).offers.map InternalExecutionOffer.alternative = keys operation)
    (initial : InternalExecutionFrontier) :
    (operations.foldl (fun frontier operation => { frontier with
      offers := frontier.offers ++ (next operation).offers
      preparationFailed := frontier.preparationFailed || (next operation).preparationFailed }) initial).offers.map
        InternalExecutionOffer.alternative =
      initial.offers.map InternalExecutionOffer.alternative ++ (operations.map keys).flatten := by
  induction operations generalizing initial with
  | nil => simp
  | cons head tail ih =>
      rw [List.foldl_cons, ih (fun operation present => agrees operation (by simp [present]))]
      simp [agrees head (by simp), List.append_assoc]

/-- Successful complete occurrence discovery fixes the exact canonically sorted execution alternatives, independently of declaration order and owner multiplicity. -/
theorem deriveInternalExecutionFrontier_occurrence_alternatives
    (program : Program) (state : RuntimeState) (instanceId : SemanticId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (selected : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (running : state.control = .running instanceId)
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs) :
    (deriveInternalExecutionFrontier program state).offers.map InternalExecutionOffer.alternative =
      sortBy internalAlternativeBefore
        (pairs.map fun pair => .operationOccurrence pair.1.operationId pair.1.owner) := by
  change (deriveInternalExecutionFrontier program state).offers.map InternalExecutionOffer.alternative =
    sortBy internalAlternativeBefore (pairs.map occurrenceAlternative)
  unfold deriveInternalOccurrenceFrontier? at discovered
  obtain ⟨pieces, piecesEq, flattened⟩ := Option.bind_eq_some_iff.mp discovered
  simp only [pure, Pure.pure, Option.some.injEq] at flattened
  obtain ⟨pieceValues, allSuccess⟩ := mapM_success _ _ pieces piecesEq
  have success : ∀ operation ∈ program.operations,
      ∃ piece, internalOperationOccurrenceOffers? program state operation = some piece := by
    intro operation present
    exact allSuccess operation ((mem_sortBy _ _ _).mpr present)
  let keys := fun operation => ((internalOperationOccurrenceOffers? program state operation).getD []).map occurrenceAlternative
  have aggregated := fold_keys program.operations (selectedDiscovery program state) keys
    (fun operation present => selectedDiscovery_keys program state operation selected (success operation present)) {}
  have shuffled : ((sortBy (fun left right : SemanticOperation => left.id.value < right.id.value)
      program.operations).map keys).flatten.Perm ((program.operations.map keys).flatten) :=
    ((sortBy_permutation _ _).map keys).flatten
  have pairKeys : pairs.map occurrenceAlternative =
      ((sortBy (fun left right : SemanticOperation => left.id.value < right.id.value)
        program.operations).map keys).flatten := by
    rw [← flattened, pieceValues]
    simp [keys, List.map_flatten, List.map_map, Function.comp_def]
  unfold deriveInternalExecutionFrontier
  split
  · simp_all
  · simp_all
  · dsimp only
    rw [sort_map _ internalAlternativeBefore InternalExecutionOffer.alternative (by intros; rfl)]
    calc
      _ = sortBy internalAlternativeBefore
          ((program.operations.foldl (fun frontier operation => { frontier with
            offers := frontier.offers ++ (selectedDiscovery program state operation).offers
            preparationFailed := frontier.preparationFailed || (selectedDiscovery program state operation).preparationFailed })
            ({} : InternalExecutionFrontier)).offers.map InternalExecutionOffer.alternative) := by
        congr 3
      _ = sortBy internalAlternativeBefore ((program.operations.map keys).flatten) := by
        rw [aggregated]
        rfl
      _ = _ := by
        rw [pairKeys]
        exact alternatives_sort_perm _ _ shuffled.symm

/-- The two successful discovery traversals have the same exact operation/owner multiplicities. -/
theorem deriveInternalExecutionFrontier_occurrence_permutation
    (program : Program) (state : RuntimeState) (instanceId : SemanticId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (selected : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (running : state.control = .running instanceId)
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs) :
    ((deriveInternalExecutionFrontier program state).offers.map InternalExecutionOffer.alternative).Perm
      (pairs.map fun pair => .operationOccurrence pair.1.operationId pair.1.owner) := by
  rw [deriveInternalExecutionFrontier_occurrence_alternatives program state instanceId pairs selected running discovered]
  exact sortBy_permutation _ _

/-- Complete occurrence discovery and execution discovery agree on the size used by batch selection. -/
theorem deriveInternalExecutionFrontier_occurrence_length
    (program : Program) (state : RuntimeState) (instanceId : SemanticId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (selected : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (running : state.control = .running instanceId)
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs) :
    (deriveInternalExecutionFrontier program state).offers.length = pairs.length := by
  simpa only [List.length_map] using
    (deriveInternalExecutionFrontier_occurrence_permutation program state instanceId pairs selected running discovered).length_eq

/-- The scheduler's literal alternative sequence equals complete occurrence discovery, including every owner of one operation. -/
theorem deriveInternalExecutionFrontier_occurrence_exact_order
    (program : Program) (state : RuntimeState) (instanceId : SemanticId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (selected : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (running : state.control = .running instanceId)
    (unique : (program.operations.map (fun operation => operation.id.value)).Nodup)
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs) :
    (deriveInternalExecutionFrontier program state).offers.map InternalExecutionOffer.alternative =
      pairs.map fun pair => .operationOccurrence pair.1.operationId pair.1.owner := by
  rw [deriveInternalExecutionFrontier_occurrence_alternatives program state instanceId pairs selected running discovered]
  exact sorted_alternatives_fixed _ (deriveInternalOccurrenceFrontier_ordered program state pairs unique discovered)

/-- The execution guard never treats duplicate exact alternatives as a successful frontier. -/
theorem deriveInternalExecutionFrontier_success_unique (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (successful : (deriveInternalExecutionFrontier program state).preparationFailed = false) :
    (deriveInternalExecutionFrontier program state).offers.Pairwise
      (fun left right => left.alternative ≠ right.alternative) := by
  unfold deriveInternalExecutionFrontier at successful ⊢
  simp only [running] at successful ⊢
  have unique := (Bool.or_eq_false_iff.mp successful).2
  simpa using unique

/-- Unsupported Merge declarations cannot disappear from successful occurrence discovery. -/
theorem deriveInternalOccurrenceFrontier_merge_refusal (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (inputs : List ControlPlaceId) (output : ControlPlaceId)
    (member : SemanticOperation.mergeExclusive id origin inputs output ∈ program.operations) :
    deriveInternalOccurrenceFrontier? program state = none := by
  cases discovered : deriveInternalOccurrenceFrontier? program state with
  | none => rfl
  | some pairs =>
      unfold deriveInternalOccurrenceFrontier? at discovered
      obtain ⟨pieces, piecesEq, _⟩ := Option.bind_eq_some_iff.mp discovered
      obtain ⟨_, allSuccess⟩ := mapM_success _ _ pieces piecesEq
      obtain ⟨piece, impossible⟩ := allSuccess (.mergeExclusive id origin inputs output)
        ((mem_sortBy _ _ _).mpr member)
      simp [internalOperationOccurrenceOffers?] at impossible

/-- Two declarations sharing a discovery key retain refusal rather than a silently selected declaration. -/
theorem internalOperationOccurrences_duplicate_declarations (program : Program) (state : RuntimeState)
    (id : OperationId) (first second : SemanticOperation) (rest : List SemanticOperation)
    (duplicates : program.operations.filter (·.id == id) = first :: second :: rest) :
    internalOperationOccurrences? program state id = none := by
  simp [internalOperationOccurrences?, duplicates]

end BpmnSemantics.SemanticProcess.InternalCommutation
