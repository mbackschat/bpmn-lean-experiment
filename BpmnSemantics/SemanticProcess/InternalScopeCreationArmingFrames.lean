module

import BpmnSemantics.SemanticProcess.InternalScopeCreationFootprintFrames
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
public import BpmnSemantics.SemanticProcess.InternalPreparedArming
public import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.InternalCommutation
import BpmnSemantics.SemanticProcess.InternalCommutationStateFrames
import BpmnSemantics.SemanticProcess.InternalLocalControlArmingFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationFreshness
import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparationFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationSelectionFrames
import BpmnSemantics.SemanticProcess.NestedScopeChainBridge
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.SequentialScopeRuntimeLaws
import BpmnSemantics.SemanticProcess.TokenPatchLaws
import all BpmnSemantics.SemanticProcess.ActivityDataInputOutputRuntime
import all BpmnSemantics.SemanticProcess.Data
import all BpmnSemantics.SemanticProcess.EffectDataMapping
import all BpmnSemantics.SemanticProcess.InternalCommutationCore
import all BpmnSemantics.SemanticProcess.InternalDataArmingFootprint
import all BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import all BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.InternalPreparedArming
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import all BpmnSemantics.SemanticProcess.InternalScopeCreationSelection
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.RuntimeState
import all BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.ScopeVariableData
import all BpmnSemantics.SemanticProcess.WaitActivation
import all BpmnSemantics.StrictJson
meta import BpmnSemantics.PrivateEquationLemmas

/-! Mixed scope/arming frames retain the complete predecessor artifact required by the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md). Scope insertion
preserves an already-live arming owner; arbitrary absent-owner queries need not be preserved.
-/

run_meta privateEquations `BpmnSemantics.SemanticProcess #[`InternalCommutation.InternalArmingWrite.available,
  `InternalCommutation.InternalScopeCreationSelection.apply, `InternalCommutation.PreparedInternalArming.apply,
  `InternalCommutation.PreparedInternalArming.scopeFramePatch, `InternalCommutation.applyInternalArmingPatch,
  `InternalCommutation.applyInternalDataArmingPatch, `InternalCommutation.dataArmingHostValid,
  `InternalCommutation.footprintOfPatch, `InternalCommutation.internalArmInput?,
  `InternalCommutation.internalArmOrigin?, `InternalCommutation.localControlStateFootprintsNonInterfering,
  `InternalCommutation.makeInternalDataArmingPatch, `InternalCommutation.openWaitAnchorAbsent,
  `InternalCommutation.openWaitAnchors, `InternalCommutation.prepareInternalArm?,
  `InternalCommutation.prepareInternalDataArmingContract?, `InternalCommutation.scopedEffectInputReads?,
  `NestedScopeData.evaluateFrame?, `NestedScopeData.occurrenceChain, `NestedScopeData.occurrenceChainWithin,
  `NestedScopeData.occurrenceWithParent?, `NestedScopeData.readSet?, `canonicalStateAtomSet,
  `InternalCommutation.internalDeclaredEntryFootprint,
  `dataInputOutputActivityRecord, `dataInputOutputRunningInstance?, `effectActivationCount, `evaluateEffectInputs?,
  `evaluateInputMappingsInOrderUnder, `evaluateInputMappingsUnder?, `evaluateSequentialScopeInputs?,
  `messageActivationCount, `readSequentialScopeVariable?, `sequentialScopeBindingForEntry?,
  `sequentialScopeBindingForOwner?, `activationCount, `activityActivationCount, `callActivationCount,
  `canonicalInsertBy, `insertScopeOccurrence, `onlyTokenOwner?, `scopeActivationCount, `timerActivationCount]

public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem scopeArming_input_read (arm : PreparedInternalArming) :
    .tokenOwners arm.scopeFramePatch.input ∈ arm.stateFootprint.reads := by
  cases arm with
  | ordinary operation patch => exact tokenOwners_mem_footprint_reads patch
  | data contract patch =>
      exact ordinary_reads_subset_data_reads contract patch (tokenOwners_mem_footprint_reads patch.arm)

theorem scopeArming_input_write (arm : PreparedInternalArming) :
    .tokenOwners arm.scopeFramePatch.input ∈ arm.stateFootprint.writes := by
  cases arm with
  | ordinary operation patch => exact tokenOwners_mem_footprint_writes patch
  | data contract patch =>
      exact ordinary_writes_subset_data_writes contract patch (tokenOwners_mem_footprint_writes patch.arm)

