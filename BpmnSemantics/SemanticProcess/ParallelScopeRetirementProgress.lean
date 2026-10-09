import BpmnSemantics.SemanticProcess.ParallelScopeResumptionProofs

/-! # Progress after parallel subprocess retirement

PMIS-END-01 removes a completed leaf without advancing its surviving siblings.
PMIS-CANCEL-01 removes remaining bodies on early completion; only final completion
issues the parent continuation. These laws connect cancellation to the actual
retirement cut rather than assuming a later successful scheduler step.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

private theorem any_filter_retained {α : Type} (items : List α) (keep test : α → Bool)
    (retained : ∀ item ∈ items, test item = true → keep item = true) :
    (items.filter keep).any test = items.any test := by
  apply Bool.eq_iff_iff.mpr
  constructor
  · intro found
    obtain ⟨item, present, matching⟩ := List.any_eq_true.mp found
    exact List.any_eq_true.mpr ⟨item, (List.mem_filter.mp present).1, matching⟩
  · intro found
    obtain ⟨item, present, matching⟩ := List.any_eq_true.mp found
    exact List.any_eq_true.mpr ⟨item, List.mem_filter.mpr ⟨present, retained item present matching⟩, matching⟩

private theorem cancel_outside_quiescence (state : RuntimeState) (root owner : ScopeOccurrenceId)
    (noCalls : state.calledProcessOccurrences = [])
    (outside : occurrenceInSubtree state.scopeOccurrences root owner = false)
    (children : ∀ child ∈ state.scopeOccurrences, child.parent = some owner →
      occurrenceInSubtree state.scopeOccurrences root child.id = false)
    (withdrawn : withdrawnByRegion (fun target => occurrenceInSubtree state.scopeOccurrences root target)
      state.activityOccurrences none = []) :
    scopeQuiescent (cancelScopeSubtree state root .remove) owner = scopeQuiescent state owner := by
  have calls := calledInstanceClosure_no_calls state root noCalls
  have reads : ∀ {α : Type} (items : List α) (getOwner : α → ScopeOccurrenceId),
      (items.filter fun item => !occurrenceInSubtree state.scopeOccurrences root (getOwner item)).any
        (fun item => getOwner item == owner) = items.any (fun item => getOwner item == owner) := by
    intro α items getOwner
    apply any_filter_retained
    intro item _ same
    have identity : getOwner item = owner := by simpa only [beq_iff_eq] using same
    simp [identity, outside]
  have scopes : (cancelScopeSubtree state root .remove).scopeOccurrences.any (fun child => child.parent == some owner) =
      state.scopeOccurrences.any (fun child => child.parent == some owner) := by
    change (state.scopeOccurrences.filter _).any _ = _
    apply any_filter_retained
    intro child present same
    change (!(occurrenceInSubtree state.scopeOccurrences root child.id ||
      (calledInstanceClosure state root).contains child.id.processInstanceId)) = true
    simp [calls, children child present (by simpa only [beq_iff_eq] using same)]
  have triggers : (state.compensationTriggers.filter fun trigger =>
      !occurrenceInSubtree state.scopeOccurrences root trigger.owner).any
        (fun trigger => trigger.lifecycle == .active && trigger.owner == owner) =
      state.compensationTriggers.any (fun trigger => trigger.lifecycle == .active && trigger.owner == owner) := by
    apply any_filter_retained
    intro trigger _ active
    have same : trigger.owner = owner := by
      have parts : trigger.lifecycle = .active ∧ trigger.owner = owner := by
        simpa only [Bool.and_eq_true, beq_iff_eq] using active
      exact parts.2
    simp [same, outside]
  unfold scopeQuiescent
  rw [scopes]
  simp only [cancelScopeSubtree, calls, List.contains_nil, Bool.or_false, retainedCancellationRoot,
    withdrawn, attachedTimersOf, List.flatMap_nil, anyTimerIdNamesWait, activityRecordsAttachMessageWait,
    List.any_nil, Bool.not_false, Bool.and_true, noCalls, List.filter_nil, reads, triggers]

/-- A nonfinal PMIS-END-01 step removes just the quiescent body, retaining all token
multiplicities and the command's control/pending phase. Final completion emits a parent
token and therefore cannot satisfy this frame merely by dropping the same body.
-/
structure ParallelScopeRemainingFrame (before after : RuntimeState) (retired : ScopeOccurrenceId) : Prop where
  control : after.control = before.control
  pending : after.initiationPending = before.initiationPending
  tokens : after.tokens = before.tokens
  scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun occurrence => occurrence.id != retired)

private theorem quiescent_leaf_cancellation_frame (state : RuntimeState) (root : ScopeOccurrenceId)
    (quiet : scopeQuiescent state root = true)
    (noCalls : state.calledProcessOccurrences = []) :
    ParallelScopeRemainingFrame state (cancelScopeSubtree state root .remove) root := by
  have calls := calledInstanceClosure_no_calls state root noCalls
  have inside : ∀ owner, occurrenceInSubtree state.scopeOccurrences root owner = (owner == root) := by
    intro owner
    by_cases same : owner = root
    · subst owner
      simp [occurrenceInSubtree, occurrenceInSubtreeWithin]
    · cases selected : occurrenceInSubtree state.scopeOccurrences root owner with
      | false => simp [same]
      | true => exact False.elim (same (quiescent_scope_subtree_identity state root owner quiet selected))
  refine ⟨rfl, rfl, ?_, ?_⟩
  · change state.tokens.filter _ = state.tokens
    apply List.filter_eq_self.mpr
    intro token present
    simp [calls, inside, quiescent_scope_has_no_token state root quiet token present]
  · change state.scopeOccurrences.filter _ = state.scopeOccurrences.filter _
    apply List.filter_congr
    intro occurrence _
    change (!(occurrenceInSubtree state.scopeOccurrences root occurrence.id ||
      (calledInstanceClosure state root).contains occurrence.id.processInstanceId)) = (occurrence.id != root)
    simp only [calls, List.contains_nil, Bool.or_false, inside]
    rfl

