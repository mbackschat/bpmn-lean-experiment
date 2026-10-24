module

public import BpmnSemantics.SemanticProcess.SequentialScopeBodyLifecycleProofs
public import BpmnSemantics.SemanticProcess.ContinuationMarkingLaws

/-! SMIS-ENTER-01 and SMIS-END-01 establish actual body birth, retirement and fresh-body conservation, including current-body population and parent credit, below certificate preservation and history transport. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- SMIS-ADMIT-01 counts each declared port separately from one actual body-entry credit; blocked Task outputs remain part of conservation, not enabledness. -/
structure SequentialScopeBodyPortAccounting (entry : ControlPlaceId) (body : ScopeOccurrenceId)
    (fired : List SemanticOperation) (state : RuntimeState) : Prop where
  balance : ∀ place,
    continuationMarking state body place +
        (fired.map (fun operation => ownedPortCount (bodyConsumedPorts operation) body body place)).sum =
      ownedPortCount [entry] body body place +
        (fired.map (fun operation => ownedPortCount (bodyProducedPorts operation) body body place)).sum

/-- Exact credit-preserving ingress changes the enabled/blocked partition without recording another internal firing. -/
theorem SequentialScopeBodyPortAccounting.exchange
    (entry : ControlPlaceId) (body : ScopeOccurrenceId) (fired : List SemanticOperation)
    (before after : RuntimeState) (accounting : SequentialScopeBodyPortAccounting entry body fired before)
    (same : ∀ place, continuationMarking after body place = continuationMarking before body place) :
    SequentialScopeBodyPortAccounting entry body fired after := by
  exact ⟨fun place => by rw [same place]; exact accounting.balance place⟩

private theorem sequentialScope_missing_owner_marking (program : Program) (hosting : SemanticId)
    (state : RuntimeState) (owner : ScopeOccurrenceId)
    (position : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting) (waits : waitOwnersLive state = true)
    (absent : exactLiveOccurrence state owner = false) :
    ∀ place, continuationMarking state owner place = 0 := by
  have different (candidate : ScopeOccurrenceId) (live : exactLiveOccurrence state candidate = true) :
      candidate ≠ owner := by intro same; subst candidate; rw [absent] at live; contradiction
  have empty {α : Type} (values : List α) (key : α → ScopeOccurrenceId) (port : α → ControlPlaceId)
      (live : ∀ value ∈ values, exactLiveOccurrence state (key value) = true) (place : ControlPlaceId) :
      (values.filter (fun value => key value == owner && port value == place)) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro value member selected
    exact different (key value) (live value member) (eq_of_beq (Bool.and_eq_true_iff.mp selected).1)
  simp only [waitOwnersLive, Bool.and_eq_true] at waits
  intro place
  rw [continuationMarking,
    empty state.tokens (·.owner) (·.placeId)
      (fun token member => runtimePositionValid_token_owner_live program hosting hosting state token position running member),
    empty state.waits (·.owner) (·.output) (List.all_eq_true.mp waits.1.1.1.1.1.1.1.1),
    empty state.effectWaits (·.owner) (·.output) (List.all_eq_true.mp waits.1.1.1.1.1.2)]
  rfl

private theorem sequentialScope_entry_credit (port : ControlPlaceId) (child : ScopeOccurrenceId)
    (before : RuntimeState) (zero : ∀ place, continuationMarking before child place = 0) :
    SequentialScopeBodyPortAccounting port child []
      { before with tokens := addToken before.tokens port child } := by
  refine ⟨fun place => ?_⟩
  have inserted := length_filter_canonicalInsertBy controlTokenBefore
    (fun token : ControlToken => token.owner == child && token.placeId == place)
    { placeId := port, owner := child } before.tokens
  have prior := zero place
  simp only [List.map_nil, List.sum_nil, Nat.add_zero, continuationMarking, addToken,
    ownedPortCount, List.filter_cons, List.filter_nil] at prior ⊢
  dsimp only at inserted ⊢
  rw [inserted]
  change (if (child == child && port == place) = true then 1 else 0) +
    (before.tokens.filter (fun token => token.owner == child && token.placeId == place)).length +
    (before.waits.filter (fun wait => wait.owner == child && wait.output == place)).length +
    (before.effectWaits.filter (fun wait => wait.owner == child && wait.output == place)).length =
    (if (child == child && port == place) = true then [port] else []).length
  split <;> simp only [List.length_cons, List.length_nil] <;> omega

/-- Actual issuance into an unoccupied definition supplies one entry credit; live-owner validity rules out residual tokens or blocked credits for the new body. -/
theorem sequentialScope_issued_body_port_accounting (program : Program) (hosting : SemanticId)
    (entry : SequentialScopeEntry) (parent child : ScopeOccurrenceId) (before after : RuntimeState)
    (position : runtimePositionValid program hosting before = true)
    (running : before.control = .running hosting) (waits : waitOwnersLive before = true)
    (issued : issueSequentialScope? entry before parent = some (after, child)) :
    SequentialScopeBodyPortAccounting entry.childEntry child [] after := by
  unfold issueSequentialScope? at issued
  simp only [running] at issued
  split at issued <;> try contradiction
  rename_i vacant
  simp only [Option.some.injEq, Prod.mk.injEq] at issued
  rcases issued with ⟨rfl, rfl⟩
  let child : ScopeOccurrenceId :=
    ⟨parent.processInstanceId, entry.childScopeId, scopeActivationCount before entry.childScopeId + 1⟩
  have vacancy : before.scopeOccurrences.any
      (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) = false := by
    simpa using vacant
  have noChild : before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = child)) = [] := by
    simp only [List.filter_eq_nil_iff, decide_eq_true_eq]
    intro occurrence member same
    have missing := List.any_eq_false.mp vacancy occurrence member
    simp [same, child] at missing
  have absent : exactLiveOccurrence before child = false := by
    simp [exactLiveOccurrence, noChild]
  have zero := sequentialScope_missing_owner_marking program hosting before child position running waits absent
  refine ⟨fun place => ?_⟩
  exact (sequentialScope_entry_credit entry.childEntry child before zero).balance place

