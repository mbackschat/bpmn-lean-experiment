import BpmnSemantics.SemanticProcess.InternalRegionalPairControlFrame
import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlPairPublication

/-! Actual regional execution supplies the field updates and token actions used by the pair consumer. The facts follow from complete preparation rather than an assumed successor shape. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedRegional_control_preserved_of_no_write (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after)
    (noWrite : .ordinary (.runtimeControl hosting) ∉ prepared.footprint.writes) :
    after.control = before.control := by
  exact (preparedRegional_control_filters program before after hosting operation prepared valid running found applied
    (fun _ => false) (fun _ => false) (fun _ => false)
    (by intros; contradiction) (by intros; contradiction) (by intros; contradiction)
    (by intros; rfl) noWrite).1

private theorem completion_update (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId)
    (selected : InternalRegionalSelection) (withdrawal : InternalCompletionWithdrawal)
    (running : before.control = .running hosting) (afterRunning : after.control = .running hosting)
    (found : selectInternalRegional? program before (.completeScope id origin definition output) = some selected)
    (kind : selected.kind = .completing withdrawal)
    (fired : completeSelectedScope? program before definition output = some after) :
    match (generalizing := false) selected.root.parent, output with
    | some parent, some place =>
        let completed := { before with
          tokens := addToken before.tokens place parent
          scopeOccurrences := before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ selected.root.id)) }
        match (generalizing := false) withdrawal with
        | .unbounded => after = completed
        | .bounded record deadline => after = { completed with
            timerWaits := before.timerWaits.erase deadline
            activityOccurrences := before.activityOccurrences.filter (fun candidate => !decide (candidate.body = record.body)) }
        | .monitored record deadline => after = { completed with
            timerWaits := removeMonitoredScopeTimer before.timerWaits deadline
            activityOccurrences := before.activityOccurrences.erase record }
    | _, _ => False := by
  obtain ⟨chosen, chosenKind, census⟩ := regionalSelection_complete_census program before id origin definition output selected found
  have sameKind : chosen = withdrawal := by simpa using chosenKind.symm.trans kind
  subst chosen
  have withdrawn := regionalSelection_completion_withdrawal program before id origin definition output selected withdrawal found kind
  obtain ⟨ordinary, ordinaryFound, control, _⟩ := completeSelectedScope_position_fields program before after definition output fired
  have update := (completeScopeState_selected_update before ordinary definition output selected.root census ordinaryFound).2
  obtain ⟨actual, actualFired, refinement⟩ := subscribedWithdrawal_refines program before ordinary definition output withdrawal withdrawn ordinaryFound
  have same : actual = after := Option.some.inj (actualFired.symm.trans fired)
  subst actual
  cases parent : selected.root.parent <;> cases output with
  | none =>
      simp only [parent, running] at update
      first
      | contradiction
      | (split at update
         · contradiction
         · cases update; simp_all)
  | some place =>
      simp only [parent, running] at update
      first
      | contradiction
      | (split at update
         · cases update
           cases withdrawal <;> simpa only [parent, running] using refinement
         · contradiction)