private theorem remaining_retirement_quiescence (entry : ParallelScopeEntry) (before : RuntimeState)
    (retired : ScopeOccurrenceId) (binding : ParallelScopeBinding) (variables : ScopedVariables)
    (next : ParallelScopeController) (selected first : ParallelScopeIteration) (rest : List ParallelScopeIteration)
    (condition : Bool) (bound : parallelScopeBinding? entry before retired = some binding)
    (parentless : occurrenceParent? before.scopeOccurrences binding.activity.owner = none)
    (noCalls : before.calledProcessOccurrences = [])
    (activities : before.activityOccurrences = [binding.activity])
    (quiet : scopeQuiescent before retired = true)
    (executed : retireParallelScopeIteration binding.controller binding.iterations retired condition =
      some (.remaining next selected first rest))
    (owner : ScopeOccurrenceId) (different : owner ≠ retired)
    (notParent : binding.activity.owner ≠ owner) :
    let edited := { before with
      variables
      activityOccurrences := before.activityOccurrences.map fun candidate =>
        if candidate == binding.activity then { candidate with body := .parallelChildScopes first rest } else candidate
      parallelScopeControllers := before.parallelScopeControllers.map fun candidate =>
        if candidate == binding.controller then next else candidate }
    scopeQuiescent (cancelScopeSubtree edited retired .remove) owner = scopeQuiescent before owner := by
  intro edited
  have members := remainingRetirement_members binding.controller next binding.iterations retired condition selected first rest executed
  have outside : occurrenceInSubtree before.scopeOccurrences retired owner = false := by
    cases inside : occurrenceInSubtree before.scopeOccurrences retired owner with
    | false => rfl
    | true => exact False.elim (different (quiescent_scope_subtree_identity before retired owner quiet inside))
  obtain ⟨chosen, chosenMember, chosenId⟩ := parallelScopeBinding_member entry before retired binding bound
  have parentDifferent : binding.activity.owner ≠ retired := by
    intro same
    have assigned := parallelScopeBinding_body_parent entry before retired binding bound chosen chosenMember
    rw [chosenId, ← same, parentless] at assigned
    contradiction
  have parentOutside : occurrenceInSubtree before.scopeOccurrences retired binding.activity.owner = false :=
    occurrenceInSubtreeWithin_parentless before.scopeOccurrences retired binding.activity.owner parentDifferent parentless _
  obtain ⟨body, census, bodyId, bodyParent, _⟩ := parallelScopeBinding_body_record entry before retired binding bound
  have children : ∀ child ∈ edited.scopeOccurrences, child.parent = some owner →
      occurrenceInSubtree edited.scopeOccurrences retired child.id = false := by
    intro child present childParent
    cases inside : occurrenceInSubtree edited.scopeOccurrences retired child.id with
    | false => rfl
    | true =>
      have identity := quiescent_scope_subtree_identity before retired child.id quiet inside
      have selectedChild : child ∈ before.scopeOccurrences.filter (fun occurrence => occurrence.id == retired) :=
        List.mem_filter.mpr ⟨present, by simp [identity]⟩
      rw [census] at selectedChild
      have same : child = body := by simpa using selectedChild
      rw [same, bodyParent] at childParent
      exact False.elim (notParent (Option.some.inj childParent))
  let record := { binding.activity with body := ActivityBody.parallelChildScopes first rest }
  have records : edited.activityOccurrences = [record] := by simp [edited, activities, record]
  have notWithdrawn : recordInRegion (fun target => occurrenceInSubtree edited.scopeOccurrences retired target) record none = false := by
    have siblings : (first :: rest).any (fun candidate => occurrenceInSubtree before.scopeOccurrences retired candidate.scope) = false := by
      apply List.any_eq_false.mpr
      intro candidate present
      rw [parallelScopeBinding_sibling_outside entry before retired binding bound candidate
        (members candidate present).1 (members candidate present).2 parentless]
      exact Bool.false_ne_true
    simpa [recordInRegion, record, edited, parentOutside] using siblings
  have withdrawn : withdrawnByRegion (fun target => occurrenceInSubtree edited.scopeOccurrences retired target)
      edited.activityOccurrences none = [] := by simp [withdrawnByRegion, records, notWithdrawn]
  exact cancel_outside_quiescence edited retired owner noCalls outside children withdrawn

