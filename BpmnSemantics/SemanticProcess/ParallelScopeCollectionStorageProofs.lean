module

public import BpmnSemantics.SemanticProcess.ParallelScopeActualStepEvidence
public import BpmnSemantics.SemanticProcess.ParallelScopeWaitReadiness
public import BpmnSemantics.SemanticProcess.InternalCommutationStateFrames
public import BpmnSemantics.SemanticProcess.RuntimeStateCollectionCounterLaws
public import BpmnSemantics.SemanticProcess.InternalRegionalRemovalOrder

/-! RSI-ORDER-01/RSI-UNIQ-02 storage follows actual PMIS ingress and internal steps.
Reservation validity supplies fresh wait identities; collection storage alone is not an issuance certificate.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

private theorem storage_iff (state : RuntimeState) :
    committedStateCollectionAdmitted state = true ↔
      canonicalCollectionOrder state = true ∧ uniqueCollectionKeys state = true := by
  unfold committedStateCollectionAdmitted committedStateCollectionDefects
  split <;> simp_all

private theorem keys_unique {α β : Type} [DecidableEq β] (key : α → β)
    (same : α → α → Bool) (matching : ∀ left right, same left right = decide (key left = key right))
    (values : List α) (unique : (values.map key).Nodup) :
    values.all (occursOnce same values) = true := by
  apply List.all_eq_true.mpr
  intro value member
  have selected := filter_key_eq_singleton_of_nodup values key value unique member
  have predicate : same value = fun candidate => decide (key candidate = key value) := by
    funext candidate
    rw [matching]
    simp only [eq_comm]
  simp [occursOnce, predicate, selected]

private theorem reservation_storage_keys (state : RuntimeState)
    (valid : occurrenceReservationStateValid state = true) :
    waitIdentitiesUnique state = true ∧ (state.variables.activities.map (·.owner)).Nodup := by
  simp only [occurrenceReservationStateValid, Bool.and_eq_true] at valid
  have anchors := (List.nodup_append.mp (of_decide_eq_true valid.1.1.1.1.2)).1
  simp only [openWaitAnchors, List.append_assoc] at anchors
  have human := (List.nodup_append.mp anchors).1
  have messages := (List.nodup_append.mp (List.nodup_append.mp anchors).2.1).1
  have timers := (List.nodup_append.mp (List.nodup_append.mp (List.nodup_append.mp anchors).2.1).2.1).1
  have effects := (List.nodup_append.mp (List.nodup_append.mp (List.nodup_append.mp
    (List.nodup_append.mp anchors).2.1).2.1).2.1).1
  refine ⟨?_, of_decide_eq_true valid.1.1.1.2⟩
  simp only [waitIdentitiesUnique, Bool.and_eq_true, and_assoc]
  refine ⟨keys_unique userTaskWaitOccurrence userTaskWaitKeyMatches ?_ _ human,
    keys_unique messageWaitOccurrence messageWaitKeyMatches ?_ _ messages,
    keys_unique timerWaitOccurrence timerWaitKeyMatches ?_ _ timers,
    keys_unique effectWaitOccurrence effectWaitKeyMatches ?_ _ effects⟩
  all_goals
    intro left right
    apply Bool.eq_iff_iff.mpr
    simp only [userTaskWaitKeyMatches, messageWaitKeyMatches, timerWaitKeyMatches,
      effectWaitKeyMatches, userTaskWaitOccurrence, messageWaitOccurrence, timerWaitOccurrence,
      effectWaitOccurrence, Bool.and_eq_true, decide_eq_true_eq, OccurrenceId.mk.injEq]
    first
    | (cases left.task.id; cases right.task.id; simp [and_assoc])
    | (cases left.elementId; cases right.elementId; simp [and_assoc])

private theorem token_storage (state : RuntimeState) (tokens : List ControlToken)
    (storage : committedStateCollectionAdmitted state = true)
    (ordered : orderedBy controlTokenBefore tokens = true) :
    committedStateCollectionAdmitted { state with tokens } = true :=
  storage_iff _ |>.mpr ⟨canonicalCollectionOrder_tokens_update state tokens
    ((storage_iff state).mp storage).1 ordered, ((storage_iff state).mp storage).2⟩

private theorem variables_storage (state : RuntimeState) (variables : ScopedVariables)
    (activities : variables.activities = state.variables.activities)
    (storage : committedStateCollectionAdmitted state = true) :
    committedStateCollectionAdmitted { state with variables } = true := by
  apply (storage_iff _).mpr
  simpa only [canonicalCollectionOrder, uniqueCollectionKeys, waitIdentitiesUnique,
    activityIdentitiesUnique, activities] using (storage_iff state).mp storage

