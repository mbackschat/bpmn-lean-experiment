module

public import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
public import BpmnSemantics.SemanticProcess.InternalPreparedArming
import BpmnSemantics.SemanticProcess.CallActivity
import BpmnSemantics.SemanticProcess.InternalArmingOrder
import BpmnSemantics.SemanticProcess.InternalLocalControlFootprintCommutation
import BpmnSemantics.SemanticProcess.InternalLocalControlPreparationFrames
import BpmnSemantics.SemanticProcess.InternalLocalControlSelectionFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingCommutation
import BpmnSemantics.SemanticProcess.InternalCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationFreshness
import BpmnSemantics.SemanticProcess.InternalScopeCreationLocalControlCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparationFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationSelectionFrames
import BpmnSemantics.SemanticProcess.NestedScopeDataLaws
import BpmnSemantics.SemanticProcess.ScopeStorageOrder
import BpmnSemantics.SemanticProcess.TokenPatchLaws

/-! Commutation of the prepared declared entry (CSD-PREPARE-01 of the
[concurrent scope data specification](../../docs/capsules/CONCURRENT-SCOPE-DATA-SPEC.md#representation-and-runtime-ownership))
with another declared entry, an undeclared scope creation, local control and an arming. Each pair composes the
control's existing pair law with the frame insertion, which changes only variables: the inserted frame
belongs to the fresh child, which is on no other reader's chain, and the two frames of a declared pair have
distinct owners because each entry reads the frame the other would write. -/

public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem scopeCreation_keeps_variables (state : RuntimeState) (selected : InternalScopeCreationSelection) :
    (selected.apply state).variables = state.variables :=
  (scopeCreation_apply_scopes state selected).2

private theorem prepareInternalScopeCreation_variables (program : Program) (state : RuntimeState)
    (variables : ScopedVariables) (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    prepareInternalScopeCreation? program { state with variables } operation = some prepared := by
  obtain ⟨selection, _, _⟩ := prepareInternalScopeCreation_selection_facts program state operation prepared found
  obtain ⟨_, running⟩ := selectInternalScopeCreation_running state operation prepared.selection selection
  have selected : selectInternalScopeCreation? { state with variables } operation = some prepared.selection := by
    refine selectInternalScopeCreation_read_frame state _ operation prepared.selection selection rfl
      (tokenOwners_frame state { state with variables } rfl _) rfl rfl (fun _ => ⟨rfl, scopeActivationCount_population_frame state _ _ rfl⟩)
      (fun record called => ?_)
    have facts := scopeCreation_selection_call_facts state operation prepared.selection record _ running selection
      called
    exact ⟨(calledProcessAssociationsValid_frame state _ rfl rfl rfl).trans
        (scopeCreation_selection_call_associations state operation prepared.selection record selection called),
      callActivationCount_population_frame state _ _ rfl, facts.2.2.2.2.2.1, facts.2.2.2.2.2.2.1,
      facts.2.2.2.2.2.2.2⟩
  exact prepareInternalScopeCreation_read_frame program state _ operation prepared found selected rfl rfl rfl rfl rfl
    (scopeCreation_counter_read_frame state _ prepared.selection (fun _ => rfl) (fun _ _ => rfl))

private theorem prepareInternalLocalControl_variables (program : Program) (state : RuntimeState)
    (variables : ScopedVariables) (process : variables.process = state.variables.process)
    (operation : SemanticOperation) (prepared : PreparedInternalLocalControl)
    (found : prepareInternalLocalControl? program state operation = some prepared) :
    prepareInternalLocalControl? program { state with variables } operation = some prepared :=
  prepareInternalLocalControl_read_frame program state _ operation prepared found rfl rfl rfl
    (fun _ _ => tokenOwners_frame state { state with variables } rfl _) (fun _ _ => rfl) (fun _ _ => by dsimp only; rw [process])
    (fun _ _ => rfl)
    (fun _ _ _ _ _ _ _ => rfl)

private theorem insertFrame_commutes (variables : ScopedVariables) (left right : ScopeVariableScope)
    (distinct : left.owner ≠ right.owner) :
    NestedScopeData.insertFrame (NestedScopeData.insertFrame variables left) right =
      NestedScopeData.insertFrame (NestedScopeData.insertFrame variables right) left := by
  simp only [NestedScopeData.insertFrame_scopes]
  rw [canonicalInsertBy_commutes_of_strict_order (fun left right => scopeOwnerBefore left.owner right.owner)
    (fun left right => scopeOwnerBefore_asymm left.owner right.owner)
    (fun left middle right => scopeOwnerBefore_trans left.owner middle.owner right.owner)
    right left (scopeOwnerBefore_comparable right.owner left.owner (Ne.symm distinct))]

/-- What every pair law needs of a prepared declared entry: its footprint extends its control's and names
the child's frame, which the evaluated frame fills and no live occurrence carries. -/
private theorem declared_entry_shape (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (entry : PreparedInternalDeclaredEntry)
    (found : prepareInternalDeclaredEntry? program state operation = some entry) :
    entry.control.footprint.reads ⊆ entry.footprint.reads ∧
      entry.control.footprint.writes ⊆ entry.footprint.writes ∧
      .scopeVariableScope entry.control.selection.created.id ∈ entry.footprint.reads ∧
      .scopeVariableScope entry.control.selection.created.id ∈ entry.footprint.writes ∧
      prepareInternalScopeCreation? program state operation = some entry.control ∧
      entry.frame.owner = entry.control.selection.created.id ∧
      ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ entry.control.selection.created.id := by
  obtain ⟨_, _, _, _, _, record, reads, _, _, control, evaluated, _, footprint⟩ :=
    prepareInternalDeclaredEntry_facts program state operation entry found
  rw [footprint]
  exact ⟨(internalDeclaredEntryFootprint_extends entry.control reads).1,
    (internalDeclaredEntryFootprint_extends entry.control reads).2.1,
    (internalDeclaredEntryFootprint_extends entry.control reads).2.2.1,
    (internalDeclaredEntryFootprint_extends entry.control reads).2.2.2, control,
    (NestedScopeData.evaluateFrame?_facts program state record _ _ entry.frame evaluated).1,
    selectInternalScopeCreation_fresh state operation entry.control.selection
      (prepareInternalScopeCreation_selection_facts program state operation entry.control control).1⟩

/-- An entry stays prepared on any state on which its control, frame and read set evaluate as before. -/
private theorem prepareInternalDeclaredEntry_after (program : Program) (state after : RuntimeState)
    (operation : SemanticOperation) (entry : PreparedInternalDeclaredEntry)
    (found : prepareInternalDeclaredEntry? program state operation = some entry)
    (control : prepareInternalScopeCreation? program after operation = some entry.control)
    (evaluated : ∀ record, NestedScopeData.evaluateFrame? program state record entry.control.selection.created.id
        entry.control.selection.owner = some entry.frame →
      NestedScopeData.evaluateFrame? program after record entry.control.selection.created.id
        entry.control.selection.owner = some entry.frame)
    (read : ∀ names reads, NestedScopeData.readSet? state.scopeOccurrences state.variables.scopes entry.control.selection.owner names = some reads →
      NestedScopeData.readSet? after.scopeOccurrences after.variables.scopes entry.control.selection.owner names = some reads) :
    prepareInternalDeclaredEntry? program after operation = some entry := by
  obtain ⟨id, origin, input, child, scope, record, reads, rfl, recorded, _, framed, readSet, footprint⟩ :=
    prepareInternalDeclaredEntry_facts program state operation entry found
  exact prepareInternalDeclaredEntry_of_facts program after entry id origin input child scope record reads recorded
    control (evaluated record framed) (read _ reads readSet) footprint

private theorem control_separated (entry : PreparedInternalDeclaredEntry) (other : InternalTransitionStateFootprint)
    (reads : entry.control.footprint.reads ⊆ entry.footprint.reads)
    (writes : entry.control.footprint.writes ⊆ entry.footprint.writes)
    (separated : localControlStateFootprintsNonInterfering entry.footprint other = true) :
    localControlStateFootprintsNonInterfering entry.control.footprint other = true :=
  localControlStateFootprintsNonInterfering_of_subsets _ _ _ reads writes separated

/-- A declared entry and an undeclared scope creation commute: the creation never reads variables, and the
entry's frame and read set walk only live links, which the creation's fresh occurrence keeps. -/
theorem prepared_declared_entry_scope_creation_pair (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (entryOperation scopeOperation : SemanticOperation)
    (entry : PreparedInternalDeclaredEntry) (scope : PreparedInternalScopeCreation)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (entryFound : prepareInternalDeclaredEntry? program state entryOperation = some entry)
    (scopeFound : prepareInternalScopeCreation? program state scopeOperation = some scope)
    (separated : localControlStateFootprintsNonInterfering entry.footprint scope.footprint = true) :
    prepareInternalScopeCreation? program (entry.apply state) scopeOperation = some scope ∧
      prepareInternalDeclaredEntry? program (scope.selection.apply state) entryOperation = some entry ∧
      scope.selection.apply (entry.apply state) = entry.apply (scope.selection.apply state) := by
  obtain ⟨reads, writes, _, _, control, _, _⟩ := declared_entry_shape program state entryOperation entry entryFound
  have pair := prepared_scope_creation_pair_complete program instanceId state entryOperation scopeOperation
    entry.control scope programWF stateWF control scopeFound (control_separated entry _ reads writes separated)
  have fresh := selectInternalScopeCreation_fresh state scopeOperation scope.selection
    (prepareInternalScopeCreation_selection_facts program state scopeOperation scope scopeFound).1
  have applied := scopeCreation_apply_scopes state scope.selection
  refine ⟨?_, ?_, ?_⟩
  · rw [PreparedInternalDeclaredEntry.apply_eq]
    exact prepareInternalScopeCreation_variables program _ _ scopeOperation scope pair.2.1
  · refine prepareInternalDeclaredEntry_after program state _ entryOperation entry entryFound pair.1 ?_ ?_
    · exact fun record evaluated => evaluateFrame?_insert_fresh program state _ scope.selection.created fresh
        applied.1 applied.2 record _ _ _ evaluated
    · exact fun names reads read => readSet?_insert_fresh state _ scope.selection.created fresh applied.1
        (by rw [applied.2]) _ names reads read
  · simp only [PreparedInternalDeclaredEntry.apply_eq, scopeCreation_apply_variables, scopeCreation_keeps_variables,
      pair.2.2.2.2.2.2]

/-- One direction of a declared pair: the left entry's frame is off the right entry's chain and is not the
right child's frame, and its occurrence is fresh, so the right entry evaluates as before. -/
private theorem prepareInternalDeclaredEntry_after_declared (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalDeclaredEntry)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (leftFound : prepareInternalDeclaredEntry? program state leftOperation = some left)
    (rightFound : prepareInternalDeclaredEntry? program state rightOperation = some right)
    (separated : localControlStateFootprintsNonInterfering left.footprint right.footprint = true) :
    prepareInternalDeclaredEntry? program (left.apply state) rightOperation = some right := by
  obtain ⟨leftReads, leftWrites, _, leftWritten, leftControl, leftOwner, leftFresh⟩ :=
    declared_entry_shape program state leftOperation left leftFound
  obtain ⟨rightReads, rightWrites, rightRead, _, rightControl, _, _⟩ :=
    declared_entry_shape program state rightOperation right rightFound
  have controls := localControlStateFootprintsNonInterfering_symm _ _
    (control_separated right _ rightReads rightWrites (localControlStateFootprintsNonInterfering_symm _ _
      (control_separated left _ leftReads leftWrites separated)))
  have pair := prepared_scope_creation_pair_complete program instanceId state leftOperation rightOperation
    left.control right.control programWF stateWF leftControl rightControl controls
  have distinct : left.frame.owner ≠ right.control.selection.created.id := by
    intro same
    rw [leftOwner] at same
    exact localControlStateFootprintsNonInterfering_write_read _ _ separated _ leftWritten (by rw [same]; exact rightRead)
  have dead : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ left.frame.owner := by
    rw [leftOwner]
    exact leftFresh
  let framed : RuntimeState := { state with variables := NestedScopeData.insertFrame state.variables left.frame }
  have applied := scopeCreation_apply_scopes framed left.control.selection
  have entered : left.apply state = left.control.selection.apply framed := by
    simp only [framed, PreparedInternalDeclaredEntry.apply_eq, scopeCreation_apply_variables,
      scopeCreation_keeps_variables]
  rw [entered]
  refine prepareInternalDeclaredEntry_after program state _ rightOperation right rightFound ?_ ?_ ?_
  · simp only [framed, scopeCreation_apply_variables]
    exact prepareInternalScopeCreation_variables program _ _ rightOperation right.control pair.2.1
  · intro record evaluated
    have kept := NestedScopeData.evaluateFrame?_insertFrame_dead program state left.frame dead record _
      right.control.selection.owner distinct
    exact evaluateFrame?_insert_fresh program framed _ left.control.selection.created leftFresh applied.1 applied.2
      record _ _ _ (kept.trans evaluated)
  · intro names reads read
    have kept := NestedScopeData.readSet?_insertFrame_dead state left.frame dead right.control.selection.owner names
    exact readSet?_insert_fresh framed _ left.control.selection.created leftFresh applied.1 (by rw [applied.2]) _
      names reads (kept.trans read)

/-- Two declared entries commute: their controls commute, and their frames have distinct owners. -/
theorem prepared_declared_entry_pair (program : Program) (instanceId : SemanticId) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalDeclaredEntry)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (leftFound : prepareInternalDeclaredEntry? program state leftOperation = some left)
    (rightFound : prepareInternalDeclaredEntry? program state rightOperation = some right)
    (separated : localControlStateFootprintsNonInterfering left.footprint right.footprint = true) :
    prepareInternalDeclaredEntry? program (left.apply state) rightOperation = some right ∧
      prepareInternalDeclaredEntry? program (right.apply state) leftOperation = some left ∧
      right.apply (left.apply state) = left.apply (right.apply state) := by
  refine ⟨prepareInternalDeclaredEntry_after_declared program instanceId state leftOperation rightOperation left right
      programWF stateWF leftFound rightFound separated,
    prepareInternalDeclaredEntry_after_declared program instanceId state rightOperation leftOperation right left
      programWF stateWF rightFound leftFound (localControlStateFootprintsNonInterfering_symm _ _ separated), ?_⟩
  obtain ⟨leftReads, leftWrites, _, leftWritten, leftControl, leftOwner, _⟩ :=
    declared_entry_shape program state leftOperation left leftFound
  obtain ⟨rightReads, rightWrites, rightRead, _, rightControl, rightOwner, _⟩ :=
    declared_entry_shape program state rightOperation right rightFound
  have controls := localControlStateFootprintsNonInterfering_symm _ _
    (control_separated right _ rightReads rightWrites (localControlStateFootprintsNonInterfering_symm _ _
      (control_separated left _ leftReads leftWrites separated)))
  have pair := prepared_scope_creation_pair_complete program instanceId state leftOperation rightOperation
    left.control right.control programWF stateWF leftControl rightControl controls
  have distinct : left.frame.owner ≠ right.frame.owner := by
    intro same
    rw [leftOwner, rightOwner] at same
    exact localControlStateFootprintsNonInterfering_write_read _ _ separated _ leftWritten (by rw [same]; exact rightRead)
  simp only [PreparedInternalDeclaredEntry.apply_eq, scopeCreation_apply_variables, scopeCreation_keeps_variables,
    pair.2.2.2.2.2.2]
  rw [insertFrame_commutes state.variables left.frame right.frame distinct]

/-- A declared entry and local control commute: local control moves only tokens and selected-branch records
and reads only Process variables, which a frame insertion keeps. -/
theorem prepared_declared_entry_local_control_pair (program : Program) (state : RuntimeState)
    (entryOperation localOperation : SemanticOperation) (entry : PreparedInternalDeclaredEntry)
    (localPrepared : PreparedInternalLocalControl)
    (entryFound : prepareInternalDeclaredEntry? program state entryOperation = some entry)
    (localFound : prepareInternalLocalControl? program state localOperation = some localPrepared)
    (canonical : canonicalCollectionOrder state = true)
    (separated : localControlStateFootprintsNonInterfering entry.footprint localPrepared.footprint = true) :
    prepareInternalLocalControl? program (entry.apply state) localOperation = some localPrepared ∧
      prepareInternalDeclaredEntry? program (localPrepared.selection.apply state) entryOperation = some entry ∧
      localPrepared.selection.apply (entry.apply state) = entry.apply (localPrepared.selection.apply state) := by
  obtain ⟨reads, writes, _, _, control, _, _⟩ := declared_entry_shape program state entryOperation entry entryFound
  have pair := prepared_scope_creation_local_control_pair program state entryOperation localOperation entry.control
    localPrepared control localFound canonical (control_separated entry _ reads writes separated)
  have moved := localControl_apply_variables state localPrepared.selection state.variables
  refine ⟨?_, ?_, ?_⟩
  · rw [PreparedInternalDeclaredEntry.apply_eq]
    exact prepareInternalLocalControl_variables program _ _ (by rw [NestedScopeData.insertFrame_scopes]) localOperation
      localPrepared pair.1
  · refine prepareInternalDeclaredEntry_after program state _ entryOperation entry entryFound pair.2.1 ?_ ?_
    · intro record evaluated
      rw [NestedScopeData.evaluateFrame?_frame program state _ moved.1 (by rw [moved.2.1]) (by rw [moved.2.1])]
      exact evaluated
    · intro names reads read
      rw [NestedScopeData.readSet?_frame state _ moved.1 (by rw [moved.2.1])]
      exact read
  · rw [PreparedInternalDeclaredEntry.apply_eq, PreparedInternalDeclaredEntry.apply_eq,
      (localControl_apply_variables _ localPrepared.selection _).2.2, pair.2.2, scopeCreation_keeps_variables,
      scopeCreation_keeps_variables, moved.2.1]

/-- A declared entry and an arming commute (CSD-PREPARE-01): the arming reads exactly its chain links and
consulted frames, and the entry's frame belongs to the occurrence the entry creates, which the arming does not
read; the arming changes no occurrence, frame or Process datum the entry's frame evaluation reads. -/
theorem prepared_declared_entry_arming_pair (program : Program) (state : RuntimeState)
    (entryOperation : SemanticOperation) (entry : PreparedInternalDeclaredEntry) (arm : PreparedInternalArming)
    (entryFound : prepareInternalDeclaredEntry? program state entryOperation = some entry)
    (armFound : arm.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (separated : localControlStateFootprintsNonInterfering entry.footprint arm.stateFootprint = true) :
    arm.Prepared program (entry.apply state) ∧
      prepareInternalDeclaredEntry? program (arm.apply state) entryOperation = some entry ∧
      arm.apply (entry.apply state) = entry.apply (arm.apply state) := by
  obtain ⟨reads, writes, _, _, control, owner, _⟩ := declared_entry_shape program state entryOperation entry entryFound
  obtain ⟨_, _, _, _, _, record, _, _, recorded, _⟩ :=
    prepareInternalDeclaredEntry_facts program state entryOperation entry entryFound
  have pair := prepared_scope_creation_arming_pair program state entryOperation entry.control arm control armFound
    canonical (control_separated entry _ reads writes separated)
  have created := writes (prepared_scope_creation_writes_created program state entryOperation entry.control control)
  have unread : InternalStateAtom.scopeOccurrence entry.frame.owner ∉ arm.stateFootprint.reads := fun read =>
    localControlStateFootprintsNonInterfering_write_read _ _ separated _ (by rw [owner]; exact created) read
  have moved := arming_apply_scope_data state arm
  refine ⟨?_, ?_, ?_⟩
  · rw [PreparedInternalDeclaredEntry.apply_eq]
    exact arming_insertFrame program _ entry.frame arm pair.1
      (nested_not_sequential program (NestedScopeData.recordFor?_nested program _ record recorded)) unread
  · refine prepareInternalDeclaredEntry_after program state _ entryOperation entry entryFound pair.2.1 ?_ ?_
    · intro record evaluated
      rw [NestedScopeData.evaluateFrame?_frame program state _ moved.1 moved.2.1 moved.2.2]
      exact evaluated
    · intro names reads read
      rw [moved.1, moved.2.1]
      exact read
  · rw [PreparedInternalDeclaredEntry.apply_eq, PreparedInternalDeclaredEntry.apply_eq, arming_apply_insertFrame,
      pair.2.2]

end BpmnSemantics.SemanticProcess.InternalCommutation