theorem scopeArming_token_write (arm : PreparedInternalArming) :
    .controlToken arm.scopeFramePatch.owner arm.scopeFramePatch.input ∈ arm.stateFootprint.writes := by
  have ordinary (patch : InternalArmingPatch) :
      .controlToken patch.owner patch.input ∈ (footprintOfPatch patch).writes := by
    simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]
  cases arm with
  | ordinary operation patch => exact ordinary patch
  | data contract patch => exact ordinary_writes_subset_data_writes contract patch (ordinary patch.arm)

theorem scopeArming_scope_read_projections (state : RuntimeState) (arm : PreparedInternalArming) :
    (arm.apply state).control = state.control ∧
      (arm.apply state).logicalTimeMs = state.logicalTimeMs ∧
      (arm.apply state).scopeOccurrences = state.scopeOccurrences ∧
      (arm.apply state).calledProcessOccurrences = state.calledProcessOccurrences ∧
      (arm.apply state).scopeActivations = state.scopeActivations ∧
      (arm.apply state).callActivations = state.callActivations ∧
      (arm.apply state).tokens = removeToken state.tokens arm.scopeFramePatch.input arm.scopeFramePatch.owner := by
  cases arm with
  | ordinary operation patch =>
      cases write : patch.write <;>
        simp [PreparedInternalArming.apply, PreparedInternalArming.scopeFramePatch,
          applyInternalArmingPatch, write]
  | data contract patch =>
      cases write : patch.arm.write <;>
        simp [PreparedInternalArming.apply, PreparedInternalArming.scopeFramePatch,
          applyInternalDataArmingPatch, applyInternalArmingPatch, write]

theorem scopeArming_untouched_input (selected : InternalScopeCreationSelection)
    (instanceId : SemanticId) (owner : RuntimeScopeOccurrence) (arm : PreparedInternalArming)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint selected instanceId owner) arm.stateFootprint = true) :
    selected.input ≠ arm.scopeFramePatch.input ∧ selected.entry ≠ arm.scopeFramePatch.input := by
  have distinct (place : ControlPlaceId) (member : place ∈ [selected.input, selected.entry]) :
      place ≠ arm.scopeFramePatch.input := by
    intro same
    have written := scopeCreation_census_write selected instanceId owner place member
    rw [same] at written
    simp only [localControlStateFootprintsNonInterfering, Bool.and_eq_true] at separated
    exact not_mem_right_of_listsDisjoint _ _ separated.1.1.1 _ written (scopeArming_input_read arm)
  exact ⟨distinct _ (by simp), distinct _ (by simp)⟩

/-! Inserting an occurrence whose identity no live occurrence carries keeps every occurrence chain that
already resolves, because each visited link is a live identity (CSD-CHAIN-01), so a nested read that
succeeded before a scope creation reads the same value after it. -/

private theorem occurrenceChainWithin_insert_fresh (occurrences : List RuntimeScopeOccurrence) (created : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ occurrences, occurrence.id ≠ created.id) :
    ∀ (fuel : Nat) (owner : ScopeOccurrenceId) (chain : List ScopeOccurrenceId),
      NestedScopeData.occurrenceChainWithin occurrences fuel owner = some chain →
      NestedScopeData.occurrenceChainWithin (insertScopeOccurrence created occurrences) fuel owner = some chain
  | 0, _, _, walked => by simp [NestedScopeData.occurrenceChainWithin] at walked
  | fuel + 1, owner, chain, walked => by
      unfold NestedScopeData.occurrenceChainWithin at walked ⊢
      cases filtered : occurrences.filter (·.id == owner) with
      | nil => simp [filtered] at walked
      | cons occurrence rest =>
          cases rest with
          | cons _ _ => simp [filtered] at walked
          | nil =>
              have member : occurrence ∈ occurrences.filter (·.id == owner) := by simp [filtered]
              obtain ⟨present, same⟩ := List.mem_filter.mp member
              have differs : (created.id == owner) = false := by
                simp only [beq_iff_eq] at same
                simp only [beq_eq_false_iff_ne]
                intro equal
                exact fresh occurrence present (same.trans equal.symm)
              rw [insertScopeOccurrence, filter_canonicalInsertBy_rejected scopeOccurrenceBefore (fun scope => scope.id == owner)
                created occurrences differs, filtered]
              simp only [filtered] at walked
              cases parent : occurrence.parent with
              | none => simpa [parent] using walked
              | some parentId =>
                  simp only [parent] at walked ⊢
                  obtain ⟨tail, rest, rfl⟩ := Option.map_eq_some_iff.mp walked
                  have inserted := occurrenceChainWithin_insert_fresh occurrences created fresh fuel parentId tail rest
                  simp only [insertScopeOccurrence] at inserted
                  simp [inserted]

