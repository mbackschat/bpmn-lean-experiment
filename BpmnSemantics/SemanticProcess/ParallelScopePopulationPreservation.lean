module

public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import BpmnSemantics.SemanticProcess.ParallelScopeRuntimeLaws
import BpmnSemantics.SemanticProcess.ScopeAncestryLaws

/-! # Parallel repeated-scope population preservation

PMIS-END-01 and PMIS-CANCEL-01 share exact population censuses through retirement. These proofs stay downstream of data and occurrence execution so the structural frame can compose actual batch prefixes without introducing a runtime dependency cycle. They do not establish committed-state reachability or bounded progress.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Exact binding supplies each child's direct parent lookup, independently of unrelated scope records. -/
theorem parallelScopeBinding_body_parent (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state target = some binding)
    (iteration : ParallelScopeIteration) (member : iteration ∈ binding.iterations) :
    occurrenceParent? state.scopeOccurrences iteration.scope = some binding.activity.owner := by
  have bodyBound := List.all_eq_true.mp (parallelScopeBinding_population entry state target binding bound).2 iteration member
  unfold parallelScopeBodyBound at bodyBound
  split at bodyBound <;> try contradiction
  rename_i body selected
  simp only [Bool.and_eq_true] at bodyBound
  have parent : body.parent = some binding.activity.owner := by
    simpa only [beq_iff_eq] using bodyBound.1.1.2
  unfold occurrenceParent?
  have predicates : (fun value : RuntimeScopeOccurrence => decide (value.id = iteration.scope)) =
      (fun value => value.id == iteration.scope) := by
    funext value
    apply Bool.eq_iff_iff.mpr
    simp
  rw [← List.head?_filter, predicates, selected]
  exact parent

/-- Every distinct initially bound sibling lies outside the retired leaf under the parentless owning root. -/
theorem parallelScopeBinding_sibling_outside (entry : ParallelScopeEntry) (state : RuntimeState)
    (retired : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state retired = some binding)
    (iteration : ParallelScopeIteration) (member : iteration ∈ binding.iterations)
    (different : iteration.scope ≠ retired)
    (parentless : occurrenceParent? state.scopeOccurrences binding.activity.owner = none) :
    occurrenceInSubtree state.scopeOccurrences retired iteration.scope = false := by
  have parentDifferent : binding.activity.owner ≠ retired := by
    intro same
    obtain ⟨selected, selectedMember, identity⟩ := parallelScopeBinding_member entry state retired binding bound
    have assigned := parallelScopeBinding_body_parent entry state retired binding bound selected selectedMember
    rw [identity, ← same, parentless] at assigned
    contradiction
  exact occurrenceInSubtree_sibling state.scopeOccurrences retired iteration.scope binding.activity.owner different
    parentDifferent (parallelScopeBinding_body_parent entry state retired binding bound iteration member) parentless

/-- Actual leaf cancellation retains each initially bound sibling's complete scope and frame censuses in a Call-free population. -/
theorem parallelScopeBinding_cancel_sibling_census (entry : ParallelScopeEntry) (state : RuntimeState)
    (retired : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state retired = some binding)
    (iteration : ParallelScopeIteration) (member : iteration ∈ binding.iterations)
    (different : iteration.scope ≠ retired)
    (parentless : occurrenceParent? state.scopeOccurrences binding.activity.owner = none)
    (noCalls : state.calledProcessOccurrences = []) :
    (cancelScopeSubtree state retired .remove).scopeOccurrences.filter (fun value => value.id == iteration.scope) =
        state.scopeOccurrences.filter (fun value => value.id == iteration.scope) ∧
      (cancelScopeSubtree state retired .remove).variables.scopes.filter (fun value => decide (value.owner = iteration.scope)) =
        state.variables.scopes.filter (fun value => decide (value.owner = iteration.scope)) := by
  exact cancelScopeSubtree_outside_owner_census state retired iteration.scope noCalls
    (parallelScopeBinding_sibling_outside entry state retired binding bound iteration member different parentless)

theorem remainingRetirement_members (controller next : ParallelScopeController)
    (iterations : List ParallelScopeIteration) (retired : ScopeOccurrenceId) (condition : Bool)
    (selected first : ParallelScopeIteration) (rest : List ParallelScopeIteration)
    (executed : retireParallelScopeIteration controller iterations retired condition = some (.remaining next selected first rest)) :
    ∀ iteration ∈ first :: rest, iteration ∈ iterations ∧ iteration.scope ≠ retired := by
  have relation := retireParallelScopeIteration_dispatch controller iterations retired condition (.remaining next selected first rest) executed
  cases relation with
  | remaining before after selected first rest valid shape identity siblings =>
    have retained : (first :: rest).Sublist iterations := by
      rw [← siblings, shape]
      exact (List.sublist_cons_self selected after).append_left before
    simp only [validParallelScopePopulation, Bool.and_eq_true] at valid
    have iterationValid := valid.1.2
    simp only [validParallelScopeIterations, Bool.and_eq_true, decide_eq_true_eq] at iterationValid
    have unique : (iterations.map (·.scope)).Nodup :=
      List.nodup_iff_pairwise_ne.mpr (List.pairwise_map.mpr (iterationValid.2.imp fun facts => facts.2.1))
    rw [shape, List.map_append, List.map_cons] at unique
    obtain ⟨_, tailUnique, disjoint⟩ := List.nodup_append.mp unique
    have fresh := (List.nodup_cons.mp tailUnique).1
    intro iteration member
    refine ⟨retained.subset member, ?_⟩
    rw [← siblings] at member
    rcases List.mem_append.mp member with leading | trailing
    · exact fun same => disjoint iteration.scope (List.mem_map.mpr ⟨iteration, leading, rfl⟩)
        selected.scope (by simp) (same.trans identity.symm)
    · intro same
      exact fresh (List.mem_map.mpr ⟨iteration, trailing, same.trans identity.symm⟩)