/-- PMIS-END-01 preserves every surviving sibling's retirement blocker. Natural and early final
completion leave no such sibling; the remaining arm changes neither its tokens nor its waits.
-/
theorem completeParallelScope_surviving_sibling_frame
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (retired : ScopeOccurrenceId) (binding : ParallelScopeBinding) (iteration : ParallelScopeIteration)
    (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before retired = some binding)
    (member : iteration ∈ binding.iterations) (different : iteration.scope ≠ retired)
    (completed : completeParallelScope? entry before retired = some after)
    (survives : ∃ occurrence ∈ after.scopeOccurrences, occurrence.id = iteration.scope) :
    ParallelScopeRemainingFrame before after retired ∧
      scopeQuiescent after iteration.scope = scopeQuiescent before iteration.scope ∧
      ∀ owner, owner ≠ retired → scopeQuiescent before owner = false → scopeQuiescent after owner = false := by
  obtain ⟨activities, _, owner⟩ := frame.bound_outer entry parent retired before binding bound
  have parentless : occurrenceParent? before.scopeOccurrences binding.activity.owner = none := by
    rw [owner]
    unfold occurrenceParent?
    rw [← List.head?_filter, frame.root]
    rfl
  unfold completeParallelScope? at completed
  simp only [bound, bind, Option.bind_some] at completed
  split at completed <;> try contradiction
  rename_i permitted
  have quiet : scopeQuiescent before retired = true := by
    cases quiet : scopeQuiescent before retired <;> simp_all
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, retiredStep, completed⟩ := Option.bind_eq_some_iff.mp completed
  have dispatch := retireParallelScopeIteration_dispatch binding.controller binding.iterations retired condition retirement retiredStep
  cases retirement with
  | remaining next selected first rest =>
    cases Option.some.inj completed
    constructor
    · let edited := { before with
        variables
        activityOccurrences := before.activityOccurrences.map fun candidate =>
          if candidate == binding.activity then { candidate with body := .parallelChildScopes first rest } else candidate
        parallelScopeControllers := before.parallelScopeControllers.map fun candidate =>
          if candidate == binding.controller then next else candidate }
      have preserved := quiescent_leaf_cancellation_frame edited retired quiet frame.noCalls
      exact ⟨preserved.control, preserved.pending, preserved.tokens, preserved.scopes⟩
    have ready := remaining_retirement_quiescence entry before retired binding variables next selected first rest condition
      bound parentless frame.noCalls activities quiet retiredStep
    have notParent : binding.activity.owner ≠ iteration.scope := by
      intro same
      have assigned := parallelScopeBinding_body_parent entry before retired binding bound iteration member
      rw [← same, parentless] at assigned
      contradiction
    refine ⟨ready iteration.scope different notParent, ?_⟩
    intro target outside blocked
    by_cases parent : binding.activity.owner = target
    · have members := remainingRetirement_members binding.controller next binding.iterations retired condition selected first rest retiredStep
      have siblingBound := parallelScopeBinding_retarget entry before retired binding bound first (members first (by simp)).1
      obtain ⟨body, census, _, bodyParent, _⟩ := parallelScopeBinding_body_record entry before first.scope binding siblingBound
      have retained := (parallelScopeRemaining_body_censuses entry before retired binding variables next selected first rest condition
        bound parentless frame.noCalls removed retiredStep first (by simp)).1
      rw [census] at retained
      have present := (List.mem_filter.mp (retained.symm ▸ List.mem_singleton_self body)).1
      apply Bool.eq_false_iff.mpr
      intro quiescent
      exact quiescent_scope_has_no_child _ target quiescent body present (by simpa only [parent] using bodyParent)
    · rw [ready target outside parent]
      exact blocked
  | naturalCompletion next selected =>
    cases dispatch with
    | naturalCompletion selected condition valid shape identity =>
      simp only [shape, List.mem_singleton] at member
      subst iteration
      exact False.elim (different identity)
  | earlyCompletion next selected first rest =>
    cases Option.some.inj completed
    cases dispatch with
    | earlyCompletion preceding following selected first rest valid shape identity siblings =>
      have differentIteration : iteration ≠ selected := by
        intro same
        exact different ((congrArg ParallelScopeIteration.scope same).trans identity)
      have retained : iteration ∈ first :: rest := by
        rw [shape] at member
        rw [← siblings]
        simpa [differentIteration] using member
      obtain ⟨occurrence, present, identity⟩ := survives
      exact False.elim (cancelScopeSubtree_fold_remove_targets (first :: rest) (·.scope) _ iteration retained occurrence present identity)

private theorem occurrence_candidates_subset (program : Program) (before after : RuntimeState)
    (id : OperationId) (oldCandidates newCandidates : List InternalOperationOccurrence)
    (scopes : after.scopeOccurrences ⊆ before.scopeOccurrences)
    (earlier : internalOperationOccurrences? program before id = some oldCandidates)
    (later : internalOperationOccurrences? program after id = some newCandidates) :
    newCandidates ⊆ oldCandidates := by
  unfold internalOperationOccurrences? at earlier later
  split at earlier <;> try contradiction
  rename_i operation declaration
  simp only [declaration] at later
  split at earlier <;> try contradiction
  rename_i ownership selected
  simp only [selected] at later
  dsimp only at earlier later
  split at earlier <;> try contradiction
  split at later <;> try contradiction
  cases Option.some.inj earlier
  cases Option.some.inj later
  intro candidate present
  obtain ⟨owner, member, same⟩ := List.mem_map.mp present
  refine List.mem_map.mpr ⟨owner, (mem_sortBy _ _ _).mpr ?_, same⟩
  obtain ⟨member, definition⟩ := List.mem_filter.mp ((mem_sortBy _ _ _).mp member)
  obtain ⟨occurrence, present, identity⟩ := List.mem_map.mp member
  exact List.mem_filter.mpr ⟨List.mem_map.mpr ⟨occurrence, scopes present, identity⟩, definition⟩