/-- The evaluator's exact four regional rewrites, including bounded withdrawal, follow
from full preparation. A running successor excludes hosting-root completion. -/
theorem preparedRegional_execution_fields (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting) (afterRunning : after.control = .running hosting)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after) :
    match (generalizing := false) operation, prepared.selection.kind with
    | .returnProcess _ _ _ _ output, .returning record =>
        after = { removeCalledProcessTree before record with tokens := addToken before.tokens output record.caller }
    | .completeScope _ _ _ output, .completing withdrawal =>
        match (generalizing := false) prepared.selection.root.parent, output with
        | some parent, some place =>
            let completed := { before with
              tokens := addToken before.tokens place parent
              scopeOccurrences := before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ prepared.selection.root.id)) }
            match (generalizing := false) withdrawal with
            | .unbounded => after = completed
            | .bounded record deadline => after = { completed with
                timerWaits := before.timerWaits.erase deadline
                activityOccurrences := before.activityOccurrences.filter (fun candidate => !decide (candidate.body = record.body)) }
            | .monitored record deadline => after = { completed with
                timerWaits := removeMonitoredScopeTimer before.timerWaits deadline
                activityOccurrences := before.activityOccurrences.erase record }
        | _, _ => False
    | .throwError _ _ _ _ handler, .interrupting parent =>
        after = interruptScope before prepared.selection.root.id parent handler.output
    | .terminateScope .., .terminating =>
        after = { cancelScopeSubtree before prepared.selection.root.id .retain with endOccurrences := before.endOccurrences + 1 }
    | _, _ => False := by
  have facts := prepareInternalRegional_facts program before operation prepared found
  have selected := (ownershipClosedSelection_facts program before operation prepared.selection facts.2.2.2.1).1
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before operation prepared found
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  cases operation with
  | returnProcess id origin process definition output =>
      obtain ⟨returned, record, root, returnedApplied, kind, _, _, _, _, update, _⟩ :=
        preparedReturn_quiescent_fields program before hosting id origin process definition output prepared valid found
      have sameReturned : returned = after := Option.some.inj (returnedApplied.symm.trans applied)
      rw [sameReturned] at update
      simpa only [kind] using update
  | completeScope id origin definition output =>
      obtain ⟨withdrawal, kind, _⟩ := regionalSelection_complete_census program before id origin definition output prepared.selection selected
      simp only [kind]
      apply completion_update program before after hosting id origin definition output prepared.selection withdrawal running afterRunning selected kind
      simp only [fire?, facts.1] at fired
      exact fired
  | throwError id origin input error handler =>
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, facts.1] at fired
        exact fired
      obtain ⟨parent, kind, _, update⟩ := regionalSelection_error_execution program before after id origin input error handler prepared.selection selected raw
      simpa only [kind] using update
  | terminateScope id origin input definition =>
      obtain ⟨chosen, kind⟩ := regionalSelection_terminate_owner program before id origin input definition prepared.selection selected
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, facts.1] at fired
        exact fired
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      simp only [kind]
      exact raw.symm
  | _ => simp [selectInternalRegional?] at selected

/-- Completion withdrawals use the existing reference masks, including the monitored
Activity and any live deadline, so the exact evaluator update composes as list filtering. -/
theorem preparedCompletion_filter_update (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (definition : DefinitionScopeId) (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (withdrawal : InternalCompletionWithdrawal) (parent : ScopeOccurrenceId)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting) (afterRunning : after.control = .running hosting)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after)
    (kind : prepared.selection.kind = .completing withdrawal)
    (parentEq : prepared.selection.root.parent = some parent) :
    after = { before with
      tokens := addToken before.tokens output parent
      scopeOccurrences := before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ prepared.selection.root.id))
      timerWaits := before.timerWaits.filter (regionalSelectionReferenceRetention before prepared.selection).timer
      activityOccurrences := before.activityOccurrences.filter (regionalSelectionReferenceRetention before prepared.selection).activity } := by
  have facts := prepareInternalRegional_facts program before _ prepared found
  have selected := (ownershipClosedSelection_facts program before _ prepared.selection facts.2.2.2.1).1
  have identities : waitIdentitiesUnique before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.2.2.2.2.1
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before _ prepared found
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  have fields := regionalSelection_reference_fields program before after _ prepared.selection facts.1 identities selected fired
  have update := preparedRegional_execution_fields program before after hosting _ prepared valid running afterRunning found applied
  rw [← fields.2.2.2.2.1, ← fields.2.1]
  cases withdrawal <;> simp only [kind, parentEq] at update
  all_goals rw [update]