private theorem occurrenceChain_insert_fresh (occurrences : List RuntimeScopeOccurrence) (created : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ occurrences, occurrence.id ≠ created.id)
    (owner : ScopeOccurrenceId) (chain : List ScopeOccurrenceId)
    (chained : NestedScopeData.occurrenceChain occurrences owner = some chain) :
    NestedScopeData.occurrenceChain (insertScopeOccurrence created occurrences) owner = some chain := by
  have inserted := occurrenceChainWithin_insert_fresh occurrences created fresh _ owner chain chained
  have grown := NestedScopeData.occurrenceChainWithin_mono (insertScopeOccurrence created occurrences) occurrences.length 1
    owner chain inserted
  have length : ∀ values : List RuntimeScopeOccurrence,
      (insertScopeOccurrence created values).length = values.length + 1 := by
    intro values
    induction values with
    | nil => rfl
    | cons current rest grown =>
        simp only [insertScopeOccurrence, canonicalInsertBy] at grown ⊢
        split <;> simp [grown]
  simpa [NestedScopeData.occurrenceChain, length occurrences] using grown

/-- A nested read that succeeded before a fresh occurrence is inserted reads the same value after it. -/
private theorem read?_insert_fresh (occurrences : List RuntimeScopeOccurrence) (program : Program) (variables : ScopedVariables) (created : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ occurrences, occurrence.id ≠ created.id) (reader : ScopeOccurrenceId)
    (name : String) (value : VariableValue) (found : NestedScopeData.read? program occurrences variables reader name = some value) :
    NestedScopeData.read? program (insertScopeOccurrence created occurrences) variables reader name = some value := by
  unfold NestedScopeData.read? at found ⊢
  cases chained : NestedScopeData.occurrenceChain occurrences reader with
  | none => simp [chained] at found
  | some chain =>
      simpa [occurrenceChain_insert_fresh occurrences created fresh reader chain chained, chained] using found

/-- Input evaluation consults its reader only on enclosing names, so a reader that returns every earlier
present value again yields the same snapshot. -/
private theorem evaluateInputMappingsInOrderUnder_of_widened (policy : EffectMappingValuePolicy)
    (before after : String → Option VariableValue)
    (widened : ∀ name value, before name = some value → after name = some value) :
    ∀ (mappings : List VariableMapping) (bindings : List VariableBinding),
      evaluateInputMappingsInOrderUnder policy before mappings = some bindings →
      evaluateInputMappingsInOrderUnder policy after mappings = some bindings
  | [], _, evaluated => evaluated
  | mapping :: rest, bindings, evaluated => by
      have tailOf := evaluateInputMappingsInOrderUnder_of_widened policy before after widened rest
      cases expression : mapping.expression with
      | stringLiteral literal =>
          simp only [evaluateInputMappingsInOrderUnder, expression] at evaluated ⊢
          cases restValue : evaluateInputMappingsInOrderUnder policy before rest with
          | none => simp [restValue] at evaluated
          | some tail =>
              simp only [restValue] at evaluated
              simp [tailOf tail restValue, ← evaluated]
      | enclosingVariable name =>
          simp only [evaluateInputMappingsInOrderUnder, expression] at evaluated ⊢
          cases read : inputLookupUnder? policy before name with
          | none => simp [read] at evaluated
          | some value =>
              have readAfter : inputLookupUnder? policy after name = some value := by
                unfold inputLookupUnder? at read ⊢
                obtain ⟨raw, found, admitted⟩ := Option.bind_eq_some_iff.mp read
                exact Option.bind_eq_some_iff.mpr ⟨raw, widened _ _ found, admitted⟩
              cases restValue : evaluateInputMappingsInOrderUnder policy before rest with
              | none => simp [read, restValue] at evaluated
              | some tail =>
                  simp only [read, restValue] at evaluated
                  simp [readAfter, tailOf tail restValue, ← evaluated]
      | localVariable _ => simp [evaluateInputMappingsInOrderUnder, expression] at evaluated