private theorem occurrence_discovery_sublist (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (oldCandidates : List InternalOperationOccurrence)
    (member : operation ∈ program.operations)
    (scopes : after.scopeOccurrences.Sublist before.scopeOccurrences)
    (earlier : internalOperationOccurrences? program before operation.id = some oldCandidates) :
    ∃ candidates, internalOperationOccurrences? program after operation.id = some candidates ∧
      ∀ candidate ∈ candidates, resolveInternalOperationOccurrence? program after candidate = some operation := by
  unfold internalOperationOccurrences? at earlier
  split at earlier <;> try contradiction
  rename_i chosen declaration
  have same : operation = chosen := by
    have present : operation ∈ program.operations.filter (·.id == operation.id) := List.mem_filter.mpr ⟨member, by simp⟩
    rw [declaration] at present
    simpa using present
  subst chosen
  split at earlier <;> try contradiction
  rename_i ownership owned
  dsimp only at earlier
  split at earlier <;> try contradiction
  rename_i unique
  have rawUnique := (sortBy_permutation InternalCommutation.scopeBefore _).nodup_iff.mp unique
  have newRawUnique : ((after.scopeOccurrences.map (·.id)).filter (·.definitionScopeId == ownership.scopeId)).Nodup :=
    rawUnique.sublist ((scopes.map (·.id)).filter _)
  have newUnique := (sortBy_permutation InternalCommutation.scopeBefore _).nodup_iff.mpr newRawUnique
  let owners := InternalCommutation.sortBy InternalCommutation.scopeBefore ((after.scopeOccurrences.map (·.id)).filter (·.definitionScopeId == ownership.scopeId))
  let candidates := owners.map (fun owner => InternalOperationOccurrence.mk operation.id owner)
  have discovered : internalOperationOccurrences? program after operation.id = some candidates := by
    simp only [internalOperationOccurrences?, declaration, owned, newUnique, ↓reduceIte]
    rfl
  refine ⟨candidates, discovered, ?_⟩
  intro candidate present
  obtain ⟨owner, _, identity⟩ := List.mem_map.mp present
  cases identity
  have found : program.operations.find? (·.id == operation.id) = some operation := by
    rw [← List.head?_filter, declaration]
    rfl
  simpa only [resolveInternalOperationOccurrence?, discovered, bind, Option.bind_some,
    List.contains_iff_mem.mpr present, ↓reduceIte] using found

private theorem stable_operation_discovery (program : Program) (state : RuntimeState)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (empty : (deriveInternalExecutionFrontier program state).offers = [])
    (successful : (deriveInternalExecutionFrontier program state).preparationFailed = false)
    (operation : SemanticOperation) (member : operation ∈ program.operations) :
    ∃ candidates, internalOperationOccurrences? program state operation.id = some candidates ∧
      operation.kind ∈ [SemanticOperationKind.initiate, .enterParallelMultiInstanceScope, .completeParallelMultiInstanceScope,
        .completeScope, .awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] := by
  have reflected := deriveInternalExecutionFrontier_empty_reflects program state (by simp [running]) empty successful operation member
  have ordinary : (ordinaryExecutionFrontier program state operation).preparationFailed = false := by
    cases operation <;> simpa [running, mergeExecutionFrontier, profile] using reflected.2
  simp only [ordinaryExecutionFrontier, profile, beq_self_eq_true, ↓reduceIte] at ordinary
  cases found : internalOperationOccurrenceOffers? program state operation with
  | none => simp [found] at ordinary
  | some offers =>
    cases operation <;> simp only [internalOperationOccurrenceOffers?] at found <;> try contradiction
    all_goals
      obtain ⟨candidates, discovered, _⟩ := Option.bind_eq_some_iff.mp found
      exact ⟨candidates, discovered, by simp [SemanticOperation.kind]⟩

private theorem stable_resolution_of_scope_subset (program : Program) (before after : RuntimeState)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (running : before.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (empty : (deriveInternalExecutionFrontier program before).offers = [])
    (successful : (deriveInternalExecutionFrontier program before).preparationFailed = false)
    (scopes : after.scopeOccurrences ⊆ before.scopeOccurrences)
    (resolved : resolveInternalOperationOccurrence? program after candidate = some operation) :
    resolveInternalOperationOccurrence? program before candidate = some operation := by
  have declaration := resolveInternalOperationOccurrence_declaration program after candidate operation resolved
  obtain ⟨oldCandidates, discovered, _⟩ := stable_operation_discovery program before profile instanceId running empty successful operation declaration.1
  have earlier : internalOperationOccurrences? program before candidate.operationId = some oldCandidates := by
    simpa only [declaration.2] using discovered
  obtain ⟨newCandidates, later, present⟩ := resolveInternalOperationOccurrence_requires_exact_candidate program after candidate operation resolved
  have previous := occurrence_candidates_subset program before after candidate.operationId oldCandidates newCandidates scopes earlier later present
  simpa only [resolveInternalOperationOccurrence?, earlier, later, bind, Option.bind_some,
    List.contains_iff_mem.mpr present, List.contains_iff_mem.mpr previous, ↓reduceIte] using resolved

/-- A surviving scope cannot gain a body offer when nonfinal retirement removes its completed
sibling: exact resolution is inherited through the reduced scope census and token reads still
match the stable command boundary. Wait inputs remain absent, so failed arming cannot masquerade
as disabled work. Structural-operation discovery remains a separate obligation.
-/
theorem ParallelScopeRemainingFrame.body_readiness (program : Program) (stable before after : RuntimeState)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable before actor)
    (remaining : ParallelScopeRemainingFrame before after actor)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (running : stable.control = .running instanceId)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program after candidate = some operation)
    (body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]) :
    applyInternalOperationOccurrence? program after candidate = none ∧
      (operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect] →
        ∀ input ∈ bodyConsumedPorts operation,
          (after.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 0) := by
  have scopes : after.scopeOccurrences ⊆ stable.scopeOccurrences := by
    rw [remaining.scopes, frame.scopes]
    exact List.filter_sublist.subset
  have original := stable_resolution_of_scope_subset program stable after profile instanceId running
    candidate operation empty successful scopes resolved
  have different : candidate.owner ≠ actor := by
    intro same
    have live := resolved_exactLiveOccurrence program after candidate operation resolved
    have absent : after.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = candidate.owner)) = [] := by
      rw [remaining.scopes]
      apply List.filter_eq_nil_iff.mpr
      intro occurrence present matching
      have outside : occurrence.id ≠ actor := by simpa only [bne_iff_ne] using (List.mem_filter.mp present).2
      exact outside ((of_decide_eq_true matching).trans same)
    simp [exactLiveOccurrence, absent] at live
  have counts : ∀ place, (after.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length =
      (stable.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length := by
    intro place
    rw [remaining.tokens]
    exact frame.counts candidate.owner different place
  refine ⟨stable_frontier_body_refusal_of_resolved_token_frame program stable after profile candidate operation
    original body empty successful (remaining.control.trans frame.control) resolved counts, ?_⟩
  intro waitKind input member
  rw [counts]
  exact stable_frontier_wait_input_absent program stable profile instanceId running candidate operation
    original waitKind empty successful input member

private theorem mapM_empty_chunks {α β : Type} (values : List α) (project : α → Option (List β))
    (empty : ∀ value ∈ values, project value = some []) :
    values.mapM project = some (values.map (fun _ => [])) := by
  induction values with
  | nil => rfl
  | cons first rest ih =>
    simp only [List.mapM_cons, empty first (by simp), bind, Option.bind_some]
    rw [ih (fun value present => empty value (by simp [present]))]
    rfl

private theorem any_input_absent (state : RuntimeState) (owner : ScopeOccurrenceId) (input : ControlPlaceId)
    (count : (state.tokens.filter fun token => token.placeId == input && token.owner == owner).length = 0) :
    (state.tokens.any fun token => token.placeId == input && token.owner == owner) = false := by
  apply List.any_eq_false.mpr
  intro token present matching
  have found : token ∈ state.tokens.filter (fun token => token.placeId == input && token.owner == owner) :=
    List.mem_filter.mpr ⟨present, matching⟩
  rw [List.length_eq_zero_iff.mp count] at found
  contradiction

/-- Scope removal preserves the complete candidate census for every declaration, including
structural operations. Each surviving candidate resolves to its original declaration; this
establishes discovery, independently of whether its evaluator can execute.
-/
theorem ParallelScopeRemainingFrame.occurrence_discovery (program : Program) (stable before after : RuntimeState)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable before actor)
    (remaining : ParallelScopeRemainingFrame before after actor)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (running : stable.control = .running instanceId)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (operation : SemanticOperation) (member : operation ∈ program.operations) :
    ∃ candidates, internalOperationOccurrences? program after operation.id = some candidates ∧
      ∀ candidate ∈ candidates, resolveInternalOperationOccurrence? program after candidate = some operation := by
  obtain ⟨oldCandidates, discovered, _⟩ := stable_operation_discovery program stable profile instanceId running empty successful operation member
  have scopes : after.scopeOccurrences.Sublist stable.scopeOccurrences := by
    rw [remaining.scopes, frame.scopes]
    exact List.filter_sublist
  exact occurrence_discovery_sublist program stable after operation oldCandidates member scopes discovered

/-- Nonfinal retirement preserves successful empty body discovery, including the failed-wait
check. The candidate census is derived from actual scope removal, not assumed to succeed.
-/
theorem ParallelScopeRemainingFrame.body_discovery (program : Program) (stable before after : RuntimeState)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable before actor)
    (remaining : ParallelScopeRemainingFrame before after actor)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (running : stable.control = .running instanceId)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (operation : SemanticOperation) (member : operation ∈ program.operations)
    (body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]) :
    ordinaryExecutionFrontier program after operation = {} := by
  obtain ⟨candidates, discovery, resolves⟩ := remaining.occurrence_discovery program stable before after actor frame
    profile instanceId running empty successful operation member
  have ready := fun candidate present => remaining.body_readiness program stable before after actor frame profile instanceId running
    empty successful candidate operation (resolves candidate present) body
  let project := fun candidate => match applyInternalOperationOccurrence? program after candidate with
    | some successor => some [(candidate, successor)]
    | none => if (match operation with
        | .awaitUserTask _ _ input .. | .awaitEffect _ _ input .. =>
            after.tokens.any fun token => token.placeId == input && token.owner == candidate.owner
        | _ => false) then none else some []
  have pieces := mapM_empty_chunks candidates project (by
    intro candidate present
    dsimp only [project]
    rw [(ready candidate present).1]
    cases operation <;> simp [SemanticOperation.kind] at body
    all_goals first
    | rfl
    | have absent := (ready candidate present).2 (by simp [SemanticOperation.kind]) _
        (by simp only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton]; rfl)
      simp only [any_input_absent after candidate.owner _ absent, Bool.false_eq_true, ↓reduceIte])
  have flat : (candidates.map (fun _ => ([] : List (InternalOperationOccurrence × RuntimeState)))).flatten = [] := by
    induction candidates <;> simp_all
  simp only [ordinaryExecutionFrontier, profile, beq_self_eq_true, ↓reduceIte]
  suffices offers : internalOperationOccurrenceOffers? program after operation = some [] by rw [offers]; rfl
  cases operation <;> simp [SemanticOperation.kind] at body
  all_goals
    simp only [internalOperationOccurrenceOffers?, discovery, bind, Option.bind_some]
    change (do let chunks ← candidates.mapM project; pure chunks.flatten) = some []
    rw [pieces]
    simp only [bind, Option.bind_some, flat, pure]