/-- All retained body selections survive the actual frame removal and remaining-arm leaf cancellation. -/
theorem parallelScopeRemaining_body_censuses (entry : ParallelScopeEntry) (before : RuntimeState)
    (retired : ScopeOccurrenceId) (binding : ParallelScopeBinding) (variables : ScopedVariables)
    (next : ParallelScopeController) (selected first : ParallelScopeIteration) (rest : List ParallelScopeIteration)
    (condition : Bool) (bound : parallelScopeBinding? entry before retired = some binding)
    (parentless : occurrenceParent? before.scopeOccurrences binding.activity.owner = none)
    (noCalls : before.calledProcessOccurrences = [])
    (removed : removeScopeVariables? before.variables retired = some variables)
    (executed : retireParallelScopeIteration binding.controller binding.iterations retired condition =
      some (.remaining next selected first rest)) :
    let edited := { before with
      variables := variables
      activityOccurrences := before.activityOccurrences.map fun candidate =>
        if candidate == binding.activity then { candidate with body := .parallelChildScopes first rest } else candidate
      parallelScopeControllers := before.parallelScopeControllers.map fun candidate =>
        if candidate == binding.controller then next else candidate }
    ∀ iteration ∈ first :: rest,
      (cancelScopeSubtree edited retired .remove).scopeOccurrences.filter (fun value => value.id == iteration.scope) =
          before.scopeOccurrences.filter (fun value => value.id == iteration.scope) ∧
        (cancelScopeSubtree edited retired .remove).variables.scopes.filter (fun value => decide (value.owner = iteration.scope)) =
          before.variables.scopes.filter (fun value => decide (value.owner = iteration.scope)) := by
  intro edited iteration member
  obtain ⟨originalMember, different⟩ := remainingRetirement_members binding.controller next binding.iterations retired condition selected first rest executed iteration member
  have outside := parallelScopeBinding_sibling_outside entry before retired binding bound iteration originalMember different parentless
  have census := cancelScopeSubtree_outside_owner_census edited retired iteration.scope noCalls outside
  have shape := (removeScopeVariables_success_iff.mp removed).2
  have erased : variables.scopes.filter (fun value => decide (value.owner = iteration.scope)) =
      before.variables.scopes.filter (fun value => decide (value.owner = iteration.scope)) := by
    rw [shape, List.filter_filter]
    apply List.filter_congr
    intro value _
    by_cases same : value.owner = iteration.scope <;> simp [same, different]
  exact ⟨census.1, census.2.trans erased⟩

theorem parallelScopeRemaining_structural_census (entry : ParallelScopeEntry) (before : RuntimeState)
    (retired : ScopeOccurrenceId) (binding : ParallelScopeBinding) (variables : ScopedVariables)
    (next : ParallelScopeController) (selected first : ParallelScopeIteration) (rest : List ParallelScopeIteration)
    (condition : Bool) (bound : parallelScopeBinding? entry before retired = some binding)
    (parentless : occurrenceParent? before.scopeOccurrences binding.activity.owner = none)
    (noCalls : before.calledProcessOccurrences = [])
    (activities : before.activityOccurrences = [binding.activity])
    (controllers : before.parallelScopeControllers = [binding.controller])
    (executed : retireParallelScopeIteration binding.controller binding.iterations retired condition =
      some (.remaining next selected first rest)) :
    let edited := { before with
      variables := variables
      activityOccurrences := before.activityOccurrences.map fun candidate =>
        if candidate == binding.activity then { candidate with body := .parallelChildScopes first rest } else candidate
      parallelScopeControllers := before.parallelScopeControllers.map fun candidate =>
        if candidate == binding.controller then next else candidate }
    ((cancelScopeSubtree edited retired .remove).activityOccurrences =
      [{ binding.activity with body := .parallelChildScopes first rest }] ∧
      (cancelScopeSubtree edited retired .remove).parallelScopeControllers = [next]) ∧
      (cancelScopeSubtree edited retired .remove).scopeOccurrences.filter (fun value => value.id == binding.activity.owner) =
        before.scopeOccurrences.filter (fun value => value.id == binding.activity.owner) ∧
      (cancelScopeSubtree edited retired .remove).calledProcessOccurrences = [] := by
  intro edited
  have members := remainingRetirement_members binding.controller next binding.iterations retired condition selected first rest executed
  have parentDifferent : binding.activity.owner ≠ retired := by
    intro same
    obtain ⟨chosen, present, identity⟩ := parallelScopeBinding_member entry before retired binding bound
    have assigned := parallelScopeBinding_body_parent entry before retired binding bound chosen present
    rw [identity, ← same, parentless] at assigned
    contradiction
  have outsideParent := occurrenceInSubtreeWithin_parentless before.scopeOccurrences retired binding.activity.owner parentDifferent parentless
  let record := { binding.activity with body := ActivityBody.parallelChildScopes first rest }
  have outer := cancelScopeSubtree_outside_parallel_outer edited retired record next noCalls
    (by simp [edited, activities, record]) (by simp [edited, controllers]) (outsideParent _) (by
      intro scope claimed
      obtain ⟨body, bodyMember, identity⟩ := List.mem_map.mp (show scope ∈ (first :: rest).map (·.scope) from claimed)
      obtain ⟨present, different⟩ := members body bodyMember
      simpa only [identity] using parallelScopeBinding_sibling_outside entry before retired binding bound body present different parentless)
  refine ⟨outer, (cancelScopeSubtree_outside_owner_census edited retired binding.activity.owner noCalls (outsideParent _)).1, ?_⟩
  change before.calledProcessOccurrences.filter _ = []
  rw [noCalls]
  rfl

