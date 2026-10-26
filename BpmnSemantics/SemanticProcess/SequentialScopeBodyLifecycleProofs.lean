module

import BpmnSemantics.SemanticProcess.InternalScopeCreationPositionValidity
import BpmnSemantics.SemanticProcess.InternalRegionalCompletionPositionValidity
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import BpmnSemantics.SemanticProcess.RuntimePositionValidityLaws
import BpmnSemantics.SemanticProcess.ScopeInsertionValidity
import BpmnSemantics.SemanticProcess.ScopeStorageOrder
import BpmnSemantics.SemanticProcess.SequentialScopeRuntimeLaws
import BpmnSemantics.SemanticProcess.TokenOrder
import BpmnSemantics.SemanticProcess.TokenStorage
public import BpmnSemantics.SemanticProcess.Incident
public import BpmnSemantics.SemanticProcess.RuntimePositionValidity
public import BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
public import BpmnSemantics.SemanticProcess.RuntimeStateIdentityBound

/-! SMIS-ENTER-01 and SMIS-END-01 establish position and identity for successful individual body creation and retirement below aggregate validity and history transport. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- SMIS-ENTER-01 uses fresh child insertion, then binds its entry token; it is not an ordinary enterScope preparation. -/
theorem sequentialScope_issue_preserves_position (program : Program) (hosting : SemanticId)
    (entry : SequentialScopeEntry) (parent : ScopeOccurrenceId) (definition : DefinitionScope)
    (before after : RuntimeState) (child : ScopeOccurrenceId)
    (position : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (named : parent.processInstanceId.value ≠ "")
    (live : exactLiveOccurrence before parent = true)
    (lookup : uniqueDefinitionScope? program entry.childScopeId = some definition)
    (staticParent : definition.parentScopeId = some parent.definitionScopeId)
    (declared : ∃ place, program.controlPlaces.filter (fun candidate =>
      decide (candidate.id = entry.childEntry)) = [place])
    (owned : program.controlPlaceScopes.filter (fun binding =>
      decide (binding.controlPlaceId = entry.childEntry)) =
        [{ controlPlaceId := entry.childEntry, scopeId := entry.childScopeId }])
    (issued : issueSequentialScope? entry before parent = some (after, child)) :
    runtimePositionValid program hosting after = true := by
  unfold issueSequentialScope? at issued
  simp only [running] at issued
  split at issued <;> try contradiction
  rename_i vacant
  simp only [Option.some.injEq, Prod.mk.injEq] at issued
  rcases issued with ⟨rfl, rfl⟩
  let created : RuntimeScopeOccurrence :=
    ⟨⟨parent.processInstanceId, entry.childScopeId,
      scopeActivationCount before entry.childScopeId + 1⟩, some parent⟩
  let inserted : RuntimeState := { before with
    scopeOccurrences := insertScopeOccurrence created before.scopeOccurrences,
    scopeActivations := setScopeActivationCount before.scopeActivations entry.childScopeId created.id.activation }
  have fresh : ∀ occurrence ∈ before.scopeOccurrences, occurrence.id ≠ created.id := by
    intro occurrence member same
    apply vacant
    exact List.any_eq_true.mpr ⟨occurrence, member, by
      simp only [same, created, beq_self_eq_true]⟩
  have insertedValid := runtimePositionValid_insert_child_frame program hosting hosting before inserted
    created parent definition position running rfl rfl rfl rfl fresh lookup rfl staticParent
    rfl named (Nat.zero_lt_succ _) live
  simpa only [inserted, created, running] using runtimePositionValid_addToken program hosting inserted entry.childEntry created.id
    insertedValid (exactLiveOccurrence_insertScopeOccurrence_created before created fresh) declared owned

/-- Empty and first entry retain the same scope forest and token-binding predicate used by publication. -/
theorem sequentialScope_entry_preserves_position (program : Program) (hosting : SemanticId)
    (entry : SequentialScopeEntry) (parent : ScopeOccurrenceId) (definition : DefinitionScope)
    (before : RuntimeState) (result : SequentialScopeEntryResult)
    (position : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (lookup : uniqueDefinitionScope? program entry.childScopeId = some definition)
    (staticParent : definition.parentScopeId = some parent.definitionScopeId)
    (declared : ∀ port ∈ [entry.childEntry, entry.normalOutput], ∃ place,
      program.controlPlaces.filter (fun candidate => decide (candidate.id = port)) = [place])
    (childOwned : program.controlPlaceScopes.filter (fun binding =>
      decide (binding.controlPlaceId = entry.childEntry)) =
        [{ controlPlaceId := entry.childEntry, scopeId := entry.childScopeId }])
    (outputOwned : program.controlPlaceScopes.filter (fun binding =>
      decide (binding.controlPlaceId = entry.normalOutput)) =
        [{ controlPlaceId := entry.normalOutput, scopeId := parent.definitionScopeId }])
    (entered : enterSequentialScopeResult? entry before parent = some result) :
    runtimePositionValid program hosting result.state = true := by
  unfold enterSequentialScopeResult? at entered
  split at entered <;> try contradiction
  rename_i enabled
  have enabled : sequentialScopeEntryEnabled entry before parent = true := by simpa using enabled
  have parentPresent : before.scopeOccurrences.any (fun occurrence => occurrence.id == parent) = true := by
    simp only [sequentialScopeEntryEnabled, Bool.and_eq_true] at enabled
    exact enabled.1.2
  obtain ⟨occurrence, member, same⟩ := List.any_eq_true.mp parentPresent
  have same : occurrence.id = parent := by simpa using same
  have facts := (position_iff program hosting hosting before running).mp position
  obtain ⟨live, _, _, named, _⟩ := facts.2.2.2.2.2.2.1 occurrence member
  rw [same] at live named
  obtain ⟨items, _, entered⟩ := Option.bind_eq_some_iff.mp entered
  cases items with
  | nil =>
      cases Option.some.inj entered
      have removed := runtimePositionValid_tokens_sublist_frame program hosting before
        { before with tokens := removeToken before.tokens entry.input parent }
        position rfl rfl rfl (removeToken_sublist _ _ _)
      exact runtimePositionValid_addToken program hosting _ entry.normalOutput parent removed live
        (declared _ (by simp)) outputOwned
  | cons item rest =>
      obtain ⟨⟨issued, child⟩, issuance, entered⟩ := Option.bind_eq_some_iff.mp entered
      obtain ⟨variables, _, entered⟩ := Option.bind_eq_some_iff.mp entered
      cases Option.some.inj entered
      have issuedValid := sequentialScope_issue_preserves_position program hosting entry parent definition
        before issued child position running named live lookup staticParent
        (declared _ (by simp)) childOwned issuance
      exact runtimePositionValid_tokens_sublist_frame program hosting issued _ issuedValid
        rfl rfl rfl (removeToken_sublist _ _ _)

/-- SMIS-END-01 removes the exact quiescent child before either issuing its replacement or releasing its parent. -/
theorem sequentialScope_completion_preserves_position (program : Program) (hosting : SemanticId)
    (entry : SequentialScopeEntry) (before : RuntimeState) (binding : SequentialScopeBinding)
    (result : SequentialScopeCompletionResult)
    (position : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting)
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (declared : ∀ port ∈ [entry.childEntry, entry.normalOutput], ∃ place,
      program.controlPlaces.filter (fun candidate => decide (candidate.id = port)) = [place])
    (childOwned : program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = entry.childEntry)) =
        [{ controlPlaceId := entry.childEntry, scopeId := entry.childScopeId }])
    (outputOwned : program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = entry.normalOutput)) =
        [{ controlPlaceId := entry.normalOutput, scopeId := binding.activity.owner.definitionScopeId }])
    (completed : completeSequentialScopeResult? entry before = some result) :
    runtimePositionValid program hosting result.state = true := by
  have body := sequentialScope_binding_body_data entry before binding bound
  have parent := (sequentialScope_bound_controller_progress entry before binding bound).2.2
  have facts := (position_iff program hosting hosting before running).mp position
  obtain ⟨bodyLive, definition, lookup, named, _, parentBinding⟩ :=
    facts.2.2.2.2.2.2.1 binding.body body.2.2.1
  rw [parent] at parentBinding
  cases static : definition.parentScopeId with
  | none => simp only [static] at parentBinding
  | some parentScope =>
    simp only [static] at parentBinding
    have staticParent : definition.parentScopeId = some binding.activity.owner.definitionScopeId := by
      rw [static, parentBinding.2.1]
    have parentNamed : binding.activity.owner.processInstanceId.value ≠ "" := by
      rw [parentBinding.1]
      exact named
    have childLookup : uniqueDefinitionScope? program entry.childScopeId = some definition := by
      simpa only [body.2.2.2] using lookup
    unfold completeSequentialScopeResult? at completed
    simp only [bound, bind, Option.bind_some] at completed
    split at completed <;> try contradiction
    rename_i allowed
    have quiet : scopeQuiescent before binding.body.id = true := by
      simp only [Bool.or_eq_true, not_or, Bool.not_eq_true', Bool.not_eq_false] at allowed
      exact allowed.1
    obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    have exactBody : before.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id = binding.body.id)) = [binding.body] := by
      obtain ⟨only, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true bodyLive)
      have member : binding.body ∈ before.scopeOccurrences.filter (fun occurrence =>
          decide (occurrence.id = binding.body.id)) := List.mem_filter.mpr ⟨body.2.2.1, by simp⟩
      rw [census] at member
      simpa only [List.mem_singleton.mp member] using census
    have removal : before.scopeOccurrences.filter (fun occurrence => decide (occurrence ≠ binding.body)) =
        before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id ≠ binding.body.id)) := by
      apply List.filter_congr
      intro occurrence member
      have same : occurrence.id = binding.body.id ↔ occurrence = binding.body := by
        constructor
        · intro idEq
          have selected : occurrence ∈ before.scopeOccurrences.filter (fun candidate =>
              decide (candidate.id = binding.body.id)) := List.mem_filter.mpr ⟨member, by simp [idEq]⟩
          simpa only [exactBody, List.mem_singleton] using selected
        · intro equal; rw [equal]
      simp only [ne_eq, same]
    let retired := { before with
      variables := variables,
      scopeOccurrences := before.scopeOccurrences.filter (fun occurrence => decide (occurrence ≠ binding.body)) }
    have retiredPosition : runtimePositionValid program hosting retired = true := by
      have removed := quiescent_child_removal_preserves_position program before hosting hosting
        position running binding.body body.2.2.1 (by simp [parent]) quiet
      exact runtimePositionValid_tokens_sublist_frame program hosting _ retired removed rfl removal rfl
        (List.Sublist.refl _)
    have parentDifferent : binding.activity.owner ≠ binding.body.id := by
      intro same
      exact quiescent_scope_has_no_child before binding.body.id quiet binding.body body.2.2.1
        (by simpa only [same] using parent)
    have parentLive : exactLiveOccurrence retired binding.activity.owner = true := by
      have census : retired.scopeOccurrences.filter (fun occurrence =>
          decide (occurrence.id = binding.activity.owner)) =
          before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = binding.activity.owner)) := by
        change (before.scopeOccurrences.filter _).filter _ = _
        rw [removal, List.filter_filter]
        apply List.filter_congr
        intro occurrence _
        by_cases same : occurrence.id = binding.activity.owner <;> simp [same, parentDifferent]
      simpa only [exactLiveOccurrence, census] using parentBinding.2.2
    split at completed
    · cases Option.some.inj completed
      have added := runtimePositionValid_addToken program hosting retired entry.normalOutput
        binding.activity.owner retiredPosition parentLive (declared _ (by simp)) outputOwned
      exact runtimePositionValid_tokens_sublist_frame program hosting _ _ added
        rfl rfl rfl (List.Sublist.refl _)
    · split at completed <;> try contradiction
      split at completed <;> try contradiction
      obtain ⟨item, _, completed⟩ := Option.bind_eq_some_iff.mp completed
      obtain ⟨⟨issued, nextChild⟩, issuance, completed⟩ := Option.bind_eq_some_iff.mp completed
      obtain ⟨locals, _, completed⟩ := Option.bind_eq_some_iff.mp completed
      cases Option.some.inj completed
      have issuedPosition := sequentialScope_issue_preserves_position program hosting entry binding.activity.owner
        definition retired issued nextChild retiredPosition running parentNamed parentLive childLookup staticParent
        (declared _ (by simp)) childOwned issuance
      exact runtimePositionValid_tokens_sublist_frame program hosting issued _ issuedPosition
        rfl rfl rfl (List.Sublist.refl _)