/-- Successful candidate discovery and refusal of all structural candidates, combined with
body-readiness preservation, establish the whole scheduler frontier rather than merely the
absence of successful evaluator calls. In particular, preparation failure stays false.
-/
theorem ParallelScopeRemainingFrame.frontier_empty (program : Program) (stable before after : RuntimeState)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable before actor)
    (remaining : ParallelScopeRemainingFrame before after actor)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (instanceId : SemanticId) (running : stable.control = .running instanceId)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (refused : ∀ candidate operation, resolveInternalOperationOccurrence? program after candidate = some operation →
      ((operation.kind = .initiate ∨ operation.kind = .enterParallelMultiInstanceScope ∨ operation.kind = .completeScope) ∨
        operation.kind = .completeParallelMultiInstanceScope) → applyInternalOperationOccurrence? program after candidate = none) :
    deriveInternalExecutionFrontier program after = {} := by
  apply deriveInternalExecutionFrontier_empty
  intro operation member
  obtain ⟨_, _, supported⟩ := stable_operation_discovery program stable profile instanceId running empty successful operation member
  have body := remaining.body_discovery program stable before after actor frame profile instanceId running empty successful operation member
  obtain ⟨candidates, discovery, resolves⟩ := remaining.occurrence_discovery program stable before after actor frame
    profile instanceId running empty successful operation member
  let selectedOperation := operation
  cases operation <;> simp [SemanticOperation.kind] at supported
  all_goals first
  | solve | apply body; simp [SemanticOperation.kind]
  | have disabled : ∀ candidate ∈ candidates, applyInternalOperationOccurrence? program after candidate = none := by
      intro candidate present
      exact refused candidate _ (resolves candidate present) (by simp [SemanticOperation.kind])
    let project := fun candidate => match applyInternalOperationOccurrence? program after candidate with
      | some successor => some [(candidate, successor)]
      | none => if false then none else some []
    have pieces := mapM_empty_chunks candidates project (by
      intro candidate present
      dsimp only [project]
      rw [disabled candidate present]
      rfl)
    have flat : (candidates.map (fun _ => ([] : List (InternalOperationOccurrence × RuntimeState)))).flatten = [] := by
      induction candidates <;> simp_all
    suffices offers : internalOperationOccurrenceOffers? program after selectedOperation = some [] by
      change ordinaryExecutionFrontier program after selectedOperation = {}
      simp only [ordinaryExecutionFrontier, profile, beq_self_eq_true, ↓reduceIte, offers]
      rfl
    dsimp only [selectedOperation]
    simp only [internalOperationOccurrenceOffers?, discovery, bind, Option.bind_some]
    change (do let chunks ← candidates.mapM project; pure chunks.flatten) = some []
    rw [pieces]
    simp only [bind, Option.bind_some, flat, pure]