/-- SMIS-ENTER-01's actual first entry preserves the fresh body's credit while consuming its distinct live parent's input. -/
theorem sequentialScope_first_entry_port_accounting (program : Program) (hosting : SemanticId)
    (entry : SequentialScopeEntry) (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (wellFormed : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (entered : enterSequentialScopeResult? entry before parent = some (.first parent after)) :
    ∃ child, child.definitionScopeId = entry.childScopeId ∧
      ({ id := child, parent := some parent } : RuntimeScopeOccurrence) ∈ after.scopeOccurrences ∧
      SequentialScopeBodyPortAccounting entry.childEntry child [] after := by
  have parts := wellFormed
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at parts
  have position : runtimePositionValid program hosting before = true := parts.1
  have waits : waitOwnersLive before = true := by grind
  unfold enterSequentialScopeResult? at entered
  split at entered <;> try contradiction
  rename_i enabled
  have enabled : sequentialScopeEntryEnabled entry before parent = true := by simpa using enabled
  have inputPresent : ({ placeId := entry.input, owner := parent } : ControlToken) ∈ before.tokens := by
    apply ContinuationMarkingLaws.token_present
    simp only [sequentialScopeEntryEnabled, Bool.and_eq_true] at enabled
    exact of_decide_eq_true enabled.1.1.2
  have parentPresent : before.scopeOccurrences.any (fun occurrence => occurrence.id == parent) = true := by
    simp only [sequentialScopeEntryEnabled, Bool.and_eq_true] at enabled
    exact enabled.1.2
  obtain ⟨occurrence, member, same⟩ := List.any_eq_true.mp parentPresent
  have same : occurrence.id = parent := by simpa using same
  obtain ⟨items, _, entered⟩ := Option.bind_eq_some_iff.mp entered
  cases items with
  | nil => cases Option.some.inj entered
  | cons item rest =>
      obtain ⟨⟨issued, child⟩, issuance, entered⟩ := Option.bind_eq_some_iff.mp entered
      obtain ⟨variables, _, entered⟩ := Option.bind_eq_some_iff.mp entered
      cases Option.some.inj entered
      have birth := sequentialScope_issued_body_port_accounting program hosting entry parent child
        before issued position running waits issuance
      have fresh := sequentialScope_issue_excludes_prior_definition entry before issued parent child issuance
      have different : parent ≠ child := by
        intro equality
        exact fresh.2 occurrence member (same.trans equality ▸ fresh.1)
      unfold issueSequentialScope? at issuance
      simp only [running] at issuance
      split at issuance <;> try contradiction
      simp only [Option.some.injEq, Prod.mk.injEq] at issuance
      rcases issuance with ⟨rfl, rfl⟩
      let child : ScopeOccurrenceId :=
        ⟨parent.processInstanceId, entry.childScopeId, scopeActivationCount before entry.childScopeId + 1⟩
      refine ⟨child, rfl, ?_, ?_⟩
      · simp [child, mem_insertScopeOccurrence]
      · apply SequentialScopeBodyPortAccounting.exchange entry.childEntry child [] _ _ birth
        intro place
        have present : ({ placeId := entry.input, owner := parent } : ControlToken) ∈
            addToken before.tokens entry.childEntry child :=
          (addToken_perm before.tokens entry.childEntry child).mem_iff.mpr (by simp [inputPresent])
        have removed := ContinuationMarkingLaws.remove_balance
          (addToken before.tokens entry.childEntry child) entry.input parent child place present
        rw [ownedPortCount_foreign _ parent child place different, Nat.add_zero] at removed
        change ContinuationMarkingLaws.tokenCount
            (removeToken (addToken before.tokens entry.childEntry child) entry.input parent) child place +
            (before.waits.filter (fun wait => wait.owner == child && wait.output == place)).length +
            (before.effectWaits.filter (fun wait => wait.owner == child && wait.output == place)).length =
          ContinuationMarkingLaws.tokenCount (addToken before.tokens entry.childEntry child) child place +
            (before.waits.filter (fun wait => wait.owner == child && wait.output == place)).length +
            (before.effectWaits.filter (fun wait => wait.owner == child && wait.output == place)).length
        rw [removed]

/-- SMIS-END-01's current-body census and quiescence exclude enabled and blocked credit across the repeated definition. -/
theorem sequentialScope_quiescent_definition_marking (program : Program) (hosting : SemanticId)
    (entry : SequentialScopeEntry) (before : RuntimeState) (binding : SequentialScopeBinding)
    (wellFormed : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?)
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (quiet : scopeQuiescent before binding.body.id = true) :
    ∀ owner, owner.definitionScopeId = entry.childScopeId →
      ∀ place, continuationMarking before owner place = 0 := by
  have parts := wellFormed
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at parts
  have waits : waitOwnersLive before = true := by grind
  have valid : sequentialScopeStateValid program before = true := by grind
  have census := sequentialScope_valid_body_census program entry before binding declared valid bound
  have empty {α : Type} (values : List α) (key : α → ScopeOccurrenceId) (port : α → ControlPlaceId)
      (none : values.any (fun value => key value == binding.body.id) = false) (place : ControlPlaceId) :
      values.filter (fun value => key value == binding.body.id && port value == place) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro value member selected
    have forbidden := List.any_eq_false.mp none value member
    rw [(Bool.and_eq_true_iff.mp selected).1] at forbidden
    contradiction
  have zeroCurrent : ∀ place, continuationMarking before binding.body.id place = 0 := by
    have facts := quiet
    simp only [scopeQuiescent, Bool.and_eq_true, Bool.not_eq_true', and_assoc] at facts
    intro place
    rw [continuationMarking, empty before.tokens (·.owner) (·.placeId) (by grind) place,
      empty before.waits (·.owner) (·.output) (by grind) place,
      empty before.effectWaits (·.owner) (·.output) (by grind) place]
    rfl
  intro owner owned place
  by_cases same : owner = binding.body.id
  · simpa only [same] using zeroCurrent place
  · have absent : exactLiveOccurrence before owner = false := by
      have noOwner : before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = owner)) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro occurrence member selected
        have identity : occurrence.id = owner := of_decide_eq_true selected
        have bodyMember : occurrence ∈ before.scopeOccurrences.filter
            (fun candidate => candidate.id.definitionScopeId == entry.childScopeId) :=
          List.mem_filter.mpr ⟨member, by simp [identity, owned]⟩
        rw [census] at bodyMember
        exact same (identity.symm.trans (congrArg RuntimeScopeOccurrence.id (List.mem_singleton.mp bodyMember)))
      simp [exactLiveOccurrence, noOwner]
    exact sequentialScope_missing_owner_marking program hosting before owner parts.1 running waits absent place

private theorem sequentialScope_counter_set (before : RuntimeState) (scope : DefinitionScopeId) (count : Nat) :
    scopeActivationCount { before with scopeActivations := setScopeActivationCount before.scopeActivations scope count }
      scope = count := by
  have absent : (before.scopeActivations.filter (fun row => decide (row.scopeId.value ≠ scope.value))).filter
      (fun row => decide (row.scopeId = scope)) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro row member same
    have different := of_decide_eq_true (List.mem_filter.mp member).2
    exact different (congrArg DefinitionScopeId.value (of_decide_eq_true same))
  have population := filter_canonicalInsertBy_perm scopeActivationBefore
    (fun row : ScopeActivation => decide (row.scopeId = scope)) { scopeId := scope, count }
    (before.scopeActivations.filter (fun row => decide (row.scopeId.value ≠ scope.value))) (by simp)
  rw [absent] at population
  have exactPopulation := List.perm_singleton.mp population
  simp only [scopeActivationCount, setScopeActivationCount, ← List.head?_filter, exactPopulation,
    List.head?_cons, Option.map_some, Option.getD_some]

/-- SMIS-ENTER-01 seeds reachable-history counter coverage from actual issuance, independently of the representation validator. -/
theorem sequentialScope_issued_body_counter_bound (entry : SequentialScopeEntry)
    (parent child : ScopeOccurrenceId) (before after : RuntimeState)
    (issued : issueSequentialScope? entry before parent = some (after, child)) :
    child.definitionScopeId = entry.childScopeId ∧
      child.activation = scopeActivationCount before entry.childScopeId + 1 ∧
      child.activation ≤ scopeActivationCount after entry.childScopeId := by
  unfold issueSequentialScope? at issued
  cases control : before.control <;> simp only [control] at issued <;> try contradiction
  split at issued <;> try contradiction
  simp only [Option.some.injEq, Prod.mk.injEq] at issued
  rcases issued with ⟨rfl, rfl⟩
  exact ⟨rfl, rfl, Nat.le_of_eq (sequentialScope_counter_set before entry.childScopeId _).symm⟩

/-- SMIS-ENTER-01's first body retains one outer Activity, one local frame and its issued credit; the binding is derived from preserved runtime associations. -/
theorem sequentialScope_first_entry_lifecycle (program : Program) (hosting : SemanticId)
    (entry : SequentialScopeEntry) (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (wellFormed : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (forest : before.scopeOccurrences = [⟨parent, none⟩])
    (activities : before.activityOccurrences = []) (locals : before.variables.scopes = [])
    (validAfter : sequentialScopeStateValid program after = true)
    (entered : enterSequentialScopeResult? entry before parent = some (.first parent after)) :
    ∃ binding, sequentialScopeBindingForEntry? entry after = some binding ∧
      binding.activity.owner = parent ∧ after.scopeOccurrences.Perm [⟨parent, none⟩, binding.body] ∧
      (∀ record ∈ after.activityOccurrences, record.activityElementId = entry.elementId) ∧
      after.variables.scopes = [binding.locals] ∧
      binding.body.id.activation ≤ scopeActivationCount after entry.childScopeId ∧
      SequentialScopeBodyPortAccounting entry.childEntry binding.body.id [] after := by
  have birth := sequentialScope_first_entry_port_accounting program hosting entry parent before after wellFormed running entered
  have priorValid : sequentialScopeStateValid program before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at wellFormed
    grind
  have controllers := sequentialScopeStateValid_no_activities_no_controllers program before priorValid activities
  unfold enterSequentialScopeResult? at entered
  split at entered <;> try contradiction
  obtain ⟨items, _, entered⟩ := Option.bind_eq_some_iff.mp entered
  cases items with
  | nil => cases Option.some.inj entered
  | cons item rest =>
      obtain ⟨⟨issued, child⟩, issuance, entered⟩ := Option.bind_eq_some_iff.mp entered
      obtain ⟨variables, initialized, entered⟩ := Option.bind_eq_some_iff.mp entered
      have counter := sequentialScope_issued_body_counter_bound entry parent child before issued issuance
      cases Option.some.inj entered
      unfold issueSequentialScope? at issuance
      simp only [running] at issuance
      split at issuance <;> try contradiction
      simp only [Option.some.injEq, Prod.mk.injEq] at issuance
      rcases issuance with ⟨rfl, rfl⟩
      let child : ScopeOccurrenceId := ⟨parent.processInstanceId, entry.childScopeId, scopeActivationCount before entry.childScopeId + 1⟩
      let created : RuntimeScopeOccurrence := ⟨child, some parent⟩
      let record : ActivityOccurrence :=
        { processInstanceId := parent.processInstanceId, activityElementId := entry.elementId,
          activation := activityActivationCount before ⟨entry.elementId.value⟩ + 1,
          owner := parent, body := .childScope child, attachedHandlers := [] }
      let changed : RuntimeState := { before with
        control := .running hosting, scopeOccurrences := insertScopeOccurrence created before.scopeOccurrences,
        scopeActivations := setScopeActivationCount before.scopeActivations entry.childScopeId child.activation,
        tokens := removeToken (addToken before.tokens entry.childEntry child) entry.input parent,
        variables, activityOccurrences := insertActivityOccurrence record before.activityOccurrences,
        activityActivations := setActivationCount before.activityActivations ⟨entry.elementId.value⟩ record.activation,
        sequentialScopeControllers := before.sequentialScopeControllers ++
          [{ id := sequentialScopeActivityId record, total := (item :: rest).length, completed := 0, currentItem := item }] }
      change sequentialScopeStateValid program changed = true at validAfter
      change ∃ binding, sequentialScopeBindingForEntry? entry changed = some binding ∧ _
      have controllerMember :
          ({ id := sequentialScopeActivityId record, total := (item :: rest).length,
             completed := 0, currentItem := item } : SequentialScopeController) ∈ changed.sequentialScopeControllers := by
        simp [changed, controllers]
      have controlled := List.all_eq_true.mp (Bool.and_eq_true_iff.mp validAfter).1 _ controllerMember
      simp only [entries, List.filter_cons, List.filter_nil, record, sequentialScopeActivityId,
        beq_self_eq_true, ite_true] at controlled
      cases bound : sequentialScopeBindingForEntry? entry changed with
      | none => simp [bound] at controlled
      | some binding =>
          have activity := sequentialScope_binding_activity entry changed binding bound
          have recordEq : binding.activity = record := by
            simpa [changed, activities, insertActivityOccurrence, record] using activity.1.symm
          have childEq : binding.body.id = child := by simpa [recordEq, record] using activity.2.symm
          have bodyParent := (sequentialScope_bound_controller_progress entry changed binding bound).2.2
          have bodyEq : binding.body = created := by
            cases body : binding.body
            simp_all [created, record]
          have scopePerm : changed.scopeOccurrences.Perm [⟨parent, none⟩, binding.body] := by
            have inserted := filter_canonicalInsertBy_perm scopeOccurrenceBefore (fun _ => true)
              created before.scopeOccurrences rfl
            have perm : changed.scopeOccurrences.Perm (created :: before.scopeOccurrences) := by
              have all (values : List RuntimeScopeOccurrence) : values.filter (fun _ => true) = values :=
                List.filter_eq_self.mpr (by intro _ _; rfl)
              simpa only [all, changed, insertScopeOccurrence] using inserted
            rw [forest, ← bodyEq] at perm
            exact perm.trans (List.Perm.swap _ _ [])
          have localFrame : changed.variables.scopes = [binding.locals] := by
            have selected := (sequentialScope_binding_body_data entry changed binding bound).2.1
            change selectScopeVariables? variables binding.body.id = some binding.locals at selected
            rw [childEq] at selected
            unfold initializeScopeVariables? at initialized
            split at initialized <;> try contradiction
            obtain ⟨values, _, initialized⟩ := Option.bind_eq_some_iff.mp initialized
            split at initialized <;> try contradiction
            cases Option.some.inj initialized
            simp [selectScopeVariables?, locals, canonicalInsertBy, child] at selected
            simpa [changed, locals, canonicalInsertBy, child] using congrArg (fun scope : ScopeVariableScope => [scope]) selected
          obtain ⟨issuedChild, scope, member, accounting⟩ := birth
          change SequentialScopeBodyPortAccounting entry.childEntry issuedChild [] changed at accounting
          have bodyCensus := sequentialScope_valid_body_census program entry changed binding
            (by rw [entries]; simp) validAfter bound
          have included : ({id := issuedChild, parent := some parent} : RuntimeScopeOccurrence) ∈
              changed.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) :=
            List.mem_filter.mpr ⟨member, by simp [scope]⟩
          rw [bodyCensus, List.mem_singleton] at included
          have same : issuedChild = binding.body.id := congrArg RuntimeScopeOccurrence.id included
          rw [same] at accounting
          refine ⟨binding, rfl, by simp [recordEq, record], scopePerm, ?_, localFrame, ?_, accounting⟩
          · intro candidate member
            have same : candidate = record := by simpa [changed, activities, insertActivityOccurrence] using member
            simp [same, record]
          · simpa only [childEq, child, changed, scopeActivationCount] using counter.2.2

/-- Entry consumes one parent credit; only the empty-collection branch immediately returns its continuation. -/
theorem sequentialScope_entry_parent_credit (entry : SequentialScopeEntry) (hosting : SemanticId)
    (parent : ScopeOccurrenceId) (before : RuntimeState) (result : SequentialScopeEntryResult)
    (running : before.control = .running hosting)
    (entered : enterSequentialScopeResult? entry before parent = some result) :
    ∀ place, continuationMarking result.state parent place + ownedPortCount [entry.input] parent parent place =
      continuationMarking before parent place +
        match result with
        | .empty .. => ownedPortCount [entry.normalOutput] parent parent place
        | .first .. => 0 := by
  unfold enterSequentialScopeResult? at entered
  split at entered <;> try contradiction
  rename_i enabled
  have enabled : sequentialScopeEntryEnabled entry before parent = true := by simpa using enabled
  have present : ({ placeId := entry.input, owner := parent } : ControlToken) ∈ before.tokens := by
    apply ContinuationMarkingLaws.token_present
    exact of_decide_eq_true (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp enabled).1).1).2
  obtain ⟨items, _, entered⟩ := Option.bind_eq_some_iff.mp entered
  cases items with
  | nil =>
      cases Option.some.inj entered
      intro place
      have removed := ContinuationMarkingLaws.remove_balance before.tokens entry.input parent parent place present
      have added := ContinuationMarkingLaws.add_many_count (removeToken before.tokens entry.input parent)
        [entry.normalOutput] parent parent place
      simp only [SequentialScopeEntryResult.state, continuationMarking, ContinuationMarkingLaws.tokenCount,
        addTokens, List.foldr_cons, List.foldr_nil] at removed added ⊢
      omega
  | cons item rest =>
      obtain ⟨⟨issued, child⟩, issuance, entered⟩ := Option.bind_eq_some_iff.mp entered
      obtain ⟨variables, _, entered⟩ := Option.bind_eq_some_iff.mp entered
      have fresh := sequentialScope_issue_excludes_prior_definition entry before issued parent child issuance
      have parentLive := (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp enabled).1).2
      obtain ⟨occurrence, member, matched⟩ := List.any_eq_true.mp parentLive
      have parentEq : occurrence.id = parent := by simpa using matched
      have different : child ≠ parent := by
        intro same
        exact fresh.2 occurrence member (by simpa only [parentEq, ← same] using fresh.1)
      cases Option.some.inj entered
      have removed := fun place => ContinuationMarkingLaws.remove_balance
        (addToken before.tokens entry.childEntry child) entry.input parent parent place
        ((addToken_perm before.tokens entry.childEntry child).mem_iff.mpr (by simp [present]))
      have added := fun place => ContinuationMarkingLaws.add_many_count before.tokens [entry.childEntry] child parent place
      unfold issueSequentialScope? at issuance
      simp only [running] at issuance
      split at issuance <;> try contradiction
      simp only [Option.some.injEq, Prod.mk.injEq] at issuance
      rcases issuance with ⟨rfl, rfl⟩
      intro place
      have removed := removed place
      have added := added place
      rw [ownedPortCount_foreign _ _ _ _ different] at added
      simp only [SequentialScopeEntryResult.state, continuationMarking, ContinuationMarkingLaws.tokenCount,
        addTokens, List.foldr_cons, List.foldr_nil] at removed added ⊢
      omega