private theorem evaluateInputMappingsUnder?_of_widened (policy : EffectMappingValuePolicy)
    (before after : String → Option VariableValue)
    (widened : ∀ name value, before name = some value → after name = some value)
    (mappings : List VariableMapping) (bindings : List VariableBinding)
    (evaluated : evaluateInputMappingsUnder? policy before mappings = some bindings) :
    evaluateInputMappingsUnder? policy after mappings = some bindings := by
  simp only [evaluateInputMappingsUnder?, bind, Option.bind_eq_some_iff] at evaluated ⊢
  obtain ⟨ordered, canonical, evaluated⟩ := evaluated
  exact ⟨ordered, canonical, evaluateInputMappingsInOrderUnder_of_widened policy before after widened ordered bindings evaluated⟩

/-- CSD-PREPARE-01: a frame evaluated before a fresh occurrence's insertion evaluates the same after it,
because its reads walk only live links (CSD-CHAIN-01) and the data is unchanged. -/
theorem evaluateFrame?_insert_fresh (program : Program) (state after : RuntimeState)
    (created : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ created.id)
    (occurrences : after.scopeOccurrences = insertScopeOccurrence created state.scopeOccurrences)
    (variables : after.variables = state.variables)
    (record : ScopeLocalData) (child parent : ScopeOccurrenceId) (frame : ScopeVariableScope)
    (evaluated : NestedScopeData.evaluateFrame? program state record child parent = some frame) :
    NestedScopeData.evaluateFrame? program after record child parent = some frame := by
  simp only [NestedScopeData.evaluateFrame?, Option.bind_eq_bind, Option.bind_eq_some_iff] at evaluated ⊢
  obtain ⟨bindings, evaluatedBindings, framed⟩ := evaluated
  refine ⟨bindings, ?_, by rw [variables]; exact framed⟩
  rw [occurrences, variables]
  exact evaluateInputMappingsUnder?_of_widened _ _ _
    (fun name value read => read?_insert_fresh _ program _ created fresh parent name value read) _ _ evaluatedBindings

private theorem find?_insert_fresh (occurrences : List RuntimeScopeOccurrence) (created : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ occurrences, occurrence.id ≠ created.id) (id : ScopeOccurrenceId)
    (live : ∃ occurrence ∈ occurrences, occurrence.id = id) :
    (insertScopeOccurrence created occurrences).find? (·.id == id) = occurrences.find? (·.id == id) := by
  obtain ⟨occurrence, present, same⟩ := live
  rw [← List.head?_filter, ← List.head?_filter, insertScopeOccurrence,
    filter_canonicalInsertBy_rejected _ _ created occurrences
      (by simpa only [beq_eq_false_iff_ne, ← same] using Ne.symm (fresh occurrence present))]

/-- CSD-PREPARE-01: a read set taken before a fresh occurrence's insertion is the read set after it, because
its chain and links are live identities, which the insertion keeps. -/
theorem readSet?_insert_fresh (state after : RuntimeState) (created : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ created.id)
    (occurrences : after.scopeOccurrences = insertScopeOccurrence created state.scopeOccurrences)
    (scopes : after.variables.scopes = state.variables.scopes)
    (reader : ScopeOccurrenceId) (names : List String) (reads : NestedScopeData.ReadSet)
    (read : NestedScopeData.readSet? state reader names = some reads) :
    NestedScopeData.readSet? after reader names = some reads := by
  unfold NestedScopeData.readSet? at read ⊢
  rw [occurrences, scopes]
  cases chained : NestedScopeData.occurrenceChain state.scopeOccurrences reader with
  | none => simp [chained] at read
  | some chain =>
      have live := NestedScopeData.occurrenceChain_live _ reader chain chained
      have links : ∀ ids : List ScopeOccurrenceId, (∀ id ∈ ids, ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = id) →
          ids.mapM (fun id => (insertScopeOccurrence created state.scopeOccurrences).find? (·.id == id)) =
            ids.mapM (fun id => state.scopeOccurrences.find? (·.id == id)) := by
        intro ids
        induction ids with
        | nil => intro _; rfl
        | cons id rest ih =>
            intro all
            simp only [List.mapM_cons, find?_insert_fresh _ created fresh id (all id (by simp)),
              ih (fun member inside => all member (List.mem_cons_of_mem _ inside))]
      simp only [chained, bind, Option.bind] at read
      simp only [occurrenceChain_insert_fresh _ created fresh reader chain chained, bind, Option.bind, links chain live]
      exact read