private theorem remaining_scope_filter (stable before after : RuntimeState) (actor : ScopeOccurrenceId)
    (frame : ParallelScopeOwnerFrame stable before actor)
    (remaining : ParallelScopeRemainingFrame before after actor) (test : RuntimeScopeOccurrence → Bool)
    (excluded : ∀ occurrence ∈ stable.scopeOccurrences, occurrence.id = actor → test occurrence = false) :
    after.scopeOccurrences.filter test = stable.scopeOccurrences.filter test := by
  rw [remaining.scopes, frame.scopes, List.filter_filter]
  apply List.filter_congr
  intro occurrence present
  by_cases same : occurrence.id = actor
  · simp [same, excluded occurrence present same]
  · simp [same]

/-- Removing one completed body cannot restart the Process, enter another population, or
complete a parent while a child remains. The blocker premise is supplied by actual nonfinal
retirement; it transfers every foreign quiescence obligation, not only token readiness.
-/
theorem ParallelScopeRemainingFrame.nonretirement_exit_refused (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (stable before after successor : RuntimeState)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable before actor)
    (remaining : ParallelScopeRemainingFrame before after actor)
    (blockers : ∀ owner, owner ≠ actor → scopeQuiescent before owner = false → scopeQuiescent after owner = false)
    (survivor : RuntimeScopeOccurrence) (survives : survivor ∈ after.scopeOccurrences)
    (child : actor.definitionScopeId = analysis.entry.childScopeId)
    (sibling : survivor.id.definitionScopeId = actor.definitionScopeId) (parented : survivor.parent.isSome = true)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (instanceId : SemanticId) (running : stable.control = .running instanceId)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program after candidate = some operation)
    (phase : operation.kind = .initiate ∨ operation.kind = .enterParallelMultiInstanceScope ∨ operation.kind = .completeScope)
    (applied : applyInternalOperationOccurrence? program after candidate = some successor) : False := by
  have scopes : after.scopeOccurrences ⊆ stable.scopeOccurrences := by
    rw [remaining.scopes, frame.scopes]
    exact List.filter_sublist.subset
  have original := stable_resolution_of_scope_subset program stable after profile instanceId running candidate operation
    empty successful scopes resolved
  have refused := deriveInternalExecutionFrontier_empty_occurrence_refusal program stable profile candidate operation original empty successful
  obtain ⟨entry, binding, bound⟩ := frame.actorBound
  obtain ⟨body, bodySelected, bodyId, bodyParent, _⟩ := parallelScopeBinding_body_record entry stable actor binding bound
  have roots : after.scopeOccurrences.filter (·.parent.isNone) = stable.scopeOccurrences.filter (·.parent.isNone) := by
    apply remaining_scope_filter stable before after actor frame remaining
    intro occurrence present same
    have included : occurrence ∈ stable.scopeOccurrences.filter (fun value => value.id == actor) :=
      List.mem_filter.mpr ⟨present, by simp [same]⟩
    rw [bodySelected] at included
    have identity : occurrence = body := by simpa using included
    simp [identity, bodyParent]
  have control := remaining.control.trans frame.control
  have pending := remaining.pending.trans frame.pending
  rcases phase with initiation | entryKind | completion
  · cases operation <;> simp only [SemanticOperation.kind] at initiation <;> try contradiction
    rename_i id origin output
    simp only [applyInternalOperationOccurrence?, running, control, resolved, original, bind, Option.bind_some] at applied refused
    rw [roots] at applied
    split at applied <;> try contradiction
    rename_i root selected
    split at applied <;> try contradiction
    rename_i owner
    simp only [selected, owner, ↓reduceIte] at refused
    have rootFrame : rootScopeOccurrence? after = rootScopeOccurrence? stable := by simp only [rootScopeOccurrence?, roots]
    have enabled : (initiateState? stable output).isSome = (initiateState? after output).isSome := by
      cases chosen : rootScopeOccurrence? stable <;> cases ready : stable.initiationPending <;>
        simp [initiateState?, rootFrame, chosen, pending, ready]
    simp [refused, applied] at enabled
  · obtain ⟨actual, actualResolved, _, replayed⟩ := ParallelScopeReplay.applyInternalOperationOccurrence_replay_record program after successor candidate profile applied
    have same : actual = operation := Option.some.inj (actualResolved.symm.trans resolved)
    subst actual
    have completed := ParallelScopeReplay.replayed_parallel_entry_execution program analysis analyzed after successor
      { operationId := candidate.operationId, operationKind := operation.kind,
        origin := operation.origin, owner := candidate.owner, mergeInput := none } entryKind replayed
    have present : (after.scopeOccurrences.any fun occurrence => occurrence.id.definitionScopeId == analysis.entry.childScopeId) = true :=
      List.any_eq_true.mpr ⟨survivor, survives, by simp [sibling, child]⟩
    simp [enterParallelScope?, present] at completed
  · have declared := (resolveInternalOperationOccurrence_declaration program after candidate operation resolved).1
    cases operation <;> simp only [SemanticOperation.kind] at completion <;> try contradiction
    rename_i id origin scopeId parentOutput
    have allowed := ParallelScopeStart.analyzeProgram_operation_allowed program analysis analyzed _ declared
    have output : parentOutput = none := by
      cases parentOutput <;> simp [SequentialScopeProgram.operationAllowed] at allowed ⊢
    subst parentOutput
    simp only [applyInternalOperationOccurrence?, running, control, resolved, original, bind, Option.bind_some] at applied refused
    split at applied <;> try contradiction
    rename_i root unique
    split at applied <;> try contradiction
    rename_i sameOwner
    have rootId : root.id = candidate.owner := by simpa only [beq_iff_eq] using sameOwner
    obtain ⟨unmonitored, unbounded⟩ := ParallelScopeReplay.admitted_completion_unwrapped program analysis analyzed scopeId
    rw [completeSelectedScope?, unmonitored,
      completeBoundedScope_eq_completeScope_of_unbounded program after scopeId none unbounded] at applied
    have uniqueAfter : after.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) = [root] := by
      simpa only [Bool.beq_eq_decide_eq] using unique
    obtain ⟨quiet, updated⟩ := completeScopeState_selected_update after successor scopeId none root uniqueAfter applied
    have parentless : root.parent = none := by
      cases parent : root.parent <;> simp only [parent, control, running] at updated <;> first | rfl | contradiction
    have otherScope : actor.definitionScopeId ≠ scopeId := by
      intro same
      have included : survivor ∈ after.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == scopeId) :=
        List.mem_filter.mpr ⟨survives, by simp [sibling, same]⟩
      rw [unique] at included
      have identity : survivor = root := by simpa using included
      simp [identity, parentless] at parented
    have census := remaining_scope_filter stable before after actor frame remaining
      (fun occurrence => occurrence.id.definitionScopeId == scopeId)
      (by intro occurrence _ same; simp [same, otherScope])
    have uniqueStable : stable.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) = [root] := by
      simpa only [Bool.beq_eq_decide_eq] using census.symm.trans unique
    simp only [← census, unique, sameOwner, ↓reduceIte] at refused
    rw [completeSelectedScope?, unmonitored,
      completeBoundedScope_eq_completeScope_of_unbounded program stable scopeId none unbounded] at refused
    have pendingFalse : stable.initiationPending = false := by
      cases ready : after.initiationPending with
      | false => exact pending.symm.trans ready
      | true => simp [parentless, control, running, ready] at updated
    have rootPresent := (List.mem_filter.mp (uniqueAfter.symm ▸ List.mem_singleton_self root)).2
    have outside : candidate.owner ≠ actor := by
      intro same
      exact otherScope (by simpa only [rootId, same] using of_decide_eq_true rootPresent)
    have rootQuiet : scopeQuiescent stable root.id = true := by
      cases checked : scopeQuiescent stable candidate.owner with
      | true => simpa only [rootId] using checked
      | false =>
        have blocked := blockers candidate.owner outside (frame.blocked candidate.owner outside checked)
        rw [rootId, blocked] at quiet
        contradiction
    simp [completeScopeState?, uniqueStable, rootQuiet, completeQuiescentScope?, parentless, running, pendingFalse] at refused