private theorem arm_storage (state : RuntimeState) (patch : InternalArmingPatch)
    (storage : committedStateCollectionAdmitted state = true)
    (valid : occurrenceReservationStateValid (applyInternalArmingPatch state patch) = true) :
    committedStateCollectionAdmitted (applyInternalArmingPatch state patch) = true := by
  obtain ⟨ordered, keys⟩ := (storage_iff state).mp storage
  have orders := canonicalCollectionOrder_internalArmingOrders state ordered
  obtain ⟨waits, frames⟩ := reservation_storage_keys _ valid
  simp only [uniqueCollectionKeys, Bool.and_eq_true, decide_eq_true_eq, and_assoc] at keys
  obtain ⟨activityKeys, humanKeys, messageKeys, timerKeys, effectKeys, scopeKeys,
    callKeys, raceKeys, scopes, _, _, selections, races, calls, activities, sequential, parallel⟩ := keys
  refine (storage_iff _).mpr ⟨applyInternalArmingPatch_preserves_order state patch ordered, ?_⟩
  cases write : patch.write with
  | userTask wait =>
    have counter := (task_counter_storage state.activations wait.task.id wait.activation orders.1 humanKeys).2
    simp_all only [applyInternalArmingPatch, uniqueCollectionKeys, waitIdentitiesUnique,
      activityIdentitiesUnique, Bool.and_eq_true, decide_eq_true_eq, and_true]
  | message wait =>
    have counter := (orderedBy_uniqueKeys_replace MessageActivation.elementId messageActivationBefore
      (stringKeyBefore_asymm (fun row : MessageActivation => row.elementId.value))
      (stringKeyBefore_compose (fun row : MessageActivation => row.elementId.value))
      ⟨wait.elementId, wait.activation⟩ (fun row => decide (row.elementId ≠ wait.elementId))
      state.messageActivations orders.2.1 messageKeys (fun row kept => of_decide_eq_true kept)).2
    simp_all only [applyInternalArmingPatch, setMessageActivationCount, uniqueCollectionKeys,
      waitIdentitiesUnique, activityIdentitiesUnique, Bool.and_eq_true, decide_eq_true_eq, and_true]
  | timer wait =>
    have counter := (orderedBy_uniqueKeys_replace TimerActivation.elementId timerActivationBefore
      (stringKeyBefore_asymm (fun row : TimerActivation => row.elementId.value))
      (stringKeyBefore_compose (fun row : TimerActivation => row.elementId.value))
      ⟨wait.elementId, wait.activation⟩ (fun row => decide (row.elementId ≠ wait.elementId))
      state.timerActivations orders.2.2.1 timerKeys (fun row kept => of_decide_eq_true kept)).2
    simp_all only [applyInternalArmingPatch, setTimerActivationCount, uniqueCollectionKeys,
      waitIdentitiesUnique, activityIdentitiesUnique, Bool.and_eq_true, decide_eq_true_eq, and_true]
  | effect wait bindings =>
    have counter := (effect_counter_storage state.effectActivations wait.elementId wait.activation orders.2.2.2.1 effectKeys).2
    simp_all only [applyInternalArmingPatch, uniqueCollectionKeys, waitIdentitiesUnique,
      activityIdentitiesUnique, Bool.and_eq_true, decide_eq_true_eq, and_true]

private theorem cancellation_storage (state : RuntimeState) (root : ScopeOccurrenceId)
    (storage : committedStateCollectionAdmitted state = true) :
    committedStateCollectionAdmitted (cancelScopeSubtree state root .remove) = true := by
  obtain ⟨ordered, keys⟩ := (storage_iff state).mp storage
  refine (storage_iff _).mpr ⟨cancelScopeSubtree_preserves_canonical_order state root .remove ordered, ?_⟩
  simp only [uniqueCollectionKeys, Bool.and_eq_true, decide_eq_true_eq, and_assoc] at keys ⊢
  obtain ⟨a, h, m, t, e, s, c, r, scopes, waits, data, selections, races, calls,
    activities, sequential, parallel⟩ := keys
  simp only [waitIdentitiesUnique, Bool.and_eq_true, and_assoc] at waits
  refine ⟨a, h, m, t, e, s, c, r, (List.filter_sublist.map _).nodup scopes, ?_,
    (List.filter_sublist.map _).nodup data, (List.filter_sublist.map _).nodup selections,
    (List.filter_sublist.map _).nodup races, (List.filter_sublist.map _).nodup calls, ?_,
    (List.filter_sublist.map _).nodup sequential, (List.filter_sublist.map _).nodup parallel⟩
  · simp only [waitIdentitiesUnique, Bool.and_eq_true, and_assoc]
    exact ⟨all_occursOnce_filter _ (fun _ => by simp [userTaskWaitKeyMatches]) _ _ waits.1,
      all_occursOnce_filter _ (fun _ => by simp [messageWaitKeyMatches]) _ _ waits.2.1,
      all_occursOnce_filter _ (fun _ => by simp [timerWaitKeyMatches]) _ _ waits.2.2.1,
      all_occursOnce_filter _ (fun _ => by simp [effectWaitKeyMatches]) _ _ waits.2.2.2⟩
  · exact all_occursOnce_filter _ (fun _ => by simp [sameActivityOccurrence]) _ _ activities