/-- Entry raises the outer Activity counter and preserves the other implemented identity bounds. -/
theorem sequentialScope_entry_preserves_identity_bound (entry : SequentialScopeEntry)
    (before : RuntimeState) (parent : ScopeOccurrenceId) (result : SequentialScopeEntryResult)
    (bounded : runtimeStateIdentityBound before = true)
    (entered : enterSequentialScopeResult? entry before parent = some result) :
    runtimeStateIdentityBound result.state = true := by
  unfold enterSequentialScopeResult? at entered
  split at entered <;> try contradiction
  obtain ⟨items, _, entered⟩ := Option.bind_eq_some_iff.mp entered
  cases items with
  | nil => cases Option.some.inj entered; exact bounded
  | cons item rest =>
      obtain ⟨⟨issued, child⟩, issuance, entered⟩ := Option.bind_eq_some_iff.mp entered
      obtain ⟨variables, _, entered⟩ := Option.bind_eq_some_iff.mp entered
      cases Option.some.inj entered
      unfold issueSequentialScope? at issuance
      cases running : before.control <;> simp only [running] at issuance <;> try contradiction
      split at issuance <;> try contradiction
      simp only [Option.some.injEq, Prod.mk.injEq] at issuance
      rcases issuance with ⟨rfl, rfl⟩
      simp only [SequentialScopeEntryResult.state, runtimeStateIdentityBound, Bool.and_eq_true] at bounded ⊢
      refine ⟨⟨bounded.1.1, bounded.1.2⟩, ?_⟩
      rw [all_insertActivityOccurrence]
      simp only [Bool.and_eq_true]
      let counterState := { before with activations := before.activityActivations }
      have updated := activationCount_setActivationCount_self counterState
        ⟨entry.elementId.value⟩ (activityActivationCount before ⟨entry.elementId.value⟩ + 1)
      constructor
      · exact decide_eq_true (Nat.le_of_eq updated.symm)
      · apply List.all_eq_true.mpr
        intro record member
        have old := of_decide_eq_true (List.all_eq_true.mp bounded.2 record member)
        apply decide_eq_true
        change record.activation ≤ taskActivationCount
          (setActivationCount before.activityActivations ⟨entry.elementId.value⟩
            (activityActivationCount before ⟨entry.elementId.value⟩ + 1)) ⟨record.activityElementId.value⟩
        by_cases same : (⟨record.activityElementId.value⟩ : TaskDefinitionId) = ⟨entry.elementId.value⟩
        · change taskActivationCount _ _ = _ at updated
          rw [same, updated]
          rw [same] at old
          omega
        · have unchanged := activationCount_setActivationCount_other counterState
            ⟨entry.elementId.value⟩ ⟨record.activityElementId.value⟩
            (activityActivationCount before ⟨entry.elementId.value⟩ + 1) same
          change taskActivationCount _ _ = _ at unchanged
          rw [unchanged]
          exact old