private theorem prefix_empty_schedule {program : Program} {commandId : SemanticId}
    {fuel index ordinal finalFuel finalIndex finalOrdinal : Nat} {initial final : RuntimeState}
    {remaining : InternalChoiceSchedule}
    (path : ScheduledClosurePrefix program commandId fuel index ordinal [] initial
      finalFuel finalIndex finalOrdinal remaining final) : remaining = [] := by
  induction path with
  | initial => rfl
  | step _ _ selected _ _ ih =>
    rcases selectInternalExecutionFrontier_consumption _ _ _ _ _ _ _ selected with kept | consumed
    · exact kept.2.trans ih
    · obtain ⟨_, _, _, _, _, _, shape, _⟩ := consumed
      rw [ih] at shape
      contradiction

/-- A stable actual cut closes the original command without further state change or failure.
The empty choice schedule is inherited from its execution prefix, not assumed for the suffix.
-/
theorem InternalCommutation.ParallelScopeSingletonCut.stable_success {program : Program} {commandId : SemanticId}
    {fuel index ordinal : Nat} {state : RuntimeState}
    (cut : ParallelScopeSingletonCut program commandId fuel index ordinal [] state)
    (stable : deriveInternalExecutionFrontier program cut.step.state = {}) :
    (closeScheduledTraced fuel program commandId index ordinal [] state).state = cut.step.state ∧
      (closeScheduledTraced fuel program commandId index ordinal [] state).failed = false := by
  have continuation := cut.continuation
  rw [prefix_empty_schedule cut.after_prefix, closeScheduledTraced_stable _ _ _ _ _ _ stable] at continuation
  exact continuation

