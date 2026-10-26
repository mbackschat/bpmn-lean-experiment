module

import BpmnSemantics.SemanticProcess.InternalRegionalActivityValidity
import BpmnSemantics.SemanticProcess.InternalRegionalPositionValidity
import BpmnSemantics.SemanticProcess.SequentialScopeRuntimeLaws
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.InternalRegionalInstanceAncestry
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Regional controller lifetime preservation

Cancellation withdraws a controller by its Activity identity, before any record payload is
inspected. Consequently every matching record of a surviving controller remains in the exact
lookup census. These laws provide the controller side of regional program-binding preservation.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem repeated_binding_members (entry : SequentialScopeEntry) (state : RuntimeState)
    (binding : SequentialScopeBinding)
    (bound : sequentialScopeBindingForEntry? entry state = some binding) :
    binding.activity ∈ state.activityOccurrences ∧ binding.body ∈ state.scopeOccurrences ∧
    binding.controller ∈ state.sequentialScopeControllers ∧ binding.locals ∈ state.variables.scopes ∧
    binding.activity.body = .childScope binding.body.id ∧
    binding.body.parent = some binding.activity.owner ∧
    binding.activity.processInstanceId = binding.activity.owner.processInstanceId ∧
    binding.body.id.processInstanceId = binding.activity.owner.processInstanceId ∧
    binding.controller.id = sequentialScopeActivityId binding.activity ∧
    binding.locals.owner = binding.body.id ∧
    state.scopeOccurrences.any (fun occurrence => occurrence.id == binding.activity.owner) = true ∧
    binding.body.id.definitionScopeId = entry.childScopeId := by
  unfold sequentialScopeBindingForEntry? at bound
  cases running : state.control <;> simp only [running] at bound <;> try contradiction
  split at bound <;> try contradiction
  rename_i records record recordsEq
  split at bound <;> try contradiction
  rename_i recordBody child bodyEq
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  rename_i occurrences occurrence occurrencesEq
  split at bound <;> try contradiction
  rename_i controls current controlsEq
  obtain ⟨frame, frameEq, bound⟩ := Option.bind_eq_some_iff.mp bound
  split at bound <;> try contradiction
  simp only [Option.some.injEq] at bound
  subst binding
  have recordMember : record ∈ state.activityOccurrences.filter (fun record => record.activityElementId == entry.elementId) := by rw [recordsEq]; simp
  have bodyMember : occurrence ∈ state.scopeOccurrences.filter (fun occurrence => occurrence.id == child) := by rw [occurrencesEq]; simp
  have controllerMember : current ∈ state.sequentialScopeControllers.filter (fun controller => decide (controller.id = sequentialScopeActivityId record)) := by rw [controlsEq]; simp
  have frameMember : frame ∈ state.variables.scopes.filter (fun scope => decide (scope.owner = child)) := by
    unfold selectScopeVariables? at frameEq
    split at frameEq <;> simp_all
  simp only [List.mem_filter, beq_iff_eq, decide_eq_true_eq] at recordMember bodyMember controllerMember frameMember
  simp_all