/-- Turnover changes the body's identity without changing the outer Activity counter; terminal retirement only removes its record. -/
theorem sequentialScope_completion_preserves_identity_bound (entry : SequentialScopeEntry)
    (before : RuntimeState) (result : SequentialScopeCompletionResult)
    (bounded : runtimeStateIdentityBound before = true)
    (completed : completeSequentialScopeResult? entry before = some result) :
    runtimeStateIdentityBound result.state = true := by
  simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounded
  unfold completeSequentialScopeResult? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  split at completed
  · cases Option.some.inj completed
    simp only [SequentialScopeCompletionResult.state, runtimeStateIdentityBound, Bool.and_eq_true]
    refine ⟨⟨bounded.1.1, bounded.1.2⟩, ?_⟩
    apply List.all_eq_true.mpr
    intro record member
    exact List.all_eq_true.mp bounded.2 record (List.mem_filter.mp member).1
  · split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨item, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨⟨issued, child⟩, issuance, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨locals, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    unfold issueSequentialScope? at issuance
    cases running : before.control <;> simp only [running] at issuance <;> try contradiction
    split at issuance <;> try contradiction
    simp only [Option.some.injEq, Prod.mk.injEq] at issuance
    rcases issuance with ⟨rfl, rfl⟩
    simp only [SequentialScopeCompletionResult.state, runtimeStateIdentityBound,
      Bool.and_eq_true, List.all_map]
    refine ⟨⟨bounded.1.1, bounded.1.2⟩, ?_⟩
    apply List.all_eq_true.mpr
    intro record member
    have previous := of_decide_eq_true (List.all_eq_true.mp bounded.2 record member)
    apply decide_eq_true
    by_cases same : record = binding.activity
    · subst record
      simpa only [Function.comp_apply, ↓reduceIte, activityActivationCount] using previous
    · simpa only [Function.comp_apply, same, ↓reduceIte, activityActivationCount] using previous