/-- Cancellation changes the exact fields already specified by the evaluator; the
separate token and end-count projections retain their actual successor values. -/
theorem preparedCancellation_field_update (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting) (afterRunning : after.control = .running hosting)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after)
    (cancelling : prepared.selection.kind = .terminating ∨ ∃ parent, prepared.selection.kind = .interrupting parent) :
    after = { cancelScopeSubtree before prepared.selection.root.id
      (match (generalizing := false) prepared.selection.kind with | .terminating => .retain | _ => .remove) with
        tokens := after.tokens, endOccurrences := after.endOccurrences } := by
  have update := preparedRegional_execution_fields program before after hosting operation prepared
    valid running afterRunning found applied
  rcases cancelling with kind | ⟨parent, kind⟩
  all_goals cases operation <;> simp only [kind] at update <;> try contradiction
  all_goals simp only [kind]; rw [update]
  all_goals rfl

/-- Only Terminate increments the regional end counter; the running successor excludes
hosting-root completion through the existing exact execution-fields theorem. -/
theorem preparedRegional_end_count (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting) (afterRunning : after.control = .running hosting)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after) :
    after.endOccurrences = before.endOccurrences +
      (match (generalizing := false) operation with | .terminateScope .. => 1 | _ => 0) := by
  have update := preparedRegional_execution_fields program before after hosting operation prepared
    valid running afterRunning found applied
  cases operation with
  | returnProcess id origin process definition output =>
      cases kind : prepared.selection.kind <;> simp only [kind] at update <;> try contradiction
      rw [update] <;> rfl
  | completeScope id origin definition output =>
      cases kind : prepared.selection.kind <;> simp only [kind] at update <;> try contradiction
      rename_i withdrawal
      cases parent : prepared.selection.root.parent <;> cases output <;>
        simp only [parent] at update <;> try contradiction
      cases withdrawal <;> simp only at update <;> rw [update] <;> rfl
  | throwError id origin input error handler =>
      cases kind : prepared.selection.kind <;> simp only [kind] at update <;> try contradiction
      rw [update] <;> rfl
  | terminateScope id origin input definition =>
      cases kind : prepared.selection.kind <;> simp only [kind] at update <;> try contradiction
      rw [update]
  | _ => simp at update