/-- Exact remaining-arm retirement preserves every retained body's binding after the real frame removal and membership rewrite. -/
theorem parallelScopeRemaining_binding (entry : ParallelScopeEntry) (before : RuntimeState)
    (retired : ScopeOccurrenceId) (binding : ParallelScopeBinding) (variables : ScopedVariables)
    (next : ParallelScopeController) (selected first : ParallelScopeIteration) (rest : List ParallelScopeIteration)
    (condition : Bool) (bound : parallelScopeBinding? entry before retired = some binding)
    (parentless : occurrenceParent? before.scopeOccurrences binding.activity.owner = none)
    (noCalls : before.calledProcessOccurrences = [])
    (activities : before.activityOccurrences = [binding.activity])
    (controllers : before.parallelScopeControllers = [binding.controller])
    (removed : removeScopeVariables? before.variables retired = some variables)
    (executed : retireParallelScopeIteration binding.controller binding.iterations retired condition =
      some (.remaining next selected first rest)) :
    let edited := { before with
      variables := variables
      activityOccurrences := before.activityOccurrences.map fun candidate =>
        if candidate == binding.activity then { candidate with body := .parallelChildScopes first rest } else candidate
      parallelScopeControllers := before.parallelScopeControllers.map fun candidate =>
        if candidate == binding.controller then next else candidate }
    ∀ iteration ∈ first :: rest, ∃ successor,
      parallelScopeBinding? entry (cancelScopeSubtree edited retired .remove) iteration.scope = some successor := by
  intro edited iteration member
  have valid := retireParallelScopeIteration_remaining_valid binding.controller next binding.iterations retired condition selected first rest executed
  have censuses := parallelScopeRemaining_body_censuses entry before retired binding variables next selected first rest condition bound parentless noCalls removed executed
  have population := parallelScopeBinding_population entry before retired binding bound
  have members := remainingRetirement_members binding.controller next binding.iterations retired condition selected first rest executed
  let record := { binding.activity with body := ActivityBody.parallelChildScopes first rest }
  obtain ⟨outerFacts, rootFacts, _⟩ := parallelScopeRemaining_structural_census entry before retired binding
    variables next selected first rest condition bound parentless noCalls activities controllers executed
  have outer : (cancelScopeSubtree edited retired .remove).activityOccurrences = [record] ∧
      (cancelScopeSubtree edited retired .remove).parallelScopeControllers = [next] := outerFacts
  have rootCensus : (cancelScopeSubtree edited retired .remove).scopeOccurrences.filter (fun value => value.id == binding.activity.owner) =
      edited.scopeOccurrences.filter (fun value => value.id == binding.activity.owner) := rootFacts
  have allBodies : (first :: rest).all (fun body => parallelScopeBodyBound entry
      (cancelScopeSubtree edited retired .remove) record body.scope) = true := by
    apply List.all_eq_true.mpr
    intro body present
    have originalBody := List.all_eq_true.mp population.2 body (members body present).1
    obtain ⟨scopes, frames⟩ := censuses body present
    unfold parallelScopeBodyBound at originalBody ⊢
    rw [scopes, outer.1]
    have selection : selectScopeVariables? (cancelScopeSubtree edited retired .remove).variables body.scope =
        selectScopeVariables? before.variables body.scope := by
      unfold selectScopeVariables?
      rw [frames]
    simp only [selection]
    split at originalBody <;> try contradiction
    simp only [Bool.and_eq_true] at originalBody
    have claimed : body.scope ∈ activityBodyScopeClaims record.body := List.mem_map.mpr ⟨body, present, rfl⟩
    simp [record, originalBody, claimed]
  have accounting := retireParallelScopeIteration_accounting binding.controller binding.iterations retired condition
    (.remaining next selected first rest) executed
  have control : (cancelScopeSubtree edited retired .remove).control = before.control := rfl
  unfold parallelScopeBinding? at bound ⊢
  simp only [outer.1, outer.2, control]
  split at bound <;> try contradiction
  rename_i instanceId running
  split at bound <;> try contradiction
  rename_i initialRecord recordFilter
  split at bound <;> try contradiction
  rename_i initialFirst initialRest initialBody
  split at bound <;> try contradiction
  rename_i header
  split at bound <;> try contradiction
  rename_i initialController controllerFilter
  dsimp only at bound
  split at bound <;> try contradiction
  rename_i capacityGuard
  cases Option.some.inj bound
  have controllerIdentity : initialController.id =
      ⟨initialRecord.processInstanceId, ⟨initialRecord.activityElementId.value⟩, initialRecord.activation⟩ := by
    change before.parallelScopeControllers.filter (fun candidate => candidate.id ==
      ⟨initialRecord.processInstanceId, ⟨initialRecord.activityElementId.value⟩, initialRecord.activation⟩) = [initialController] at controllerFilter
    rw [controllers] at controllerFilter
    simp only [List.filter_cons, List.filter_nil] at controllerFilter
    split at controllerFilter <;> try contradiction
    rename_i matched
    simpa using matched
  dsimp only [ParallelScopeRetirement.controller] at accounting
  simp at header
  have nextId : next.id =
      ⟨record.processInstanceId, ⟨record.activityElementId.value⟩, record.activation⟩ :=
    accounting.1.trans controllerIdentity
  have nextFilter : [next].filter (fun controller : ParallelScopeController => controller.id ==
      ⟨record.processInstanceId, ⟨record.activityElementId.value⟩, record.activation⟩) = [next] := by
    simp [nextId]
  have totalBound : next.total ≤ 16 := by
    simp at capacityGuard
    have oldBound : initialController.total ≤ 16 := capacityGuard.1.1
    simpa only [accounting.2.1] using oldBound
  have claimed : iteration.scope ∈ activityBodyScopeClaims record.body := List.mem_map.mpr ⟨iteration, member, rfl⟩
  have scopesEq : edited.scopeOccurrences = before.scopeOccurrences := rfl
  have recordClaim : [record].filter (fun candidate =>
      (activityBodyScopeClaims candidate.body).contains iteration.scope) = [record] := by
    simp [claimed]
  simp only [recordClaim]
  change ∃ successor, (if record.activityElementId != entry.elementId ||
      record.processInstanceId != instanceId || record.owner.processInstanceId != instanceId ||
      !record.attachedHandlers.isEmpty ||
      ((cancelScopeSubtree edited retired .remove).scopeOccurrences.filter fun occurrence =>
        occurrence.id == record.owner).length != 1 then none
    else match [next].filter (fun controller => controller.id ==
        ⟨record.processInstanceId, ⟨record.activityElementId.value⟩, record.activation⟩) with
      | [controller] => if controller.total > 16 || !validParallelScopePopulation controller (first :: rest) ||
          !((first :: rest).all fun body => parallelScopeBodyBound entry
            (cancelScopeSubtree edited retired .remove) record body.scope) then none
        else some (ParallelScopeBinding.mk record controller (first :: rest))
      | _ => none) = some successor
  rw [nextFilter]
  have afterHeader : (record.activityElementId != entry.elementId ||
      record.processInstanceId != instanceId || record.owner.processInstanceId != instanceId ||
      !record.attachedHandlers.isEmpty ||
      ((cancelScopeSubtree edited retired .remove).scopeOccurrences.filter fun occurrence =>
        occurrence.id == record.owner).length != 1) = false := by
    simpa [record, rootCensus, scopesEq] using header
  simp [afterHeader, totalBound, valid, allBodies]