private theorem repeated_body_retention_mask (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (entry : SequentialScopeEntry) (binding : SequentialScopeBinding)
    (position : runtimePositionValid program hosting state = true) [CallersParentless state]
    (running : state.control = .running hosting)
    (bound : sequentialScopeBindingForEntry? entry state = some binding) :
    let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId
    (!recordInRegion cancelled binding.activity (retainedCancellationRoot root disposition)) =
      (match disposition with
        | .retain => decide (binding.body.id = root) || !cancelled binding.body.id
        | .remove => !cancelled binding.body.id) := by
  dsimp only
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  obtain ⟨_, bodyMember, _, _, bodyEq, parentEq, _, processEq, _⟩ := repeated_binding_members entry state binding bound
  have closed : cancelled binding.activity.owner = true → cancelled binding.body.id = true := by
    intro inside
    rcases Bool.or_eq_true_iff.mp inside with scope | called
    · exact Bool.or_eq_true_iff.mpr (Or.inl (occurrenceInSubtree_closed state.scopeOccurrences
        (runtimePositionValid_scope_ids_nodup program hosting hosting state position running)
        (runtimePositionValid_scope_parents_live program hosting hosting state position running)
        root binding.activity.owner binding.body.id scope ⟨binding.body, bodyMember, parentEq, rfl⟩))
    · apply Bool.or_eq_true_iff.mpr
      exact Or.inr (by simpa only [processEq] using called)
  simp only [recordInRegion, bodyEq]
  change (!(cancelled binding.activity.owner ||
    (cancelled binding.body.id && !(retainedCancellationRoot root disposition == some binding.body.id)))) =
      (match disposition with
        | .retain => decide (binding.body.id = root) || !cancelled binding.body.id
        | .remove => !cancelled binding.body.id)
  by_cases same : binding.body.id = root
  · have called := calledInstanceClosure_child_empty program state hosting hosting position running
      binding.body bodyMember (by rw [parentEq]; simp)
    have outside := runtimePositionValid_parent_outside_child_subtree program state hosting hosting
      position running binding.body bodyMember binding.activity.owner parentEq
    have ownerOutside : cancelled binding.activity.owner = false := by
      simp only [cancelled, ← same, called, outside, List.contains_nil, Bool.or_self]
    cases disposition <;> simp [retainedCancellationRoot, same, ownerOutside]
  · have distinct : (retainedCancellationRoot root disposition == some binding.body.id) = false := by
      cases disposition <;> simp [retainedCancellationRoot, Ne.symm same]
    simp only [distinct, Bool.not_false, Bool.and_true]
    have mask : (!(cancelled binding.activity.owner || cancelled binding.body.id)) =
        !cancelled binding.body.id := by
      cases inside : cancelled binding.activity.owner with
      | false => simp only [Bool.false_or]
      | true => simp only [closed inside, Bool.true_or]
    rw [mask]
    cases disposition <;> simp [same]

private theorem repeated_controller_retention_mask (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (entry : SequentialScopeEntry) (binding : SequentialScopeBinding)
    (unique : activityIdentitiesUnique state = true)
    (bound : sequentialScopeBindingForEntry? entry state = some binding) :
    let called := calledInstanceClosure state root
    let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner || called.contains owner.processInstanceId
    (!called.contains binding.controller.id.processInstanceId &&
      !((withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)).any fun activity =>
        binding.controller.id.processInstanceId == activity.processInstanceId &&
        binding.controller.id.activityElementId.value == activity.activityElementId.value &&
        binding.controller.id.activation == activity.activation)) =
      !recordInRegion cancelled binding.activity (retainedCancellationRoot root disposition) := by
  dsimp only
  let called := calledInstanceClosure state root
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner || called.contains owner.processInstanceId
  obtain ⟨member, _, _, _, _, _, processEq, _, identity, _⟩ := repeated_binding_members entry state binding bound
  have names (activity : ActivityOccurrence) :
      (binding.controller.id.processInstanceId == activity.processInstanceId &&
        binding.controller.id.activityElementId.value == activity.activityElementId.value &&
        binding.controller.id.activation == activity.activation) = sameActivityOccurrence activity binding.activity := by
    apply Bool.eq_iff_iff.mpr
    simp only [identity, sequentialScopeActivityId, sameActivityOccurrence, Bool.and_eq_true, beq_iff_eq]
    have node : binding.activity.activityElementId.value = activity.activityElementId.value ↔
        activity.activityElementId = binding.activity.activityElementId := by
      cases activity.activityElementId
      cases binding.activity.activityElementId
      simp [eq_comm]
    rw [node]
    constructor <;> rintro ⟨⟨process, element⟩, activation⟩
    · exact ⟨⟨process.symm, element⟩, activation.symm⟩
    · exact ⟨⟨process.symm, element⟩, activation.symm⟩
  simp only [names]
  have withdrawn : (withdrawnByRegion cancelled state.activityOccurrences (retainedCancellationRoot root disposition)).any
      (fun activity => sameActivityOccurrence activity binding.activity) =
      recordInRegion cancelled binding.activity (retainedCancellationRoot root disposition) := by
    apply Bool.eq_iff_iff.mpr
    constructor
    · intro present
      obtain ⟨activity, retained, named⟩ := List.any_eq_true.mp present
      obtain ⟨prior, inside⟩ := List.mem_filter.mp retained
      have same := activityIdentitiesUnique_member_eq state binding.activity activity unique member prior named
      simpa only [same] using inside
    · intro inside
      exact List.any_eq_true.mpr ⟨binding.activity, List.mem_filter.mpr ⟨member, inside⟩,
        by simp [sameActivityOccurrence]⟩
  rw [withdrawn]
  have calledInside : called.contains binding.controller.id.processInstanceId = true →
      recordInRegion cancelled binding.activity (retainedCancellationRoot root disposition) = true := by
    intro present
    apply Bool.or_eq_true_iff.mpr
    apply Or.inl
    apply Bool.or_eq_true_iff.mpr
    exact Or.inr (by simpa only [identity, sequentialScopeActivityId, processEq] using present)
  cases inside : recordInRegion cancelled binding.activity (retainedCancellationRoot root disposition) with
  | true => simp
  | false =>
      have absent : called.contains binding.controller.id.processInstanceId = false := by
        apply Bool.eq_false_iff.mpr
        intro present
        have contradiction := calledInside present
        rw [inside] at contradiction
        contradiction
      change ((!called.contains binding.controller.id.processInstanceId) && true) = true
      rw [absent]
      rfl

/-- SMIS-IDENTITY-01 derives complete binding survival from the actual retained Activity, for either cancellation disposition. -/
theorem cancelScopeSubtree_preserves_repeated_binding (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (entry : SequentialScopeEntry) (binding : SequentialScopeBinding)
    (position : runtimePositionValid program hosting state = true) [CallersParentless state]
    (running : state.control = .running hosting)
    (unique : activityIdentitiesUnique state = true)
    (bound : sequentialScopeBindingForEntry? entry state = some binding)
    (retained : binding.activity ∈ (cancelScopeSubtree state root disposition).activityOccurrences) :
    sequentialScopeBindingForEntry? entry (cancelScopeSubtree state root disposition) = some binding := by
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  obtain ⟨_, bodyMember, controllerMember, localMember, _, _, _, _, _, localOwner, ownerLive, _⟩ :=
    repeated_binding_members entry state binding bound
  have kept : (!recordInRegion cancelled binding.activity (retainedCancellationRoot root disposition)) = true :=
    (List.mem_filter.mp retained).2
  have bodyKept := (repeated_body_retention_mask program state hosting root disposition entry binding position running bound) ▸ kept
  have nextBody : binding.body ∈ (cancelScopeSubtree state root disposition).scopeOccurrences :=
    List.mem_filter.mpr ⟨bodyMember, bodyKept⟩
  have nextController : binding.controller ∈ (cancelScopeSubtree state root disposition).sequentialScopeControllers := by
    apply List.mem_filter.mpr
    refine ⟨controllerMember, ?_⟩
    rw [repeated_controller_retention_mask state root disposition entry binding unique bound]
    exact kept
  have nextLocal : binding.locals ∈ (cancelScopeSubtree state root disposition).variables.scopes := by
    apply List.mem_filter.mpr
    refine ⟨localMember, ?_⟩
    cases disposition <;> simpa only [localOwner] using bodyKept
  have notInside : recordInRegion cancelled binding.activity (retainedCancellationRoot root disposition) = false := by
    simpa only [Bool.not_eq_true'] using kept
  have outside : cancelled binding.activity.owner = false := (Bool.or_eq_false_iff.mp notInside).1
  have nextOwner : (cancelScopeSubtree state root disposition).scopeOccurrences.any
      (fun occurrence => occurrence.id == binding.activity.owner) = true := by
    obtain ⟨owner, member, named⟩ := List.any_eq_true.mp ownerLive
    apply List.any_eq_true.mpr
    refine ⟨owner, List.mem_filter.mpr ⟨member, ?_⟩, named⟩
    have ownerEq : owner.id = binding.activity.owner := by simpa only [beq_iff_eq] using named
    cases disposition with
    | retain =>
        change (decide (owner.id = root) || !cancelled owner.id) = true
        simp only [ownerEq, outside, Bool.not_false, Bool.or_true]
    | remove =>
        change (!cancelled owner.id) = true
        simp only [ownerEq, outside, Bool.not_false]
  exact sequentialScopeBindingForEntry_retained entry state _ binding bound rfl
    List.filter_sublist retained List.filter_sublist nextBody List.filter_sublist nextController
    List.filter_sublist nextLocal nextOwner

private theorem repeated_filters_commute {α : Type} (values : List α) (keep selected : α → Bool) :
    (values.filter keep).filter selected = (values.filter selected).filter keep := by
  simp only [List.filter_filter]
  apply List.filter_congr
  intro value _
  exact Bool.and_comm _ _

/-- SMIS-IDENTITY-01 survives actual regional cancellation in both directions, including removed and retained bodies. -/
theorem cancelScopeSubtree_preserves_repeated_scope_state (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (position : runtimePositionValid program hosting state = true) [CallersParentless state]
    (running : state.control = .running hosting)
    (unique : activityIdentitiesUnique state = true)
    (valid : sequentialScopeStateValid program state = true) :
    sequentialScopeStateValid program (cancelScopeSubtree state root disposition) = true := by
  let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
    (calledInstanceClosure state root).contains owner.processInstanceId
  let keepActivity := fun activity => !recordInRegion cancelled activity (retainedCancellationRoot root disposition)
  let keepScope : RuntimeScopeOccurrence → Bool := match disposition with
    | .retain => fun occurrence => decide (occurrence.id = root) || !cancelled occurrence.id
    | .remove => fun occurrence => !cancelled occurrence.id
  have scopeField : (cancelScopeSubtree state root disposition).scopeOccurrences = state.scopeOccurrences.filter keepScope := by
    cases disposition <;> rfl
  simp only [sequentialScopeStateValid, Bool.and_eq_true] at valid ⊢
  constructor
  · apply List.all_eq_true.mpr
    intro controller retained
    have prior := List.all_eq_true.mp valid.1 controller (List.mem_filter.mp retained).1
    split at prior <;> try contradiction
    rename_i entry selected
    cases bindingEq : sequentialScopeBindingForEntry? entry state with
    | none => simp only [bindingEq] at prior; contradiction
    | some binding =>
        simp only [bindingEq] at prior
        have identity : binding.controller.id = controller.id := by simpa only [beq_iff_eq] using prior
        have kept := (List.mem_filter.mp retained).2
        rw [← identity] at kept
        rw [repeated_controller_retention_mask state root disposition entry binding unique bindingEq] at kept
        have activity : binding.activity ∈ (cancelScopeSubtree state root disposition).activityOccurrences :=
          List.mem_filter.mpr ⟨(repeated_binding_members entry state binding bindingEq).1, kept⟩
        have next := cancelScopeSubtree_preserves_repeated_binding program state hosting root disposition
          entry binding position running unique bindingEq activity
        simpa only [selected, next] using prior
  · apply List.all_eq_true.mpr
    intro entry declared
    have prior := List.all_eq_true.mp valid.2 entry declared
    have activityFrame : (cancelScopeSubtree state root disposition).activityOccurrences.filter
        (fun activity => activity.activityElementId == entry.elementId) =
        (state.activityOccurrences.filter (fun activity => activity.activityElementId == entry.elementId)).filter keepActivity :=
      repeated_filters_commute _ _ _
    have bodyFrame : (cancelScopeSubtree state root disposition).scopeOccurrences.filter
        (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) =
        (state.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId)).filter keepScope := by
      rw [scopeField]
      exact repeated_filters_commute _ _ _
    rw [activityFrame, bodyFrame]
    split at prior
    · simp_all only [List.filter_nil]
    · rename_i activity body activityEq bodyEq
      cases bindingEq : sequentialScopeBindingForEntry? entry state with
      | none => simp only [bindingEq] at prior; contradiction
      | some binding =>
          have activityCensus := (sequentialScope_binding_activity entry state binding bindingEq).1
          have activitySame : binding.activity = activity := by simpa only [activityEq, List.cons.injEq, and_true] using activityCensus.symm
          obtain ⟨_, bodyMember, _, _, _, _, _, _, _, _, _, bodyDefinition⟩ := repeated_binding_members entry state binding bindingEq
          have bodySelected : binding.body ∈ state.scopeOccurrences.filter
              (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) :=
            List.mem_filter.mpr ⟨bodyMember, by simpa only [beq_iff_eq] using bodyDefinition⟩
          have bodySame : binding.body = body := by simpa only [bodyEq, List.mem_singleton] using bodySelected
          have mask : keepActivity activity = keepScope body := by
            rw [← activitySame, ← bodySame]
            have relation := repeated_body_retention_mask program state hosting root disposition entry binding position running bindingEq
            cases disposition <;> exact relation
          rw [activityEq, bodyEq]
          simp only [List.filter_cons, List.filter_nil]
          rw [← mask]
          cases kept : keepActivity activity with
          | false => rfl
          | true =>
              have retained : binding.activity ∈ (cancelScopeSubtree state root disposition).activityOccurrences :=
                List.mem_filter.mpr ⟨(repeated_binding_members entry state binding bindingEq).1,
                  by change keepActivity binding.activity = true; simpa only [activitySame] using kept⟩
              have next := cancelScopeSubtree_preserves_repeated_binding program state hosting root disposition
                entry binding position running unique bindingEq retained
              have collection : sequentialScopeCollection? entry (cancelScopeSubtree state root disposition) =
                  sequentialScopeCollection? entry state := rfl
              simpa only [↓reduceIte, next, collection, bindingEq] using prior
    · contradiction

/-- SMIS-IDENTITY-01: Call return removes every part of a repeated binding by the same Process identity. -/
theorem removeCalledProcessTree_preserves_repeated_binding (state : RuntimeState)
    (call : CalledProcessOccurrence) (entry : SequentialScopeEntry) (binding : SequentialScopeBinding)
    (bound : sequentialScopeBindingForEntry? entry state = some binding)
    (retained : binding.activity ∈ (removeCalledProcessTree state call).activityOccurrences) :
    sequentialScopeBindingForEntry? entry (removeCalledProcessTree state call) = some binding := by
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [call.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
  obtain ⟨_, bodyMember, controllerMember, localMember, _, _, processEq, bodyProcess,
    identity, localOwner, ownerLive, _⟩ := repeated_binding_members entry state binding bound
  have kept : (!removed.contains binding.activity.owner.processInstanceId) = true :=
    (List.mem_filter.mp retained).2
  have nextBody : binding.body ∈ (removeCalledProcessTree state call).scopeOccurrences :=
    List.mem_filter.mpr ⟨bodyMember, by simpa only [bodyProcess] using kept⟩
  have nextController : binding.controller ∈ (removeCalledProcessTree state call).sequentialScopeControllers :=
    List.mem_filter.mpr ⟨controllerMember, by simpa only [identity, sequentialScopeActivityId, processEq] using kept⟩
  have nextLocal : binding.locals ∈ (removeCalledProcessTree state call).variables.scopes :=
    List.mem_filter.mpr ⟨localMember, by simpa only [localOwner, bodyProcess] using kept⟩
  have nextOwner : (removeCalledProcessTree state call).scopeOccurrences.any
      (fun occurrence => occurrence.id == binding.activity.owner) = true := by
    obtain ⟨owner, member, named⟩ := List.any_eq_true.mp ownerLive
    apply List.any_eq_true.mpr
    refine ⟨owner, List.mem_filter.mpr ⟨member, ?_⟩, named⟩
    have ownerEq : owner.id = binding.activity.owner := by simpa only [beq_iff_eq] using named
    simpa only [ownerEq] using kept
  exact sequentialScopeBindingForEntry_retained entry state _ binding bound rfl
    List.filter_sublist retained List.filter_sublist nextBody List.filter_sublist nextController
    List.filter_sublist nextLocal nextOwner

/-- SMIS-IDENTITY-01 survives Call return through whole-Process removal, including the reverse entry census. -/
theorem removeCalledProcessTree_preserves_repeated_scope_state (program : Program) (state : RuntimeState)
    (call : CalledProcessOccurrence) (valid : sequentialScopeStateValid program state = true) :
    sequentialScopeStateValid program (removeCalledProcessTree state call) = true := by
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [call.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
  let keepActivity := fun activity : ActivityOccurrence => !removed.contains activity.owner.processInstanceId
  let keepScope := fun occurrence : RuntimeScopeOccurrence => !removed.contains occurrence.id.processInstanceId
  simp only [sequentialScopeStateValid, Bool.and_eq_true] at valid ⊢
  constructor
  · apply List.all_eq_true.mpr
    intro controller retained
    have prior := List.all_eq_true.mp valid.1 controller (List.mem_filter.mp retained).1
    split at prior <;> try contradiction
    rename_i entry selected
    cases bindingEq : sequentialScopeBindingForEntry? entry state with
    | none => simp only [bindingEq] at prior; contradiction
    | some binding =>
        simp only [bindingEq] at prior
        have same : binding.controller.id = controller.id := by simpa only [beq_iff_eq] using prior
        obtain ⟨member, _, _, _, _, _, processEq, _, identity, _⟩ :=
          repeated_binding_members entry state binding bindingEq
        have kept := (List.mem_filter.mp retained).2
        have activity : binding.activity ∈ (removeCalledProcessTree state call).activityOccurrences := by
          apply List.mem_filter.mpr
          refine ⟨member, ?_⟩
          simpa only [← same, identity, sequentialScopeActivityId, processEq] using kept
        have next := removeCalledProcessTree_preserves_repeated_binding state call entry binding bindingEq activity
        simpa only [selected, next] using prior
  · apply List.all_eq_true.mpr
    intro entry declared
    have prior := List.all_eq_true.mp valid.2 entry declared
    have activityFrame : (removeCalledProcessTree state call).activityOccurrences.filter
        (fun activity => activity.activityElementId == entry.elementId) =
        (state.activityOccurrences.filter (fun activity => activity.activityElementId == entry.elementId)).filter keepActivity :=
      repeated_filters_commute _ _ _
    have bodyFrame : (removeCalledProcessTree state call).scopeOccurrences.filter
        (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) =
        (state.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId)).filter keepScope :=
      repeated_filters_commute _ _ _
    rw [activityFrame, bodyFrame]
    split at prior
    · simp_all only [List.filter_nil]
    · rename_i activity body activityEq bodyEq
      cases bindingEq : sequentialScopeBindingForEntry? entry state with
      | none => simp only [bindingEq] at prior; contradiction
      | some binding =>
          have activityCensus := (sequentialScope_binding_activity entry state binding bindingEq).1
          have activitySame : binding.activity = activity := by simpa only [activityEq, List.cons.injEq, and_true] using activityCensus.symm
          obtain ⟨_, bodyMember, _, _, _, _, _, processEq, _, _, _, bodyDefinition⟩ :=
            repeated_binding_members entry state binding bindingEq
          have bodySelected : binding.body ∈ state.scopeOccurrences.filter
              (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) :=
            List.mem_filter.mpr ⟨bodyMember, by simpa only [beq_iff_eq] using bodyDefinition⟩
          have bodySame : binding.body = body := by simpa only [bodyEq, List.mem_singleton] using bodySelected
          have mask : keepActivity activity = keepScope body := by
            simp only [← activitySame, ← bodySame, keepActivity, keepScope, processEq]
          rw [activityEq, bodyEq]
          simp only [List.filter_cons, List.filter_nil]
          rw [← mask]
          cases kept : keepActivity activity with
          | false => rfl
          | true =>
              have retained : binding.activity ∈ (removeCalledProcessTree state call).activityOccurrences :=
                List.mem_filter.mpr ⟨(repeated_binding_members entry state binding bindingEq).1,
                  by change keepActivity binding.activity = true; simpa only [activitySame] using kept⟩
              have next := removeCalledProcessTree_preserves_repeated_binding state call entry binding bindingEq retained
              have collection : sequentialScopeCollection? entry (removeCalledProcessTree state call) =
                  sequentialScopeCollection? entry state := rfl
              simpa only [↓reduceIte, next, collection, bindingEq] using prior
    · contradiction

/-- Any withdrawn identity claimant removes the SMI controller, even when another record with
the same identity survives. A payload-first lookup would miss that second claimant. -/
theorem cancelled_activity_claimant_removes_controller (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (controller : SequentialMultiInstanceController) (record : ActivityOccurrence)
    (member : record ∈ state.activityOccurrences)
    (inside : recordInRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
      (calledInstanceClosure state root).contains owner.processInstanceId) record (retainedCancellationRoot root disposition) = true)
    (names : controllerNamesActivityOccurrence controller record = true) :
    controller ∉ (cancelScopeSubtree state root disposition).sequentialMultiInstanceControllers := by
  intro survives
  have kept := (List.mem_filter.mp survives).2
  simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
  have withdrawn : (withdrawnByRegion
      (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
        (calledInstanceClosure state root).contains owner.processInstanceId)
      state.activityOccurrences (retainedCancellationRoot root disposition)).any (controllerNamesActivityOccurrence controller) = true :=
    List.any_eq_true.mpr ⟨record, List.mem_filter.mpr ⟨member, inside⟩, names⟩
  rw [kept.2] at withdrawn
  contradiction

private theorem retained_census_of_no_withdrawn_claimant (records : List ActivityOccurrence)
    (cancelled : ScopeOccurrenceId → Bool) (names : ActivityOccurrence → Bool) (retainedRoot : Option ScopeOccurrenceId)
    (absent : (withdrawnByRegion cancelled records retainedRoot).any names = false) :
    (retainedByRegion cancelled records retainedRoot).filter names = records.filter names := by
  simp only [retainedByRegion, List.filter_filter]
  apply List.filter_congr
  intro record member
  by_cases named : names record = true
  · have outside : recordInRegion cancelled record retainedRoot = false := by
      apply Bool.eq_false_iff.mpr
      intro inside
      have present : (withdrawnByRegion cancelled records retainedRoot).any names = true :=
        List.any_eq_true.mpr ⟨record, List.mem_filter.mpr ⟨member, inside⟩, named⟩
      rw [absent] at present
      contradiction
    simp [named, outside]
  · simp [Bool.eq_false_iff.mpr named]

/-- The complete identity-first SMI Activity lookup is unchanged for every surviving controller;
the claim preserves multiplicity rather than assuming uniqueness or selecting one witness. -/
theorem cancelScopeSubtree_controller_activity_census (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (controller : SequentialMultiInstanceController)
    (survives : controller ∈
      (cancelScopeSubtree state root disposition).sequentialMultiInstanceControllers) :
    (cancelScopeSubtree state root disposition).activityOccurrences.filter
        (controllerNamesActivityOccurrence controller) =
      state.activityOccurrences.filter (controllerNamesActivityOccurrence controller) := by
  have kept := (List.mem_filter.mp survives).2
  simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
  exact retained_census_of_no_withdrawn_claimant _ _ _ _ kept.2

/-- PMI cancellation uses the same all-claimant withdrawal rule with its published controller
identity. No successor controller/record binding is assumed. -/
theorem cancelScopeSubtree_parallel_controller_activity_census (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (controller : ParallelMultiInstanceController)
    (survives : controller ∈
      (cancelScopeSubtree state root disposition).parallelMultiInstanceControllers) :
    (cancelScopeSubtree state root disposition).activityOccurrences.filter
        (fun activity => parallelControllerNamesIdentity controller activity.processInstanceId
          ⟨activity.activityElementId.value⟩ activity.activation) =
      state.activityOccurrences.filter
        (fun activity => parallelControllerNamesIdentity controller activity.processInstanceId
          ⟨activity.activityElementId.value⟩ activity.activation) := by
  have kept := (List.mem_filter.mp survives).2
  simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
  exact retained_census_of_no_withdrawn_claimant _ _ _ _ kept.2

/-- The exact singleton Activity census of every retained SMI controller follows from the
predecessor census and the actual identity-based controller withdrawal. -/
theorem cancelScopeSubtree_preserves_controller_owners (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (valid : controllersOwnLiveActivity state = true) :
    controllersOwnLiveActivity (cancelScopeSubtree state root disposition) = true := by
  apply List.all_eq_true.mpr
  intro controller member
  rw [cancelScopeSubtree_controller_activity_census state root disposition controller member]
  exact List.all_eq_true.mp valid controller (List.mem_filter.mp member).1

/-- Cancellation neither advances a retained controller nor changes its snapshot. -/
theorem cancelScopeSubtree_preserves_controller_exhaustion (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (valid : controllersNotExhausted state = true) :
    controllersNotExhausted (cancelScopeSubtree state root disposition) = true :=
  all_filter _ _ _ valid

/-- Called-instance removal also leaves retained controller progress and snapshots intact. -/
theorem removeCalledProcessTree_preserves_controller_exhaustion (state : RuntimeState)
    (record : CalledProcessOccurrence) (valid : controllersNotExhausted state = true) :
    controllersNotExhausted (removeCalledProcessTree state record) = true :=
  all_filter _ _ _ valid

private theorem task_body_census_length (state : RuntimeState) (record : ActivityOccurrence)
    (task : OccurrenceId) (body : activityBodyTask? record = some task)
    (live : activityBodyLive state record = true) :
    (state.waits.filter (taskIdNamesWait task)).length = 1 := by
  cases shape : record.body <;> simp [activityBodyTask?, shape] at body
  next actual =>
    subst actual
    have names (wait : UserTaskWait) :
        (decide (wait.processInstanceId = task.processInstanceId) &&
          decide (wait.task.id.value = task.elementId.value) &&
          decide (wait.activation = task.activation)) = taskIdNamesWait task wait := by
      apply Bool.eq_iff_iff.mpr
      simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq]
      simp only [eq_comm]
    simpa only [activityBodyLive, shape, names, decide_eq_true_eq] using live

theorem smi_binding_of_retained_work (program : Program) (before after : RuntimeState)
    (controller : SequentialMultiInstanceController)
    (records : after.activityOccurrences.filter (controllerNamesActivityOccurrence controller) =
      before.activityOccurrences.filter (controllerNamesActivityOccurrence controller))
    (tasks : after.waits.Sublist before.waits)
    (timers : after.timerWaits.Sublist before.timerWaits)
    (beforeBodies : activityRecordsOwnLiveWork before = true)
    (afterBodies : activityRecordsOwnLiveWork after = true)
    (valid : sequentialMultiInstanceControllerProgramBindingValid program before controller = true) :
    sequentialMultiInstanceControllerProgramBindingValid program after controller = true := by
  unfold sequentialMultiInstanceControllerProgramBindingValid at valid ⊢
  rw [records]
  generalize selected : before.activityOccurrences.filter
    (controllerNamesActivityOccurrence controller) = selectedRecords at valid ⊢
  cases selectedRecords with
  | nil => simp at valid
  | cons record rest =>
    cases rest with
    | cons next tail => simp at valid
    | nil =>
      have beforeSelected : record ∈ before.activityOccurrences.filter
          (controllerNamesActivityOccurrence controller) := by rw [selected]; simp
      have afterSelected : record ∈ after.activityOccurrences.filter
          (controllerNamesActivityOccurrence controller) := by rw [records, selected]; simp
      have beforeMember := (List.mem_filter.mp beforeSelected).1
      have afterMember := (List.mem_filter.mp afterSelected).1
      have beforeWork := List.all_eq_true.mp beforeBodies record beforeMember
      have afterWork := List.all_eq_true.mp afterBodies record afterMember
      simp only [Bool.and_eq_true] at beforeWork afterWork
      simp only at valid ⊢
      split at *
      · rename_i id origin input task data output boundaryTimer limits operations
        cases body : activityBodyTask? record with
        | none => simp [body] at valid
        | some bodyTask =>
          have taskCensus : after.waits.filter (taskIdNamesWait bodyTask) =
              before.waits.filter (taskIdNamesWait bodyTask) := by
            apply (tasks.filter _).eq_of_length
            rw [task_body_census_length after record bodyTask body afterWork.1.1.1,
              task_body_census_length before record bodyTask body beforeWork.1.1.1]
          simp only [body, taskCensus] at valid ⊢
          generalize taskSelection : before.waits.filter (taskIdNamesWait bodyTask) = selectedTasks
            at valid ⊢
          cases selectedTasks with
          | nil => simp at valid
          | cons wait rest =>
            cases rest with
            | cons next tail => simp at valid
            | nil =>
              cases handlerSelection : record.timerHandlerOccurrences with
              | nil => simp [handlerSelection] at valid
              | cons timerId rest =>
                cases rest with
                | cons next tail => simp [handlerSelection] at valid
                | nil =>
                  simp only [handlerSelection] at valid ⊢
                  have timerLive := List.all_eq_true.mp afterWork.1.2 timerId
                    (handlerSelection.symm ▸ (by simp))
                  obtain ⟨afterWait, afterWaitMem, named⟩ := List.any_eq_true.mp timerLive
                  simp only [Bool.and_eq_true] at named
                  have positive : 0 < (after.timerWaits.filter (timerIdNamesWait timerId)).length :=
                    List.length_pos_of_mem (List.mem_filter.mpr
                      ⟨afterWaitMem, named.1⟩)
                  generalize timerSelection : before.timerWaits.filter (timerIdNamesWait timerId) =
                    selectedTimers at valid
                  cases selectedTimers with
                  | nil => simp at valid
                  | cons timerWait rest =>
                    cases rest with
                    | cons next tail => simp at valid
                    | nil =>
                      have timerCensus : after.timerWaits.filter (timerIdNamesWait timerId) =
                          before.timerWaits.filter (timerIdNamesWait timerId) := by
                        apply (timers.filter _).eq_of_length_le
                        simp only [timerSelection, List.length_singleton]
                        omega
                      simpa only [timerCensus, timerSelection] using valid
      · contradiction

/-- Actual cancellation preserves every retained SMI controller's operation, Activity, task,
and lifetime-Timer binding. Handler survival is derived from predecessor attachment uniqueness. -/
theorem cancelScopeSubtree_preserves_controller_program_bindings (program : Program)
    (state : RuntimeState) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (bindings : sequentialMultiInstanceControllerProgramBindingsValid program state = true)
    (bodies : activityRecordsOwnLiveWork state = true)
    (timers : attachedTimersUnambiguous state = true)
    (messages : attachedMessagesUnambiguous state = true) :
    sequentialMultiInstanceControllerProgramBindingsValid program
      (cancelScopeSubtree state root disposition) = true := by
  have retainedBodies := cancelScopeSubtree_preserves_activity_records state root disposition
    bodies timers messages
  apply List.all_eq_true.mpr
  intro controller member
  exact smi_binding_of_retained_work program state (cancelScopeSubtree state root disposition)
    controller (cancelScopeSubtree_controller_activity_census state root disposition controller member)
    List.filter_sublist List.filter_sublist bodies retainedBodies
    (List.all_eq_true.mp bindings controller (List.mem_filter.mp member).1)

end BpmnSemantics.SemanticProcess