/-- The declared entry's footprint extends its control's and names the written frame on both sides. -/
theorem internalDeclaredEntryFootprint_extends (control : PreparedInternalScopeCreation)
    (reads : NestedScopeData.ReadSet) :
    control.footprint.reads ⊆ (internalDeclaredEntryFootprint control reads).reads ∧
      control.footprint.writes ⊆ (internalDeclaredEntryFootprint control reads).writes ∧
      .scopeVariableScope control.selection.created.id ∈ (internalDeclaredEntryFootprint control reads).reads ∧
      .scopeVariableScope control.selection.created.id ∈ (internalDeclaredEntryFootprint control reads).writes := by
  simp only [internalDeclaredEntryFootprint, canonicalStateAtomSet, mem_sortBy, List.mem_eraseDups,
    List.mem_append, List.mem_singleton, or_true, and_true]
  exact ⟨fun atom member => by simp [mem_sortBy, member], fun atom member => by simp [mem_sortBy, member]⟩

/-- The first live occurrence of a definition, inserted under `parent`, is that definition's unique live
occurrence. -/
theorem occurrenceWithParent?_insert_created (occurrences : List RuntimeScopeOccurrence) (state : RuntimeState)
    (created : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId)
    (scopes : state.scopeOccurrences = insertScopeOccurrence created occurrences)
    (parentOf : created.parent = some parent)
    (noneLive : (occurrences.any fun occurrence =>
      occurrence.id.definitionScopeId == created.id.definitionScopeId) = false) :
    NestedScopeData.occurrenceWithParent? state created.id.definitionScopeId = some (created.id, parent) := by
  have empty : occurrences.filter (·.id.definitionScopeId == created.id.definitionScopeId) = [] := by
    simpa [List.filter_eq_nil_iff, List.any_eq_false] using noneLive
  have perm := filter_canonicalInsertBy_perm scopeOccurrenceBefore
    (·.id.definitionScopeId == created.id.definitionScopeId) created occurrences (by simp)
  rw [empty] at perm
  have filtered : state.scopeOccurrences.filter (·.id.definitionScopeId == created.id.definitionScopeId) =
      [created] := by
    rw [scopes, insertScopeOccurrence]
    exact List.perm_singleton.mp perm
  simp only [NestedScopeData.occurrenceWithParent?, filtered, parentOf, bind, Option.bind]