/-- Actual retirement retains binding for every initially bound distinct sibling that remains live. -/
theorem completeParallelScope_surviving_sibling_binding
    (entry : ParallelScopeEntry) (before after : RuntimeState) (retired : ScopeOccurrenceId)
    (binding : ParallelScopeBinding) (iteration : ParallelScopeIteration)
    (bound : parallelScopeBinding? entry before retired = some binding)
    (parentless : occurrenceParent? before.scopeOccurrences binding.activity.owner = none)
    (noCalls : before.calledProcessOccurrences = [])
    (activities : before.activityOccurrences = [binding.activity])
    (controllers : before.parallelScopeControllers = [binding.controller])
    (member : iteration ∈ binding.iterations) (different : iteration.scope ≠ retired)
    (completed : completeParallelScope? entry before retired = some after)
    (survives : ∃ occurrence ∈ after.scopeOccurrences, occurrence.id = iteration.scope) :
    ∃ successor, parallelScopeBinding? entry after iteration.scope = some successor := by
  unfold completeParallelScope? at completed
  simp only [bound, bind, Option.bind_some] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, retiredStep, completed⟩ := Option.bind_eq_some_iff.mp completed
  have dispatch := retireParallelScopeIteration_dispatch binding.controller binding.iterations retired condition retirement retiredStep
  cases retirement with
  | remaining next selected first rest =>
    cases Option.some.inj completed
    have ready := parallelScopeRemaining_binding entry before retired binding variables next selected first rest condition
      bound parentless noCalls activities controllers removed retiredStep
    cases dispatch with
    | remaining preceding following selected first rest valid shape identity siblings =>
      have differentIteration : iteration ≠ selected := by
        intro same
        exact different ((congrArg ParallelScopeIteration.scope same).trans identity)
      have retained : iteration ∈ first :: rest := by
        rw [shape] at member
        rw [← siblings]
        simpa [differentIteration] using member
      exact ready iteration retained
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

/-- The common structural premises of clean entry and live-population retirement, independently of token progress. -/
structure ParallelScopeStructuralFrame (parent : ScopeOccurrenceId) (state : RuntimeState) : Prop where
  noCalls : state.calledProcessOccurrences = []
  root : state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = parent)) = [⟨parent, none⟩]
  outer : (state.activityOccurrences = [] ∧ state.parallelScopeControllers = []) ∨
    ∃ record controller, state.activityOccurrences = [record] ∧
      state.parallelScopeControllers = [controller] ∧ record.owner = parent

/-- Actual Start establishes the parentless root census and empty Call/outer population. -/
theorem runningProgramStartState_structural_parallel_frame
    (program : Program) (instanceId : SemanticId) (values : List VariableBinding)
    (state : RuntimeState) (root : DefinitionScope)
    (selected : rootDefinitionScope? program = some root)
    (started : runningProgramStartState? program instanceId values = some state) :
    ParallelScopeStructuralFrame ⟨instanceId, root.id, 1⟩ state := by
  simp only [runningProgramStartState?, selected, bind, Option.bind_some, pure, Option.some.injEq] at started
  subst state
  constructor
  · rfl
  · simp
  · exact Or.inl ⟨rfl, rfl⟩