/-- SMIS-END-01 exposes one exact retirement or fresh-body update, retaining every unrelated field and population. -/
theorem sequentialScope_completion_frame (entry : SequentialScopeEntry)
    (before : RuntimeState) (binding : SequentialScopeBinding)
    (result : SequentialScopeCompletionResult)
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (completed : completeSequentialScopeResult? entry before = some result) :
    scopeQuiescent before binding.body.id = true ∧
    before.activityOccurrences.any (fun record => record.owner == binding.body.id) = false ∧
    ∃ removed, removeScopeVariables? before.variables binding.body.id = some removed ∧
      let retired := { before with
        variables := removed,
        scopeOccurrences := before.scopeOccurrences.filter (fun occurrence => decide (occurrence ≠ binding.body)) }
      (result = .terminal binding.body.id { retired with
        tokens := addToken retired.tokens entry.normalOutput binding.activity.owner,
        activityOccurrences := retired.activityOccurrences.filter (fun record => decide (record ≠ binding.activity)),
        sequentialScopeControllers := retired.sequentialScopeControllers.filter (fun controller => decide (controller ≠ binding.controller)) }) ∨
      (∃ item issued child locals,
        issueSequentialScope? entry retired binding.activity.owner = some (issued, child) ∧
        initializeScopeVariables? retired.variables child entry.bodyInputs = some locals ∧
        result = .next binding.body.id { issued with
          variables := locals,
          activityOccurrences := issued.activityOccurrences.map (fun record =>
            if record = binding.activity then { binding.activity with body := .childScope child } else record),
          sequentialScopeControllers := issued.sequentialScopeControllers.map (fun controller =>
            if controller = binding.controller then
              { binding.controller with completed := binding.controller.completed + 1, currentItem := item }
            else controller) }) := by
  simp only [completeSequentialScopeResult?, bound, bind, Option.bind_some] at completed
  split at completed <;> try contradiction
  have quiet : scopeQuiescent before binding.body.id = true ∧
      before.activityOccurrences.any (fun record => record.owner == binding.body.id) = false := by
    cases quiescent : scopeQuiescent before binding.body.id <;>
      cases owned : before.activityOccurrences.any (fun record => record.owner == binding.body.id) <;> simp_all
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨removed, removal, completed⟩ := Option.bind_eq_some_iff.mp completed
  refine ⟨quiet.1, quiet.2, removed, removal, ?_⟩
  split at completed
  · exact Or.inl (Option.some.inj completed).symm
  · split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨item, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨⟨issued, child⟩, issuance, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨locals, initialized, completed⟩ := Option.bind_eq_some_iff.mp completed
    exact Or.inr ⟨item, issued, child, locals, issuance, initialized, (Option.some.inj completed).symm⟩

