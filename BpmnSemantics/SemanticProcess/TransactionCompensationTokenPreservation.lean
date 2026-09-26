import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime
import BpmnSemantics.SemanticProcess.TokenPatch

/-! Token patches preserve active Transaction quiescence only when their produced owners
are separate. Actual input tokens supply that separation for existing local-control callers. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem rootCompensationExecutionDomain_of_no_cancel (program : Program)
    (absent : (program.operations.any fun operation =>
      match operation with | .cancelTransaction .. => true | _ => false) = false) :
    RootCompensationExecutionDomain program := by
  intro operation member
  have excluded := List.any_eq_false.mp absent operation member
  cases operation <;> simp_all

theorem RootCompensationExecutionDomain.no_cancel (program : Program)
    (domain : RootCompensationExecutionDomain program) :
    (program.operations.any fun operation =>
      match operation with | .cancelTransaction .. => true | _ => false) = false := by
  apply List.any_eq_false.mpr
  intro operation member
  have admitted := domain operation member
  cases operation <;> simp_all

theorem RootCompensationExecutionDomain.of_no_execution
    (program : Program) (absent : program.compensationExecution = none)
    (valid : compensationExecutionDeclarationValid program = true) :
    RootCompensationExecutionDomain program := by
  simp only [compensationExecutionDeclarationValid, absent, Bool.not_eq_true'] at valid
  intro operation member
  have excluded := List.any_eq_false.mp valid operation member
  cases operation <;> simp_all

theorem RootCompensationExecutionDomain.of_root_declaration
    (program : Program) (declaration : CompensationExecutionDeclaration)
    (present : program.compensationExecution = some declaration)
    (valid : compensationExecutionDeclarationValid program = true)
    (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
    (input output : ControlPlaceId)
    (selected : program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) =
      [.triggerCompensation id origin scope input output]) :
    RootCompensationExecutionDomain program := by
  simp only [compensationExecutionDeclarationValid, present, Bool.and_eq_true, and_assoc] at valid
  have scopeValid := valid.1
  conv at scopeValid => lhs; whnf
  split at scopeValid
  · simp only [Bool.and_eq_true, Bool.not_eq_true'] at scopeValid
    exact rootCompensationExecutionDomain_of_no_cancel program scopeValid.2
  · rename_i selectedCancel
    simp [selected] at selectedCancel
  · simp_all


/-- TXC-JOIN-01 forbids ordinary tokens in the owner pinned by active compensation. -/
theorem transactionTriggerOwnerLive_refuses_owned_token
    (state : RuntimeState) (trigger : CompensationTriggerExecution) (token : ControlToken)
    (member : token ∈ state.tokens) (owned : token.owner = trigger.owner) :
    transactionTriggerOwnerLive state trigger = false := by
  have present : (state.tokens.any fun candidate => candidate.owner == trigger.owner) = true :=
    List.any_eq_true.mpr ⟨token, member, by simp [owned]⟩
  unfold transactionTriggerOwnerLive
  split <;> simp [scopeQuiescent, present]

/-- The old unrestricted token frame fails even for one inserted token at the pinned owner. -/
theorem transactionTriggerOwnerLive_addToken_counterexample
    (state : RuntimeState) (trigger : CompensationTriggerExecution) (place : ControlPlaceId)
    (live : transactionTriggerOwnerLive state trigger = true) :
    transactionTriggerOwnerLive
        { state with tokens := addToken state.tokens place trigger.owner } trigger ≠
      transactionTriggerOwnerLive state trigger := by
  rw [transactionTriggerOwnerLive_refuses_owned_token _ trigger
    { placeId := place, owner := trigger.owner }
    (by simp [addToken, mem_canonicalInsertBy]) rfl, live]
  decide +kernel

/-- Only produced tokens need separation: removal cannot introduce work into a quiescent owner. -/
def TokenPatch.SeparatesActiveCancelOwners
    (patch : TokenPatch) (program : Program) (state : RuntimeState) : Prop :=
  match program.compensationExecution with
  | none => True
  | some declaration =>
      match program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) with
      | [.cancelTransaction ..] =>
          ∀ trigger ∈ state.compensationTriggers, trigger.lifecycle = .active →
            ∀ place ∈ patch.produced, patch.owner ≠ trigger.owner
      | _ => True

theorem TokenPatch.separatesActiveCancelOwners_of_root
    (patch : TokenPatch) (program : Program) (state : RuntimeState)
    (domain : RootCompensationExecutionDomain program) :
    patch.SeparatesActiveCancelOwners program state := by
  unfold TokenPatch.SeparatesActiveCancelOwners
  cases present : program.compensationExecution with
  | none => trivial
  | some declaration =>
      simp only
      split
      · rename_i id origin scope input output boundary selected
        have member : .cancelTransaction id origin scope input output boundary ∈ program.operations := by
          have filtered : .cancelTransaction id origin scope input output boundary ∈
              program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) := by
            rw [selected]
            exact List.mem_singleton_self _
          exact (List.mem_filter.mp filtered).1
        exact False.elim (domain _ member)
      · trivial