/-- Successful binding selects the sole live outer record/controller from the shared frame. -/
theorem ParallelScopeStructuralFrame.bound_outer
    (entry : ParallelScopeEntry) (parent retired : ScopeOccurrenceId) (before : RuntimeState)
    (binding : ParallelScopeBinding) (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before retired = some binding) :
    before.activityOccurrences = [binding.activity] ∧
      before.parallelScopeControllers = [binding.controller] ∧ binding.activity.owner = parent := by
  rcases frame.outer with empty | ⟨record, controller, activities, controllers, owner⟩
  · cases control : before.control <;> simp [parallelScopeBinding?, control, empty.1] at bound
  · unfold parallelScopeBinding? at bound
    split at bound <;> try contradiction
    split at bound <;> try contradiction
    rename_i chosen recordFilter
    split at bound <;> try contradiction
    split at bound <;> try contradiction
    split at bound <;> try contradiction
    rename_i chosenController controllerFilter
    dsimp only at bound
    split at bound <;> try contradiction
    cases Option.some.inj bound
    have selectedRecord : chosen = record := by
      have member : chosen ∈ before.activityOccurrences :=
        (List.mem_filter.mp (recordFilter.symm ▸ (show chosen ∈ [chosen] from by simp))).1
      simpa [activities] using member
    have selectedController : chosenController = controller := by
      have member : chosenController ∈ before.parallelScopeControllers :=
        (List.mem_filter.mp (controllerFilter.symm ▸ (show chosenController ∈ [chosenController] from by simp))).1
      simpa [controllers] using member
    subst chosen
    subst chosenController
    exact ⟨activities, controllers, owner⟩

/-- The shared frame discharges actual retirement's structural prerequisites for every surviving sibling. -/
theorem ParallelScopeStructuralFrame.retirement_binding
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (retired : ScopeOccurrenceId) (binding : ParallelScopeBinding) (iteration : ParallelScopeIteration)
    (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before retired = some binding)
    (member : iteration ∈ binding.iterations) (different : iteration.scope ≠ retired)
    (completed : completeParallelScope? entry before retired = some after)
    (survives : ∃ occurrence ∈ after.scopeOccurrences, occurrence.id = iteration.scope) :
    ∃ successor, parallelScopeBinding? entry after iteration.scope = some successor := by
  obtain ⟨activities, controllers, owner⟩ := frame.bound_outer entry parent retired before binding bound
  have parentless : occurrenceParent? before.scopeOccurrences binding.activity.owner = none := by
    rw [owner]
    unfold occurrenceParent?
    rw [← List.head?_filter, frame.root]
    rfl
  exact completeParallelScope_surviving_sibling_binding entry before after retired binding iteration bound
    parentless frame.noCalls activities controllers member different completed survives

/-- Unchanged represented owners transport the shared structural population independently of token and data writes. -/
theorem ParallelScopeStructuralFrame.frame (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (frame : ParallelScopeStructuralFrame parent before)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (activities : after.activityOccurrences = before.activityOccurrences)
    (controllers : after.parallelScopeControllers = before.parallelScopeControllers) :
    ParallelScopeStructuralFrame parent after := by
  constructor
  · exact calls.trans frame.noCalls
  · simpa only [scopes] using frame.root
  · simpa only [activities, controllers] using frame.outer

private theorem empty_cancel_structural_frame (parent target : ScopeOccurrenceId) (before : RuntimeState)
    (frame : ParallelScopeStructuralFrame parent before)
    (empty : before.activityOccurrences = [] ∧ before.parallelScopeControllers = [])
    (different : target ≠ parent) :
    ParallelScopeStructuralFrame parent (cancelScopeSubtree before target .remove) ∧
      (cancelScopeSubtree before target .remove).activityOccurrences = [] ∧
      (cancelScopeSubtree before target .remove).parallelScopeControllers = [] := by
  have parentless : occurrenceParent? before.scopeOccurrences parent = none := by
    unfold occurrenceParent?
    rw [← List.head?_filter, frame.root]
    rfl
  have outside := occurrenceInSubtreeWithin_parentless before.scopeOccurrences target parent (Ne.symm different) parentless
  have census := (cancelScopeSubtree_outside_owner_census before target parent frame.noCalls (outside _)).1
  have afterEmpty : (cancelScopeSubtree before target .remove).activityOccurrences = [] ∧
      (cancelScopeSubtree before target .remove).parallelScopeControllers = [] := by
    simp [cancelScopeSubtree, empty.1, empty.2, retainedByRegion, withdrawnByRegion]
  refine ⟨⟨?_, ?_, Or.inl afterEmpty⟩, afterEmpty⟩
  · change before.calledProcessOccurrences.filter _ = []
    rw [frame.noCalls]
    rfl
  · simpa only [Bool.beq_eq_decide_eq] using census.trans (by simpa only [Bool.beq_eq_decide_eq] using frame.root)

private theorem empty_cancel_fold_structural_frame (parent : ScopeOccurrenceId)
    (targets : List ParallelScopeIteration) (before : RuntimeState)
    (frame : ParallelScopeStructuralFrame parent before)
    (empty : before.activityOccurrences = [] ∧ before.parallelScopeControllers = [])
    (different : ∀ iteration ∈ targets, iteration.scope ≠ parent) :
    ParallelScopeStructuralFrame parent
      (targets.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) before) := by
  induction targets generalizing before with
  | nil => exact frame
  | cons first rest ih =>
    obtain ⟨next, nextEmpty⟩ := empty_cancel_structural_frame parent first.scope before frame empty (different first (by simp))
    exact ih _ next nextEmpty (by intro iteration member; exact different iteration (by simp [member]))