/-- A prepared regional operation fixes one exact token action and protects each emitted
continuation in its predecessor write footprint. Reusing the preparation reuses that action. -/
theorem preparedRegional_token_action (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (_valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (found : prepareInternalRegional? program before operation = some prepared) :
    ∃ (keep : ControlToken → Bool) (outputs : List ControlPlaceId) (owner : ScopeOccurrenceId),
      (∀ token, prepared.region.contains token.owner = false → keep token = true) ∧
      (∀ output ∈ outputs, .ordinary (.controlToken owner output) ∈ prepared.footprint.writes) ∧
      ∀ state after, runtimeStateWellFormed program hosting state = true →
        state.control = .running hosting → after.control = .running hosting →
        prepareInternalRegional? program state operation = some prepared →
        applyPreparedInternalRegional? program state prepared = some after →
        after.tokens = addTokens (state.tokens.filter keep) outputs owner := by
  have facts := prepareInternalRegional_facts program before operation prepared found
  have selected := (ownershipClosedSelection_facts program before operation prepared.selection facts.2.2.2.1).1
  have selectedOperation := regionalSelection_operation program before operation prepared.selection selected
  obtain ⟨base, baseFound, writes⟩ := regional_footprint_base before hosting prepared.selection prepared.region
    prepared.footprint running facts.2.2.2.2.2.1
  have trueFilter (tokens : List ControlToken) : tokens.filter (fun _ => true) = tokens :=
    List.filter_eq_self.mpr (by intros; rfl)
  have cancellationTokens (state : RuntimeState)
      (stateValid : runtimeStateWellFormed program hosting state = true)
      (stateRunning : state.control = .running hosting)
      (stateFound : prepareInternalRegional? program state operation = some prepared)
      (disposition : SelectedScopeDisposition) :
      (cancelScopeSubtree state prepared.selection.root.id disposition).tokens =
        state.tokens.filter (fun token => !prepared.region.contains token.owner) := by
    have position : runtimePositionValid program hosting state = true := by
      simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at stateValid
      exact stateValid.1
    exact cancelScopeSubtree_tokens_eq_prepared_region program state hosting hosting position stateRunning
      prepared.selection.root.id prepared.region
      (prepareInternalRegional_facts program state operation prepared stateFound).2.2.2.2.1 disposition
  simp only [regionalBaseFootprint?, selectedOperation] at baseFound
  cases operation with
  | returnProcess id origin process definition output =>
      cases kind : prepared.selection.kind <;> simp only [kind] at baseFound <;> try contradiction
      rename_i record
      cases baseFound
      refine ⟨(fun _ => true), [output], record.caller, by intros; rfl, ?_, ?_⟩
      · intro place member
        have same := List.mem_singleton.mp member
        subst place
        exact writes _ (by simp)
      · intro state after stateValid stateRunning afterRunning stateFound applied
        have update := preparedRegional_execution_fields program state after hosting _ prepared
          stateValid stateRunning afterRunning stateFound applied
        simp only [kind] at update
        rw [update, trueFilter] <;> rfl
  | completeScope id origin definition output =>
      cases kind : prepared.selection.kind <;> simp only [kind] at baseFound <;> try contradiction
      rename_i withdrawal
      cases parentEq : prepared.selection.root.parent with
      | none =>
          cases output with
          | none =>
              refine ⟨(fun _ => true), [], prepared.selection.root.id, by intros; rfl,
                by intros; contradiction, ?_⟩
              intro state after stateValid stateRunning afterRunning stateFound applied
              have update := preparedRegional_execution_fields program state after hosting _ prepared
                stateValid stateRunning afterRunning stateFound applied
              simp only [kind, parentEq] at update
          | some output => simp only [parentEq] at baseFound; contradiction
      | some parent =>
          cases output with
          | none => simp only [parentEq] at baseFound; contradiction
          | some output =>
              simp only [parentEq] at baseFound
              cases baseFound
              refine ⟨(fun _ => true), [output], parent, by intros; rfl, ?_, ?_⟩
              · intro place member
                have same := List.mem_singleton.mp member
                subst place
                exact writes _ (by simp)
              · intro state after stateValid stateRunning afterRunning stateFound applied
                have update := preparedCompletion_filter_update program state after hosting id origin definition output
                  prepared withdrawal parent stateValid stateRunning afterRunning stateFound applied kind parentEq
                rw [update, trueFilter] <;> rfl
  | throwError id origin input error handler =>
      cases kind : prepared.selection.kind <;> simp only [kind] at baseFound <;> try contradiction
      rename_i parent
      cases baseFound
      refine ⟨(fun token => !prepared.region.contains token.owner), [handler.output], parent,
        (by intro token outside; simp only [outside, Bool.not_false]), ?_, ?_⟩
      · intro place member
        have same := List.mem_singleton.mp member
        subst place
        exact writes _ (by simp)
      · intro state after stateValid stateRunning afterRunning stateFound applied
        have update := preparedRegional_execution_fields program state after hosting _ prepared
          stateValid stateRunning afterRunning stateFound applied
        simp only [kind] at update
        rw [update]
        change addToken (cancelScopeSubtree state prepared.selection.root.id .remove).tokens handler.output parent = _
        rw [cancellationTokens state stateValid stateRunning stateFound .remove] <;> rfl
  | terminateScope id origin input definition =>
      cases kind : prepared.selection.kind <;> simp only [kind] at baseFound <;> try contradiction
      refine ⟨(fun token => !prepared.region.contains token.owner), [], prepared.selection.root.id,
        (by intro token outside; simp only [outside, Bool.not_false]), by intros; contradiction, ?_⟩
      intro state after stateValid stateRunning afterRunning stateFound applied
      have update := preparedRegional_execution_fields program state after hosting _ prepared
        stateValid stateRunning afterRunning stateFound applied
      simp only [kind] at update
      rw [update]
      exact cancellationTokens state stateValid stateRunning stateFound .retain
  | _ => simp at baseFound

theorem regional_pair_effect_populations (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after) :
    after.effectWaits.filter (fun wait => right.region.contains wait.owner) =
        before.effectWaits.filter (fun wait => right.region.contains wait.owner) ∧
      after.effectIncidents.filter (fun incident => right.region.contains incident.wait.owner) =
        before.effectIncidents.filter (fun incident => right.region.contains incident.wait.owner) := by
  have leftFacts := prepareInternalRegional_facts program before leftOperation left leftFound
  have rightFacts := prepareInternalRegional_facts program before rightOperation right rightFound
  have selected := (ownershipClosedSelection_facts program before leftOperation left.selection leftFacts.2.2.2.1).1
  have disjoint := regional_pair_regions_disjoint before left.selection right.selection left.region right.region
    left.footprint right.footprint leftFacts.2.2.2.2.2.1 rightFacts.2.2.2.2.2.1 independent
  have filtered {α : Type} (values : List α) (owner : α → ScopeOccurrenceId) :
      (values.filter (fun value => !left.region.contains (owner value))).filter
        (fun value => right.region.contains (owner value)) =
      values.filter (fun value => right.region.contains (owner value)) := by
    apply regional_filter_retained
    intro value _ observed
    have outside : left.region.contains (owner value) = false := Bool.eq_false_iff.mpr (by
      intro inside
      exact disjoint (owner value) (List.contains_iff_mem.mp inside) (List.contains_iff_mem.mp observed))
    simp [outside]
  have cancellation (disposition : SelectedScopeDisposition) :
      (cancelScopeSubtree before left.selection.root.id disposition).effectWaits.filter
          (fun wait => right.region.contains wait.owner) =
        before.effectWaits.filter (fun wait => right.region.contains wait.owner) ∧
      (cancelScopeSubtree before left.selection.root.id disposition).effectIncidents.filter
          (fun incident => right.region.contains incident.wait.owner) =
        before.effectIncidents.filter (fun incident => right.region.contains incident.wait.owner) := by
    have fields := cancelScopeSubtree_owned_work_eq_prepared_region program before hosting hosting valid running
      left.selection.root.id left.region leftFacts.2.2.2.2.1 disposition
    rw [fields.2.1, fields.2.2.1]
    exact ⟨filtered _ _, filtered _ _⟩
  have afterRunning := (regional_pair_control_frame program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied).1.trans running
  have update := preparedRegional_execution_fields program before after hosting leftOperation left valid running afterRunning leftFound applied
  cases leftOperation with
  | returnProcess id origin process definition output =>
      obtain ⟨returned, record, root, returnedApplied, _, _, _, _, _, _, _, _, _, _, effects, incidents, _⟩ :=
        preparedReturn_quiescent_fields program before hosting id origin process definition output left valid leftFound
      have same : returned = after := Option.some.inj (returnedApplied.symm.trans applied)
      rw [same] at effects incidents
      rw [effects, incidents]
      exact ⟨rfl, rfl⟩
  | completeScope id origin definition output =>
      obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before _ left leftFound
      have same : actual = after := Option.some.inj (executed.symm.trans applied)
      subst actual
      have raw : completeSelectedScope? program before definition output = some after := by
        simp only [fire?, leftFacts.1] at fired
        exact fired
      have fields := regionalSelectedCompletion_effect_and_branch_fields program before after definition output raw
      rw [fields.1, fields.2.1]
      exact ⟨rfl, rfl⟩
  | throwError id origin input error handler =>
      cases kind : left.selection.kind <;> simp only [kind] at update
      all_goals first
      | contradiction
      | (rw [update]; exact cancellation .remove)
  | terminateScope id origin input definition =>
      cases kind : left.selection.kind <;> simp only [kind] at update
      all_goals first
      | contradiction
      | (rw [update]; exact cancellation .retain)
  | _ => simp [selectInternalRegional?] at selected

end BpmnSemantics.SemanticProcess.InternalCommutation