/-- A surviving sibling at the actual scoped-command retirement cut establishes a successful
empty frontier, excluding every body and structural operation. Admission and the actual prefix
supply its binding and blockers; `ParallelScopeSingletonCut.stable_success` closes the suffix.
-/
theorem ParallelScopeCommandBoundaryReachable.scoped_retirement_sibling_frame (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis)
    (selected : ParallelScopeStart.programSelected program = true)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (entryBefore issued current : RuntimeState) (record : InternalTransitionRecord)
    (kind : record.operationKind = .enterParallelMultiInstanceScope)
    (entered : replayInternalOperationOccurrence? program entryBefore record = some issued)
    (reachable : ParallelScopeCommandBoundaryReachable program current)
    (instanceId : SemanticId) (running : current.control = .running instanceId)
    (stimulus : Stimulus) (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program current stimulus).outcome = .committed)
    (structural : ParallelScopeStructuralFrame record.owner current)
    (actor : ScopeOccurrenceId) (resumed : scopedWaitCompletionOwner program current stimulus actor) (fuel : Nat) :
    ParallelScopeOwnerFrame current
        (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 [] (admitStimulus program current stimulus).state).state actor ∨
      ∃ cut : ParallelScopeSingletonCut program (stimulusCommandId stimulus) fuel 1 0 [] (admitStimulus program current stimulus).state,
        ParallelScopeOwnerFrame current cut.before actor ∧
        cut.operation.kind = .completeParallelMultiInstanceScope ∧ cut.candidate.owner = actor ∧
        ∃ binding, parallelScopeBinding? analysis.entry cut.before actor = some binding ∧
          completeParallelScope? analysis.entry cut.before actor = some cut.step.state ∧
          ∀ iteration ∈ binding.iterations, iteration.scope ≠ actor →
            (∃ occurrence ∈ cut.step.state.scopeOccurrences, occurrence.id = iteration.scope) →
            ParallelScopeRemainingFrame cut.before cut.step.state actor ∧
              scopeQuiescent cut.step.state iteration.scope = false ∧
              deriveInternalExecutionFrontier program cut.step.state = {} := by
  rcases reachable.scoped_closure_exit_classification program analysis selected analyzed entryBefore issued current record kind
    entered instanceId running stimulus completion committed structural actor resumed fuel with
    retained | ⟨cut, frame, retirement, owned⟩
  · exact Or.inl retained
  · have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
      simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
    obtain ⟨operation, resolved, _, replayed⟩ := ParallelScopeReplay.applyInternalOperationOccurrence_replay_record
      program cut.before cut.step.state cut.candidate profile cut.applied
    have same : operation = cut.operation := Option.some.inj (resolved.symm.trans cut.resolved)
    subst operation
    obtain ⟨entry, member, completed⟩ := ParallelScopeReplay.replayed_retirement_execution program cut.before cut.step.state
      { operationId := cut.candidate.operationId, operationKind := cut.operation.kind,
        origin := cut.operation.origin, owner := cut.candidate.owner, mergeInput := none } retirement replayed
    obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis analyzed
    rw [entries] at member
    have sameEntry : entry = analysis.entry := by simpa using member
    subst entry
    simp only [owned] at completed
    have bindingReady := completed
    unfold completeParallelScope? at bindingReady
    obtain ⟨binding, bound, _⟩ := Option.bind_eq_some_iff.mp bindingReady
    refine Or.inr ⟨cut, frame, retirement, owned, binding, bound, completed, ?_⟩
    intro iteration present different survives
    have retained := completeParallelScope_surviving_sibling_frame analysis.entry record.owner cut.before cut.step.state
      actor binding iteration (frame.population record.owner structural) bound present different completed survives
    have stable : (deriveInternalExecutionFrontier program current).offers = [] ∧
        (deriveInternalExecutionFrontier program current).preparationFailed = false := by
      simpa using reachable.running_stable program selected current instanceId running
    have siblingBound := parallelScopeBinding_retarget analysis.entry cut.before actor binding bound iteration present
    obtain ⟨body, census, bodyId, bodyParent, child⟩ := parallelScopeBinding_body_record analysis.entry cut.before iteration.scope binding siblingBound
    have bodyPresent : body ∈ current.scopeOccurrences := by
      rw [← frame.scopes]
      exact (List.mem_filter.mp (census.symm ▸ List.mem_singleton_self body)).1
    refine ⟨retained.1, ?_, ?_⟩
    · rw [retained.2.1]
      apply frame.blocked iteration.scope different
      obtain ⟨capacity, accepted⟩ := Option.isSome_iff_exists.mp
        (parallelScope_committed_resumption_capacity program analysis current stimulus selected analyzed completion committed)
      obtain ⟨original, originalBound⟩ := ParallelScopeStart.programStateCapacity_live_body_binding program analysis current
        capacity analyzed accepted body bodyPresent (by simpa only [bodyId] using child)
      simpa only [bodyId] using parallelScope_stable_resumption_body_nonquiescent program analysis selected analyzed
        entryBefore issued current record kind entered stimulus completion committed body.id original structural originalBound stable.1 stable.2
    · apply retained.1.frontier_empty program current cut.before cut.step.state actor frame profile instanceId running stable.1 stable.2
      intro candidate operation resolved phase
      cases applied : applyInternalOperationOccurrence? program cut.step.state candidate with
      | none => rfl
      | some successor =>
        rcases phase with nonretirement | retirement
        · have stillPresent : body ∈ cut.step.state.scopeOccurrences := by
            rw [retained.1.scopes, frame.scopes]
            exact List.mem_filter.mpr ⟨bodyPresent, by simp [bodyId, different]⟩
          obtain ⟨_, _, _, _, actorChild⟩ := parallelScopeBinding_body_record analysis.entry cut.before actor binding bound
          exact False.elim (retained.1.nonretirement_exit_refused program analysis current cut.before cut.step.state successor actor frame
            retained.2.2 body stillPresent actorChild (by simp only [bodyId, child, actorChild]) (by simp [bodyParent])
            profile analyzed instanceId running stable.1 stable.2 candidate operation resolved nonretirement applied)
        obtain ⟨actual, actualResolved, _, replayed⟩ := ParallelScopeReplay.applyInternalOperationOccurrence_replay_record
          program cut.step.state successor candidate profile applied
        have same : actual = operation := Option.some.inj (actualResolved.symm.trans resolved)
        subst actual
        obtain ⟨entry, member, completed⟩ := ParallelScopeReplay.replayed_retirement_execution program cut.step.state successor
          { operationId := candidate.operationId, operationKind := operation.kind,
            origin := operation.origin, owner := candidate.owner, mergeInput := none } retirement replayed
        obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis analyzed
        rw [entries] at member
        have sameEntry : entry = analysis.entry := by simpa using member
        subst entry
        unfold completeParallelScope? at completed
        obtain ⟨nextBinding, nextBound, completed⟩ := Option.bind_eq_some_iff.mp completed
        split at completed <;> try contradiction
        rename_i permitted
        obtain ⟨target, census, targetId, _, targetChild⟩ := parallelScopeBinding_body_record analysis.entry cut.step.state candidate.owner nextBinding nextBound
        have present : target ∈ cut.step.state.scopeOccurrences := (List.mem_filter.mp (census.symm ▸ List.mem_singleton_self target)).1
        rw [retained.1.scopes, frame.scopes] at present
        have outside : candidate.owner ≠ actor := by simpa only [targetId, bne_iff_ne] using (List.mem_filter.mp present).2
        obtain ⟨capacity, accepted⟩ := Option.isSome_iff_exists.mp
          (parallelScope_committed_resumption_capacity program analysis current stimulus selected analyzed completion committed)
        obtain ⟨original, originalBound⟩ := ParallelScopeStart.programStateCapacity_live_body_binding program analysis current capacity analyzed accepted
          target (List.mem_filter.mp present).1 (by simpa only [targetId] using targetChild)
        have blocked := parallelScope_stable_resumption_body_nonquiescent program analysis selected analyzed
          entryBefore issued current record kind entered stimulus completion committed target.id original structural originalBound stable.1 stable.2
        rw [targetId] at blocked
        have stopped := retained.2.2 candidate.owner outside (frame.blocked candidate.owner outside blocked)
        simp [stopped] at permitted

end BpmnSemantics.SemanticProcess