/-- Scope creation keeps the arming's own snapshot: a nested read walks only live links, which a fresh
occurrence never replaces (CSD-CHAIN-01). Other mappings may differ, because a walk that failed before
the creation may resolve through the created occurrence. -/
theorem scopeCreation_effect_input_frames (program : Program) (state : RuntimeState)
    (scopeOperation : SemanticOperation) (scope : InternalScopeCreationSelection)
    (scopeFound : selectInternalScopeCreation? state scopeOperation = some scope)
    (owner : ScopeOccurrenceId) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (evaluated : (evaluateEffectInputs? program state owner effect.inputMappings).isNone = false) :
    evaluateEffectInputs? program (scope.apply state) owner effect.inputMappings =
      evaluateEffectInputs? program state owner effect.inputMappings ∧
    scopedEffectInputReads? program (scope.apply state) owner (.awaitEffect id origin input output effect route) =
      scopedEffectInputReads? program state owner (.awaitEffect id origin input output effect route) := by
  have applied : (scope.apply state).scopeOccurrences = insertScopeOccurrence scope.created state.scopeOccurrences ∧
      (scope.apply state).variables = state.variables := by
    cases kind : scope.kind <;> simp [InternalScopeCreationSelection.apply, kind]
  cases scopeSelected : sequentialScopeProgramSelected program && hasSequentialScopeDefinition program owner with
  | false =>
      constructor
      · simp only [evaluateEffectInputs?, scopeSelected, applied.1, applied.2, Bool.false_eq_true, ↓reduceIte]
          at evaluated ⊢
        cases nested : nestedScopeDataProgram program with
        | false => rfl
        | true =>
            have fresh := selectInternalScopeCreation_fresh state scopeOperation scope scopeFound
            simp only [nested, ↓reduceIte] at evaluated ⊢
            cases value : evaluateInputMappingsUnder? (programEffectMappingValuePolicy program)
                (NestedScopeData.read? program state.scopeOccurrences state.variables owner) effect.inputMappings with
            | none => simp [value] at evaluated
            | some bindings =>
                exact evaluateInputMappingsUnder?_of_widened _ _ _
                  (fun name found read => read?_insert_fresh _ program _ scope.created fresh owner name
                    found read) _ _ value
      · simp only [scopedEffectInputReads?, scopeSelected]
        rfl
  | true =>
      cases binding : sequentialScopeBindingForOwner? program state owner with
      | none =>
          simp only [evaluateEffectInputs?, scopeSelected] at evaluated
          simp [evaluateSequentialScopeInputs?, binding] at evaluated
      | some bound =>
          have afterBinding : sequentialScopeBindingForOwner? program (scope.apply state) owner = some bound := by
            have inserted := sequentialScopeBindingForOwner_insert_scope program state scope.created owner bound
              (selectInternalScopeCreation_fresh state scopeOperation scope scopeFound) binding
            cases kind : scope.kind <;> simpa only [InternalScopeCreationSelection.apply, kind, sequentialScopeBindingForOwner?,
              sequentialScopeBindingForEntry?] using inserted
          constructor
          · simp only [evaluateEffectInputs?, scopeSelected]
            simp [evaluateSequentialScopeInputs?, binding, afterBinding]
            cases kind : scope.kind <;> simp [InternalScopeCreationSelection.apply, kind, readSequentialScopeVariable?]
          · simp only [scopedEffectInputReads?, scopeSelected]
            simp [binding, afterBinding]

theorem prepared_scopeCreation_input_frames (program : Program) (state : RuntimeState)
    (scopeOperation : SemanticOperation) (scope : InternalScopeCreationSelection)
    (scopeFound : selectInternalScopeCreation? state scopeOperation = some scope)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (prepared : prepareInternalArm? program state operation = some patch) :
    (match operation with
      | .awaitEffect _ _ _ _ effect _ =>
          evaluateEffectInputs? program (scope.apply state) patch.owner effect.inputMappings =
            evaluateEffectInputs? program state patch.owner effect.inputMappings
      | _ => True) ∧
    scopedEffectInputReads? program (scope.apply state) patch.owner operation =
      scopedEffectInputReads? program state patch.owner operation := by
  cases operation <;> try exact ⟨True.intro, rfl⟩
  rename_i id origin input output effect route
  simp [prepareInternalArm?, internalArmInput?, internalArmOrigin?] at prepared
  obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  split at prepared
  · simp at prepared
  · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases controlEq : state.control <;> simp_all
    all_goals
      rcases prepared with ⟨evaluated, _, _, rfl⟩
      exact scopeCreation_effect_input_frames program state scopeOperation scope scopeFound
        owner id origin input output effect route (by
          cases value : evaluateEffectInputs? program state owner effect.inputMappings <;> simp_all)