/-- Actual retirement preserves the shared root and outer population in every retirement arm. -/
theorem completeParallelScope_structural_parallel_frame (entry : ParallelScopeEntry)
    (parent retired : ScopeOccurrenceId) (before after : RuntimeState) (binding : ParallelScopeBinding)
    (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before retired = some binding)
    (completed : completeParallelScope? entry before retired = some after) :
    ParallelScopeStructuralFrame parent after := by
  obtain ⟨activities, controllers, owner⟩ := frame.bound_outer entry parent retired before binding bound
  have parentless : occurrenceParent? before.scopeOccurrences binding.activity.owner = none := by
    rw [owner]
    unfold occurrenceParent?
    rw [← List.head?_filter, frame.root]
    rfl
  have bodyDifferent : ∀ iteration ∈ binding.iterations, iteration.scope ≠ parent := by
    intro iteration member same
    have assigned := parallelScopeBinding_body_parent entry before retired binding bound iteration member
    rw [same, ← owner, parentless] at assigned
    contradiction
  have retiredDifferent : retired ≠ parent := by
    obtain ⟨selected, member, identity⟩ := parallelScopeBinding_member entry before retired binding bound
    simpa only [identity] using bodyDifferent selected member
  unfold completeParallelScope? at completed
  simp only [bound, bind, Option.bind_some] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, executed, completed⟩ := Option.bind_eq_some_iff.mp completed
  let detached := { before with
    variables := variables
    activityOccurrences := before.activityOccurrences.filter (· != binding.activity)
    parallelScopeControllers := before.parallelScopeControllers.filter (· != binding.controller) }
  have detachedEmpty : detached.activityOccurrences = [] ∧ detached.parallelScopeControllers = [] := by
    simp [detached, activities, controllers]
  have detachedFrame : ParallelScopeStructuralFrame parent detached :=
    ⟨frame.noCalls, frame.root, Or.inl detachedEmpty⟩
  obtain ⟨retiredFrame, retiredEmpty⟩ := empty_cancel_structural_frame parent retired detached detachedFrame detachedEmpty retiredDifferent
  cases retirement with
  | remaining next selected first rest =>
    cases Option.some.inj completed
    obtain ⟨outer, rootCensus, calls⟩ := parallelScopeRemaining_structural_census entry before retired binding
      variables next selected first rest condition bound parentless frame.noCalls activities controllers executed
    constructor
    · exact calls
    · rw [owner] at rootCensus
      simpa only [Bool.beq_eq_decide_eq] using rootCensus.trans (by simpa only [Bool.beq_eq_decide_eq] using frame.root)
    · exact Or.inr ⟨_, next, outer.1, outer.2, owner⟩
  | naturalCompletion next selected =>
    cases Option.some.inj completed
    exact ParallelScopeStructuralFrame.frame parent _ _ retiredFrame rfl rfl rfl rfl
  | earlyCompletion next selected first rest =>
    cases Option.some.inj completed
    have dispatch := retireParallelScopeIteration_dispatch binding.controller binding.iterations retired condition
      (.earlyCompletion next selected first rest) executed
    cases dispatch with
    | earlyCompletion preceding following selected first rest valid shape identity siblings =>
      have different : ∀ iteration ∈ first :: rest, iteration.scope ≠ parent := by
        intro iteration member
        apply bodyDifferent iteration
        rw [shape]
        rw [← siblings] at member
        rcases List.mem_append.mp member with leading | trailing
        · exact List.mem_append.mpr (Or.inl leading)
        · exact List.mem_append.mpr (Or.inr (by simp [trailing]))
      have cancelledFrame := empty_cancel_fold_structural_frame parent (first :: rest)
        (cancelScopeSubtree detached retired .remove) retiredFrame retiredEmpty different
      exact ParallelScopeStructuralFrame.frame parent _ _ cancelledFrame rfl rfl rfl rfl

/-- Actual clean population entry retains the parentless root and installs at most one enclosing outer population. -/
theorem enterParallelScope_structural_parallel_frame
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (clean : ParallelScopeCleanEntry entry parent before)
    (frame : ParallelScopeStructuralFrame parent before)
    (entered : enterParallelScope? entry before parent = some after) :
    ParallelScopeStructuralFrame parent after := by
  obtain ⟨root, different, activities, controllers, _, _⟩ := clean
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    exact ParallelScopeStructuralFrame.frame parent before _ frame rfl rfl rfl rfl
  · rename_i item items itemsEq bounded
    obtain ⟨⟨issued, iterations⟩, generated, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
      cases Option.some.inj installed
      obtain ⟨_, activityFrame, controllerFrame, callFrame⟩ := issueParallelBodies_structural_fields generated
      have population := issueParallelBodies_scope_population generated
      have domain := issueParallelBodies_scope_domain generated
      have absent : ((first :: rest).map (fun iteration =>
          (⟨iteration.scope, some parent⟩ : RuntimeScopeOccurrence))).filter
          (fun occurrence => decide (occurrence.id = parent)) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro occurrence member
        obtain ⟨iteration, present, rfl⟩ := List.mem_map.mp member
        have distinct : iteration.scope ≠ parent := by
          intro same
          exact different ((domain iteration present).2.symm.trans (congrArg ScopeOccurrenceId.definitionScopeId same))
        simpa using distinct
      have rootCensus : issued.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = parent)) =
          [⟨parent, none⟩] := by
        have filtered := population.filter (fun occurrence => decide (occurrence.id = parent))
        rw [List.filter_append, absent, root] at filtered
        simpa using filtered
      constructor
      · exact callFrame.trans frame.noCalls
      · exact rootCensus
      · apply Or.inr
        let record : ActivityOccurrence :=
          { processInstanceId := parent.processInstanceId, activityElementId := entry.elementId,
            activation := activityActivationCount before ⟨entry.elementId.value⟩ + 1, owner := parent,
            body := .parallelChildScopes first rest, attachedHandlers := [] }
        let controller : ParallelScopeController :=
          ⟨⟨parent.processInstanceId, ⟨entry.elementId.value⟩, activityActivationCount before ⟨entry.elementId.value⟩ + 1⟩,
            (item :: items).length, 0⟩
        refine ⟨record, controller, ?_, ?_, rfl⟩
        · simp [record, activityFrame, activities, insertActivityOccurrence]
        · simp [controller, controllerFrame, controllers]