private theorem activity_filter_storage (state : RuntimeState) (keep : ActivityOccurrence → Bool)
    (storage : committedStateCollectionAdmitted state = true) :
    committedStateCollectionAdmitted { state with activityOccurrences := state.activityOccurrences.filter keep } = true := by
  obtain ⟨ordered, keys⟩ := (storage_iff state).mp storage
  have order : orderedBy activityOccurrenceBefore state.activityOccurrences = true := by
    simp only [canonicalCollectionOrder, Bool.and_eq_true] at ordered
    exact ordered.1.1.1.1.1.1.2
  have unique : activityIdentitiesUnique state = true := by
    simp only [uniqueCollectionKeys, Bool.and_eq_true] at keys
    exact keys.1.1.2
  have filteredOrder := orderedBy_filter regional_activityOccurrenceBefore_compose keep _ order
  have filteredKeys := all_occursOnce_filter sameActivityOccurrence (fun _ => by simp [sameActivityOccurrence]) _ keep unique
  apply (storage_iff _).mpr
  simp_all only [canonicalCollectionOrder, uniqueCollectionKeys, waitIdentitiesUnique,
    activityIdentitiesUnique, Bool.and_eq_true, and_true]

private theorem activity_body_storage (state : RuntimeState) (record : ActivityOccurrence)
    (first : ParallelScopeIteration) (rest : List ParallelScopeIteration)
    (storage : committedStateCollectionAdmitted state = true) :
    committedStateCollectionAdmitted { state with activityOccurrences := state.activityOccurrences.map fun candidate =>
      if candidate == record then { candidate with body := .parallelChildScopes first rest } else candidate } = true := by
  let key := fun row : ActivityOccurrence => (row.processInstanceId, row.activityElementId, row.activation)
  have mapped : (state.activityOccurrences.map (fun candidate =>
      if candidate == record then { candidate with body := .parallelChildScopes first rest } else candidate)).map key =
      state.activityOccurrences.map key := by
    simp only [List.map_map]
    apply List.map_congr_left
    intro row _
    dsimp only [Function.comp_def]
    split <;> rfl
  have order := orderedBy_of_map_eq key activityOccurrenceBefore
    (fun left right => if left.1.value ≠ right.1.value then left.1.value < right.1.value
      else if left.2.1.value ≠ right.2.1.value then left.2.1.value < right.2.1.value else left.2.2 < right.2.2)
    (fun _ _ => rfl) _ _ mapped
  have unique := all_occursOnce_of_map_eq key sameActivityOccurrence
    (fun left right => left.1 == right.1 && left.2.1 == right.2.1 && left.2.2 == right.2.2)
    (fun _ _ => rfl) _ _ mapped
  apply (storage_iff _).mpr
  simpa only [canonicalCollectionOrder, uniqueCollectionKeys, waitIdentitiesUnique,
    activityIdentitiesUnique, order, unique] using (storage_iff state).mp storage