/-- SMIS-END-01 retires zero old-body credit, then releases one parent credit or resets the fresh body; counter coverage is a reachable-history obligation. -/
theorem sequentialScope_completion_port_accounting (program : Program) (hosting : SemanticId)
    (entry : SequentialScopeEntry) (before : RuntimeState) (binding : SequentialScopeBinding)
    (result : SequentialScopeCompletionResult)
    (wellFormed : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?)
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (counter : binding.body.id.activation ≤ scopeActivationCount before entry.childScopeId)
    (completed : completeSequentialScopeResult? entry before = some result) :
    (∀ place, continuationMarking before binding.body.id place = 0) ∧
      match result with
      | .terminal owner after => owner = binding.body.id ∧
          (∀ queried place, continuationMarking after queried place = continuationMarking before queried place +
            ownedPortCount [entry.normalOutput] binding.activity.owner queried place) ∧
          (∀ place, continuationMarking after binding.body.id place = 0)
      | .next owner after => owner = binding.body.id ∧ ∃ child,
          child.definitionScopeId = entry.childScopeId ∧
          child.activation = scopeActivationCount before entry.childScopeId + 1 ∧
          child ≠ binding.body.id ∧
          ({ id := child, parent := some binding.activity.owner } : RuntimeScopeOccurrence) ∈ after.scopeOccurrences ∧
          SequentialScopeBodyPortAccounting entry.childEntry child [] after ∧
          child.activation ≤ scopeActivationCount after entry.childScopeId ∧
          (∀ place, continuationMarking after binding.body.id place = 0) := by
  unfold completeSequentialScopeResult? at completed
  simp only [bound, bind, Option.bind_some] at completed
  split at completed <;> try contradiction
  rename_i allowed
  have quiet : scopeQuiescent before binding.body.id = true := by
    simp only [Bool.or_eq_true, not_or, Bool.not_eq_true', Bool.not_eq_false] at allowed
    exact allowed.1
  have body := sequentialScope_binding_body_data entry before binding bound
  have zero := sequentialScope_quiescent_definition_marking program hosting entry before binding
    wellFormed running declared bound quiet
  have oldZero := zero binding.body.id body.2.2.2
  have parentDifferent : binding.activity.owner ≠ binding.body.id := by
    intro same
    have parent := (sequentialScope_bound_controller_progress entry before binding bound).2.2
    exact quiescent_scope_has_no_child before binding.body.id quiet binding.body body.2.2.1 (by rw [parent, same])
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  split at completed
  · cases Option.some.inj completed
    have delta : ∀ queried place, continuationMarking
        { before with tokens := addToken before.tokens entry.normalOutput binding.activity.owner } queried place =
        continuationMarking before queried place + ownedPortCount [entry.normalOutput] binding.activity.owner queried place := by
      intro queried place
      have added := ContinuationMarkingLaws.add_many_count before.tokens [entry.normalOutput]
        binding.activity.owner queried place
      simp only [addTokens, List.foldr_cons, List.foldr_nil, continuationMarking,
        ContinuationMarkingLaws.tokenCount] at added ⊢
      omega
    refine ⟨oldZero, rfl, delta, ?_⟩
    intro place
    change continuationMarking
      { before with tokens := addToken before.tokens entry.normalOutput binding.activity.owner }
      binding.body.id place = 0
    rw [delta, oldZero, ownedPortCount_foreign _ _ _ _ parentDifferent]
  · split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨item, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨⟨issued, child⟩, issuance, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨locals, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    have newCounter := sequentialScope_issued_body_counter_bound entry binding.activity.owner child _ issued issuance
    unfold issueSequentialScope? at issuance
    simp only [running] at issuance
    split at issuance <;> try contradiction
    simp only [Option.some.injEq, Prod.mk.injEq] at issuance
    rcases issuance with ⟨rfl, rfl⟩
    let child : ScopeOccurrenceId :=
      ⟨binding.activity.owner.processInstanceId, entry.childScopeId, scopeActivationCount before entry.childScopeId + 1⟩
    have different : child ≠ binding.body.id := by
      intro same
      have equal := congrArg ScopeOccurrenceId.activation same
      dsimp only [child] at equal
      omega
    refine ⟨oldZero, rfl, child, rfl, rfl, different, ?_, ?_, ?_, ?_⟩
    · simp [child, mem_insertScopeOccurrence, scopeActivationCount]
    · exact ⟨fun place => (sequentialScope_entry_credit entry.childEntry child before (zero child rfl)).balance place⟩
    · exact newCounter.2.2
    · intro place
      have added := ContinuationMarkingLaws.add_many_count before.tokens [entry.childEntry]
        child binding.body.id place
      rw [ownedPortCount_foreign _ _ _ _ different] at added
      simp only [addTokens, List.foldr_cons, List.foldr_nil, Nat.add_zero,
        ContinuationMarkingLaws.tokenCount] at added
      change (addToken before.tokens entry.childEntry child |>.filter
          (fun token => token.owner == binding.body.id && token.placeId == place)).length +
          (before.waits.filter (fun wait => wait.owner == binding.body.id && wait.output == place)).length +
          (before.effectWaits.filter (fun wait => wait.owner == binding.body.id && wait.output == place)).length = 0
      rw [added]
      exact oldZero place

/-- SMIS-END-01 retires the sole body's populations or replaces them together, retaining the outer Activity identity and Process data. -/
theorem sequentialScope_completion_populations (entry : SequentialScopeEntry)
    (before : RuntimeState) (binding : SequentialScopeBinding)
    (result : SequentialScopeCompletionResult)
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (forest : before.scopeOccurrences.Perm [⟨binding.activity.owner, none⟩, binding.body])
    (activities : before.activityOccurrences = [binding.activity])
    (controllers : before.sequentialScopeControllers = [binding.controller])
    (locals : before.variables.scopes = [binding.locals])
    (completed : completeSequentialScopeResult? entry before = some result) :
    result.state.variables.process = before.variables.process ∧
    result.state.variables.activities = before.variables.activities ∧
    match result with
    | .terminal owner after => owner = binding.body.id ∧
        after.scopeOccurrences = [⟨binding.activity.owner, none⟩] ∧
        after.activityOccurrences = [] ∧ after.sequentialScopeControllers = [] ∧
        after.variables.scopes = []
    | .next owner after => owner = binding.body.id ∧ ∃ child item frame,
        child.definitionScopeId = entry.childScopeId ∧
        after.scopeOccurrences.Perm [⟨binding.activity.owner, none⟩, ⟨child, some binding.activity.owner⟩] ∧
        after.activityOccurrences = [{ binding.activity with body := .childScope child }] ∧
        after.sequentialScopeControllers = [{ binding.controller with
          completed := binding.controller.completed + 1, currentItem := item }] ∧
        after.variables.scopes = [frame] ∧ frame.owner = child := by
  have bodyData := sequentialScope_binding_body_data entry before binding bound
  have parent := (sequentialScope_bound_controller_progress entry before binding bound).2.2
  have different : (⟨binding.activity.owner, none⟩ : RuntimeScopeOccurrence) ≠ binding.body := by
    intro same
    have impossible := congrArg RuntimeScopeOccurrence.parent same
    rw [parent] at impossible
    contradiction
  have remaining : before.scopeOccurrences.filter (fun occurrence => decide (occurrence ≠ binding.body)) =
      [⟨binding.activity.owner, none⟩] := by
    have filtered := forest.filter (fun occurrence => decide (occurrence ≠ binding.body))
    simpa [different] using filtered
  obtain ⟨_, _, removed, removal, frame⟩ := sequentialScope_completion_frame entry before binding result bound completed
  have removedFrame := removeScopeVariables_preserves_other_data removal
  have removedLocals : removed.scopes = [] := by
    have exactRemoval := (removeScopeVariables_success_iff.mp removal).2
    have localOwner := selectScopeVariables_exact_owner bodyData.2.1
    simp [exactRemoval, locals, localOwner]
  rcases frame with terminal | ⟨item, issued, child, variables, issuance, initialized, next⟩
  · subst result
    refine ⟨removedFrame.1, removedFrame.2.1, rfl, remaining, ?_, ?_, removedLocals⟩
    · simp [activities]
    · simp [controllers]
  · subst result
    have variableFrame := initializeScopeVariables_preserves_other_data initialized
    have freshFrame : ∃ frame, variables.scopes = [frame] ∧ frame.owner = child := by
      unfold initializeScopeVariables? at initialized
      split at initialized <;> try contradiction
      obtain ⟨values, _, initialized⟩ := Option.bind_eq_some_iff.mp initialized
      split at initialized <;> try contradiction
      cases Option.some.inj initialized
      exact ⟨{ owner := child, bindings := mergeProcessVariableBindings [] values },
        by simp [removedLocals, canonicalInsertBy], rfl⟩
    obtain ⟨rfl, rfl⟩ := sequentialScope_issue_fields entry _ issued binding.activity.owner child issuance
    obtain ⟨localFrame, localCensus, localOwner⟩ := freshFrame
    refine ⟨variableFrame.1.trans removedFrame.1, variableFrame.2.1.trans removedFrame.2.1,
      rfl, _, item, localFrame, rfl, ?_, ?_, ?_, localCensus, localOwner⟩
    · dsimp only [SequentialScopeCompletionResult.state]
      rw [remaining]
      unfold insertScopeOccurrence canonicalInsertBy
      split <;> simp [canonicalInsertBy, List.Perm.swap]
    · simp [activities]
    · simp [controllers]

/-- SMIS-IDENTITY-01's binding lookup and two-way association census identify the entire retained Activity/controller populations. -/
theorem sequentialScope_binding_populations (program : Program) (entry : SequentialScopeEntry)
    (state : RuntimeState) (binding : SequentialScopeBinding)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (valid : sequentialScopeStateValid program state = true)
    (bound : sequentialScopeBindingForEntry? entry state = some binding)
    (elements : ∀ record ∈ state.activityOccurrences, record.activityElementId = entry.elementId) :
    state.activityOccurrences = [binding.activity] ∧
      state.sequentialScopeControllers = [binding.controller] ∧ binding.activity.attachedHandlers = [] := by
  have activity := (sequentialScope_binding_activity entry state binding bound).1
  have allRecords : state.activityOccurrences.filter (fun record => record.activityElementId == entry.elementId) =
      state.activityOccurrences := List.filter_eq_self.mpr (fun record member => by simp [elements record member])
  have records := allRecords.symm.trans activity
  have lookup := bound
  unfold sequentialScopeBindingForEntry? at lookup
  cases control : state.control <;> simp only [control] at lookup <;> try contradiction
  split at lookup <;> try contradiction
  rename_i records record recordsEq
  split at lookup <;> try contradiction
  split at lookup <;> try contradiction
  split at lookup <;> try contradiction
  split at lookup <;> try contradiction
  rename_i selected current selectedEq
  obtain ⟨locals, _, lookup⟩ := Option.bind_eq_some_iff.mp lookup
  split at lookup <;> try contradiction
  simp only [Option.some.injEq] at lookup
  subst binding
  have selectedMember : current ∈ state.sequentialScopeControllers.filter
      (fun controller => decide (controller.id = sequentialScopeActivityId record)) := by rw [selectedEq]; simp
  have currentKey := of_decide_eq_true (List.mem_filter.mp selectedMember).2
  have allControllers : state.sequentialScopeControllers.filter
      (fun controller => decide (controller.id = sequentialScopeActivityId record)) = state.sequentialScopeControllers := by
    apply List.filter_eq_self.mpr
    intro controller member
    have accepted := List.all_eq_true.mp (Bool.and_eq_true_iff.mp valid).1 controller member
    by_cases named : entry.elementId.value = controller.id.activityElementId.value
    · simp [entries, named, bound] at accepted
      exact decide_eq_true (accepted.symm.trans currentKey)
    · simp [entries, named] at accepted
  refine ⟨records, allControllers.symm.trans selectedEq, ?_⟩
  apply List.isEmpty_iff.mp
  grind

/-- SMIS-END-01 replaces the body accounting by fresh empty firing history while retaining the selected outer Activity and local-frame census. -/
theorem sequentialScope_next_completion_lifecycle (program : Program) (hosting : SemanticId)
    (entry : SequentialScopeEntry) (before after : RuntimeState) (binding : SequentialScopeBinding)
    (wellFormed : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (forest : before.scopeOccurrences.Perm [⟨binding.activity.owner, none⟩, binding.body])
    (activities : before.activityOccurrences = [binding.activity])
    (controllers : before.sequentialScopeControllers = [binding.controller])
    (locals : before.variables.scopes = [binding.locals])
    (element : binding.activity.activityElementId = entry.elementId)
    (counter : binding.body.id.activation ≤ scopeActivationCount before entry.childScopeId)
    (validAfter : sequentialScopeStateValid program after = true)
    (completed : completeSequentialScopeResult? entry before = some (.next binding.body.id after)) :
    ∃ nextBinding, sequentialScopeBindingForEntry? entry after = some nextBinding ∧
      nextBinding.activity.owner = binding.activity.owner ∧
      after.scopeOccurrences.Perm [⟨binding.activity.owner, none⟩, nextBinding.body] ∧
      (∀ record ∈ after.activityOccurrences, record.activityElementId = entry.elementId) ∧
      after.variables.scopes = [nextBinding.locals] ∧
      nextBinding.body.id.activation ≤ scopeActivationCount after entry.childScopeId ∧
      SequentialScopeBodyPortAccounting entry.childEntry nextBinding.body.id [] after := by
  obtain ⟨_, _, _, child, item, localFrame, childScope, nextForest, records, controls, localScopes, localOwner⟩ :=
    sequentialScope_completion_populations entry before binding (.next binding.body.id after)
      bound forest activities controllers locals completed
  have controlled := List.all_eq_true.mp (Bool.and_eq_true_iff.mp validAfter).1
    { binding.controller with completed := binding.controller.completed + 1, currentItem := item }
    (by rw [controls]; simp)
  cases nextBound : sequentialScopeBindingForEntry? entry after with
  | none =>
      by_cases named : entry.elementId.value = binding.controller.id.activityElementId.value <;>
        simp [entries, named, nextBound] at controlled
  | some nextBinding =>
      have nextActivity := (sequentialScope_binding_activity entry after nextBinding nextBound).1
      have recordEq : nextBinding.activity = { binding.activity with body := .childScope child } := by
        simpa [records, element] using nextActivity.symm
      have childEq : nextBinding.body.id = child := by
        simpa [recordEq] using (sequentialScope_binding_activity entry after nextBinding nextBound).2.symm
      have bodyParent := (sequentialScope_bound_controller_progress entry after nextBinding nextBound).2.2
      have bodyEq : nextBinding.body = ⟨child, some binding.activity.owner⟩ := by
        cases body : nextBinding.body
        simp only [body] at childEq bodyParent
        simp only [recordEq] at bodyParent
        simp only [childEq, bodyParent]
      have frameSelected := (sequentialScope_binding_body_data entry after nextBinding nextBound).2.1
      have localsEq : nextBinding.locals = localFrame := by
        simpa [selectScopeVariables?, localScopes, childEq, localOwner] using frameSelected.symm
      obtain ⟨_, _, issuedChild, _, _, _, present, accounting, issuedCounter, _⟩ :=
        sequentialScope_completion_port_accounting program hosting entry before binding (.next binding.body.id after)
          wellFormed running (by rw [entries]; simp) bound counter completed
      have bodyCensus := sequentialScope_valid_body_census program entry after nextBinding
        (by rw [entries]; simp) validAfter nextBound
      have included : ({id := issuedChild, parent := some binding.activity.owner} : RuntimeScopeOccurrence) ∈
          after.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) := by
        apply List.mem_filter.mpr
        exact ⟨present, by grind⟩
      rw [bodyCensus, List.mem_singleton] at included
      have same : issuedChild = nextBinding.body.id := congrArg RuntimeScopeOccurrence.id included
      rw [same] at accounting issuedCounter
      refine ⟨nextBinding, rfl, by simp [recordEq], ?_, ?_, by rw [localsEq]; exact localScopes,
        issuedCounter, accounting⟩
      · simpa [bodyEq] using nextForest
      · intro record member
        have sameRecord : record = { binding.activity with body := .childScope child } := by simpa [records] using member
        simp [sameRecord, element]

/-- Turnover issues only a body-owned entry token, so a distinct parent retains exactly its previous continuation credit. -/
theorem sequentialScope_next_parent_credit (entry : SequentialScopeEntry) (before after : RuntimeState)
    (binding : SequentialScopeBinding)
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (separated : binding.activity.owner.definitionScopeId ≠ entry.childScopeId)
    (completed : completeSequentialScopeResult? entry before = some (.next binding.body.id after)) :
    ∀ place, continuationMarking after binding.activity.owner place =
      continuationMarking before binding.activity.owner place := by
  obtain ⟨_, _, removed, _, frame⟩ := sequentialScope_completion_frame entry before binding
    (.next binding.body.id after) bound completed
  rcases frame with impossible | ⟨item, issued, child, variables, issuance, _, next⟩
  · contradiction
  · obtain ⟨rfl, rfl⟩ := sequentialScope_issue_fields entry _ issued binding.activity.owner child issuance
    rw [(SequentialScopeCompletionResult.next.inj next).2]
    intro place
    have different : (⟨binding.activity.owner.processInstanceId, entry.childScopeId,
        scopeActivationCount before entry.childScopeId + 1⟩ : ScopeOccurrenceId) ≠ binding.activity.owner := by
      intro same
      exact separated (congrArg ScopeOccurrenceId.definitionScopeId same).symm
    have added := ContinuationMarkingLaws.add_many_count before.tokens [entry.childEntry]
      ⟨binding.activity.owner.processInstanceId, entry.childScopeId, scopeActivationCount before entry.childScopeId + 1⟩
      binding.activity.owner place
    rw [ownedPortCount_foreign _ _ _ _ different] at added
    simpa [continuationMarking, addTokens, ContinuationMarkingLaws.tokenCount, scopeActivationCount] using
      congrArg (fun count => count +
        (before.waits.filter (fun wait => wait.owner == binding.activity.owner && wait.output == place)).length +
        (before.effectWaits.filter (fun wait => wait.owner == binding.activity.owner && wait.output == place)).length) added


/-- The shared actual body outcome retains lifecycle identity and the Scope data frame, including Service arming. -/
theorem sequentialScope_body_fire_frame (program : Program) (operation : SemanticOperation)
    (bodyOperations : List SemanticOperation) (vertex : StructuredParallelBody.Vertex) (before after : RuntimeState)
    (parsed : SequentialScopeControl.bodyVertex? bodyOperations operation = some vertex)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (executed : fire? program operation before = some after) :
    after = { before with
      tokens := after.tokens, waits := after.waits,
      effectWaits := after.effectWaits, variables := after.variables, activations := after.activations,
      effectActivations := after.effectActivations, endOccurrences := after.endOccurrences } ∧
      after.variables.scopes = before.variables.scopes := by
  obtain ⟨owner, outcome⟩ := sequentialScope_body_fire_outcome program operation bodyOperations vertex before after parsed absent executed
  cases operation <;> simp only [SequentialScopeControl.bodyVertex?] at parsed <;> try contradiction
  all_goals dsimp only at outcome
  all_goals first | obtain ⟨_, rfl⟩ := outcome | obtain ⟨_, arguments, rfl⟩ := outcome
  all_goals exact ⟨rfl, rfl⟩

end BpmnSemantics.SemanticProcess
