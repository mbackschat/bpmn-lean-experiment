import BpmnSemantics.SemanticProcess.TransactionFrontierCardinality
import BpmnSemantics.SemanticProcess.TransactionReachableFrontier
import BpmnSemantics.SemanticProcess.TransactionCancellationSemantics
import BpmnSemantics.SemanticProcess.ScopeAncestryLaws
import BpmnSemantics.SemanticProcess.TransactionPhaseFrames

/-! # Transaction leaf-scope frontier classification

Exact scope layouts and leaf-owned tokens are local induction predicates. They exclude parent work
beside a quiescent child without assuming disabled completion, runtime validity, or a frontier bound.
The classifier does not establish that execution reaches only these layouts.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics TransactionProgramRoles InternalCommutation

inductive TransactionScopeShape {p : Program} (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) : Option RuntimeScopeOccurrence → Prop where
  | nested (parent child : RuntimeScopeOccurrence)
      (root : parent.id.definitionScopeId = roles.root.id) (parentless : parent.parent = none)
      (selected : child.id.definitionScopeId = roles.child.id) (attached : child.parent = some parent.id)
      (scopes : state.scopeOccurrences.Perm [parent, child]) : TransactionScopeShape roles state (some child)
  | root (parent : RuntimeScopeOccurrence) (selected : parent.id.definitionScopeId = roles.root.id)
      (parentless : parent.parent = none) (scopes : state.scopeOccurrences = [parent]) :
      TransactionScopeShape roles state (some parent)
  | empty (scopes : state.scopeOccurrences = []) : TransactionScopeShape roles state none

def TransactionTokensAtLeaf (state : RuntimeState) (leaf : Option RuntimeScopeOccurrence) : Prop :=
  ∀ token ∈ state.tokens, some token.owner = leaf.map (·.id)

def TransactionWaitsAtLeaf (state : RuntimeState) (leaf : Option RuntimeScopeOccurrence) : Prop :=
  ∀ wait ∈ state.waits, some wait.owner = leaf.map (·.id)

private def leafCompletion (leaf : Option RuntimeScopeOccurrence) (operation : SemanticOperation) : Bool :=
  match leaf, operation with
  | some occurrence, .completeScope _ _ scope _ => scope == occurrence.id.definitionScopeId
  | _, _ => false

theorem transaction_quiescent_scope_is_leaf (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (leaf : Option RuntimeScopeOccurrence) (shape : TransactionScopeShape roles state leaf)
    (occurrence : RuntimeScopeOccurrence) (member : occurrence ∈ state.scopeOccurrences)
    (quiet : scopeQuiescent state occurrence.id = true) : leaf = some occurrence := by
  cases shape with
  | empty scopes => simp [scopes] at member
  | root parent _ _ scopes =>
      have same : occurrence = parent := by simpa [scopes] using member
      exact congrArg some same.symm
  | nested parent child _ _ _ attached scopes =>
      have selected := scopes.mem_iff.mp member
      simp only [List.mem_cons, List.not_mem_nil, or_false] at selected
      rcases selected with same | same
      · subst occurrence
        have blocked := transaction_scope_barrier_not_quiescent state parent.id
          (.child child (scopes.mem_iff.mpr (by simp)) attached)
        simp [blocked] at quiet
      · subst occurrence; rfl

private theorem selected_completion_none (p : Program) (state : RuntimeState)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId)
    (missing : completeScopeState? state scope output = none) : completeSelectedScope? p state scope output = none := by
  unfold completeSelectedScope?
  split
  · simp only [completeMonitoredScope?]
    cases monitoredScopePairForChild? p state scope with
    | none => rfl
    | some pair => dsimp only [Bind.bind, Option.bind]; split <;> simp [missing]
  · simp [completeBoundedScope?, missing]