private theorem cancellation_fold_storage (iterations : List ParallelScopeIteration) (state : RuntimeState)
    (storage : committedStateCollectionAdmitted state = true) :
    committedStateCollectionAdmitted (iterations.foldl
      (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state) = true := by
  induction iterations generalizing state with
  | nil => exact storage
  | cons iteration rest ih => exact ih _ (cancellation_storage state iteration.scope storage)

private theorem retirement_storage (entry : ParallelScopeEntry) (state after : RuntimeState)
    (target : ScopeOccurrenceId) (completed : completeParallelScope? entry state target = some after)
    (storage : committedStateCollectionAdmitted state = true) : committedStateCollectionAdmitted after = true := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  have disposed := variables_storage state variables (removeScopeVariables_preserves_other_data removed).2.1 storage
  have detached := activity_filter_storage _ (· != binding.activity) disposed
  have retired := cancellation_storage { { state with variables } with
    activityOccurrences := state.activityOccurrences.filter (· != binding.activity),
    parallelScopeControllers := state.parallelScopeControllers.filter (· != binding.controller) } target detached
  rcases retirement with ⟨_, _, first, rest⟩ | ⟨_, _⟩ | ⟨_, _, first, rest⟩ <;> cases Option.some.inj completed
  · exact cancellation_storage _ target (activity_body_storage _ binding.activity first rest disposed)
  · exact token_storage _ _ retired (orderedBy_addToken _ _ _ (canonicalCollectionOrder_tokens _ ((storage_iff _).mp retired).1))
  · have cancelled := cancellation_fold_storage (first :: rest) _ retired
    exact token_storage _ _ cancelled (orderedBy_addToken _ _ _ (canonicalCollectionOrder_tokens _ ((storage_iff _).mp cancelled).1))

private theorem issuance_storage_fields (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (items : List String) (index : Nat) (before after : RuntimeState) (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations))
    (ordered : canonicalCollectionOrder before = true)
    (scopeKeys : (before.scopeActivations.map (·.scopeId)).Nodup) :
    canonicalCollectionOrder after = true ∧ (after.scopeActivations.map (·.scopeId)).Nodup ∧
      after.activityActivations = before.activityActivations ∧ after.activations = before.activations ∧
      after.messageActivations = before.messageActivations ∧ after.timerActivations = before.timerActivations ∧
      after.effectActivations = before.effectActivations ∧ after.callActivations = before.callActivations ∧
      after.eventRaceActivations = before.eventRaceActivations ∧ after.waits = before.waits ∧
      after.messageWaits = before.messageWaits ∧ after.timerWaits = before.timerWaits ∧
      after.effectWaits = before.effectWaits ∧ after.variables.activities = before.variables.activities ∧
      after.selectedBranchSets = before.selectedBranchSets ∧ after.eventRaces = before.eventRaces ∧
      after.sequentialMultiInstanceControllers = before.sequentialMultiInstanceControllers ∧
      after.parallelMultiInstanceControllers = before.parallelMultiInstanceControllers := by
  induction items generalizing before index iterations with
  | nil =>
    simp only [issueParallelBodies?, Option.some.injEq, Prod.mk.injEq] at issued
    rcases issued with ⟨rfl, rfl⟩
    exact ⟨ordered, scopeKeys, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩
  | cons item items ih =>
    unfold issueParallelBodies? at issued
    obtain ⟨variables, initialized, issued⟩ := Option.bind_eq_some_iff.mp issued
    obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
    cases Option.some.inj issued
    have data := (initializeScopeVariables_preserves_other_data initialized).2.1
    have scopeOrder : orderedBy scopeActivationBefore before.scopeActivations = true := by
      simp only [canonicalCollectionOrder, Bool.and_eq_true] at ordered
      exact ordered.1.1.2
    have counter := orderedBy_uniqueKeys_replace ScopeActivation.scopeId scopeActivationBefore
      (stringKeyBefore_asymm (fun row : ScopeActivation => row.scopeId.value))
      (stringKeyBefore_compose (fun row : ScopeActivation => row.scopeId.value))
      ⟨entry.childScopeId, scopeActivationCount before entry.childScopeId + 1⟩
      (fun row => decide (row.scopeId.value ≠ entry.childScopeId.value)) before.scopeActivations
      scopeOrder scopeKeys (fun row kept same => of_decide_eq_true kept (congrArg DefinitionScopeId.value same))
    have issuedOrder : canonicalCollectionOrder
        { before with
          variables := variables,
          scopeOccurrences := insertScopeOccurrence ⟨⟨parent.processInstanceId, entry.childScopeId,
            scopeActivationCount before entry.childScopeId + 1⟩, some parent⟩ before.scopeOccurrences,
          scopeActivations := setScopeActivationCount before.scopeActivations entry.childScopeId
            (scopeActivationCount before entry.childScopeId + 1),
          tokens := addToken before.tokens entry.childEntry
            ⟨parent.processInstanceId, entry.childScopeId, scopeActivationCount before entry.childScopeId + 1⟩ } = true := by
      have tokenOrder := orderedBy_addToken before.tokens entry.childEntry
        ⟨parent.processInstanceId, entry.childScopeId, scopeActivationCount before entry.childScopeId + 1⟩
        (canonicalCollectionOrder_tokens before ordered)
      have scopes : orderedBy scopeOccurrenceBefore before.scopeOccurrences = true := by
        simp only [canonicalCollectionOrder, Bool.and_eq_true] at ordered
        exact ordered.1.1.1.2
      have inserted := orderedBy_insertScopeOccurrence
        ⟨⟨parent.processInstanceId, entry.childScopeId, scopeActivationCount before entry.childScopeId + 1⟩, some parent⟩ _ scopes
      simp only [canonicalCollectionOrder, Bool.and_eq_true] at ordered ⊢
      simp_all only [setScopeActivationCount, and_true]
    have result := ih _ _ _ generated issuedOrder counter.2
    simpa only [data] using result

private theorem fresh_activity_keys (record : ActivityOccurrence) (values : List ActivityOccurrence)
    (fresh : ∀ value ∈ values, value.activityElementId ≠ record.activityElementId)
    (unique : values.all (occursOnce sameActivityOccurrence values) = true) :
    (insertActivityOccurrence record values).all (occursOnce sameActivityOccurrence (insertActivityOccurrence record values)) = true := by
  have absent : values.filter (sameActivityOccurrence record) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro value member same
    have different := fresh value member
    simp only [sameActivityOccurrence, Bool.and_eq_true, beq_iff_eq] at same
    exact different same.1.2.symm
  rw [all_insertActivityOccurrence]
  simp only [Bool.and_eq_true]
  constructor
  · simp only [occursOnce, insertActivityOccurrence_eq_canonicalInsertBy, length_filter_canonicalInsertBy, sameActivityOccurrence,
      BEq.rfl, Bool.and_self, ite_true, absent, List.length_nil, Nat.add_zero, decide_true]
  · apply List.all_eq_true.mpr
    intro value member
    have different := fresh value member
    have rejected : sameActivityOccurrence value record = false := by simp [sameActivityOccurrence, different]
    simp only [occursOnce, insertActivityOccurrence_eq_canonicalInsertBy, length_filter_canonicalInsertBy,
      rejected, Bool.false_eq_true, ite_false, Nat.zero_add]
    exact List.all_eq_true.mp unique value member

private theorem entry_storage (entry : ParallelScopeEntry) (before after : RuntimeState)
    (parent : ScopeOccurrenceId) (entered : enterParallelScope? entry before parent = some after)
    (storage : committedStateCollectionAdmitted before = true) : committedStateCollectionAdmitted after = true := by
  obtain ⟨ordered, keys⟩ := (storage_iff before).mp storage
  have scopeUnique : (before.scopeOccurrences.map (·.id)).Nodup := by
    simp only [uniqueCollectionKeys, Bool.and_eq_true, decide_eq_true_eq] at keys
    exact keys.1.1.1.1.1.1.1.1.2
  have finalScopes := enterParallelScope_preserves_scope_uniqueness entered scopeUnique
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  rename_i permitted
  have activityFresh : ∀ record ∈ before.activityOccurrences, record.activityElementId ≠ entry.elementId := by
    intro record member same
    have present : (before.activityOccurrences.any (fun record => record.activityElementId == entry.elementId)) = true :=
      List.any_eq_true.mpr ⟨record, member, by simp [same]⟩
    simp [present] at permitted
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    exact token_storage before _ storage (orderedBy_addToken _ _ _
      (orderedBy_removeToken _ _ _ (canonicalCollectionOrder_tokens before ordered)))
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
      cases Option.some.inj entered
      have consumedStorage := token_storage before (removeToken before.tokens entry.input parent) storage
        (orderedBy_removeToken before.tokens entry.input parent (canonicalCollectionOrder_tokens before ordered))
      have initialScopeKeys : (before.scopeActivations.map (·.scopeId)).Nodup := by
        simp only [uniqueCollectionKeys, Bool.and_eq_true, decide_eq_true_eq] at keys
        exact keys.1.1.1.1.1.1.1.1.1.1.1.2
      obtain ⟨issuedOrder, scopeKeys, activityCounterFrame, humanFrame, messageFrame, timerFrame,
        effectFrame, callFrame, raceFrame, humanWaitFrame, messageWaitFrame, timerWaitFrame,
        effectWaitFrame, dataFrame, selectionFrame, eventFrame, sequentialFrame, parallelFrame⟩ :=
        issuance_storage_fields entry parent _ _ _ issued _ generated ((storage_iff _).mp consumedStorage).1 initialScopeKeys
      obtain ⟨_, activityFrame, _, callsFrame⟩ := issueParallelBodies_structural_fields generated
      have oldActivityOrder : orderedBy activityOccurrenceBefore issued.activityOccurrences = true := by
        simp only [canonicalCollectionOrder, Bool.and_eq_true] at issuedOrder
        exact issuedOrder.1.1.1.1.1.1.2
      let record : ActivityOccurrence :=
        { processInstanceId := parent.processInstanceId, activityElementId := entry.elementId,
          activation := activityActivationCount before ⟨entry.elementId.value⟩ + 1, owner := parent,
          body := .parallelChildScopes first rest, attachedHandlers := [] }
      have activityOrder := orderedBy_canonicalInsertBy activityOccurrenceBefore
        (fun left right => scopeOwnerBefore_asymm
          ⟨left.processInstanceId, ⟨left.activityElementId.value⟩, left.activation⟩
          ⟨right.processInstanceId, ⟨right.activityElementId.value⟩, right.activation⟩) record _ oldActivityOrder
      simp only [uniqueCollectionKeys, Bool.and_eq_true, decide_eq_true_eq, and_assoc] at keys
      obtain ⟨activityKeys, humanKeys, messageKeys, timerKeys, effectKeys, _, callKeys,
        raceKeys, _, waits, dataKeys, selections, races, calls, activities, sequential, parallel⟩ := keys
      have counterOrder : orderedBy activationBefore issued.activityActivations = true := by
        simp only [canonicalCollectionOrder, Bool.and_eq_true] at issuedOrder
        exact issuedOrder.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.2
      have activityCounter := task_counter_storage issued.activityActivations ⟨entry.elementId.value⟩
        (activityActivationCount before ⟨entry.elementId.value⟩ + 1) counterOrder
        (by rw [activityCounterFrame]; exact activityKeys)
      have insertedKeys := fresh_activity_keys record
        issued.activityOccurrences (by simpa only [activityFrame] using activityFresh)
        (by simpa only [activityFrame, activityIdentitiesUnique] using activities)
      apply (storage_iff _).mpr
      constructor
      · simp only [canonicalCollectionOrder, Bool.and_eq_true] at issuedOrder ⊢
        simp_all only [insertActivityOccurrence_eq_canonicalInsertBy, record, and_true]
      · simp_all only [uniqueCollectionKeys, waitIdentitiesUnique, activityIdentitiesUnique,
          Bool.and_eq_true, decide_eq_true_eq, record, and_true]

private theorem root_completion_storage (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (before after : RuntimeState)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId) (instanceId : SemanticId)
    (completed : completeSelectedScope? program before scope output = some after)
    (finished : after.control = .completed instanceId)
    (storage : committedStateCollectionAdmitted before = true) : committedStateCollectionAdmitted after = true := by
  obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis analyzed scope
  simp only [completeSelectedScope?, unmonitored, Bool.false_eq_true, ↓reduceIte,
    completeBoundedScope_eq_completeScope_of_unbounded program before scope output unbounded] at completed
  unfold completeScopeState? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  unfold completeQuiescentScope? at completed
  repeat' split at completed
  all_goals first
    | contradiction
    | (simp at completed; done)
    | (cases Option.some.inj completed
       have parts := (storage_iff before).mp storage
       simp_all [storage_iff, canonicalCollectionOrder, uniqueCollectionKeys,
         waitIdentitiesUnique, activityIdentitiesUnique, orderedBy])

private theorem human_disposal_storage (before : RuntimeState) (wait : UserTaskWait) (variables : ScopedVariables)
    (activities : variables.activities = before.variables.activities)
    (storage : committedStateCollectionAdmitted before = true) :
    committedStateCollectionAdmitted { before with
      waits := before.waits.erase wait, variables := variables,
      tokens := addToken before.tokens wait.output wait.owner } = true := by
  obtain ⟨ordered, keys⟩ := (storage_iff before).mp storage
  have stageOrder := canonicalCollectionOrder_of_removal before
    { before with waits := before.waits.erase wait, variables }
    (List.Sublist.refl _) List.erase_sublist (List.Sublist.refl _) (List.Sublist.refl _)
    (List.Sublist.refl _) (activities ▸ List.Sublist.refl _) (List.Sublist.refl _) (List.Sublist.refl _)
    (List.Sublist.refl _) (List.Sublist.refl _) (List.Sublist.refl _) (List.Sublist.refl _)
    (List.Sublist.refl _) rfl rfl rfl rfl rfl rfl rfl rfl ordered
  have waits : before.waits.all (occursOnce userTaskWaitKeyMatches before.waits) = true := by
    simp only [uniqueCollectionKeys, waitIdentitiesUnique, Bool.and_eq_true] at keys
    exact keys.1.1.1.1.1.1.1.2.1.1.1
  have retained := all_occursOnce_erase userTaskWaitKeyMatches (fun _ => by simp [userTaskWaitKeyMatches]) wait before.waits waits
  have stageKeys : uniqueCollectionKeys { before with waits := before.waits.erase wait, variables } = true := by
    simp only [uniqueCollectionKeys, waitIdentitiesUnique, activityIdentitiesUnique, Bool.and_eq_true, activities] at keys ⊢
    simp_all only [and_true]
  exact token_storage { before with waits := before.waits.erase wait, variables }
    (addToken before.tokens wait.output wait.owner) ((storage_iff _).mpr ⟨stageOrder, stageKeys⟩)
    (orderedBy_addToken _ _ _ (canonicalCollectionOrder_tokens before ordered))

private theorem effect_disposal_storage (before : RuntimeState) (wait : EffectWait) (variables : ScopedVariables)
    (activities : variables.activities.Sublist before.variables.activities)
    (storage : committedStateCollectionAdmitted before = true) :
    committedStateCollectionAdmitted { before with
      effectWaits := before.effectWaits.erase wait, variables := variables,
      tokens := addToken before.tokens wait.output wait.owner } = true := by
  obtain ⟨ordered, keys⟩ := (storage_iff before).mp storage
  have stageOrder := canonicalCollectionOrder_of_removal before
    { before with effectWaits := before.effectWaits.erase wait, variables }
    (List.Sublist.refl _) (List.Sublist.refl _) (List.Sublist.refl _) (List.Sublist.refl _)
    List.erase_sublist activities (List.Sublist.refl _) (List.Sublist.refl _) (List.Sublist.refl _)
    (List.Sublist.refl _) (List.Sublist.refl _) (List.Sublist.refl _) (List.Sublist.refl _)
    rfl rfl rfl rfl rfl rfl rfl rfl ordered
  have waits : before.effectWaits.all (occursOnce effectWaitKeyMatches before.effectWaits) = true := by
    simp only [uniqueCollectionKeys, waitIdentitiesUnique, Bool.and_eq_true] at keys
    exact keys.1.1.1.1.1.1.1.2.2
  have data : (before.variables.activities.map (·.owner)).Nodup := by
    simp only [uniqueCollectionKeys, Bool.and_eq_true, decide_eq_true_eq] at keys
    exact keys.1.1.1.1.1.1.2
  have retained := all_occursOnce_erase effectWaitKeyMatches (fun _ => by simp [effectWaitKeyMatches]) wait before.effectWaits waits
  have retainedData := (activities.map ActivityVariableScope.owner).nodup data
  have stageKeys : uniqueCollectionKeys { before with effectWaits := before.effectWaits.erase wait, variables } = true := by
    simp only [uniqueCollectionKeys, waitIdentitiesUnique, activityIdentitiesUnique, Bool.and_eq_true, decide_eq_true_eq] at keys ⊢
    simp_all only [and_true]
  exact token_storage { before with effectWaits := before.effectWaits.erase wait, variables }
    (addToken before.tokens wait.output wait.owner) ((storage_iff _).mpr ⟨stageOrder, stageKeys⟩)
    (orderedBy_addToken _ _ _ (canonicalCollectionOrder_tokens before ordered))

private theorem human_completion_storage (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after)
    (storage : committedStateCollectionAdmitted before = true) : committedStateCollectionAdmitted after = true := by
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact human_disposal_storage before _ variables (writeParallelScopeValues_preserves_activities written) storage
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact human_disposal_storage before _ _ rfl storage

private theorem effect_completion_storage (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeEffect? program before id (.success values) = some after)
    (storage : committedStateCollectionAdmitted before = true) : committedStateCollectionAdmitted after = true := by
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selected
  split at completed
  · unfold completeParallelScopeEffect? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    apply effect_disposal_storage before _ _ _ storage
    change (variables.activities.filter fun scope => !activityScopeMatches id scope).Sublist before.variables.activities
    rw [writeParallelScopeValues_preserves_activities written]
    exact List.filter_sublist
    case h_2 =>
      rename_i result impossible
      exact False.elim (impossible values rfl)
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeSerialActivityScope? at written
    split at written <;> try contradiction
    obtain ⟨bindings, _, written⟩ := Option.bind_eq_some_iff.mp written
    cases Option.some.inj written
    cases Option.some.inj completed
    exact effect_disposal_storage before _ _ List.filter_sublist storage

private theorem start_storage (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (instanceId : SemanticId)
    (values : List VariableBinding) (state : RuntimeState)
    (started : runningProgramStartState? program instanceId values = some state) :
    committedStateCollectionAdmitted state = true := by
  have declarations := (analyzeProgram_incidence_admission program analysis analyzed).2.1
  unfold runningProgramStartState? at started
  obtain ⟨root, _, started⟩ := Option.bind_eq_some_iff.mp started
  simp only [declarations, pure, Option.some.injEq] at started
  cases started
  simp [storage_iff, canonicalCollectionOrder, uniqueCollectionKeys, waitIdentitiesUnique,
    activityIdentitiesUnique, runningStartState, initialState, emptyScopedVariables,
    orderedBy, parallelMultiInstanceControllersOrdered]

private theorem ingress_storage (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (selected : programSelected program = true)
    (before : RuntimeState) (boundary : ParallelScopeCommandBoundaryReachable program before)
    (stimulus : Stimulus) (storage : committedStateCollectionAdmitted before = true)
    (committed : (admitStimulus program before stimulus).outcome = .committed) :
    committedStateCollectionAdmitted (admitStimulus program before stimulus).state = true := by
  rcases parallelScope_committed_ingress_kind program selected before stimulus committed with
    ⟨commandId, processId, instanceId, values, rfl, _⟩ | completion
  · exact start_storage program analysis analyzed instanceId values _
      (boundary.committed_start_from_initial program analysis analyzed selected before commandId processId instanceId values committed).2.1
  · apply admitStimulus_wait_preserves program before stimulus selected completion
      (fun state => committedStateCollectionAdmitted state = true) storage
    · intro id values after completed
      exact human_completion_storage program before after id values completed storage
    · intro id values after completed
      exact effect_completion_storage program before after id values completed storage

private theorem singleton_storage (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (before after : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (candidate : InternalOperationOccurrence) (storage : committedStateCollectionAdmitted before = true)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    committedStateCollectionAdmitted after = true := by
  obtain ⟨_, operation, _, resolved, _, classified⟩ :=
    parallelScope_singleton_execution_cases program analysis analyzed profile before after candidate applied
  have reservation := reachable_singleton_reservation_valid program analysis analyzed profile before after reachable
    candidate applied (reachable.reservation_valid program analysis analyzed before)
  cases classified with
  | body kind =>
    rcases applyInternalOperationOccurrence_body_effect program before after candidate operation resolved kind applied with
      ⟨patch, _, _, rfl⟩ | ⟨patch, increment, _, rfl⟩
    · exact arm_storage before patch storage reservation
    · exact token_storage { before with endOccurrences := before.endOccurrences + increment } _ storage
        (patch.preserves_order _ (canonicalCollectionOrder_tokens _ ((storage_iff _).mp storage).1))
  | initiation id origin output rootFound initiated =>
    simp only [initiateState?, rootFound, bind, Option.bind_some] at initiated
    split at initiated <;> try contradiction
    cases Option.some.inj initiated
    exact token_storage { before with initiationPending := false } _ storage
      (orderedBy_addToken _ _ _ (canonicalCollectionOrder_tokens _ ((storage_iff _).mp storage).1))
  | entry _ entered => exact entry_storage analysis.entry before after candidate.owner entered storage
  | retirement _ completed => exact retirement_storage analysis.entry before after candidate.owner completed storage
  | rootCompletion scope output instanceId _ completed finished =>
    exact root_completion_storage program analysis analyzed before after scope output instanceId completed finished storage

private theorem batch_storage (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (before after : RuntimeState)
    (reachable : ParallelScopeInternalPrefixReachable program before) (batch : InternalOccurrenceBatch)
    (successors : List RuntimeState) (storage : committedStateCollectionAdmitted before = true)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors)
    (endpoint : successors.getLast? = some after) : committedStateCollectionAdmitted after = true := by
  obtain ⟨_, absent, _⟩ := reachable.start_certificate program analysis analyzed before
  have wellFormed := (analyzeProgram_incidence_admission program analysis analyzed).1
  have transported := applyInternalOccurrenceBatch_patch_induction program before batch successors
    (fun state => committedStateCollectionAdmitted state = true ∧
      occurrenceReservationStateValid state = true ∧ state.compensationHandlerEffectWaits = [])
    ⟨storage, reachable.reservation_valid program analysis analyzed before, absent⟩ (by
      intro state after patch _ actual prior
      have reservation := reserved_patch_step_reservation_valid program state after patch wellFormed actual prior.2.1 prior.2.2
      refine ⟨?_, reservation, ?_⟩
      · rw [actual.1] at reservation ⊢
        cases patch with
        | arm arm => exact arm_storage state arm prior.1 reservation
        | token token =>
          exact token_storage state _ prior.1
            (token.tokens.preserves_order _ (canonicalCollectionOrder_tokens _ ((storage_iff _).mp prior.1).1))
      · rw [actual.1, reserved_patch_compensation_waits]; exact prior.2.2) applied
  exact (transported after (List.mem_of_getLast? endpoint)).1

private theorem selected_profile (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) : programSelected program = true := by
  cases selected : programSelected program with
  | false => simp [analyzeProgram, selected] at analyzed
  | true => rfl

private theorem initial_storage : committedStateCollectionAdmitted initialState = true := rfl

/-- Every actual PMIS internal prefix preserves ordered, unique committed collections. -/
theorem ParallelScopeInternalPrefixReachable.collection_storage (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (state : RuntimeState)
    (reachable : ParallelScopeInternalPrefixReachable program state) : committedStateCollectionAdmitted state = true := by
  have selected := selected_profile program analysis analyzed
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  exact reachable.invariant_transport program profile (fun state => committedStateCollectionAdmitted state = true)
    initial_storage (ingress_storage program analysis analyzed selected)
    (singleton_storage program analysis analyzed profile) (batch_storage program analysis analyzed) state

/-- Actual command boundaries retain storage after committed execution, unchanged rejection or atomic rollback. -/
theorem ParallelScopeCommandBoundaryReachable.collection_storage (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (state : RuntimeState)
    (reachable : ParallelScopeCommandBoundaryReachable program state) : committedStateCollectionAdmitted state = true := by
  have selected := selected_profile program analysis analyzed
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  exact reachable.invariant_transport program profile (fun state => committedStateCollectionAdmitted state = true)
    initial_storage (ingress_storage program analysis analyzed selected)
    (singleton_storage program analysis analyzed profile) (batch_storage program analysis analyzed) state

end BpmnSemantics.SemanticProcess
