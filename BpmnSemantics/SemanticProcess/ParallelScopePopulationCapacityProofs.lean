import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.ParallelScopePopulationPreservation
import BpmnSemantics.SemanticProcess.ParallelScopeLifetimeAccounting

/-! Population capacity follows actual entry and retirement, so command composition need not assume successor capacity. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart

/-- Capacity reads the represented population, rather than tokens or separate Activity data. -/
theorem programStateCapacity_population_frame (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (before after : RuntimeState)
    (capacity : ProgramCapacity) (accepted : programStateCapacity program before = some capacity)
    (storage : committedStateCollectionAdmitted after = true)
    (reservation : occurrenceReservationStateValid after = true)
    (startCapacity : programStartCapacity program after.variables.process.bindings = some capacity)
    (collection : after.variables.process.bindings.filter (·.name == analysis.entry.collectionName) =
      before.variables.process.bindings.filter (·.name == analysis.entry.collectionName))
    (control : after.control = before.control) (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (activities : after.activityOccurrences = before.activityOccurrences)
    (controllers : after.parallelScopeControllers = before.parallelScopeControllers)
    (frames : after.variables.scopes.map (·.owner) = before.variables.scopes.map (·.owner)) :
    programStateCapacity program after = some capacity := by
  have start := programStateCapacity_retains_start_capacity program before capacity accepted
  have frameLength : after.variables.scopes.length = before.variables.scopes.length := by
    simpa only [List.length_map] using congrArg List.length frames
  have frameEmpty : after.variables.scopes.isEmpty = before.variables.scopes.isEmpty := by
    apply Bool.eq_iff_iff.mpr
    simp only [List.isEmpty_iff_length_eq_zero, frameLength]
  have bound : ∀ target, parallelScopeBinding? analysis.entry after target =
      parallelScopeBinding? analysis.entry before target :=
    fun target => parallelScopeBinding_state_frame analysis.entry before after target
      control scopes activities controllers frames
  unfold programStateCapacity at accepted ⊢
  split at accepted <;> try contradiction
  simp only [analyzed, start, bind, Option.bind_some] at accepted
  simpa only [storage, reservation, Bool.not_true, Bool.false_or, Bool.false_eq_true,
    ↓reduceIte, analyzed, startCapacity, bind, Option.bind_some, pure, collection, scopes,
    activities, controllers, frameLength, frameEmpty, bound] using accepted

private theorem binding_body_shape (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state target = some binding) :
    ∃ first rest, binding.activity.body = .parallelChildScopes first rest ∧
      binding.iterations = first :: rest := by
  unfold parallelScopeBinding? at bound
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  rename_i first rest body
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  dsimp only at bound
  split at bound <;> try contradiction
  cases Option.some.inj bound
  exact ⟨first, rest, body, rfl⟩

private theorem issued_item_lookup (items : List String) (iterations : List ParallelScopeIteration)
    (captured : iterations.map (·.item) = items)
    (indices : iterations.map (·.loopCounter) = List.range' 0 items.length) :
    iterations.all (fun iteration => items[iteration.loopCounter]? == some iteration.item) = true := by
  apply List.all_eq_true.mpr
  intro iteration member
  obtain ⟨index, selected⟩ := List.mem_iff_getElem?.mp member
  have ordinal := congrArg (fun values : List Nat => values[index]?) indices
  have lengthEq : iterations.length = items.length := by
    simpa only [List.length_map] using congrArg List.length captured
  have indexBound : index < items.length := lengthEq ▸ (List.getElem?_eq_some_iff.mp selected).1
  rw [List.getElem?_map, selected, List.getElem?_range' indexBound] at ordinal
  have same : iteration.loopCounter = index := by simpa using ordinal
  have value := congrArg (fun values : List String => values[index]?) captured
  simp only [List.getElem?_map, selected, Option.map_some] at value
  simpa only [same, beq_iff_eq] using value.symm

/-- Actual clean entry establishes every population check against its unchanged captured collection. -/
theorem enterParallelScope_preserves_capacity (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (capacity : ProgramCapacity)
    (accepted : programStateCapacity program before = some capacity)
    (ownerSelection : program.operationScopes.filter (·.operationId == analysis.entry.id) =
      [{ operationId := analysis.entry.id, scopeId := parent.definitionScopeId }])
    (clean : ParallelScopeCleanEntry analysis.entry parent before)
    (frame : ParallelScopeStructuralFrame parent before)
    (entered : enterParallelScope? analysis.entry before parent = some after)
    (storage : committedStateCollectionAdmitted after = true)
    (reservation : occurrenceReservationStateValid after = true) :
    programStateCapacity program after = some capacity := by
  have original := entered
  have cleanBefore := clean
  have process := enterParallelScope_preserves_process entered
  have start := programStateCapacity_retains_start_capacity program before capacity accepted
  have afterStart : programStartCapacity program after.variables.process.bindings = some capacity := by
    rw [process]; exact start
  obtain ⟨root, different, emptyActivities, emptyControllers, emptyFrames, counter⟩ := clean
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  rename_i collection binding captured
  split at entered <;> try contradiction
  rename_i items typed
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    apply programStateCapacity_population_frame program analysis analyzed before _ capacity accepted
      storage reservation afterStart rfl rfl rfl rfl rfl rfl
  · rename_i item tail itemsEq
    let sourceItems := item :: tail
    obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
      cases Option.some.inj entered
      obtain ⟨_, activityFrame, controllerFrame, _⟩ := issueParallelBodies_structural_fields generated
      have population := issueParallelBodies_scope_population generated
      have domain := issueParallelBodies_scope_domain generated
      have itemShape := issueParallelBodies_preserves_items_and_indices generated
      let record : ActivityOccurrence :=
        { processInstanceId := parent.processInstanceId, activityElementId := analysis.entry.elementId,
          activation := activityActivationCount before ⟨analysis.entry.elementId.value⟩ + 1,
          owner := parent, body := .parallelChildScopes first rest, attachedHandlers := [] }
      let controller : ParallelScopeController :=
        ⟨⟨parent.processInstanceId, ⟨analysis.entry.elementId.value⟩, record.activation⟩, sourceItems.length, 0⟩
      have activities : (insertActivityOccurrence record issued.activityOccurrences) = [record] := by
        simp [activityFrame, emptyActivities, insertActivityOccurrence]
      have controllers : issued.parallelScopeControllers ++ [controller] = [controller] := by
        simp [controllerFrame, emptyControllers]
      have present : ∃ occurrence ∈ issued.scopeOccurrences, occurrence.id = first.scope := by
        refine ⟨⟨first.scope, some parent⟩, population.mem_iff.mpr ?_, rfl⟩
        exact List.mem_append_left _ (List.mem_map.mpr ⟨first, by simp, rfl⟩)
      obtain ⟨boundPopulation, bound⟩ := enterParallelScope_clean_binding original root different
        emptyActivities emptyControllers emptyFrames counter present (domain first (by simp)).2
      have afterFrame := enterParallelScope_structural_parallel_frame analysis.entry parent before _ cleanBefore frame original
      obtain ⟨boundActivities, boundControllers, owned⟩ :=
        afterFrame.bound_outer analysis.entry parent first.scope _ boundPopulation bound
      have recordEq : boundPopulation.activity = record := by
        change insertActivityOccurrence record issued.activityOccurrences = [boundPopulation.activity] at boundActivities
        simpa only [activities, List.singleton_inj] using boundActivities.symm
      have controllerEq : boundPopulation.controller = controller := by
        change issued.parallelScopeControllers ++ [controller] = [boundPopulation.controller] at boundControllers
        simpa only [controllers, List.singleton_inj] using boundControllers.symm
      obtain ⟨actualFirst, actualRest, body, iterationShape⟩ :=
        binding_body_shape analysis.entry _ first.scope boundPopulation bound
      have iterationsEq : boundPopulation.iterations = first :: rest := by
        rw [recordEq] at body
        obtain ⟨sameFirst, sameRest⟩ := ActivityBody.parallelChildScopes.inj body
        simpa only [← sameFirst, ← sameRest] using iterationShape
      have bodyCount : (issued.scopeOccurrences.filter
          (·.id.definitionScopeId == analysis.entry.childScopeId)).length = (first :: rest).length := by
        have count := (population.filter (·.id.definitionScopeId == analysis.entry.childScopeId)).length_eq
        rw [List.filter_append, root] at count
        have allChildren : ((first :: rest).map (fun iteration =>
            (⟨iteration.scope, some parent⟩ : RuntimeScopeOccurrence))).filter
            (·.id.definitionScopeId == analysis.entry.childScopeId) =
              (first :: rest).map (fun iteration => (⟨iteration.scope, some parent⟩ : RuntimeScopeOccurrence)) := by
          apply List.filter_eq_self.mpr
          intro occurrence member
          obtain ⟨iteration, presentIteration, rfl⟩ := List.mem_map.mp member
          simp [(domain iteration presentIteration).2]
        rw [allChildren] at count
        simpa only [List.filter_cons, List.filter_nil, beq_eq_false_iff_ne.mpr (Ne.symm different),
          Bool.false_eq_true, ↓reduceIte, List.append_nil, List.length_map] using count
      have frameCount : issued.variables.scopes.length = (first :: rest).length := by
        have firstIssue := generated
        unfold issueParallelBodies? at firstIssue
        obtain ⟨variables, initialized, _⟩ := Option.bind_eq_some_iff.mp firstIssue
        unfold initializeScopeVariables? at initialized
        split at initialized <;> try contradiction
        obtain ⟨values, evaluated, _⟩ := Option.bind_eq_some_iff.mp initialized
        have count := (issueParallelBodies_local_frames evaluated generated).length_eq
        simpa [emptyFrames] using count
      have lookup := issued_item_lookup sourceItems (first :: rest) itemShape.1 itemShape.2
      have parentCensus := afterFrame.root
      have sameParent : (fun occurrence : RuntimeScopeOccurrence => occurrence.id == parent) =
          (fun occurrence => decide (occurrence.id = parent)) := by
        funext occurrence
        apply Bool.eq_iff_iff.mpr
        simp
      rw [← sameParent] at parentCensus
      dsimp only [sourceItems] at lookup
      have collectionAfter : issued.variables.process.bindings.filter
          (·.name == analysis.entry.collectionName) = [binding] := by
        rw [issueParallelBodies_preserves_process generated]; exact captured
      let successor : RuntimeState :=
        { issued with
          activityOccurrences := insertActivityOccurrence record issued.activityOccurrences,
          activityActivations := setActivationCount issued.activityActivations ⟨analysis.entry.elementId.value⟩ record.activation,
          parallelScopeControllers := issued.parallelScopeControllers ++ [controller] }
      change programStateCapacity program successor = some capacity
      change committedStateCollectionAdmitted successor = true at storage
      change occurrenceReservationStateValid successor = true at reservation
      change parallelScopeBinding? analysis.entry successor first.scope = some boundPopulation at bound
      dsimp only [successor] at storage reservation bound ⊢
      rw [activities, controllers] at storage reservation bound ⊢
      simp only [programStateCapacity, storage, reservation, Bool.not_true, Bool.false_or,
        Bool.false_eq_true, ↓reduceIte, analyzed, afterStart, bind, Option.bind_some,
        ownerSelection, collectionAfter, typed, record, beq_self_eq_true,
        Bool.true_or, List.filter_cons, List.filter_nil, bound, recordEq, controllerEq,
        iterationsEq, parentCensus, bodyCount, frameCount, lookup, controller, sourceItems]
      simp

private theorem binding_frame_owners (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state target = some binding) :
    (binding.iterations.map (·.scope)).Nodup ∧
      binding.iterations.map (·.scope) ⊆ state.variables.scopes.map (·.owner) := by
  obtain ⟨valid, bodies⟩ := parallelScopeBinding_population entry state target binding bound
  have iterations : validParallelScopeIterations binding.controller.id.processInstanceId binding.iterations = true := by
    simp only [validParallelScopePopulation, Bool.and_eq_true] at valid
    exact valid.1.2
  simp only [validParallelScopeIterations, Bool.and_eq_true, decide_eq_true_eq] at iterations
  refine ⟨List.pairwise_map.mpr (iterations.2.imp (fun facts => facts.2.1)), ?_⟩
  intro owner member
  obtain ⟨iteration, included, identity⟩ := List.mem_map.mp member
  subst owner
  have body := List.all_eq_true.mp bodies iteration included
  unfold parallelScopeBodyBound at body
  split at body <;> try contradiction
  simp only [Bool.and_eq_true] at body
  obtain ⟨frame, selected⟩ := Option.isSome_iff_exists.mp body.1.2
  have present := List.mem_filter.mp ((selectScopeVariables_iff.mp selected).symm ▸ List.mem_singleton_self frame)
  exact List.mem_map.mpr ⟨frame, present.1, selectScopeVariables_exact_owner selected⟩

private theorem binding_covers_frames (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state target = some binding)
    (count : state.variables.scopes.length = binding.iterations.length)
    (frame : ScopeVariableScope) (present : frame ∈ state.variables.scopes) :
    ∃ iteration ∈ binding.iterations, iteration.scope = frame.owner := by
  obtain ⟨unique, represented⟩ := binding_frame_owners entry state target binding bound
  have covered : frame.owner ∈ binding.iterations.map (·.scope) := by
    apply Classical.byContradiction
    intro absent
    have extraUnique := List.nodup_cons.mpr ⟨absent, unique⟩
    have extraSubset : frame.owner :: binding.iterations.map (·.scope) ⊆ state.variables.scopes.map (·.owner) := by
      intro owner member
      rcases List.mem_cons.mp member with same | member
      · subst owner; exact List.mem_map.mpr ⟨frame, present, rfl⟩
      · exact represented member
    have impossible := extraUnique.length_le_of_subset extraSubset
    simp only [List.length_cons, List.length_map, count] at impossible
    omega
  exact List.mem_map.mp covered

private theorem binding_body_count_le (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state target = some binding) :
    binding.iterations.length ≤ (state.scopeOccurrences.filter (·.id.definitionScopeId == entry.childScopeId)).length := by
  have unique := (binding_frame_owners entry state target binding bound).1
  have bodies := (parallelScopeBinding_population entry state target binding bound).2
  have represented : binding.iterations.map (·.scope) ⊆
      (state.scopeOccurrences.filter (·.id.definitionScopeId == entry.childScopeId)).map (·.id) := by
    intro owner member
    obtain ⟨iteration, included, identity⟩ := List.mem_map.mp member
    subst owner
    have body := List.all_eq_true.mp bodies iteration included
    unfold parallelScopeBodyBound at body
    split at body <;> try contradiction
    rename_i occurrence selected
    have present := List.mem_filter.mp (selected.symm ▸ List.mem_singleton_self occurrence)
    have same : occurrence.id = iteration.scope := by simpa using present.2
    simp only [Bool.and_eq_true] at body
    exact List.mem_map.mpr ⟨occurrence, List.mem_filter.mpr ⟨present.1, by simpa [same] using body.1.1.1⟩, same⟩
  simpa only [List.length_map] using unique.length_le_of_subset represented

private theorem removed_length_bound {α : Type} (before after : List α) (selected : α → Bool)
    (retained : after.Sublist before) (gone : ∀ value ∈ after, selected value = false)
    (one : (before.filter selected).length = 1) : after.length + 1 ≤ before.length := by
  have complement (values : List α) :
      (values.filter selected).length + (values.filter (fun value => !selected value)).length = values.length := by
    induction values with
    | nil => rfl
    | cons first rest ih => cases chosen : selected first <;> simp_all <;> omega
  have filtered : after.filter (fun value => !selected value) = after :=
    List.filter_eq_self.mpr (fun value member => by simp [gone value member])
  have bounded := (retained.filter (fun value => !selected value)).length_le
  rw [filtered] at bounded
  have total := complement before
  omega

private theorem cancellation_fold_frames (targets : List ParallelScopeIteration) (state : RuntimeState) :
    (targets.foldl (fun current target => cancelScopeSubtree current target.scope .remove) state).variables.scopes.Sublist
      state.variables.scopes := by
  induction targets generalizing state with
  | nil => exact List.Sublist.refl _
  | cons target rest ih => exact (ih (cancelScopeSubtree state target.scope .remove)).trans List.filter_sublist

private theorem cancellation_fold_removes_frames (targets : List ParallelScopeIteration) (state : RuntimeState) :
    ∀ target ∈ targets, ∀ frame ∈
      (targets.foldl (fun current target => cancelScopeSubtree current target.scope .remove) state).variables.scopes,
      frame.owner ≠ target.scope := by
  induction targets generalizing state with
  | nil => simp
  | cons first rest ih =>
    intro target member frame survives same
    rcases List.mem_cons.mp member with equal | member
    · subst target
      have previous := (cancellation_fold_frames rest (cancelScopeSubtree state first.scope .remove)).subset survives
      change frame ∈ state.variables.scopes.filter _ at previous
      have retained := (List.mem_filter.mp previous).2
      simp [same, occurrenceInSubtree, occurrenceInSubtreeWithin] at retained
    · exact ih (cancelScopeSubtree state first.scope .remove) target member frame survives same

private theorem retirement_count_bounds (entry : ParallelScopeEntry) (before after : RuntimeState)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry before target = some binding)
    (completed : completeParallelScope? entry before target = some after) :
    after.variables.scopes.length + 1 ≤ before.variables.scopes.length ∧
      (after.scopeOccurrences.filter (·.id.definitionScopeId == entry.childScopeId)).length + 1 ≤
        (before.scopeOccurrences.filter (·.id.definitionScopeId == entry.childScopeId)).length := by
  obtain ⟨iteration, member, identity⟩ := parallelScopeBinding_member entry before target binding bound
  have body := List.all_eq_true.mp (parallelScopeBinding_population entry before target binding bound).2 iteration member
  rw [identity] at body
  unfold parallelScopeBodyBound at body
  split at body <;> try contradiction
  rename_i occurrence selected
  simp only [Bool.and_eq_true] at body
  have child : target.definitionScopeId = entry.childScopeId := by simpa using body.1.1.1
  obtain ⟨frame, frameSelected⟩ := Option.isSome_iff_exists.mp body.1.2
  have populations := completeParallelScope_surviving_population completed
  have scopes := completeParallelScope_scope_census entry before after target completed
  constructor
  · apply removed_length_bound before.variables.scopes after.variables.scopes (fun frame => decide (frame.owner = target))
      (populations.1.trans List.filter_sublist)
    · intro frame present
      simp [completeParallelScope_disposes_target_frame completed frame present]
    · rw [selectScopeVariables_iff.mp frameSelected]; rfl
  · apply removed_length_bound _ _ (fun body => body.id == target)
      (scopes.1.filter (·.id.definitionScopeId == entry.childScopeId))
    · intro body present
      simpa using scopes.2 body (List.mem_filter.mp present).1
    · have same : (before.scopeOccurrences.filter (·.id.definitionScopeId == entry.childScopeId)).filter
          (·.id == target) = before.scopeOccurrences.filter (·.id == target) := by
        rw [List.filter_filter]
        apply List.filter_congr
        intro body _
        by_cases equal : body.id = target <;> simp [equal, child]
      rw [same, selected]; rfl

private theorem cancel_fold_empty_outer (iterations : List ParallelScopeIteration) (state : RuntimeState)
    (empty : state.activityOccurrences = [] ∧ state.parallelScopeControllers = []) :
    let after := iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state
    after.activityOccurrences = [] ∧ after.parallelScopeControllers = [] := by
  induction iterations generalizing state with
  | nil => exact empty
  | cons first rest ih =>
    apply ih
    simp [cancelScopeSubtree, empty.1, empty.2, retainedByRegion, withdrawnByRegion]

private theorem retirement_capacity_population (entry : ParallelScopeEntry) (parent target : ScopeOccurrenceId)
    (before after : RuntimeState) (binding : ParallelScopeBinding)
    (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? entry before target = some binding)
    (bodyCount : (before.scopeOccurrences.filter (·.id.definitionScopeId == entry.childScopeId)).length = binding.iterations.length)
    (frameCount : before.variables.scopes.length = binding.iterations.length)
    (completed : completeParallelScope? entry before target = some after) :
    (after.activityOccurrences = [] ∧ after.parallelScopeControllers = [] ∧
      after.scopeOccurrences.filter (·.id.definitionScopeId == entry.childScopeId) = [] ∧ after.variables.scopes = []) ∨
    ∃ nextTarget successor, parallelScopeBinding? entry after nextTarget = some successor ∧
      successor.controller.total = binding.controller.total ∧ successor.iterations.Sublist binding.iterations ∧
      (after.scopeOccurrences.filter (·.id.definitionScopeId == entry.childScopeId)).length = successor.iterations.length ∧
      after.variables.scopes.length = successor.iterations.length := by
  have counts := retirement_count_bounds entry before after target binding bound completed
  have populations := completeParallelScope_surviving_population completed
  have scopeGone := (completeParallelScope_scope_census entry before after target completed).2
  have frameGone := completeParallelScope_disposes_target_frame completed
  have afterFrame := completeParallelScope_structural_parallel_frame entry parent target before after binding frame bound completed
  obtain ⟨activities, controllers, owner⟩ := frame.bound_outer entry parent target before binding bound
  have parentless : occurrenceParent? before.scopeOccurrences binding.activity.owner = none := by
    rw [owner]
    unfold occurrenceParent?
    rw [← List.head?_filter, frame.root]
    rfl
  unfold completeParallelScope? at completed
  simp only [bound, bind, Option.bind_some] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, executed, completed⟩ := Option.bind_eq_some_iff.mp completed
  let detached := { before with
    variables := variables
    activityOccurrences := before.activityOccurrences.filter (· != binding.activity)
    parallelScopeControllers := before.parallelScopeControllers.filter (· != binding.controller) }
  have detachedEmpty : detached.activityOccurrences = [] ∧ detached.parallelScopeControllers = [] := by
    simp [detached, activities, controllers]
  have retiredEmpty : (cancelScopeSubtree detached target .remove).activityOccurrences = [] ∧
      (cancelScopeSubtree detached target .remove).parallelScopeControllers = [] := by
    simp [cancelScopeSubtree, detachedEmpty.1, detachedEmpty.2, retainedByRegion, withdrawnByRegion]
  have dispatch := retireParallelScopeIteration_dispatch binding.controller binding.iterations target condition retirement executed
  cases retirement with
  | remaining next selected first rest =>
    cases Option.some.inj completed
    obtain ⟨successor, successorBound⟩ := parallelScopeRemaining_binding entry before target binding variables next selected first rest condition
      bound parentless frame.noCalls activities controllers removed executed first (by simp)
    obtain ⟨outer, _, _⟩ := parallelScopeRemaining_structural_census entry before target binding variables next selected first rest condition
      bound parentless frame.noCalls activities controllers executed
    obtain ⟨newActivities, newControllers, _⟩ := afterFrame.bound_outer entry parent first.scope _ successor successorBound
    have record : successor.activity = { binding.activity with body := .parallelChildScopes first rest } := by
      rw [outer.1] at newActivities
      simpa only [List.singleton_inj] using newActivities.symm
    have controller : successor.controller = next := by
      rw [outer.2] at newControllers
      simpa only [List.singleton_inj] using newControllers.symm
    obtain ⟨actualFirst, actualRest, body, shape⟩ := binding_body_shape entry _ first.scope successor successorBound
    have iterations : successor.iterations = first :: rest := by
      rw [record] at body
      obtain ⟨sameFirst, sameRest⟩ := ActivityBody.parallelChildScopes.inj body
      simpa only [← sameFirst, ← sameRest] using shape
    have total := (retireParallelScopeIteration_accounting binding.controller binding.iterations target condition _ executed).2.1
    have lowerBody := binding_body_count_le entry _ first.scope successor successorBound
    have frameOwners := binding_frame_owners entry _ first.scope successor successorBound
    have lowerFrame := frameOwners.1.length_le_of_subset frameOwners.2
    simp only [List.length_map] at lowerFrame
    cases dispatch with
    | remaining preceding following selected first rest valid shape identity siblings =>
      have retained : successor.iterations.Sublist binding.iterations := by
        rw [iterations, ← siblings, shape]
        exact (List.sublist_cons_self selected following).append_left preceding
      have length : successor.iterations.length + 1 = binding.iterations.length := by
        rw [iterations, ← siblings, shape]
        simp
        omega
      refine Or.inr ⟨first.scope, successor, successorBound, ?_, retained, ?_, ?_⟩
      · simp only [controller]
      · omega
      · omega
  | naturalCompletion next selected =>
    cases Option.some.inj completed
    cases dispatch with
    | naturalCompletion selected condition valid shape identity =>
      refine Or.inl ⟨retiredEmpty.1, retiredEmpty.2, List.length_eq_zero_iff.mp ?_, List.length_eq_zero_iff.mp ?_⟩
      all_goals
        dsimp only at counts ⊢
        simp only [bodyCount, frameCount, shape, List.length_singleton] at counts
        omega
  | earlyCompletion next selected first rest =>
    cases Option.some.inj completed
    have empty := cancel_fold_empty_outer (first :: rest) (cancelScopeSubtree detached target .remove) retiredEmpty
    cases dispatch with
    | earlyCompletion preceding following selected first rest valid shape identity siblings =>
      have retained (iteration : ParallelScopeIteration) (member : iteration ∈ binding.iterations)
          (different : iteration.scope ≠ target) : iteration ∈ first :: rest := by
        have distinct : iteration ≠ selected := fun same => different ((congrArg ParallelScopeIteration.scope same).trans identity)
        rw [shape] at member
        rw [← siblings]
        simpa [distinct] using member
      refine Or.inl ⟨empty.1, empty.2, List.filter_eq_nil_iff.mpr ?_, List.eq_nil_iff_forall_not_mem.mpr ?_⟩
      · intro body present child
        obtain ⟨iteration, member, same⟩ := parallelScopeBinding_covers_bodies entry before target binding bound bodyCount body
          (populations.2.subset present) (by simpa using child)
        have different : iteration.scope ≠ target := by rw [same]; exact scopeGone body present
        exact cancelScopeSubtree_fold_remove_targets (first :: rest) (·.scope) _ iteration (retained iteration member different)
          body present same.symm
      · intro localFrame present
        obtain ⟨iteration, member, same⟩ := binding_covers_frames entry before target binding bound frameCount localFrame
          ((populations.1.trans List.filter_sublist).subset present)
        have different : iteration.scope ≠ target := by rw [same]; exact frameGone localFrame present
        exact cancellation_fold_removes_frames (first :: rest) _ iteration (retained iteration member different)
          localFrame present same.symm

/-- Actual retirement preserves the original collection bound through surviving bodies or complete disposal. -/
theorem completeParallelScope_preserves_capacity (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (parent target : ScopeOccurrenceId)
    (before after : RuntimeState) (capacity : ProgramCapacity) (binding : ParallelScopeBinding)
    (accepted : programStateCapacity program before = some capacity)
    (ownerSelection : program.operationScopes.filter (·.operationId == analysis.entry.id) =
      [{ operationId := analysis.entry.id, scopeId := parent.definitionScopeId }])
    (frame : ParallelScopeStructuralFrame parent before)
    (bound : parallelScopeBinding? analysis.entry before target = some binding)
    (completed : completeParallelScope? analysis.entry before target = some after)
    (storage : committedStateCollectionAdmitted after = true)
    (reservation : occurrenceReservationStateValid after = true) :
    programStateCapacity program after = some capacity := by
  have start := programStateCapacity_retains_start_capacity program before capacity accepted
  obtain ⟨selectedAnalysis, collection, items, selected, _, collectionSelection, value, _⟩ :=
    programStartCapacity_bound_certificate program before.variables.process.bindings capacity start
  rw [analyzed] at selected
  cases Option.some.inj selected
  obtain ⟨activities, controllers, owner, element, _, _, _⟩ :=
    frame.bound_parent_shape analysis.entry parent target before binding bound
  obtain ⟨first, rest, body, iterations⟩ := binding_body_shape analysis.entry before target binding bound
  have firstBound := parallelScopeBinding_retarget analysis.entry before target binding bound first (by simp [iterations])
  have root : before.scopeOccurrences.filter (·.id == parent) = [⟨parent, none⟩] := by
    simpa only [Bool.beq_eq_decide_eq] using frame.root
  unfold programStateCapacity at accepted
  split at accepted <;> try contradiction
  simp only [analyzed, start, bind, Option.bind_some, ownerSelection, collectionSelection, value,
    activities, element, beq_self_eq_true, Bool.true_or, List.filter_cons, List.filter_nil,
    ↓reduceIte, body, firstBound, owner, root, controllers] at accepted
  split at accepted <;> try contradiction
  rename_i checks
  have total : binding.controller.total = items.length := by
    apply Classical.byContradiction; intro different; simp [different] at checks
  have bodyCount : (before.scopeOccurrences.filter (·.id.definitionScopeId == analysis.entry.childScopeId)).length =
      binding.iterations.length := by
    apply Classical.byContradiction; intro different; simp [different] at checks
  have frameCount : before.variables.scopes.length = binding.iterations.length := by
    apply Classical.byContradiction; intro different; simp [different] at checks
  have lookup : binding.iterations.all (fun iteration => items[iteration.loopCounter]? == some iteration.item) = true := by
    cases selected : binding.iterations.all (fun iteration => items[iteration.loopCounter]? == some iteration.item) with
    | false => simp [selected] at checks
    | true => rfl
  have process := completeParallelScope_preserves_process completed
  have afterStart : programStartCapacity program after.variables.process.bindings = some capacity := by rw [process]; exact start
  have afterCollection : after.variables.process.bindings.filter (·.name == analysis.entry.collectionName) = [collection] := by
    rw [process]; exact collectionSelection
  have afterFrame := completeParallelScope_structural_parallel_frame analysis.entry parent target before after binding frame bound completed
  have afterRoot : after.scopeOccurrences.filter (·.id == parent) = [⟨parent, none⟩] := by
    simpa only [Bool.beq_eq_decide_eq] using afterFrame.root
  rcases retirement_capacity_population analysis.entry parent target before after binding frame bound bodyCount frameCount completed with
    empty | ⟨nextTarget, successor, successorBound, successorTotal, retained, successorBodies, successorFrames⟩
  · simp [programStateCapacity, storage, reservation, analyzed, afterStart, ownerSelection,
      afterCollection, value, empty.1, empty.2.1, empty.2.2.2]
    simpa only [List.filter_eq_nil_iff, beq_iff_eq] using empty.2.2.1
  · obtain ⟨afterActivities, afterControllers, afterOwner, afterElement, _, _, _⟩ :=
      afterFrame.bound_parent_shape analysis.entry parent nextTarget after successor successorBound
    obtain ⟨nextFirst, nextRest, nextBody, nextIterations⟩ := binding_body_shape analysis.entry after nextTarget successor successorBound
    have nextBound := parallelScopeBinding_retarget analysis.entry after nextTarget successor successorBound nextFirst (by simp [nextIterations])
    have nextLookup : successor.iterations.all (fun iteration => items[iteration.loopCounter]? == some iteration.item) = true := by
      apply List.all_eq_true.mpr
      intro iteration member
      exact List.all_eq_true.mp lookup iteration (retained.subset member)
    simp [programStateCapacity, storage, reservation, analyzed, afterStart, ownerSelection,
      afterCollection, value, afterActivities, afterControllers, afterOwner, afterElement,
      nextBody, nextBound, afterRoot, successorTotal, total, successorBodies, successorFrames]
    simpa only [List.all_eq_true, beq_iff_eq] using nextLookup

end BpmnSemantics.SemanticProcess