private theorem completion_live_quiet (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
    (output : Option ControlPlaceId) (step : AppliedInternalOperation)
    (applied : attemptInternalOperation p (.completeScope id origin scope output) state = .applied step) :
    ∃ occurrence ∈ state.scopeOccurrences, occurrence.id.definitionScopeId = scope ∧
      scopeQuiescent state occurrence.id = true := by
  simp only [attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent] at applied
  change (match completeSelectedScope? p state scope output with
    | none => InternalOperationAttempt.disabled _
    | some successor => InternalOperationAttempt.applied { operation := _, successor }) = .applied step at applied
  cases completed : completeScopeState? state scope output with
  | none => rw [selected_completion_none p state scope output completed] at applied; contradiction
  | some after =>
      unfold completeScopeState? at completed
      split at completed
      · rename_i occurrence unique
        have member := List.mem_filter.mp (show occurrence ∈ state.scopeOccurrences.filter
          (fun candidate => decide (candidate.id.definitionScopeId = scope)) by rw [unique]; simp)
        exact ⟨occurrence, member.1, of_decide_eq_true member.2,
          (completeScopeState_selected_update state after scope output occurrence unique (by
            simpa only [completeScopeState?, unique] using completed)).1⟩
      · contradiction

private theorem completion_disabled_by_leaf_token (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (leaf : Option RuntimeScopeOccurrence) (shape : TransactionScopeShape roles state leaf)
    (token : ControlToken) (member : token ∈ state.tokens) (owned : TransactionTokensAtLeaf state leaf)
    (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId) (output : Option ControlPlaceId) :
    attemptInternalOperation p (.completeScope id origin scope output) state = .disabled (.completeScope id origin scope output) := by
  have impossible (step : AppliedInternalOperation)
      (applied : attemptInternalOperation p (.completeScope id origin scope output) state = .applied step) : False := by
    obtain ⟨occurrence, present, _, quiet⟩ := completion_live_quiet p roles state id origin scope output step applied
    have selected := transaction_quiescent_scope_is_leaf p roles state leaf shape occurrence present quiet
    have same : token.owner = occurrence.id := by simpa [selected] using owned token member
    have blocked := transaction_scope_barrier_not_quiescent state occurrence.id (.token token member same)
    simp [blocked] at quiet
  simp only [attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent] at impossible ⊢
  change ∀ step, (match completeSelectedScope? p state scope output with
    | none => InternalOperationAttempt.disabled (.completeScope id origin scope output)
    | some successor => InternalOperationAttempt.applied
        { operation := .completeScope id origin scope output, successor }) = .applied step → False at impossible
  change (match completeSelectedScope? p state scope output with
    | none => InternalOperationAttempt.disabled _
    | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _
  cases result : completeSelectedScope? p state scope output with
  | none => rfl
  | some successor =>
      exact False.elim (impossible
        { operation := .completeScope id origin scope output, successor } (by rw [result]))

private theorem frontier_filter_bound (p : Program) (state : RuntimeState) (keep : SemanticOperation → Bool)
    (restricted : ∀ operation ∈ p.operations, ∀ step,
      attemptInternalOperation p operation state = .applied step → keep operation = true) :
    (snapshotInternalTransitionFrontier p state).transitions.length ≤ (p.operations.filter keep).length := by
  let select := fun operation => match attemptInternalOperation p operation state with
    | .applied step => some (step.operation, step.successor)
    | .disabled _ | .refused _ _ => none
  have filterEq (values : List SemanticOperation)
      (outside : ∀ operation ∈ values, keep operation = false → select operation = none) :
      values.filterMap select = (values.filter keep).filterMap select := by
    induction values with
    | nil => rfl
    | cons head tail ih =>
        have rest := ih (fun operation member => outside operation (List.mem_cons_of_mem head member))
        cases kept : keep head with
        | false => simp [kept, rest, outside head List.mem_cons_self kept]
        | true => simp [List.filterMap_cons, kept, rest]
  simp only [snapshotInternalTransitionFrontier, canonicalEnabledInternalTransitions, snapshot_sort_eq]
  rw [(sortBy_permutation _ _).length_eq]
  change (List.filterMap _ (InternalCommutation.sortBy _ _)).length ≤ _
  rw [((sortBy_permutation _ _).filterMap _).length_eq, List.filterMap_map]
  change (p.operations.filterMap select).length ≤ _
  rw [filterEq p.operations (by
    intro operation member excluded
    cases applied : attemptInternalOperation p operation state with
    | disabled _ | refused _ _ => simp only [select, applied]
    | applied step => simp [restricted operation member step applied] at excluded)]
  exact List.length_filterMap_le select _

theorem transaction_empty_tokens_scope_frontier_bound (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (leaf : Option RuntimeScopeOccurrence) (shape : TransactionScopeShape roles state leaf)
    (graph : transactionCancellationProgramGraph p = true) (consumed : state.initiationPending = false)
    (tokens : state.tokens = []) : (snapshotInternalTransitionFrontier p state).transitions.length ≤ 1 := by
  have bound := frontier_filter_bound p state (leafCompletion leaf) (by
    intro operation member step applied
    have family := transactionCancellationProgramGraph_operation_families p graph operation member
    have selected : (∃ id origin scope output, operation = .completeScope id origin scope output) ∨
        (∃ input, operationInput? operation = some input) := by
      cases operation <;> try contradiction
      case initiate id origin output =>
        rw [transaction_initiation_consumed p state id origin output roles.snapshotsAbsent consumed] at applied
        contradiction
      all_goals first | exact Or.inl ⟨_, _, _, _, rfl⟩ | exact Or.inr ⟨_, rfl⟩
    rcases selected with ⟨id, origin, scope, output, rfl⟩ | ⟨input, consumes⟩
    ·
      obtain ⟨occurrence, present, scopeSelected, quiet⟩ := completion_live_quiet p roles state id origin scope output step applied
      have selected := transaction_quiescent_scope_is_leaf p roles state leaf shape occurrence present quiet
      simp [leafCompletion, selected, scopeSelected]
    · have missing : onlyTokenOwner? state input = none := by simp [onlyTokenOwner?, tokenOwners, tokens]
      have disabled := transaction_consuming_attempt_without_token p state operation input roles.execution
        roles.executionPresent roles.snapshotsAbsent consumes missing
      rw [disabled] at applied
      contradiction)
  apply Nat.le_trans bound
  cases shape with
  | empty =>
      have missing : p.operations.filter (leafCompletion none) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro operation _; cases operation <;> simp [leafCompletion]
      rw [missing]
      exact Nat.zero_le 1
  | nested parent child _ _ selected _ _ =>
      have filtered : p.operations.filter (leafCompletion (some child)) = [roles.childComplete] := by
        rw [← unique_exact _ _ roles.childCompleteSelected]
        apply congrArg (fun predicate : SemanticOperation → Bool => p.operations.filter predicate)
        funext operation; cases operation <;> simp [leafCompletion, selected]
      rw [filtered]
      exact Nat.le_refl 1
  | root parent selected _ _ =>
      have filtered : p.operations.filter (leafCompletion (some parent)) = [roles.rootComplete] := by
        rw [← unique_exact _ _ roles.rootCompleteSelected]
        apply congrArg (fun predicate : SemanticOperation → Bool => p.operations.filter predicate)
        funext operation; cases operation <;> simp [leafCompletion, selected]
      rw [filtered]
      exact Nat.le_refl 1

theorem transaction_leaf_owned_scope_frontier_bound (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (leaf : Option RuntimeScopeOccurrence) (shape : TransactionScopeShape roles state leaf)
    (graph : transactionCancellationProgramGraph p = true) (consumed : state.initiationPending = false)
    (bound : state.tokens.length ≤ 1) (owned : TransactionTokensAtLeaf state leaf)
    (consumers : ∀ token ∈ state.tokens, ∃ operation, soleConsumer? p token.placeId = some operation) :
    (snapshotInternalTransitionFrontier p state).transitions.length ≤ 1 := by
  cases tokens : state.tokens with
  | nil => exact transaction_empty_tokens_scope_frontier_bound p roles state leaf shape graph consumed tokens
  | cons token rest =>
      have empty : rest = [] := by cases rest <;> simp_all
      subst rest
      have present : token ∈ state.tokens := by simp [tokens]
      obtain ⟨operation, selected⟩ := consumers token present
      exact transaction_single_token_frontier_cardinality p roles state graph token tokens consumed
        (fun id origin scope output _ => completion_disabled_by_leaf_token p roles state leaf shape
          token present owned id origin scope output) operation selected

/-- Actual scope completion derives token emptiness from leaf ownership, without a token-count premise. -/
theorem transaction_scope_completion_requires_empty_tokens (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (leaf : Option RuntimeScopeOccurrence) (shape : TransactionScopeShape roles state leaf)
    (owned : TransactionTokensAtLeaf state leaf) (id : OperationId) (origin : BpmnElementOrigin)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId) (step : AppliedInternalOperation)
    (applied : attemptInternalOperation p (.completeScope id origin scope output) state = .applied step) :
    state.tokens = [] := by
  cases tokens : state.tokens with
  | nil => rfl
  | cons token rest =>
      have member : token ∈ state.tokens := by simp [tokens]
      rw [completion_disabled_by_leaf_token p roles state leaf shape token member owned id origin scope output] at applied
      contradiction

/-- A parent token beside a distinct live child fails the ownership predicate before classification. -/
theorem transaction_parent_token_rejects_child_leaf (state : RuntimeState)
    (parent child : RuntimeScopeOccurrence) (token : ControlToken) (present : token ∈ state.tokens)
    (parentOwned : token.owner = parent.id) (distinct : parent.id ≠ child.id) :
    ¬ TransactionTokensAtLeaf state (some child) := by
  intro owned
  exact distinct (by simpa only [parentOwned, Option.map_some, Option.some.injEq] using owned token present)

theorem TransactionScopeShape.of_scopes_eq {p : Program} {roles : TransactionAdmittedRoles p}
    {before after : RuntimeState} {leaf : Option RuntimeScopeOccurrence}
    (shape : TransactionScopeShape roles before leaf)
    (scopes : after.scopeOccurrences = before.scopeOccurrences) : TransactionScopeShape roles after leaf := by
  cases shape with
  | nested parent child root parentless selected attached inventory =>
      exact .nested parent child root parentless selected attached (by rw [scopes]; exact inventory)
  | root parent selected parentless inventory => exact .root parent selected parentless (scopes.trans inventory)
  | empty inventory => exact .empty (scopes.trans inventory)

/-- TXC-JOIN-01's selected child and quiescence force the direct-parent layout and its sole token. -/
theorem transaction_scope_join_preserves_leaf (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (before after : RuntimeState)
    (leaf : Option RuntimeScopeOccurrence) (shape : TransactionScopeShape roles before leaf)
    (owned : TransactionTokensAtLeaf before leaf) (waitsOwned : TransactionWaitsAtLeaf before leaf)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (joined : TransactionCancellationJoin before owner output after) :
    ∃ nextLeaf, TransactionScopeShape roles after nextLeaf ∧ TransactionTokensAtLeaf after nextLeaf ∧
      TransactionWaitsAtLeaf after nextLeaf := by
  cases joined with
  | joined occurrence parent selected parentSelected quiet =>
      have member := List.mem_filter.mp (show occurrence ∈ before.scopeOccurrences.filter
        (fun candidate => candidate.id == owner) by rw [selected]; simp)
      have ownerEq : occurrence.id = owner := by simpa using member.2
      have atLeaf := transaction_quiescent_scope_is_leaf p roles before leaf shape occurrence member.1
        (by simpa only [ownerEq] using quiet)
      have empty : before.tokens = [] := by
        apply List.eq_nil_iff_forall_not_mem.mpr
        intro token present
        have same : token.owner = owner := by simpa [atLeaf, ownerEq] using owned token present
        have blocked := transaction_scope_barrier_not_quiescent before owner (.token token present same)
        simp [blocked] at quiet
      have emptyWaits : before.waits = [] := by
        apply List.eq_nil_iff_forall_not_mem.mpr
        intro wait present
        have same : wait.owner = owner := by simpa [atLeaf, ownerEq] using waitsOwned wait present
        have blocked := transaction_scope_barrier_not_quiescent before owner (.task wait present same)
        simp [blocked] at quiet
      cases shape with
      | empty inventory => simp [inventory] at member
      | root root rootSelected parentless inventory =>
          have same : occurrence = root := Option.some.inj atLeaf.symm
          simp [same, parentless] at parentSelected
      | nested root child rootSelected parentless childSelected attached inventory =>
          have same : occurrence = child := Option.some.inj atLeaf.symm
          subst occurrence
          have parentEq : parent = root.id := Option.some.inj (parentSelected.symm.trans attached)
          have distinct : root.id ≠ child.id := by
            intro equal
            exact roles.child_scope_ne_root wellFormed
              (childSelected.symm.trans ((congrArg ScopeOccurrenceId.definitionScopeId equal).symm.trans rootSelected))
          have remaining : (before.scopeOccurrences.filter (fun candidate => candidate.id != owner)) = [root] := by
            apply List.Perm.eq_singleton
            simpa [← ownerEq, distinct] using inventory.filter (fun candidate => candidate.id != owner)
          refine ⟨some root, .root root rootSelected parentless remaining, ?_, ?_⟩
          · intro token present
            change token ∈ addToken before.tokens output parent at present
            simp only [empty, addToken, canonicalInsertBy, List.mem_singleton] at present
            subst token
            change some parent = some root.id
            exact congrArg some parentEq
          · intro wait present; simp [emptyWaits] at present

/-- Handler routing reuses the actual Transaction join; fail-fast completion leaves no live scope. -/
theorem transaction_scope_handler_completion (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (before after : RuntimeState)
    (leaf : Option RuntimeScopeOccurrence) (shape : TransactionScopeShape roles before leaf)
    (owned : TransactionTokensAtLeaf before leaf) (waitsOwned : TransactionWaitsAtLeaf before leaf)
    (effectId : EffectOccurrenceId)
    (result : EffectExecutionResult) (step : CompensationHandlerCompletionStep p before effectId result after) :
    ∃ nextLeaf, TransactionScopeShape roles after nextLeaf ∧ TransactionTokensAtLeaf after nextLeaf ∧
      TransactionWaitsAtLeaf after nextLeaf := by
  cases step with
  | successFinal declaration selected patch activated triggers waits after ready resultShape candidate capacity routing valid =>
      cases routing with
      | root id origin scope input output selectedOperation =>
          have member : SemanticOperation.triggerCompensation id origin scope input output ∈ p.operations :=
            (List.mem_filter.mp (show SemanticOperation.triggerCompensation id origin scope input output ∈
              p.operations.filter (fun operation => operation.id.value == selected.trigger.id.elementId.value) by
                rw [selectedOperation]; simp)).1
          have canonical := List.all_eq_true.mp roles.canonicalOperations _ member
          change false = true at canonical
          contradiction
      | transaction id origin scope input output boundary after selectedOperation joined =>
          exact transaction_scope_join_preserves_leaf p roles wellFormed
            { before with
              compensationTriggers := triggers
              compensationHandlerEffectWaits := waits
              effectActivations := activated.effectActivations } after leaf
            (shape.of_scopes_eq rfl) owned waitsOwned selected.trigger.owner selected.trigger.output joined
  | successAdvance declaration selected patch activated triggers waits after ready resultShape candidate capacity afterShape valid =>
      subst after
      exact ⟨leaf, shape.of_scopes_eq rfl, owned, waitsOwned⟩
  | failure declaration selected code message patch after ready resultShape cancelled valid =>
      cases cancelled with
      | cancel handlers failedTrigger failure after terminalized triggerShape failureShape afterShape =>
          subst after
          exact ⟨none, .empty rfl, by intro token present; simp at present,
            by intro wait present; simp at present⟩

private theorem transaction_scope_cancel_withdrawal (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (before : RuntimeState)
    (leaf : Option RuntimeScopeOccurrence) (shape : TransactionScopeShape roles before leaf)
    (owned : TransactionTokensAtLeaf before leaf) (waitsOwned : TransactionWaitsAtLeaf before leaf)
    (noCalls : before.calledProcessOccurrences = [])
    (operation : SemanticOperation) (declaration : CompensationExecutionDeclaration)
    (id : OperationId) (scope : DefinitionScopeId) (input output : ControlPlaceId) (owner : ScopeOccurrenceId)
    (ready : TransactionCancellationReady p operation before declaration id scope input output owner) :
    TransactionScopeShape roles (cancelScopeSubtree before owner .retain) leaf ∧
      TransactionTokensAtLeaf (cancelScopeSubtree before owner .retain) leaf ∧
      TransactionWaitsAtLeaf (cancelScopeSubtree before owner .retain) leaf := by
  refine ⟨?_, fun token present => owned token (List.mem_filter.mp present).1,
    fun wait present => waitsOwned wait (List.mem_filter.mp present).1⟩
  cases ready with
  | ready origin boundary declared operationSelected accepted running tokenOwner scopeMatches valid occurrence parent selected parentSelected unclaimed =>
      have member := List.mem_filter.mp (show occurrence ∈ before.scopeOccurrences.filter
        (fun candidate => candidate.id == owner) by rw [selected]; simp)
      have ownerEq : occurrence.id = owner := by simpa using member.2
      cases shape with
      | empty inventory => simp [inventory] at member
      | root root rootSelected parentless inventory =>
          have same : occurrence = root := by simpa [inventory] using member.1
          simp [same, parentless] at parentSelected
      | nested root child rootSelected parentless childSelected attached inventory =>
          have which := inventory.mem_iff.mp member.1
          simp only [List.mem_cons, List.not_mem_nil, or_false] at which
          rcases which with same | same
          · simp [same, parentless] at parentSelected
          · subst occurrence
            have distinct : root.id ≠ child.id := by
              intro equal
              exact roles.child_scope_ne_root wellFormed
                (childSelected.symm.trans ((congrArg ScopeOccurrenceId.definitionScopeId equal).symm.trans rootSelected))
            have unique : (before.scopeOccurrences.map (·.id)).Nodup :=
              (inventory.map (·.id)).nodup_iff.mpr (by simp [distinct])
            have backward := occurrenceInSubtree_no_backward before.scopeOccurrences unique root child
              (inventory.mem_iff.mpr (by simp)) parentless distinct
            have calls : calledInstanceClosure before owner = [] := by
              simp [calledInstanceClosure, noCalls, processInstanceClosureWithin]
            have scopes : (cancelScopeSubtree before owner .retain).scopeOccurrences = before.scopeOccurrences := by
              change before.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner) ||
                !(occurrenceInSubtree before.scopeOccurrences owner candidate.id ||
                  (calledInstanceClosure before owner).contains candidate.id.processInstanceId)) = _
              apply List.filter_eq_self.mpr
              intro candidate present
              have which := inventory.mem_iff.mp present
              simp only [List.mem_cons, List.not_mem_nil, or_false] at which
              rcases which with rfl | rfl
              · rw [calls]; simp [← ownerEq, backward]
              · simp [← ownerEq]
            exact (TransactionScopeShape.nested root child rootSelected parentless childSelected attached inventory).of_scopes_eq scopes

/-- Regional cancellation preserves the leaf layout when the phase excludes Called Processes. -/
theorem transaction_scope_cancellation (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (before after : RuntimeState)
    (leaf : Option RuntimeScopeOccurrence) (shape : TransactionScopeShape roles before leaf)
    (owned : TransactionTokensAtLeaf before leaf) (waitsOwned : TransactionWaitsAtLeaf before leaf)
    (noCalls : before.calledProcessOccurrences = [])
    (operation : SemanticOperation) (compensating : Bool)
    (step : TransactionCancellationStep p operation before compensating after) :
    ∃ nextLeaf, TransactionScopeShape roles after nextLeaf ∧ TransactionTokensAtLeaf after nextLeaf ∧
      TransactionWaitsAtLeaf after nextLeaf := by
  cases step with
  | empty declaration id scope input output owner after ready sources joined accepted =>
      obtain ⟨retained, ownedAfter, waitsAfter⟩ := transaction_scope_cancel_withdrawal p roles wellFormed before leaf
        shape owned waitsOwned noCalls operation declaration id scope input output owner ready
      exact transaction_scope_join_preserves_leaf p roles wellFormed _ after leaf retained ownedAfter waitsAfter owner output joined
  | compensating declaration id scope input output owner first rest pending activated triggers waits after ready sources pendingShape frontier triggersShape waitsShape capacity afterShape accepted =>
      obtain ⟨retained, ownedAfter, waitsAfter⟩ := transaction_scope_cancel_withdrawal p roles wellFormed before leaf
        shape owned waitsOwned noCalls operation declaration id scope input output owner ready
      subst after
      exact ⟨leaf, retained.of_scopes_eq rfl, ownedAfter, waitsAfter⟩

private theorem transaction_selected_token_at_leaf (before : RuntimeState)
    (leaf : Option RuntimeScopeOccurrence) (owned : TransactionTokensAtLeaf before leaf)
    (input : ControlPlaceId) (owner : ScopeOccurrenceId)
    (selected : onlyTokenOwner? before input = some owner) : some owner = leaf.map (·.id) := by
  have present : owner ∈ tokenOwners before input := by
    unfold onlyTokenOwner? at selected
    cases census : tokenOwners before input with
    | nil => simp [census] at selected
    | cons first rest =>
        simp only [census] at selected
        split at selected
        · cases selected; simp
        · contradiction
  obtain ⟨token, present, same⟩ := List.mem_map.mp present
  exact same ▸ owned token (List.mem_filter.mp present).1

/-- The actual Task selector transfers the leaf token's owner to the newly inserted wait. -/
theorem transaction_scope_task_arming (p : Program) (roles : TransactionAdmittedRoles p)
    (before after : RuntimeState) (leaf : Option RuntimeScopeOccurrence)
    (shape : TransactionScopeShape roles before leaf) (owned : TransactionTokensAtLeaf before leaf)
    (waitsOwned : TransactionWaitsAtLeaf before leaf) (input output : ControlPlaceId)
    (task : UserTaskDefinition) (applied : awaitUserTaskState? before input output task = some after) :
    TransactionScopeShape roles after leaf ∧ TransactionTokensAtLeaf after leaf ∧
      TransactionWaitsAtLeaf after leaf ∧ after.calledProcessOccurrences = before.calledProcessOccurrences := by
  unfold awaitUserTaskState? at applied
  obtain ⟨owner, selected, applied⟩ := Option.bind_eq_some_iff.mp applied
  obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
  cases applied
  refine ⟨shape.of_scopes_eq rfl, ?_, ?_, rfl⟩
  · intro token present
    exact owned token ((removeToken_sublist before.tokens input owner).subset present)
  · intro wait present
    rcases (mem_insertUserTaskWait _ wait before.waits).mp present with same | previous
    · subst wait
      exact transaction_selected_token_at_leaf before leaf owned input owner selected
    · exact waitsOwned wait previous

/-- Reaching NoneEnd consumes only its token and leaves the scope and ordinary waits in place. -/
theorem transaction_scope_none_end (p : Program) (roles : TransactionAdmittedRoles p)
    (before after : RuntimeState) (leaf : Option RuntimeScopeOccurrence)
    (shape : TransactionScopeShape roles before leaf) (owned : TransactionTokensAtLeaf before leaf)
    (waitsOwned : TransactionWaitsAtLeaf before leaf) (input : ControlPlaceId)
    (applied : reachNoneEndState? before input = some after) :
    TransactionScopeShape roles after leaf ∧ TransactionTokensAtLeaf after leaf ∧
      TransactionWaitsAtLeaf after leaf ∧ after.calledProcessOccurrences = before.calledProcessOccurrences := by
  unfold reachNoneEndState? at applied
  obtain ⟨owner, _, applied⟩ := Option.bind_eq_some_iff.mp applied
  obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
  cases applied
  exact ⟨shape.of_scopes_eq rfl, fun token present =>
    owned token ((removeToken_sublist before.tokens input owner).subset present), waitsOwned, rfl⟩

private theorem transaction_retention_staging_preserves_calls
    (program : Program) (family : CompensationActivityOperationFamily) (owner : ScopeOccurrenceId)
    (facts : CompensationCompletionFacts) (before after : RuntimeState)
    (staged : stageDeclaredCompensationCompletion? program family owner facts before = some after) :
    after.calledProcessOccurrences = before.calledProcessOccurrences := by
  unfold stageDeclaredCompensationCompletion? at staged
  split at staged
  · cases staged; rfl
  · cases retained : retainCompletedCompensableActivity program owner facts before with
    | refused reason successor => simp [retained] at staged
    | retained successor record | notRetained successor =>
        simp only [retained, Option.some.injEq] at staged
        subst after
        unfold retainCompletedCompensableActivity at retained
        repeat' (split at retained <;> try dsimp only at retained)
        all_goals first | contradiction | (cases retained; rfl)

private theorem transaction_task_completion_preserves_calls (program : Program)
    (before after : RuntimeState) (taskId : UserTaskInstanceId)
    (completed : completeOrdinaryUserTaskWithCompensation? completeUserTask program before taskId = some after) :
    after.calledProcessOccurrences = before.calledProcessOccurrences := by
  have frame (state successor : RuntimeState)
      (completed : completeUserTask state taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation = some successor) :
      successor.calledProcessOccurrences = state.calledProcessOccurrences := by
    unfold completeUserTask at completed
    split at completed
    · contradiction
    · cases completed; rfl
  unfold completeOrdinaryUserTaskWithCompensation? at completed
  split at completed
  · obtain ⟨wait, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨staged, retained, completed⟩ := Option.bind_eq_some_iff.mp completed
    have retainedCalls := transaction_retention_staging_preserves_calls program .ordinaryUserTask wait.owner _ _ staged retained
    exact (frame staged after completed).trans retainedCalls
  · exact frame before after completed

/-- Stable completion takes its new token's owner from the selected leaf-owned wait. -/
theorem transaction_scope_task_completion (p : Program) (roles : TransactionAdmittedRoles p)
    (before after : RuntimeState) (leaf : Option RuntimeScopeOccurrence)
    (shape : TransactionScopeShape roles before leaf) (waitsOwned : TransactionWaitsAtLeaf before leaf)
    (taskId : UserTaskInstanceId) (emptyTokens : before.tokens = [])
    (completed : completeOrdinaryUserTaskWithCompensation? completeUserTask p before taskId = some after) :
    TransactionScopeShape roles after leaf ∧ TransactionTokensAtLeaf after leaf ∧
      TransactionWaitsAtLeaf after leaf ∧ after.calledProcessOccurrences = before.calledProcessOccurrences := by
  obtain ⟨wait, selected, tokens, waits, scopes, _⟩ :=
    transaction_ordinary_completion_from_waiting p before after taskId emptyTokens completed
  refine ⟨shape.of_scopes_eq scopes, ?_, ?_, transaction_task_completion_preserves_calls p before after taskId completed⟩
  · intro token present
    simp only [tokens, List.mem_singleton] at present
    subst token
    exact waitsOwned wait (List.mem_of_find?_eq_some selected)
  · intro other present
    rw [waits] at present
    exact waitsOwned other (List.mem_of_mem_erase present)

/-- Primitive completion derives absence of leaf work before retiring a root or routing to its parent. -/
theorem transaction_scope_normal_completion (p : Program) (roles : TransactionAdmittedRoles p)
    (wellFormed : programWellFormed p = true) (before after : RuntimeState)
    (leaf : Option RuntimeScopeOccurrence) (shape : TransactionScopeShape roles before leaf)
    (owned : TransactionTokensAtLeaf before leaf) (waitsOwned : TransactionWaitsAtLeaf before leaf)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId)
    (applied : completeScopeState? before scope output = some after) :
    ∃ nextLeaf, TransactionScopeShape roles after nextLeaf ∧ TransactionTokensAtLeaf after nextLeaf ∧
      TransactionWaitsAtLeaf after nextLeaf ∧ after.calledProcessOccurrences = before.calledProcessOccurrences := by
  unfold completeScopeState? at applied
  split at applied
  · rename_i occurrence selected
    split at applied
    · contradiction
    · rename_i enabled
      have quiet : scopeQuiescent before occurrence.id = true := by simpa using enabled
      have member := (List.mem_filter.mp (show occurrence ∈ before.scopeOccurrences.filter
        (fun candidate => decide (candidate.id.definitionScopeId = scope)) by rw [selected]; simp)).1
      have atLeaf := transaction_quiescent_scope_is_leaf p roles before leaf shape occurrence member quiet
      have empty : before.tokens = [] := by
        apply List.eq_nil_iff_forall_not_mem.mpr
        intro token present
        have same : token.owner = occurrence.id := by simpa [atLeaf] using owned token present
        have blocked := transaction_scope_barrier_not_quiescent before occurrence.id (.token token present same)
        simp [blocked] at quiet
      have emptyWaits : before.waits = [] := by
        apply List.eq_nil_iff_forall_not_mem.mpr
        intro wait present
        have same : wait.owner = occurrence.id := by simpa [atLeaf] using waitsOwned wait present
        have blocked := transaction_scope_barrier_not_quiescent before occurrence.id (.task wait present same)
        simp [blocked] at quiet
      cases shape with
      | empty inventory => simp [inventory] at member
      | root root rootSelected parentless inventory =>
          have same : occurrence = root := Option.some.inj atLeaf.symm
          subst occurrence
          simp only [completeQuiescentScope?, parentless] at applied
          repeat' split at applied
          all_goals
            first
            | contradiction
            | (cases applied
               exact ⟨none, .empty rfl, by intro token present; simp [empty] at present,
                 by intro wait present; simp [emptyWaits] at present, rfl⟩)
      | nested root child rootSelected parentless childSelected attached inventory =>
          have same : occurrence = child := Option.some.inj atLeaf.symm
          subst occurrence
          have distinct : root.id ≠ child.id := by
            intro equal
            exact roles.child_scope_ne_root wellFormed
              (childSelected.symm.trans ((congrArg ScopeOccurrenceId.definitionScopeId equal).symm.trans rootSelected))
          have remaining : (before.scopeOccurrences.filter
              (fun candidate => decide (candidate.id ≠ child.id))) = [root] := by
            apply List.Perm.eq_singleton
            simpa [distinct] using inventory.filter (fun candidate => decide (candidate.id ≠ child.id))
          simp only [completeQuiescentScope?, attached] at applied
          repeat' split at applied
          all_goals
            first
            | contradiction
            | (cases applied
               refine ⟨some root, .root root rootSelected parentless remaining, ?_, ?_, rfl⟩
               · intro token present
                 simp only [empty, addToken, canonicalInsertBy, List.mem_singleton] at present
                 subst token
                 simp_all only [Option.map_some, Option.some.injEq]
               · intro wait present; simp [emptyWaits] at present)
  · contradiction

private def transactionBranchScopeFamily : SemanticOperation → Prop
  | .awaitUserTask .. | .reachNoneEnd .. | .cancelTransaction .. => True
  | _ => False

private theorem transaction_branch_scope_family (p : Program) (scope : DefinitionScopeId)
    (place : ControlPlaceId) (operations : List SemanticOperation) (places : List ControlPlaceId)
    (chain : TransactionTaskChain p scope place operations places)
    (operation : SemanticOperation) (member : operation ∈ operations) : transactionBranchScopeFamily operation := by
  induction chain with
  | task current id origin input output task rest remaining placeOwned operationOwned consumer metadata tail ih =>
      rcases List.mem_cons.mp member with same | rest
      · subst operation; trivial
      · cases operation <;> first | trivial | exact ih rest
  | noneEnd current id origin input placeOwned operationOwned consumer =>
      have same : operation = .reachNoneEnd id origin input := by simpa using member
      subst operation; trivial
  | cancelEnd current id origin selectedScope input output boundary placeOwned operationOwned consumer =>
      have same : operation = .cancelTransaction id origin selectedScope input output boundary := by simpa using member
      subst operation; trivial

private theorem transaction_scope_primitive_completion (p : Program)
    (graph : transactionCancellationProgramGraph p = true) (state : RuntimeState)
    (scope : DefinitionScopeId) (output : Option ControlPlaceId) :
    completeSelectedScope? p state scope output = completeScopeState? state scope output := by
  have monitored : monitoredScopeDefinitions p = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    have family := transactionCancellationProgramGraph_operation_families p graph operation member
    cases operation <;> simp_all
  have bounded : boundedScopeOperations p = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    have family := transactionCancellationProgramGraph_operation_families p graph operation member
    cases operation <;> simp_all
  simp only [completeSelectedScope?, isMonitoredScopeDefinition, monitored, List.any_nil,
    Bool.false_eq_true, ↓reduceIte, completeBoundedScope?, boundedScopeDefinitionForChild?, bounded,
    List.find?_nil]
  cases completeScopeState? state scope output <;> rfl

/-- Actual continuation attempts preserve the scope phase and inactive families after entry and split are disabled. -/
theorem transaction_scope_frames_internal_step (p : Program) (roles : TransactionAdmittedRoles p)
    (graph : transactionCancellationProgramGraph p = true) (wellFormed : programWellFormed p = true)
    (before after : RuntimeState) (leaf : Option RuntimeScopeOccurrence)
    (shape : TransactionScopeShape roles before leaf) (owned : TransactionTokensAtLeaf before leaf)
    (waitsOwned : TransactionWaitsAtLeaf before leaf) (inert : TransactionInertCollections before)
    (live : TransactionLiveScopeControl before) (started : before.control ≠ .notStarted)
    (consumed : before.initiationPending = false)
    (entryDisabled : attemptInternalOperation p roles.entry before = .disabled roles.entry)
    (splitDisabled : attemptInternalOperation p roles.split before = .disabled roles.split)
    (operation : SemanticOperation) (member : operation ∈ p.operations)
    (applied : attemptInternalOperation p operation before = .applied { operation, successor := after }) :
    ∃ nextLeaf, TransactionScopeShape roles after nextLeaf ∧ TransactionTokensAtLeaf after nextLeaf ∧
      TransactionWaitsAtLeaf after nextLeaf ∧ TransactionInertCollections after ∧
      TransactionLiveScopeControl after ∧ after.control ≠ .notStarted := by
  have family := transactionCancellationProgramGraph_operation_families p graph operation member
  have inventory := roles.operation_in_inventory operation member
  have leftFamily := transaction_branch_scope_family p roles.child.id roles.left _ _ roles.left_chain operation
  have rightFamily := transaction_branch_scope_family p roles.child.id roles.right _ _ roles.right_chain operation
  cases operation <;> try contradiction
  case initiate id origin output =>
    rw [transaction_initiation_consumed p before id origin output roles.snapshotsAbsent consumed] at applied
    contradiction
  case enterScope id origin input entry scope =>
    have same : SemanticOperation.enterScope id origin input entry scope = roles.entry := by
      obtain ⟨startId, startOrigin, startShape⟩ := roles.startShape
      obtain ⟨splitId, splitOrigin, splitInput, splitShape⟩ := roles.splitShape
      obtain ⟨rootId, rootOrigin, rootScope, rootShape⟩ := roles.rootCompleteShape
      obtain ⟨childId, childOrigin, childScope, childShape⟩ := roles.childCompleteShape
      obtain ⟨normalId, normalOrigin, normalInput, normalShape⟩ := roles.normalEndShape
      obtain ⟨ackId, ackOrigin, ackInput, ackTask, ackShape⟩ := roles.ackShape
      obtain ⟨endId, endOrigin, endInput, endShape⟩ := roles.ackEndShape
      simp only [List.mem_append, List.mem_cons, List.not_mem_nil, or_false,
        startShape, splitShape, rootShape, childShape, normalShape, ackShape, endShape,
        reduceCtorEq, false_or, or_false] at inventory
      rcases inventory with (selected | onLeft) | onRight
      · exact selected
      · exact False.elim (leftFamily onLeft)
      · exact False.elim (rightFamily onRight)
    rw [same, entryDisabled] at applied
    contradiction
  case duplicate id origin input outputs =>
    have same : SemanticOperation.duplicate id origin input outputs = roles.split := by
      obtain ⟨startId, startOrigin, startShape⟩ := roles.startShape
      obtain ⟨entryId, entryOrigin, entryInput, entryShape⟩ := roles.entryShape
      obtain ⟨rootId, rootOrigin, rootScope, rootShape⟩ := roles.rootCompleteShape
      obtain ⟨childId, childOrigin, childScope, childShape⟩ := roles.childCompleteShape
      obtain ⟨normalId, normalOrigin, normalInput, normalShape⟩ := roles.normalEndShape
      obtain ⟨ackId, ackOrigin, ackInput, ackTask, ackShape⟩ := roles.ackShape
      obtain ⟨endId, endOrigin, endInput, endShape⟩ := roles.ackEndShape
      simp only [List.mem_append, List.mem_cons, List.not_mem_nil, or_false,
        startShape, entryShape, rootShape, childShape, normalShape, ackShape, endShape,
        reduceCtorEq, false_or, or_false] at inventory
      rcases inventory with (selected | onLeft) | onRight
      · exact selected
      · exact False.elim (leftFamily onLeft)
      · exact False.elim (rightFamily onRight)
    rw [same, splitDisabled] at applied
    contradiction
  case awaitUserTask id origin input output task =>
    simp only [attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent] at applied
    change (match awaitUserTaskState? before input output task with
      | none => InternalOperationAttempt.disabled _
      | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _ at applied
    cases selected : awaitUserTaskState? before input output task with
    | none => simp [selected] at applied
    | some successor =>
      simp only [selected, InternalOperationAttempt.applied.injEq, AppliedInternalOperation.mk.injEq,
        true_and] at applied
      subst successor
      obtain ⟨nextShape, nextTokens, nextWaits, _⟩ :=
        transaction_scope_task_arming p roles before after leaf shape owned waitsOwned input output task selected
      exact ⟨leaf, nextShape, nextTokens, nextWaits,
        transaction_task_arming_phase_frames before after inert live started input output task selected⟩
  case reachNoneEnd id origin input =>
    simp only [attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent] at applied
    change (match reachNoneEndState? before input with
      | none => InternalOperationAttempt.disabled _
      | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _ at applied
    cases selected : reachNoneEndState? before input with
    | none => simp [selected] at applied
    | some successor =>
      simp only [selected, InternalOperationAttempt.applied.injEq, AppliedInternalOperation.mk.injEq,
        true_and] at applied
      subst successor
      obtain ⟨nextShape, nextTokens, nextWaits, _⟩ :=
        transaction_scope_none_end p roles before after leaf shape owned waitsOwned input selected
      exact ⟨leaf, nextShape, nextTokens, nextWaits,
        transaction_none_end_phase_frames before after inert live started input selected⟩
  case completeScope id origin scope output =>
    simp only [attemptInternalOperation, roles.executionPresent, roles.snapshotsAbsent] at applied
    change (match completeSelectedScope? p before scope output with
      | none => InternalOperationAttempt.disabled _
      | some successor => InternalOperationAttempt.applied { operation := _, successor }) = _ at applied
    rw [transaction_scope_primitive_completion p graph] at applied
    cases selected : completeScopeState? before scope output with
    | none => simp [selected] at applied
    | some successor =>
      simp only [selected, InternalOperationAttempt.applied.injEq, AppliedInternalOperation.mk.injEq,
        true_and] at applied
      subst successor
      obtain ⟨nextLeaf, nextShape, nextTokens, nextWaits, _⟩ :=
        transaction_scope_normal_completion p roles wellFormed before after leaf shape owned waitsOwned scope output selected
      exact ⟨nextLeaf, nextShape, nextTokens, nextWaits,
        transaction_normal_completion_phase_frames before after inert live started scope output selected⟩
  case cancelTransaction id origin scope input output boundary =>
    simp only [attemptInternalOperation, roles.executionPresent] at applied
    cases selected : attemptTransactionCancellation p
        (.cancelTransaction id origin scope input output boundary) before with
    | disabled successor => simp [selected] at applied
    | refused reason => simp [selected] at applied
    | applied successor =>
      simp only [selected, InternalOperationAttempt.applied.injEq, AppliedInternalOperation.mk.injEq,
        true_and] at applied
      subst successor
      obtain ⟨compensating, step⟩ := attemptTransactionCancellation_sound p _ before after selected
      obtain ⟨nextLeaf, nextShape, nextTokens, nextWaits⟩ := transaction_scope_cancellation p roles wellFormed
        before after leaf shape owned waitsOwned inert.2.2.2.2 _ compensating step
      exact ⟨nextLeaf, nextShape, nextTokens, nextWaits,
        transaction_cancellation_phase_frames p _ before after compensating inert live started step⟩

end BpmnSemantics.SemanticProcess
