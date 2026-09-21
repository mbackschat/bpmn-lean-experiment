import BpmnSemantics.SemanticProcess.InternalRegionalRootTerminationValidity
import BpmnSemantics.SemanticProcess.InternalRegionalCompletionAdmission
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime

/-! Cancellation preserves Compensation validity through the exact retained-owner census.
The selected operation must justify retention or removal; an empty result alone is not
valid for a running Program that declares an Activity-retention register. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem parentless_outside_child (state : RuntimeState)
    (unique : (state.scopeOccurrences.map (·.id)).Nodup)
    (root candidate : RuntimeScopeOccurrence) (rootMember : root ∈ state.scopeOccurrences)
    (member : candidate ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (parentless : candidate.parent = none) :
    occurrenceInSubtree state.scopeOccurrences root.id candidate.id = false := by
  apply occurrenceInSubtreeWithin_parentless
  · intro same
    have selected := occurrence_find_exact state.scopeOccurrences unique root rootMember
    rw [← same, occurrence_find_exact state.scopeOccurrences unique candidate member] at selected
    exact child ((congrArg RuntimeScopeOccurrence.parent (Option.some.inj selected)).symm.trans parentless)
  · rw [occurrenceParent_of_mem state.scopeOccurrences unique candidate member, parentless]

theorem cancelScopeSubtree_child_parentless_census (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (valid : runtimePositionValid program expected state = true) (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none) (owner : ScopeOccurrenceId) :
    ((cancelScopeSubtree state root.id disposition).scopeOccurrences.filter fun occurrence =>
      occurrence.id == owner && occurrence.parent.isNone) =
      state.scopeOccurrences.filter (fun occurrence => occurrence.id == owner && occurrence.parent.isNone) := by
  have unique := runtimePositionValid_scope_ids_nodup program expected hosting state valid running
  have calls := calledInstanceClosure_child_empty program state expected hosting valid running root rootMember child
  change (state.scopeOccurrences.filter _).filter _ = _
  rw [List.filter_filter]
  apply List.filter_congr
  intro occurrence member
  change ((occurrence.id == owner && occurrence.parent.isNone) && (match disposition with
    | .retain => decide (occurrence.id = root.id) ||
        !(occurrenceInSubtree state.scopeOccurrences root.id occurrence.id ||
          (calledInstanceClosure state root.id).contains occurrence.id.processInstanceId)
    | .remove => !(occurrenceInSubtree state.scopeOccurrences root.id occurrence.id ||
        (calledInstanceClosure state root.id).contains occurrence.id.processInstanceId))) = _
  by_cases parentless : occurrence.parent = none
  · have outside := parentless_outside_child state unique root occurrence rootMember member child parentless
    cases disposition <;> simp [calls, outside, parentless]
  · have present : occurrence.parent.isNone = false := by cases parent : occurrence.parent <;> simp_all
    simp [present]

theorem cancelScopeSubtree_child_root_definition_outside (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (definition : DefinitionScope)
    (valid : runtimePositionValid program expected state = true) (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (definitionMember : definition ∈ program.definitionScopes) (parentless : definition.parentScopeId = none)
    (owner : ScopeOccurrenceId) (ownerDefinition : owner.definitionScopeId = definition.id) :
    (occurrenceInSubtree state.scopeOccurrences root.id owner ||
      (calledInstanceClosure state root.id).contains owner.processInstanceId) = false := by
  have calls := calledInstanceClosure_child_empty program state expected hosting valid running root rootMember child
  simp only [calls, List.contains_nil, Bool.or_false]
  apply Bool.eq_false_iff.mpr
  intro reached
  obtain ⟨occurrence, member, identity⟩ := List.mem_map.mp
    (occurrenceInSubtree_live state.scopeOccurrences root.id owner (List.mem_map.mpr ⟨root, rootMember, rfl⟩) reached)
  obtain ⟨_, actual, actualMember, actualId, binding⟩ :=
    runtimePositionValid_scope_parent_binding program expected hosting state valid running occurrence member
  have admitted : programWellFormed program = true := by
    simp only [runtimePositionValid, Bool.and_eq_true] at valid
    exact valid.1.1
  have actualLookup := programWellFormed_definition_lookup_of_member program actual admitted actualMember
  have sameId : actual.id = definition.id := actualId.trans ((congrArg ScopeOccurrenceId.definitionScopeId identity).trans ownerDefinition)
  rw [sameId, programWellFormed_definition_lookup_of_member program definition admitted definitionMember] at actualLookup
  have same := Option.some.inj actualLookup
  have occurrenceParent : occurrence.parent = none := by
    rcases binding with ⟨_, parent⟩ | ⟨parent, _, staticParent, _⟩
    · exact parent
    · rw [← same, parentless] at staticParent
      contradiction
  have outside := parentless_outside_child state
    (runtimePositionValid_scope_ids_nodup program expected hosting state valid running)
    root occurrence rootMember member child occurrenceParent
  rw [identity] at outside
  simp [outside] at reached

theorem cancelScopeSubtree_compensation_retention_of_outside (program : Program)
    (state : RuntimeState) (hosting : SemanticId) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) (running : state.control = .running hosting)
    (outside : ∀ retention ∈ state.compensationActivityRetentions,
      (occurrenceInSubtree state.scopeOccurrences root retention.owner ||
        (calledInstanceClosure state root).contains retention.owner.processInstanceId) = false)
    (valid : compensationActivityRetentionStateValid program state = true) :
    compensationActivityRetentionStateValid program (cancelScopeSubtree state root disposition) = true := by
  have retained : (cancelScopeSubtree state root disposition).compensationActivityRetentions =
      state.compensationActivityRetentions := by
    apply List.filter_eq_self.mpr
    intro retention member
    simp only [outside retention member, Bool.not_false]
  have control : (cancelScopeSubtree state root disposition).control = .running hosting := running
  simp only [compensationActivityRetentionStateValid, Bool.and_eq_true] at valid ⊢
  refine ⟨valid.1, ?_⟩
  cases declaration : program.compensationActivityRetention with
  | none => simpa only [declaration, retained] using valid.2
  | some declaration =>
      simp only [declaration, running, control, retained] at valid ⊢
      cases records : state.compensationActivityRetentions with
      | nil => simp [records] at valid
      | cons retention rest =>
          cases rest with
          | cons other rest => simp [records] at valid
          | nil =>
              simp only [records] at valid ⊢
              have outsideOwner := outside retention (by simp [records])
              have census := cancelScopeSubtree_uncancelled_owner_census state root disposition
                retention.owner outsideOwner
              have predicate : (fun occurrence : RuntimeScopeOccurrence => occurrence.id == retention.owner) =
                  (fun occurrence => decide (occurrence.id = retention.owner)) := by
                funext occurrence
                by_cases same : occurrence.id = retention.owner <;> simp [same]
              have lookup : ((cancelScopeSubtree state root disposition).scopeOccurrences.filter
                  fun occurrence => occurrence.id == retention.owner) =
                  state.scopeOccurrences.filter (fun occurrence => occurrence.id == retention.owner) := by
                simpa only [predicate] using census
              have previous := valid.2
              change (_ && _ && _ && decide ((state.scopeOccurrences.filter fun occurrence =>
                occurrence.id == retention.owner) = [{ id := retention.owner, parent := none }]) &&
                _ && _ && _ && _ && _ && _) = true at previous
              change (_ && _ && _ && decide (((cancelScopeSubtree state root disposition).scopeOccurrences.filter
                fun occurrence => occurrence.id == retention.owner) =
                  [{ id := retention.owner, parent := none }]) && _ && _ && _ && _ && _ && _) = true
              rw [lookup]
              exact previous

theorem terminate_declaration_excludes_compensation_retention (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId) (scope : DefinitionScopeId)
    (member : .terminateScope id origin input scope ∈ program.operations)
    (valid : compensationActivityRetentionDeclarationValid program = true) :
    program.compensationActivityRetention = none := by
  cases declaration : program.compensationActivityRetention with
  | none => rfl
  | some declaration =>
      simp only [compensationActivityRetentionDeclarationValid, declaration, Bool.and_eq_true] at valid
      have excluded := valid.2
      simp only [Bool.not_eq_true', List.any_eq_false] at excluded
      have contradiction := excluded _ member
      contradiction

theorem compensation_execution_without_subject_sources (program : Program)
    (declaration : CompensationExecutionDeclaration)
    (declared : program.compensationExecution = some declaration)
    (retention : program.compensationActivityRetention = none)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (valid : compensationExecutionDeclarationValid program = true) :
    declaration.subjects = [] := by
  simp only [compensationExecutionDeclarationValid, declared, Bool.and_eq_true, and_assoc] at valid
  have subjects := valid.2.2.2.2.1
  cases entries : declaration.subjects with
  | nil => rfl
  | cons subject rest =>
      have fact := List.all_eq_true.mp subjects subject (by simp [entries])
      cases subject with
      | boundaryActivity element body =>
          change (_ && (match program.compensationActivityRetention with
            | none => false
            | some _ => _)) = true at fact
          simp only [retention, Bool.and_false, Bool.false_eq_true] at fact
      | eventSubProcess parent handler body =>
          change (_ && (match program.compensationEventSubProcessSnapshots,
              (_ : Option DefinitionScope) with
            | some _, some _ => _
            | _, _ => false)) = true at fact
          simp only [snapshots, Bool.and_false, Bool.false_eq_true] at fact

theorem compensation_execution_empty_without_subjects (program : Program)
    (state : RuntimeState) (declaration : CompensationExecutionDeclaration)
    (declared : program.compensationExecution = some declaration)
    (subjects : declaration.subjects = [])
    (valid : compensationExecutionStateValid program state = true) :
    state.compensationTriggers = [] ∧ state.compensationHandlerEffectWaits = [] := by
  have noDefinition (subject : CompensationSubjectOccurrence) :
      compensationSubjectDefinitionForOccurrence? program subject = none := by
    simp [compensationSubjectDefinitionForOccurrence?, declared, subjects]
  simp only [compensationExecutionStateValid, declared, Bool.and_eq_true, and_assoc] at valid
  have triggers := valid.2.2.2.2.1
  have noTriggers : state.compensationTriggers = [] := by
    cases entries : state.compensationTriggers with
    | nil => rfl
    | cons trigger rest =>
        have fact := List.all_eq_true.mp triggers trigger (by simp [entries])
        change (match program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) with
          | [.triggerCompensation _ _ _ _ _] => _
          | _ => false) = true at fact
        split at fact
        · simp only [Bool.and_eq_true, and_assoc] at fact
          obtain ⟨_, _, nonempty, _, _, _, _, _, _, _, matching, _⟩ := fact
          have present : trigger.handlers ≠ [] := by
            intro empty
            simp [empty] at nonempty
          obtain ⟨handler, member⟩ := List.exists_mem_of_ne_nil _ present
          have bound := List.all_eq_true.mp matching handler member
          change (match compensationSubjectDefinitionForOccurrence? program handler.identity.subject with
            | none => false
            | some _ => _) = true at bound
          rw [noDefinition] at bound
          contradiction
        · contradiction
  refine ⟨noTriggers, ?_⟩
  have waits := valid.2.2.2.2.2.2.2.1
  cases entries : state.compensationHandlerEffectWaits with
  | nil => rfl
  | cons wait rest =>
      have fact := List.all_eq_true.mp waits wait (by simp [entries])
      change (match state.compensationTriggers.filter (fun trigger => trigger.id == wait.triggerId) with
        | [_] => _
        | _ => false) = true at fact
      simp only [noTriggers, List.filter_nil, Bool.false_eq_true] at fact

theorem terminate_compensation_execution_empty (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId) (scope : DefinitionScopeId)
    (member : .terminateScope id origin input scope ∈ program.operations)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (retention : compensationActivityRetentionDeclarationValid program = true)
    (valid : compensationExecutionStateValid program state = true) :
    state.compensationTriggers = [] ∧ state.compensationHandlerEffectWaits = [] := by
  have absent := terminate_declaration_excludes_compensation_retention program id origin input scope member retention
  cases declared : program.compensationExecution with
  | none =>
      simp only [compensationExecutionStateValid, declared, Bool.and_eq_true, List.isEmpty_iff] at valid
      exact valid.2
  | some declaration =>
      have declarationValid : compensationExecutionDeclarationValid program = true :=
        (Bool.and_eq_true_iff.mp valid).1
      exact compensation_execution_empty_without_subjects program state declaration declared
        (compensation_execution_without_subject_sources program declaration declared absent snapshots declarationValid) valid

theorem cancelScopeSubtree_terminate_compensation_validity (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId) (scope : DefinitionScopeId)
    (running : state.control = .running hosting)
    (member : .terminateScope id origin input scope ∈ program.operations)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (retention : compensationActivityRetentionStateValid program state = true)
    (snapshotValid : compensationEventSubProcessSnapshotStateValid program state = true)
    (execution : compensationExecutionStateValid program state = true) :
    compensationActivityRetentionStateValid program (cancelScopeSubtree state root disposition) = true ∧
      compensationEventSubProcessSnapshotStateValid program (cancelScopeSubtree state root disposition) = true ∧
      compensationExecutionStateValid program (cancelScopeSubtree state root disposition) = true := by
  have retentionDeclaration : compensationActivityRetentionDeclarationValid program = true :=
    (Bool.and_eq_true_iff.mp retention).1
  have absent := terminate_declaration_excludes_compensation_retention program id origin input scope member retentionDeclaration
  obtain ⟨triggers, waits⟩ := terminate_compensation_execution_empty program state id origin input scope
    member snapshots retentionDeclaration execution
  have registers : state.compensationActivityRetentions = [] := by
    have fact := (Bool.and_eq_true_iff.mp retention).2
    simpa only [absent, List.isEmpty_iff] using fact
  have parents : state.compensationParentContextRetentions = [] := by
    have fact := (Bool.and_eq_true_iff.mp snapshotValid).2
    simpa only [snapshots, List.isEmpty_iff] using fact
  refine ⟨?_, ?_, ?_⟩
  · simpa only [compensationActivityRetentionStateValid, absent, cancelScopeSubtree, registers,
      List.filter_nil] using retention
  · simpa only [compensationEventSubProcessSnapshotStateValid, snapshots, cancelScopeSubtree, parents,
      List.filter_nil] using snapshotValid
  · exact compensationExecutionStateValid_empty program _ (Bool.and_eq_true_iff.mp execution).1
      (by simp only [cancelScopeSubtree, triggers, List.filter_nil])
      (by simp only [cancelScopeSubtree, waits, List.filter_nil])
      (Or.inr ⟨hosting, running⟩)

theorem compensation_execution_running_retained_frame (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (running : before.control = .running hosting)
    (control : after.control = before.control)
    (triggers : after.compensationTriggers = before.compensationTriggers)
    (waits : after.compensationHandlerEffectWaits = before.compensationHandlerEffectWaits)
    (roots : ∀ owner, (after.scopeOccurrences.filter fun occurrence =>
        occurrence.id == owner && occurrence.parent.isNone).length =
      (before.scopeOccurrences.filter fun occurrence =>
        occurrence.id == owner && occurrence.parent.isNone).length)
    (effects : after.effectWaits ⊆ before.effectWaits)
    (incidents : after.effectIncidents ⊆ before.effectIncidents)
    (valid : compensationExecutionStateValid program before = true) :
    compensationExecutionStateValid program after = true := by
  unfold compensationExecutionStateValid at valid ⊢
  simp only [Bool.and_eq_true] at valid ⊢
  refine ⟨valid.1, ?_⟩
  cases declared : program.compensationExecution with
  | none => simpa only [declared, triggers, waits] using valid.2
  | some declaration =>
      simp only [declared, Bool.and_eq_true, and_assoc] at valid ⊢
      obtain ⟨order, unique, owners, triggerBindings, waitOrder, waitUnique, matching, oneWait,
        collision, triggerBound, handlerBound, byteBound, lifecycle⟩ := valid.2
      refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
      · simpa only [triggers] using order
      · simpa only [triggers] using unique
      · simpa only [activeCompensationTriggerOwnersUnique, triggers] using owners
      · rw [triggers]
        apply List.all_eq_true.mpr
        intro trigger member
        have prior := List.all_eq_true.mp triggerBindings trigger member
        change (match program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) with
          | [.triggerCompensation _ _ _ _ _] => _ && _
          | _ => false) = true at prior ⊢
        split at prior
        · simp only [Bool.and_eq_true] at prior ⊢
          refine ⟨prior.1, ?_⟩
          have previous := prior.2
          change (match trigger.lifecycle with | .active => _ | .succeeded => _ | .failed => _) = true at previous ⊢
          cases status : trigger.lifecycle with
          | succeeded => simpa only [status] using previous
          | failed => simpa only [status, control] using previous
          | active =>
              simp only [status] at previous ⊢
              change (_ && decide ((after.scopeOccurrences.filter fun occurrence =>
                occurrence.id == trigger.owner && occurrence.parent.isNone).length = 1) && _ && _) = true
              rw [roots]
              simpa only [control] using previous
        · contradiction
      · simpa only [waits] using waitOrder
      · simpa only [waits] using waitUnique
      · simpa only [waits, triggers] using matching
      · simpa only [waits, triggers] using oneWait
      · rw [waits]
        apply List.all_eq_true.mpr
        intro wait member
        have previous := List.all_eq_true.mp collision wait member
        change (!(before.effectWaits.any _ || before.effectIncidents.any _) : Bool) = true at previous
        change (!(after.effectWaits.any _ || after.effectIncidents.any _) : Bool) = true
        simp only [Bool.not_eq_true', Bool.or_eq_false_iff, List.any_eq_false] at previous ⊢
        exact ⟨fun value member => previous.1 value (effects member),
          fun value member => previous.2 value (incidents member)⟩
      · simpa only [triggers] using triggerBound
      · simpa only [triggers] using handlerBound
      · simpa only [triggers, waits] using byteBound
      · change (match before.control with
          | .notStarted => _ | .running _ => _ | .completed _ | .cancelled _ => _ | .failed .. => _) = true at lifecycle
        change (match after.control with
          | .notStarted => _ | .running _ => _ | .completed _ | .cancelled _ => _ | .failed .. => _) = true
        simpa only [control, running, triggers] using lifecycle

theorem cancelScopeSubtree_child_compensation_retention (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (position : runtimePositionValid program expected state = true) (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (valid : compensationActivityRetentionStateValid program state = true) :
    compensationActivityRetentionStateValid program (cancelScopeSubtree state root.id disposition) = true := by
  apply cancelScopeSubtree_compensation_retention_of_outside program state hosting root.id disposition running ?_ valid
  intro retention member
  have fact := (Bool.and_eq_true_iff.mp valid).2
  cases declared : program.compensationActivityRetention with
  | none =>
      have empty : state.compensationActivityRetentions = [] := by
        simpa only [declared, List.isEmpty_iff] using fact
      simp [empty] at member
  | some declaration =>
      simp only [declared, running] at fact
      split at fact
      · rename_i register entries
        have same : retention = register := by simpa only [entries, List.mem_singleton] using member
        subst retention
        change (_ && _ && _ && decide ((state.scopeOccurrences.filter fun occurrence =>
          occurrence.id == register.owner) = [{ id := register.owner, parent := none }]) &&
          _ && _ && _ && _ && _ && _) = true at fact
        simp only [Bool.and_eq_true, and_assoc] at fact
        have census := of_decide_eq_true fact.2.2.2.1
        have live : ({ id := register.owner, parent := none } : RuntimeScopeOccurrence) ∈ state.scopeOccurrences := by
          have filtered : ({ id := register.owner, parent := none } : RuntimeScopeOccurrence) ∈
              state.scopeOccurrences.filter (fun occurrence => occurrence.id == register.owner) := by
            rw [census]
            simp
          exact (List.mem_filter.mp filtered).1
        have outside := parentless_outside_child state
          (runtimePositionValid_scope_ids_nodup program expected hosting state position running)
          root _ rootMember live child rfl
        simp only [outside, calledInstanceClosure_child_empty program state expected hosting position running
          root rootMember child, List.contains_nil, Bool.or_false]
      · contradiction

theorem cancelScopeSubtree_child_compensation_fields (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (position : runtimePositionValid program expected state = true) (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (valid : compensationExecutionStateValid program state = true) :
    (cancelScopeSubtree state root.id disposition).compensationTriggers = state.compensationTriggers ∧
      (cancelScopeSubtree state root.id disposition).compensationHandlerEffectWaits = state.compensationHandlerEffectWaits := by
  have outside : ∀ trigger ∈ state.compensationTriggers,
      (occurrenceInSubtree state.scopeOccurrences root.id trigger.owner ||
        (calledInstanceClosure state root.id).contains trigger.owner.processInstanceId) = false := by
    intro trigger member
    have declarationValid := (Bool.and_eq_true_iff.mp valid).1
    have fact := (Bool.and_eq_true_iff.mp valid).2
    cases declared : program.compensationExecution with
    | none =>
        simp only [declared, Bool.and_eq_true, List.isEmpty_iff] at fact
        have empty : state.compensationTriggers = [] := by
          exact fact.1
        simp [empty] at member
    | some declaration =>
        simp only [compensationExecutionDeclarationValid, declared, Bool.and_eq_true, and_assoc] at declarationValid
        have roots := of_decide_eq_true declarationValid.2.1
        have present : declaration.definitionScopeId ∈
            (program.definitionScopes.filter (·.parentScopeId.isNone)).map (·.id) := by rw [roots]; simp
        obtain ⟨definition, definitionMember, definitionId⟩ := List.mem_map.mp present
        obtain ⟨definitionMember, parentless⟩ := List.mem_filter.mp definitionMember
        simp only [Option.isNone_iff_eq_none] at parentless
        simp only [declared, Bool.and_eq_true, and_assoc] at fact
        have binding := List.all_eq_true.mp fact.2.2.2.1 trigger member
        change (match program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) with
          | [.triggerCompensation _ _ _ _ _] => _ | _ => false) = true at binding
        split at binding
        · simp only [Bool.and_eq_true, and_assoc] at binding
          have ownerId : trigger.owner.definitionScopeId = declaration.definitionScopeId := by
            simpa only [beq_iff_eq] using binding.2.2.2.2.2.1
          exact cancelScopeSubtree_child_root_definition_outside program state expected hosting root definition
            position running rootMember child definitionMember parentless trigger.owner (ownerId.trans definitionId.symm)
        · contradiction
  have triggers : (cancelScopeSubtree state root.id disposition).compensationTriggers = state.compensationTriggers := by
    apply List.filter_eq_self.mpr
    intro trigger member
    simp only [outside trigger member, Bool.not_false]
  have removed : (state.compensationTriggers.filter fun trigger =>
      occurrenceInSubtree state.scopeOccurrences root.id trigger.owner ||
        (calledInstanceClosure state root.id).contains trigger.owner.processInstanceId) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro trigger member
    simp only [outside trigger member, Bool.false_eq_true, not_false_eq_true]
  have waits : (cancelScopeSubtree state root.id disposition).compensationHandlerEffectWaits =
      state.compensationHandlerEffectWaits := by
    change state.compensationHandlerEffectWaits.filter _ = _
    simp only [removed, List.any_nil, Bool.not_false]
    exact List.filter_eq_self.mpr (by intros; rfl)
  exact ⟨triggers, waits⟩

theorem cancelScopeSubtree_child_compensation_execution (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (position : runtimePositionValid program expected state = true) (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (valid : compensationExecutionStateValid program state = true) :
    compensationExecutionStateValid program (cancelScopeSubtree state root.id disposition) = true := by
  obtain ⟨triggers, waits⟩ := cancelScopeSubtree_child_compensation_fields program state expected hosting root disposition
    position running rootMember child valid
  exact compensation_execution_running_retained_frame program state _ hosting running rfl triggers waits
    (fun owner => congrArg List.length (cancelScopeSubtree_child_parentless_census program state expected hosting
      root disposition position running rootMember child owner))
    (fun _ member => (List.mem_filter.mp member).1)
    (fun _ member => (List.mem_filter.mp member).1) valid

end BpmnSemantics.SemanticProcess
