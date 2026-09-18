import BpmnSemantics.SemanticProcess.InternalScopeCreationSelectionFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation

/-! Complete artifact frames preserve issuance populations and differently owned token buckets;
the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md) requires exact
footprints and numbering-free publication as well as successful selection.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem scopeCreation_any_population_frame {α : Type} (before after : List α)
    (predicate : α → Bool) (population : after.filter predicate = before.filter predicate) :
    after.any predicate = before.any predicate := by
  apply Bool.eq_iff_iff.mpr
  simp only [List.any_eq_true]
  constructor
  · rintro ⟨value, member, matched⟩
    have present := List.mem_filter.mpr ⟨member, matched⟩
    rw [population] at present
    exact ⟨value, (List.mem_filter.mp present).1, (List.mem_filter.mp present).2⟩
  · rintro ⟨value, member, matched⟩
    have present := List.mem_filter.mpr ⟨member, matched⟩
    rw [← population] at present
    exact ⟨value, (List.mem_filter.mp present).1, (List.mem_filter.mp present).2⟩

theorem scopeCreation_counter_read_frame (before after : RuntimeState)
    (selected : InternalScopeCreationSelection)
    (child : selected.kind = .child →
      after.scopeActivations.filter (fun row => decide (row.scopeId = selected.created.id.definitionScopeId)) =
        before.scopeActivations.filter (fun row => decide (row.scopeId = selected.created.id.definitionScopeId)))
    (called : ∀ record, selected.kind = .called record →
      after.callActivations.filter (fun row => decide (row.elementId.value = record.id.elementId.value)) =
        before.callActivations.filter (fun row => decide (row.elementId.value = record.id.elementId.value))) :
    internalScopeCreationCounterSafe after selected = internalScopeCreationCounterSafe before selected := by
  cases kind : selected.kind with
  | child =>
      have population := child kind
      simp only [internalScopeCreationCounterSafe, kind, population,
        scopeActivationCount_population_frame before after _ population]
  | called record =>
      have population := called record kind
      simp only [internalScopeCreationCounterSafe, kind, population,
        callActivationCount_population_frame before after ⟨record.id.elementId.value⟩ population]

theorem prepareInternalScopeCreation_read_frame (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (found : prepareInternalScopeCreation? program before operation = some prepared)
    (selection : selectInternalScopeCreation? after operation = some prepared.selection)
    (control : after.control = before.control) (time : after.logicalTimeMs = before.logicalTimeMs)
    (owner : after.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = prepared.selection.owner)) =
      before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = prepared.selection.owner)))
    (input : after.tokens.filter (fun token =>
        decide (token.placeId = prepared.selection.input && token.owner = prepared.selection.owner)) =
      before.tokens.filter (fun token =>
        decide (token.placeId = prepared.selection.input && token.owner = prepared.selection.owner)))
    (entry : after.tokens.filter (fun token =>
        decide (token.placeId = prepared.selection.entry && token.owner = prepared.selection.created.id)) =
      before.tokens.filter (fun token =>
        decide (token.placeId = prepared.selection.entry && token.owner = prepared.selection.created.id)))
    (counter : internalScopeCreationCounterSafe after prepared.selection =
      internalScopeCreationCounterSafe before prepared.selection) :
    prepareInternalScopeCreation? program after operation = some prepared := by
  obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
    _, running, snapshots, operations, ownerExact, originFound, definitionFound, checks,
    startFound, deltaFound, rfl⟩ := prepareInternalScopeCreation_facts program before operation prepared found
  dsimp only [makeInternalScopeCreationPreparation] at selection owner input entry counter
  have available : internalScopeCreationTokensAvailable after selected =
      internalScopeCreationTokensAvailable before selected := by
    have equal := congr (congrArg (fun count present =>
      decide (0 < count) && SemanticProcessJson.isSafeWireNat count && !present)
      (congrArg List.length input))
      (scopeCreation_any_population_frame before.tokens after.tokens _ entry)
    exact equal
  have checked : internalScopeCreationPredecessorChecks program after operation selected origin definition = true := by
    simpa only [internalScopeCreationPredecessorChecks, time, counter, available] using checks
  have ownerAfter := owner.trans ownerExact
  simp only [prepareInternalScopeCreation?, selection, control, running, snapshots, operations,
    originFound, definitionFound, checked, startFound, deltaFound,
    makeInternalScopeCreationPreparation, time, bind, Option.bind, ne_eq, not_true_eq_false,
    Bool.not_true, Bool.false_eq_true, ↓reduceIte]
  have ownerResult := congrArg (fun population : List RuntimeScopeOccurrence =>
    match population with
    | [record] => some (makeInternalScopeCreationPreparation before selected instanceId record start delta)
    | _ => none) ownerAfter
  exact ownerResult

theorem scopeCreation_definition_parent (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalScopeCreationSelection) (definition : DefinitionScope)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (matched : internalScopeCreationDefinitionMatches operation selected.owner definition = true) :
    definition.parentScopeId = match selected.kind with
      | .child => some selected.owner.definitionScopeId | .called _ => none := by
  unfold selectInternalScopeCreation? at selection
  obtain ⟨hosting, _, selection⟩ := Option.bind_eq_some_iff.mp selection
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨owner, _, selection⟩ := Option.bind_eq_some_iff.mp selection
      dsimp only at selection
      repeat first | contradiction | split at selection
      all_goals cases selection
      all_goals simp_all [internalScopeCreationDefinitionMatches]

end BpmnSemantics.SemanticProcess.InternalCommutation