theorem prepareInternalArm_after_scope_creation (program : Program) (state : RuntimeState)
    (operation scopeOperation : SemanticOperation) (patch : InternalArmingPatch)
    (selected : InternalScopeCreationSelection)
    (found : prepareInternalArm? program state operation = some patch)
    (scopeFound : selectInternalScopeCreation? state scopeOperation = some selected)
    (input : selected.input ≠ patch.input) (entry : selected.entry ≠ patch.input) :
    prepareInternalArm? program (selected.apply state) operation = some patch := by
  have inputFrames := prepared_scopeCreation_input_frames program state scopeOperation selected scopeFound
    operation patch found
  have inputFound := prepareInternalArm_input program state operation patch found
  have ownerFound := prepared_owner_lookup program state operation patch found
  have live := (prepared_arm_live_running program state operation patch found).1
  have liveAfter := selectInternalScopeCreation_preserves_live state scopeOperation selected
    patch.owner scopeFound live
  have ownerAfter : onlyTokenOwner? (selected.apply state) patch.input = some patch.owner := by
    simpa only [onlyTokenOwner?, scopeCreation_apply_census state selected patch.input input entry]
      using ownerFound
  unfold prepareInternalArm? at found ⊢
  simp only [inputFound, bind, Option.bind] at found ⊢
  cases originFound : internalArmOrigin? operation with
  | none => simp [originFound] at found
  | some origin =>
    simp only [originFound, ownerFound, ownerAfter, live, liveAfter] at found ⊢
    cases operation <;> simp only [inputFrames.1, inputFrames.2]
    all_goals cases kind : selected.kind <;>
      simp only [InternalScopeCreationSelection.apply, kind, activationCount,
        messageActivationCount, timerActivationCount, effectActivationCount,
        openWaitAnchorAbsent, openWaitAnchors, InternalArmingWrite.available] at found ⊢
    all_goals exact found

theorem prepareInternalDataArm_after_scope_creation (program : Program) (state : RuntimeState)
    (contract : InternalDataArmingContract) (patch : InternalDataArmingPatch)
    (scopeOperation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (found : prepareInternalDataArmingContract? program state contract = some patch)
    (scopeFound : selectInternalScopeCreation? state scopeOperation = some selected)
    (input : selected.input ≠ contract.input) (entry : selected.entry ≠ contract.input) :
    prepareInternalDataArmingContract? program (selected.apply state) contract = some patch := by
  obtain ⟨owner, inputOrigin, source, owned, running, programSelection, live, origin,
    available, declarer, absent, fresh, bodyFresh, patchEq⟩ :=
      prepareInternalDataArmingContract_facts program state contract patch found
  have liveAfter := selectInternalScopeCreation_preserves_live state scopeOperation selected
    owner scopeFound live
  have ownerAfter : onlyTokenOwner? (selected.apply state) contract.input = some owner := by
    simpa only [onlyTokenOwner?, scopeCreation_apply_census state selected contract.input input entry]
      using owned
  have hostFrame : dataArmingHostValid (selected.apply state) owner contract.data = true := by
    cases kind : selected.kind <;>
      simpa only [InternalScopeCreationSelection.apply, kind, dataArmingHostValid] using running
  have sourceFrame : dataArmingBindings? (programPropertyPathValuePolicy program) (selected.apply state) owner contract.data = some source := by
    rw [dataArmingBindings_process_frame (programPropertyPathValuePolicy program) state (selected.apply state) owner contract.data
      (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]) (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])
      (by cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind])]
    exact available
  have patchFrame : makeInternalDataArmingPatch program (selected.apply state)
      contract owner inputOrigin source = patch := by
    rw [patchEq]
    cases kind : selected.kind <;>
      simp only [InternalScopeCreationSelection.apply, kind, makeInternalDataArmingPatch,
        dataInputOutputRunningInstance?, activationCount, activityActivationCount, dataInputOutputActivityRecord]
  have anchorFrame : openWaitAnchorAbsent (selected.apply state) patch.arm.write.occurrence = true := by
    cases kind : selected.kind <;>
      simpa only [InternalScopeCreationSelection.apply, kind, openWaitAnchorAbsent, openWaitAnchors] using absent
  have scopeFrame : (selected.apply state).variables.activities.any
      (activityOccurrenceScopeMatches (activityOwnerForRecord patch.record)) = false := by
    cases kind : selected.kind <;> simpa only [InternalScopeCreationSelection.apply, kind] using fresh
  have recordFrame : (selected.apply state).activityOccurrences.any (fun record =>
      sameActivityOccurrence record patch.record || !activityBodyClaimsDisjoint record patch.record) = false := by
    cases kind : selected.kind <;> simpa only [InternalScopeCreationSelection.apply, kind] using bodyFresh
  simp only [prepareInternalDataArmingContract?, ownerAfter, hostFrame, programSelection,
    liveAfter, origin, sourceFrame, patchFrame, declarer, anchorFrame, scopeFrame, recordFrame,
    bind, Option.bind, Bool.not_true, Bool.false_or, Bool.or_false, Bool.false_eq_true, ite_false]