/-- Initiation changes only pending status and the root continuation token. -/
theorem initiateState_structural_parallel_frame (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (output : ControlPlaceId)
    (frame : ParallelScopeStructuralFrame parent before)
    (initiated : initiateState? before output = some after) : ParallelScopeStructuralFrame parent after := by
  unfold initiateState? at initiated
  obtain ⟨owner, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
  split at initiated <;> try contradiction
  cases Option.some.inj initiated
  exact ParallelScopeStructuralFrame.frame parent before _ frame rfl rfl rfl rfl

/-- Actual scoped Human completion retains all structural population owners. -/
theorem completeParallelScopeUserTask_structural_parallel_frame
    (program : Program) (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (frame : ParallelScopeStructuralFrame parent before)
    (completed : completeParallelScopeUserTask? program before id values = some after) :
    ParallelScopeStructuralFrame parent after := by
  unfold completeParallelScopeUserTask? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact ParallelScopeStructuralFrame.frame parent before _ frame rfl rfl rfl rfl

/-- Actual scoped Service completion disposes Activity data without changing structural population owners. -/
theorem completeParallelScopeEffect_structural_parallel_frame
    (program : Program) (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (id : EffectOccurrenceId) (result : EffectExecutionResult)
    (frame : ParallelScopeStructuralFrame parent before)
    (completed : completeParallelScopeEffect? program before id result = some after) :
    ParallelScopeStructuralFrame parent after := by
  unfold completeParallelScopeEffect? at completed
  split at completed <;> try contradiction
  cases result <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact ParallelScopeStructuralFrame.frame parent before _ frame rfl rfl rfl rfl
  case h_2 =>
    rename_i patch missingResult impossible
    exact False.elim (impossible patch rfl)

/-- Both actual Human command routes retain the common population frame, regardless of the selected wait owner. -/
theorem ParallelScopeCommand.completeTask_structural_parallel_frame
    (program : Program) (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (frame : ParallelScopeStructuralFrame parent before)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after) :
    ParallelScopeStructuralFrame parent after := by
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · exact completeParallelScopeUserTask_structural_parallel_frame program parent before after id values frame completed
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact ParallelScopeStructuralFrame.frame parent before _ frame rfl rfl rfl rfl

/-- Both actual Service command routes retain the common population frame after successful mapped completion. -/
theorem ParallelScopeCommand.completeEffect_structural_parallel_frame
    (program : Program) (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (id : EffectOccurrenceId) (result : EffectExecutionResult)
    (frame : ParallelScopeStructuralFrame parent before)
    (completed : ParallelScopeCommand.completeEffect? program before id result = some after) :
    ParallelScopeStructuralFrame parent after := by
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i wait selected
  split at completed
  · exact completeParallelScopeEffect_structural_parallel_frame program parent before after id result frame completed
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeSerialActivityScope? at written
    split at written <;> try contradiction
    obtain ⟨bindings, _, written⟩ := Option.bind_eq_some_iff.mp written
    cases Option.some.inj written
    cases Option.some.inj completed
    exact ParallelScopeStructuralFrame.frame parent before _ frame rfl rfl rfl rfl

namespace InternalCommutation

/-- Actual singleton body execution retains the same owners through aligned arming or owned token work. -/
theorem applyInternalOperationOccurrence_body_structural_parallel_frame
    (program : Program) (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (frame : ParallelScopeStructuralFrame parent before)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (bodyOperation : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect,
      .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    ParallelScopeStructuralFrame parent after := by
  obtain ⟨_, scopes, activities, controllers, _, _⟩ :=
    applyInternalOperationOccurrence_body_retirement_frame program before after candidate operation resolved bodyOperation applied
  have calls : after.calledProcessOccurrences = before.calledProcessOccurrences := by
    rcases applyInternalOperationOccurrence_body_effect program before after candidate operation resolved bodyOperation applied with
      ⟨patch, _, _, rfl⟩ | ⟨patch, increment, _, rfl⟩
    · cases write : patch.write <;> simp [applyInternalArmingPatch, write]
    · rfl
  exact ParallelScopeStructuralFrame.frame parent before after frame calls scopes activities controllers

/-- Actual reserved-batch execution retains the shared population frame at every successful prefix. -/
theorem applyInternalOccurrenceBatch_structural_parallel_frame
    (program : Program) (state : RuntimeState) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState) (parent : ScopeOccurrenceId)
    (frame : ParallelScopeStructuralFrame parent state)
    (applied : applyInternalOccurrenceBatch? program state batch = some successors) :
    ∀ successor ∈ successors, ParallelScopeStructuralFrame parent successor := by
  apply applyInternalOccurrenceBatch_prefix_induction program state batch successors
    (ParallelScopeStructuralFrame parent) frame _ applied
  intro before patch _ _ preserved
  obtain ⟨_, scopes, activities, controllers, _, _⟩ := patch.retirement_frame before
  have calls : (patch.apply before).calledProcessOccurrences = before.calledProcessOccurrences := by
    cases patch with
    | arm arm => cases write : arm.write <;> simp [InternalOccurrencePatch.apply, applyInternalArmingPatch, write]
    | token token => rfl
  exact ParallelScopeStructuralFrame.frame parent before (patch.apply before) preserved
    calls scopes activities controllers

end InternalCommutation

/-- Every member of a validated population has the same exact binding: the per-body claim census rules out a competing Activity. -/
theorem parallelScopeBinding_retarget (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state target = some binding)
    (iteration : ParallelScopeIteration) (member : iteration ∈ binding.iterations) :
    parallelScopeBinding? entry state iteration.scope = some binding := by
  have population := parallelScopeBinding_population entry state target binding bound
  unfold parallelScopeBinding? at bound
  split at bound <;> try contradiction
  rename_i instanceId running
  split at bound <;> try contradiction
  rename_i record selected
  split at bound <;> try contradiction
  rename_i first rest body
  split at bound <;> try contradiction
  rename_i recordChecks
  split at bound <;> try contradiction
  rename_i controller controllerSelection
  dsimp only at bound
  split at bound <;> try contradiction
  rename_i populationChecks
  cases Option.some.inj bound
  have bodyBound := List.all_eq_true.mp population.2 iteration member
  unfold parallelScopeBodyBound at bodyBound
  split at bodyBound <;> try contradiction
  simp only [Bool.and_eq_true, decide_eq_true_eq] at bodyBound
  obtain ⟨sole, soleSelection⟩ := List.length_eq_one_iff.mp bodyBound.2
  have recordMember : record ∈ state.activityOccurrences :=
    (List.mem_filter.mp (selected.symm ▸ List.mem_singleton_self record)).1
  have claimed : (activityBodyScopeClaims record.body).contains iteration.scope = true := by
    rw [body]
    simp only [activityBodyScopeClaims, List.contains_iff_mem]
    exact List.mem_map.mpr ⟨iteration, member, rfl⟩
  have included : record ∈ state.activityOccurrences.filter
      (fun candidate => (activityBodyScopeClaims candidate.body).contains iteration.scope) :=
    List.mem_filter.mpr ⟨recordMember, claimed⟩
  rw [soleSelection] at included
  have same : record = sole := by simpa using included
  rw [← same] at soleSelection
  simp only [parallelScopeBinding?, running, soleSelection, body, recordChecks, Bool.false_eq_true, ↓reduceIte,
    controllerSelection, populationChecks]

/-- Equal admitted body/population counts plus unique bound iterations exclude an unrepresented live body; no scope-uniqueness premise is needed. -/
theorem parallelScopeBinding_covers_bodies (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state target = some binding)
    (count : (state.scopeOccurrences.filter (·.id.definitionScopeId == entry.childScopeId)).length = binding.iterations.length)
    (body : RuntimeScopeOccurrence) (present : body ∈ state.scopeOccurrences)
    (child : body.id.definitionScopeId = entry.childScopeId) :
    ∃ iteration ∈ binding.iterations, iteration.scope = body.id := by
  obtain ⟨valid, bodies⟩ := parallelScopeBinding_population entry state target binding bound
  have iterationChecks : validParallelScopeIterations binding.controller.id.processInstanceId binding.iterations = true := by
    simp only [validParallelScopePopulation, Bool.and_eq_true] at valid
    exact valid.1.2
  simp only [validParallelScopeIterations, Bool.and_eq_true, decide_eq_true_eq] at iterationChecks
  have unique : (binding.iterations.map (·.scope)).Nodup := by
    apply List.pairwise_map.mpr
    exact iterationChecks.2.imp (fun facts => facts.2.1)
  let owners := (state.scopeOccurrences.filter (·.id.definitionScopeId == entry.childScopeId)).map (·.id)
  have represented : binding.iterations.map (·.scope) ⊆ owners := by
    intro owner member
    obtain ⟨iteration, included, identity⟩ := List.mem_map.mp member
    subst owner
    have bodyBound := List.all_eq_true.mp bodies iteration included
    unfold parallelScopeBodyBound at bodyBound
    split at bodyBound <;> try contradiction
    rename_i occurrence selected
    have member := List.mem_filter.mp (selected.symm ▸ List.mem_singleton_self occurrence)
    have same : occurrence.id = iteration.scope := by simpa using member.2
    simp only [Bool.and_eq_true] at bodyBound
    have childScope : iteration.scope.definitionScopeId = entry.childScopeId := by simpa using bodyBound.1.1.1
    exact List.mem_map.mpr ⟨occurrence, List.mem_filter.mpr ⟨member.1, by simp [same, childScope]⟩, same⟩
  have targetPresent : body.id ∈ owners := List.mem_map.mpr ⟨body, List.mem_filter.mpr ⟨present, by simp [child]⟩, rfl⟩
  have targetRepresented : body.id ∈ binding.iterations.map (·.scope) := by
    apply Classical.byContradiction
    intro absent
    have extraUnique : (body.id :: binding.iterations.map (·.scope)).Nodup := List.nodup_cons.mpr ⟨absent, unique⟩
    have extraSubset : body.id :: binding.iterations.map (·.scope) ⊆ owners := by
      intro owner member
      rcases List.mem_cons.mp member with same | member
      · simpa only [same] using targetPresent
      · exact represented member
    have impossible := extraUnique.length_le_of_subset extraSubset
    simp only [List.length_cons, List.length_map, owners, count] at impossible
    omega
  exact List.mem_map.mp targetRepresented


end BpmnSemantics.SemanticProcess