/-- SMIS-DATA-01 writes preserve Effect-local snapshots; only exact Service disposal removes one. -/
theorem sequentialScope_write_activity_frame (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (values : List VariableBinding) (kind : SequentialScopeWriteKind)
    (variables : ScopedVariables)
    (written : writeSequentialScopeValues? program state owner values kind = some variables) :
    variables.activities = state.variables.activities := by
  unfold writeSequentialScopeValues? at written
  obtain ⟨binding, _, written⟩ := Option.bind_eq_some_iff.mp written
  exact writeBoundMultiInstanceScopeValues_preserves_activities written

/-- Human ingress exposes its exact selected write and disposal once for validity and credit consumers. -/
theorem sequentialScope_user_completion_data_frame (program : Program) (before after : RuntimeState)
    (taskId : UserTaskInstanceId) (values : List VariableBinding)
    (completed : completeSequentialScopeUserTask? program before taskId values = some after) :
    ∃ wait variables, sequentialScopeTaskWaits before taskId = [wait] ∧
      writeSequentialScopeValues? program before wait.owner values .userTask = some variables ∧
      after = { before with
        waits := before.waits.erase wait, variables := variables,
        tokens := addToken before.tokens wait.output wait.owner } := by
  unfold completeSequentialScopeUserTask? at completed
  generalize selected : sequentialScopeTaskWaits before taskId = waits at completed
  cases waits with
  | nil => contradiction
  | cons wait rest =>
      cases rest with
      | cons _ _ => contradiction
      | nil =>
          dsimp only at completed
          split at completed <;> try contradiction
          obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
          exact ⟨wait, variables, rfl, written, (Option.some.inj completed).symm⟩

/-- Service ingress retains the exact write before removing only the addressed Effect-local scope. -/
theorem sequentialScope_effect_completion_data_frame (program : Program) (before after : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (completed : completeSequentialScopeEffect? program before effectId result = some after) :
    ∃ wait values variables,
      before.effectWaits.filter (effectIdNamesWait effectId) = [wait] ∧
      effectId = effectWaitOccurrenceId wait ∧
      writeSequentialScopeValues? program before wait.owner values .serviceTask = some variables ∧
      after = { before with
        effectWaits := before.effectWaits.erase wait,
        variables := { variables with
          activities := variables.activities.filter (fun scope => !activityScopeMatches effectId scope) },
        tokens := addToken before.tokens wait.output wait.owner } := by
  unfold completeSequentialScopeEffect? at completed
  generalize selected : before.effectWaits.filter (effectIdNamesWait effectId) = waits at completed
  cases waits with
  | nil => contradiction
  | cons wait rest =>
      cases rest with
      | cons _ _ => contradiction
      | nil =>
          cases result <;> dsimp only at completed <;> try contradiction
          split at completed <;> try contradiction
          obtain ⟨locals, written, completed⟩ := Option.bind_eq_some_iff.mp completed
          have member : wait ∈ before.effectWaits.filter (effectIdNamesWait effectId) := by rw [selected]; simp
          have named := (List.mem_filter.mp member).2
          have identity : effectId = effectWaitOccurrenceId wait := by
            simp only [effectIdNamesWait, Bool.and_eq_true, beq_iff_eq] at named
            cases effectId with
            | mk process element activation => cases element; simp_all [effectWaitOccurrenceId]
          unfold completeSequentialScopeEffectData? at written
          split at written <;> try contradiction
          obtain ⟨projected, _, written⟩ := Option.bind_eq_some_iff.mp written
          obtain ⟨variables, writeResult, disposed⟩ := Option.bind_eq_some_iff.mp written
          cases Option.some.inj disposed
          exact ⟨wait, _, variables, rfl, identity, writeResult, (Option.some.inj completed).symm⟩

/-- SMIS-ENTER-01's issuer changes only the fresh child forest, its counter and its entry token. -/
theorem sequentialScope_issue_fields (entry : SequentialScopeEntry)
    (before after : RuntimeState) (parent child : ScopeOccurrenceId)
    (issued : issueSequentialScope? entry before parent = some (after, child)) :
    child = ⟨parent.processInstanceId, entry.childScopeId, scopeActivationCount before entry.childScopeId + 1⟩ ∧
    after = { before with
      scopeOccurrences := insertScopeOccurrence ⟨child, some parent⟩ before.scopeOccurrences,
      scopeActivations := setScopeActivationCount before.scopeActivations entry.childScopeId child.activation,
      tokens := addToken before.tokens entry.childEntry child } := by
  unfold issueSequentialScope? at issued
  cases running : before.control <;> simp only [running] at issued <;> try contradiction
  split at issued <;> try contradiction
  simp only [Option.some.injEq, Prod.mk.injEq] at issued
  rcases issued with ⟨rfl, rfl⟩
  exact ⟨rfl, rfl⟩

/-- SMIS-END-01's exact field frame separates lifecycle writes from every retained wait and counter family. -/
theorem sequentialScope_completion_state_frame (entry : SequentialScopeEntry)
    (before : RuntimeState) (binding : SequentialScopeBinding) (result : SequentialScopeCompletionResult)
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (completed : completeSequentialScopeResult? entry before = some result) :
    result.state = { before with
      scopeOccurrences := result.state.scopeOccurrences, scopeActivations := result.state.scopeActivations,
      tokens := result.state.tokens, variables := result.state.variables,
      activityOccurrences := result.state.activityOccurrences,
      sequentialScopeControllers := result.state.sequentialScopeControllers } := by
  obtain ⟨_, _, removed, _, frame⟩ := sequentialScope_completion_frame entry before binding result bound completed
  rcases frame with terminal | ⟨item, issued, child, locals, issuance, _, next⟩
  · subst result; rfl
  · have fields := (sequentialScope_issue_fields entry _ issued binding.activity.owner child issuance).2
    subst result
    rw [fields]
    rfl

/-- SMIS-END-01 retains canonical storage order through exact retirement or singleton outer-body replacement. -/
theorem sequentialScope_completion_preserves_order (entry : SequentialScopeEntry)
    (before : RuntimeState) (binding : SequentialScopeBinding) (result : SequentialScopeCompletionResult)
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (activities : before.activityOccurrences = [binding.activity])
    (canonical : canonicalCollectionOrder before = true)
    (completed : completeSequentialScopeResult? entry before = some result) :
    canonicalCollectionOrder result.state = true := by
  have order := canonical
  simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at order
  have tokenOrder : orderedBy controlTokenBefore before.tokens = true := order.1
  have scopeOrder : orderedBy scopeOccurrenceBefore before.scopeOccurrences = true := by grind
  have counterOrder : orderedBy scopeActivationBefore before.scopeActivations = true := by grind
  obtain ⟨_, _, removed, removal, frame⟩ := sequentialScope_completion_frame entry before binding result bound completed
  have dataFrame := removeScopeVariables_preserves_other_data removal
  have retiredOrder := orderedBy_scopeOccurrence_filter before.scopeOccurrences
    (fun occurrence => decide (occurrence ≠ binding.body)) scopeOrder
  rcases frame with terminal | ⟨item, issued, child, locals, issuance, initialized, next⟩
  · subst result
    have tokens := orderedBy_addToken before.tokens entry.normalOutput binding.activity.owner tokenOrder
    simp_all [SequentialScopeCompletionResult.state, canonicalCollectionOrder, orderedBy]
  · have fields := sequentialScope_issue_fields entry _ issued binding.activity.owner child issuance
    have variableFrame := initializeScopeVariables_preserves_other_data initialized
    subst result
    rw [fields.2]
    have tokens := orderedBy_addToken before.tokens entry.childEntry child tokenOrder
    have scopes := orderedBy_insertScopeOccurrence ⟨child, some binding.activity.owner⟩ _ retiredOrder
    have counters := orderedBy_setScopeActivationCount before.scopeActivations entry.childScopeId child.activation counterOrder
    simp_all [SequentialScopeCompletionResult.state, canonicalCollectionOrder, orderedBy]

/-- Exact live-owner censuses in position validity retain multiplicity in the lifecycle scope keys. -/
theorem sequentialScope_position_scope_keys (program : Program) (hosting : SemanticId) (state : RuntimeState)
    (position : runtimePositionValid program hosting state = true) (running : state.control = .running hosting) :
    (state.scopeOccurrences.map (·.id)).Nodup := by
  have facts := (position_iff program hosting hosting state running).mp position
  apply List.nodup_iff_count.mpr
  intro owner
  by_cases present : owner ∈ state.scopeOccurrences.map (·.id)
  · obtain ⟨occurrence, member, identity⟩ := List.mem_map.mp present
    have live := (facts.2.2.2.2.2.2.1 occurrence member).1
    have census := of_decide_eq_true live
    change (state.scopeOccurrences.filter (fun candidate => decide (candidate.id = occurrence.id))).length = 1 at census
    apply Nat.le_of_eq
    simpa only [← identity, List.count_eq_countP, List.countP_map,
      List.countP_eq_length_filter, List.filter_map, List.length_map,
      Function.comp_def, Bool.beq_eq_decide_eq, eq_comm] using census
  · simp [List.count_eq_zero_of_not_mem present]

/-- A retained hosting parent and direct child forest preserve Process ownership under valid runtime parent bindings. -/
theorem sequentialScope_position_hosting (program : Program) (hosting : SemanticId)
    (state : RuntimeState) (parent : ScopeOccurrenceId)
    (position : runtimePositionValid program hosting state = true) (running : state.control = .running hosting)
    (named : parent.processInstanceId = hosting)
    (forest : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id = parent ∨ occurrence.parent = some parent) :
    ∀ occurrence ∈ state.scopeOccurrences, occurrence.id.processInstanceId = hosting := by
  intro occurrence member
  rcases forest occurrence member with identity | parented
  · exact (congrArg ScopeOccurrenceId.processInstanceId identity).trans named
  · obtain ⟨_, definition, _, _, parents⟩ := runtimePositionValid_scope_parent_binding
      program hosting hosting state position running occurrence member
    rcases parents with ⟨_, unparented⟩ | ⟨actual, selected, _, process, _⟩
    · rw [parented] at unparented; contradiction
    · have same : actual = parent := Option.some.inj (selected.symm.trans parented)
      rw [same] at process
      exact process.symm.trans named

end BpmnSemantics.SemanticProcess