private theorem addTokens_preserves_owner_absence (tokens : List ControlToken)
    (places : List ControlPlaceId) (insertOwner owner : ScopeOccurrenceId)
    (absent : (tokens.any fun token => token.owner == owner) = false)
    (separated : ∀ place ∈ places, insertOwner ≠ owner) :
    ((addTokens tokens places insertOwner).any fun token => token.owner == owner) = false := by
  induction places with
  | nil => exact absent
  | cons place rest ih =>
      apply List.any_eq_false.mpr
      intro token member
      change token ∈ canonicalInsertBy controlTokenBefore
        { placeId := place, owner := insertOwner } (addTokens tokens rest insertOwner) at member
      rcases (mem_canonicalInsertBy _ _ _ _).mp member with inserted | retained
      · subst token
        simpa only [beq_iff_eq] using separated place (by simp)
      · exact List.any_eq_false.mp
          (ih (fun place member => separated place (by simp [member]))) token retained

theorem TokenPatch.preserves_owner_absence (tokens : List ControlToken) (patch : TokenPatch)
    (owner : ScopeOccurrenceId)
    (absent : (tokens.any fun token => token.owner == owner) = false)
    (separated : ∀ place ∈ patch.produced, patch.owner ≠ owner) :
    ((patch.apply tokens).any fun token => token.owner == owner) = false := by
  apply addTokens_preserves_owner_absence _ _ _ _ ?_ separated
  apply List.any_eq_false.mpr
  intro token member
  exact List.any_eq_false.mp absent token
    ((removeTokens_sublist tokens patch.consumed patch.owner).subset member)