theorem scopeArming_bucket_frame (state : RuntimeState)
    (selected : InternalScopeCreationSelection) (instanceId : SemanticId)
    (ownerRecord : RuntimeScopeOccurrence) (arm : PreparedInternalArming)
    (separated : localControlStateFootprintsNonInterfering
      (internalScopeCreationStateFootprint selected instanceId ownerRecord) arm.stateFootprint = true)
    (token : ControlToken)
    (member : token ∈ [{ placeId := selected.input, owner := selected.owner },
      { placeId := selected.entry, owner := selected.created.id }]) :
    (arm.apply state).tokens.filter (fun candidate =>
        decide (candidate.placeId = token.placeId && candidate.owner = token.owner)) =
      state.tokens.filter (fun candidate =>
        decide (candidate.placeId = token.placeId && candidate.owner = token.owner)) := by
  rw [(scopeArming_scope_read_projections state arm).2.2.2.2.2.2]
  apply filter_removeToken_of_rejected
  apply Bool.eq_false_iff.mpr
  intro matched
  simp only [decide_eq_true_eq, Bool.and_eq_true] at matched
  have written := scopeArming_token_write arm
  rw [matched.1, matched.2] at written
  simp only [localControlStateFootprintsNonInterfering, Bool.and_eq_true] at separated
  exact not_mem_right_of_listsDisjoint _ _ separated.1.2 _ written
    (scopeCreation_token_read selected instanceId ownerRecord token member)

theorem prepareInternalScopeCreation_after_arming (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (arm : PreparedInternalArming)
    (found : prepareInternalScopeCreation? program state operation = some prepared)
    (separated : localControlStateFootprintsNonInterfering prepared.footprint arm.stateFootprint = true) :
    prepareInternalScopeCreation? program (arm.apply state) operation = some prepared := by
  obtain ⟨selected, instanceId, ownerRecord, origin, definition, start, delta,
    selection, running, snapshots, operations, ownerExact, originFound, definitionFound,
    checks, startFound, deltaFound, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  have projections := scopeArming_scope_read_projections state arm
  have untouched := scopeArming_untouched_input selected instanceId ownerRecord arm separated
  have inputFrame := scopeArming_bucket_frame state selected instanceId ownerRecord arm separated
    { placeId := selected.input, owner := selected.owner } (by simp)
  have entryFrame := scopeArming_bucket_frame state selected instanceId ownerRecord arm separated
    { placeId := selected.entry, owner := selected.created.id } (by simp)
  have ownerFrame : (arm.apply state).scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id = selected.owner)) = state.scopeOccurrences.filter
        (fun occurrence => decide (occurrence.id = selected.owner)) := by rw [projections.2.2.1]
  have selectedAfter : selectInternalScopeCreation? (arm.apply state) operation = some selected := by
    refine selectInternalScopeCreation_read_frame state (arm.apply state) operation selected selection
      projections.1 ?_ inputFrame ownerFrame ?_ ?_
    · unfold tokenOwners
      rw [projections.2.2.2.2.2.2,
        filterTokens_removeToken_other _ _ _ _ (Ne.symm untouched.1)]
    · intro child
      rw [projections.2.2.1]
      simp only [scopeActivationCount, projections.2.2.2.2.1, and_self]
    · intro record called
      have facts := scopeCreation_selection_call_facts state operation selected record instanceId
        running selection called
      refine ⟨?_, ?_, ?_, ?_, ?_⟩
      · rw [calledProcessAssociationsValid_frame state (arm.apply state) projections.1
          projections.2.2.1 projections.2.2.2.1]
        exact scopeCreation_selection_call_associations state operation selected record selection called
      · simp only [callActivationCount, projections.2.2.2.2.2.1]
      · simpa only [projections.2.2.2.1] using facts.2.2.2.2.2.1
      · simpa only [projections.2.2.1] using facts.2.2.2.2.2.2.1
      · simpa only [projections.2.2.2.1] using facts.2.2.2.2.2.2.2
  apply prepareInternalScopeCreation_read_frame program state (arm.apply state) operation _ found
    selectedAfter projections.1 projections.2.1 ownerFrame inputFrame entryFrame
  apply scopeCreation_counter_read_frame
  · intro child
    rw [projections.2.2.2.2.1]
  · intro record called
    rw [projections.2.2.2.2.2.1]

end BpmnSemantics.SemanticProcess.InternalCommutation