theorem TokenPatch.preserves_scopeQuiescent (state : RuntimeState) (patch : TokenPatch)
    (owner : ScopeOccurrenceId) (quiet : scopeQuiescent state owner = true)
    (separated : ∀ place ∈ patch.produced, patch.owner ≠ owner) :
    scopeQuiescent { state with tokens := patch.apply state.tokens } owner = true := by
  have absent : (state.tokens.any fun token => token.owner == owner) = false := by
    simp only [scopeQuiescent, Bool.and_eq_true, Bool.not_eq_true'] at quiet
    exact quiet.1.1.1.1.1.1.1.1.1.1
  have preserved := patch.preserves_owner_absence state.tokens owner absent separated
  simpa only [scopeQuiescent, preserved, absent] using quiet

theorem TokenPatch.preserves_transactionTriggerOwnerLive
    (state : RuntimeState) (patch : TokenPatch) (trigger : CompensationTriggerExecution)
    (live : transactionTriggerOwnerLive state trigger = true)
    (separated : ∀ place ∈ patch.produced, patch.owner ≠ trigger.owner) :
    transactionTriggerOwnerLive { state with tokens := patch.apply state.tokens } trigger = true := by
  unfold transactionTriggerOwnerLive at live ⊢
  split at live
  · rename_i occurrence parent selected
    simp only [selected]
    apply Bool.and_eq_true_iff.mpr
    exact ⟨(Bool.and_eq_true_iff.mp live).1,
      patch.preserves_scopeQuiescent _ trigger.owner (Bool.and_eq_true_iff.mp live).2 separated⟩
  · contradiction

/-- TXC-JOIN-01's retained identity evidence is independent of ordinary token storage. -/
theorem TokenPatch.transaction_provenance_frame
    (state : RuntimeState) (patch : TokenPatch) (trigger : CompensationTriggerExecution) :
    transactionTriggerProvenanceValid { state with tokens := patch.apply state.tokens } trigger =
      transactionTriggerProvenanceValid state trigger := rfl

theorem TokenPatch.succeeded_transaction_lifecycle_frame
    (state : RuntimeState) (patch : TokenPatch) (trigger : CompensationTriggerExecution)
    (succeeded : trigger.lifecycle = .succeeded) :
    triggerLifecycleValid true { state with tokens := patch.apply state.tokens } trigger =
      triggerLifecycleValid true state trigger := by
  simp only [triggerLifecycleValid, succeeded, transaction_provenance_frame]

/-- Restoring only tokens recovers the entire predecessor, including every identity counter. -/
theorem TokenPatch.compensation_state_frame (state : RuntimeState) (patch : TokenPatch) :
    { { state with tokens := patch.apply state.tokens } with tokens := state.tokens } = state := rfl

private theorem TokenPatch.preserves_triggerLifecycleValid
    (state : RuntimeState) (patch : TokenPatch) (transaction : Bool)
    (trigger : CompensationTriggerExecution)
    (valid : triggerLifecycleValid transaction state trigger = true)
    (separated : transaction = true → trigger.lifecycle = .active →
      ∀ place ∈ patch.produced, patch.owner ≠ trigger.owner) :
    triggerLifecycleValid transaction { state with tokens := patch.apply state.tokens } trigger = true := by
  cases transaction with
  | false => simpa [triggerLifecycleValid] using valid
  | true =>
      cases lifecycle : trigger.lifecycle with
      | active =>
          have live : transactionTriggerOwnerLive state trigger = true := by
            simp only [triggerLifecycleValid, lifecycle, Bool.not_true, Bool.false_or,
              Bool.and_eq_true, ite_true] at valid
            exact valid.2.1.1.2
          have preserved := patch.preserves_transactionTriggerOwnerLive state trigger live
            (separated rfl lifecycle)
          simpa only [triggerLifecycleValid, lifecycle, transaction_provenance_frame,
            preserved, live] using valid
      | succeeded =>
          simpa only [patch.succeeded_transaction_lifecycle_frame state trigger lifecycle] using valid
      | failed =>
          simpa only [triggerLifecycleValid, lifecycle, transaction_provenance_frame] using valid

/-- TXC-FRAME-01 preserves actual validation from predecessor validity and produced-owner separation. -/
theorem TokenPatch.preserves_compensationExecutionStateValid
    (program : Program) (state : RuntimeState) (patch : TokenPatch)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (valid : compensationExecutionStateValid program state = true)
    (separated : patch.SeparatesActiveCancelOwners program state) :
    compensationExecutionStateValid program { state with tokens := patch.apply state.tokens } = true := by
  apply compensationExecutionStateValid_running_tokens_of_matches
    program state _ instanceId running valid
  intro declaration present trigger member
  have matching := compensationExecutionStateValid_trigger program state declaration present valid trigger member
  unfold triggerMatchesDeclaration at matching ⊢
  split at matching
  · rename_i id origin scope input output selected
    simp only
    have lifecycle := (Bool.and_eq_true_iff.mp matching).2
    have preserved := patch.preserves_triggerLifecycleValid state false trigger lifecycle
      (by simp)
    simpa only [Bool.and_eq_true, lifecycle, preserved, and_true] using matching
  · rename_i id origin scope input output boundary selected
    simp only
    have lifecycle := (Bool.and_eq_true_iff.mp matching).2
    have preserved := patch.preserves_triggerLifecycleValid state true trigger lifecycle (by
      intro _ active
      have owners := separated
      simp only [TokenPatch.SeparatesActiveCancelOwners, present, selected] at owners
      exact owners trigger member active)
    simpa only [Bool.and_eq_true, lifecycle, preserved, and_true] using matching
  · contradiction

/-- An active Cancel trigger's validity entails quiescence after masking that trigger alone. -/
theorem compensationExecutionStateValid_active_cancel_quiescent
    (program : Program) (state : RuntimeState) (declaration : CompensationExecutionDeclaration)
    (present : program.compensationExecution = some declaration)
    (valid : compensationExecutionStateValid program state = true)
    (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
    (input output : ControlPlaceId) (boundary : NodeId)
    (selected : program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) =
      [.cancelTransaction id origin scope input output boundary])
    (trigger : CompensationTriggerExecution) (member : trigger ∈ state.compensationTriggers)
    (active : trigger.lifecycle = .active) :
    scopeQuiescent { state with compensationTriggers :=
      state.compensationTriggers.filter (fun candidate => candidate.id != trigger.id) }
      trigger.owner = true := by
  have matching := compensationExecutionStateValid_trigger program state declaration present valid trigger member
  simp only [triggerMatchesDeclaration, selected, Bool.and_eq_true] at matching
  have lifecycle := matching.2
  simp only [triggerLifecycleValid, active, Bool.not_true, Bool.false_or,
    Bool.and_eq_true, ite_true] at lifecycle
  have live := lifecycle.2.1.1.2
  unfold transactionTriggerOwnerLive at live
  split at live
  · exact (Bool.and_eq_true_iff.mp live).2
  · contradiction

/-- TXC-JOIN-01 excludes an active Cancel owner wherever local control already has a token. -/
theorem TokenPatch.separatesActiveCancelOwners_of_owned_token
    (patch : TokenPatch) (program : Program) (state : RuntimeState)
    (valid : compensationExecutionStateValid program state = true)
    (token : ControlToken) (member : token ∈ state.tokens) (owned : token.owner = patch.owner) :
    patch.SeparatesActiveCancelOwners program state := by
  unfold TokenPatch.SeparatesActiveCancelOwners
  cases present : program.compensationExecution with
  | none => trivial
  | some declaration =>
      simp only
      split
      · rename_i id origin scope input output boundary selected
        intro trigger triggerMember active place produced sameOwner
        have quiet := compensationExecutionStateValid_active_cancel_quiescent
          program state declaration present valid id origin scope input output boundary
          selected trigger triggerMember active
        have tokenPresent : (state.tokens.any fun candidate => candidate.owner == trigger.owner) = true :=
          List.any_eq_true.mpr ⟨token, member, by simp [owned, sameOwner]⟩
        simp [scopeQuiescent, tokenPresent] at quiet
      · trivial

/-- A token inserted into a valid active Cancel owner invalidates the complete validator. -/
theorem compensationExecutionStateValid_active_cancel_addToken_invalid
    (program : Program) (state : RuntimeState) (declaration : CompensationExecutionDeclaration)
    (present : program.compensationExecution = some declaration)
    (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
    (input output : ControlPlaceId) (boundary : NodeId)
    (selected : program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) =
      [.cancelTransaction id origin scope input output boundary])
    (trigger : CompensationTriggerExecution) (member : trigger ∈ state.compensationTriggers)
    (active : trigger.lifecycle = .active) (place : ControlPlaceId) :
    compensationExecutionStateValid program
      { state with tokens := addToken state.tokens place trigger.owner } = false := by
  apply Bool.eq_false_iff.mpr
  intro valid
  have quiet := compensationExecutionStateValid_active_cancel_quiescent program _ declaration
    present valid id origin scope input output boundary selected trigger member active
  have tokenPresent : ((addToken state.tokens place trigger.owner).any
      fun token => token.owner == trigger.owner) = true := by
    apply List.any_eq_true.mpr
    exact ⟨{ placeId := place, owner := trigger.owner },
      by simp [addToken, mem_canonicalInsertBy], by simp⟩
  simp [scopeQuiescent, tokenPresent] at quiet

theorem TokenPatch.active_cancel_owned_production_not_separated
    (program : Program) (state : RuntimeState) (patch : TokenPatch)
    (declaration : CompensationExecutionDeclaration)
    (present : program.compensationExecution = some declaration)
    (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
    (input output : ControlPlaceId) (boundary : NodeId)
    (selected : program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) =
      [.cancelTransaction id origin scope input output boundary])
    (trigger : CompensationTriggerExecution) (member : trigger ∈ state.compensationTriggers)
    (active : trigger.lifecycle = .active) (place : ControlPlaceId)
    (produced : place ∈ patch.produced) (owned : patch.owner = trigger.owner) :
    ¬ patch.SeparatesActiveCancelOwners program state := by
  intro separated
  simp only [TokenPatch.SeparatesActiveCancelOwners, present, selected] at separated
  exact separated trigger member active place produced owned

end BpmnSemantics.SemanticProcess
