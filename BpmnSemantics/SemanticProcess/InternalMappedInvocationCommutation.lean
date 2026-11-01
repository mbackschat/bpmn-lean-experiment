module

public import BpmnSemantics.SemanticProcess.InternalPreparedArming
public import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.CallVariableMappingLaws
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.InternalDeclaredEntryCommutation
import BpmnSemantics.SemanticProcess.InternalLocalControlFootprintCommutation
import BpmnSemantics.SemanticProcess.InternalLocalControlSelectionFrames
import BpmnSemantics.SemanticProcess.InternalMappedInvocationLaws
import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationFreshness
import BpmnSemantics.SemanticProcess.InternalScopeCreationLocalControlCommutation
import BpmnSemantics.SemanticProcess.InternalScopeCreationSelectionFrames
import BpmnSemantics.SemanticProcess.NestedScopeDataLaws

/-! Commutation of the prepared mapped invocation (CMCALL-PREPARE-01 of the
[concurrent mapped Calls specification](../../docs/capsules/CONCURRENT-MAPPED-CALLS-SPEC.md#representation-and-runtime-ownership))
with another mapped invocation, a declared entry, an unmapped scope creation, local control and an arming. Each
pair composes the control's existing pair law with the called-root frame insertion, as the declared entry's
pairs do: the inserted frame belongs to the fresh called root, which is on no other reader's chain, and the
input reads consult only live chains, which another member's fresh occurrence and dead-owner frame keep. -/

public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- What every pair law needs of a prepared mapped invocation, as `declared_entry_shape` for a declared entry. -/
private theorem mapped_invocation_shape (program : Program) (state : RuntimeState) (operation : SemanticOperation)
    (mapped : PreparedInternalMappedInvocation)
    (found : prepareInternalMappedInvocation? program state operation = some mapped) :
    mapped.control.footprint.reads ⊆ mapped.footprint.reads ∧
      mapped.control.footprint.writes ⊆ mapped.footprint.writes ∧
      .scopeVariableScope mapped.control.selection.created.id ∈ mapped.footprint.reads ∧
      .scopeVariableScope mapped.control.selection.created.id ∈ mapped.footprint.writes ∧
      prepareInternalScopeCreation? program state operation = some mapped.control ∧
      mapped.frame.owner = mapped.control.selection.created.id ∧
      (∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ mapped.control.selection.created.id) ∧
      state.variables.scopes.any (·.owner == mapped.control.selection.created.id) = false := by
  obtain ⟨_, _, _, _, _, _, _, _, _, _, reads, _, _, _, control, _, _, _, _, footprint⟩ :=
    prepareInternalMappedInvocation_facts program state operation mapped found
  obtain ⟨owner, absent⟩ := prepareInternalMappedInvocation_frame program state operation mapped found
  rw [footprint]
  exact ⟨(internalDeclaredEntryFootprint_extends mapped.control reads).1,
    (internalDeclaredEntryFootprint_extends mapped.control reads).2.1,
    (internalDeclaredEntryFootprint_extends mapped.control reads).2.2.1,
    (internalDeclaredEntryFootprint_extends mapped.control reads).2.2.2, control, owner,
    selectInternalScopeCreation_fresh state operation mapped.control.selection
      (prepareInternalScopeCreation_selection_facts program state operation mapped.control control).1,
    by rw [← owner]; exact absent⟩

/-- An invocation stays prepared on any state on which its control, input reads, root frame absence and read
set evaluate as before. -/
private theorem prepareInternalMappedInvocation_after (program : Program) (state after : RuntimeState)
    (operation : SemanticOperation) (mapped : PreparedInternalMappedInvocation)
    (found : prepareInternalMappedInvocation? program state operation = some mapped)
    (control : prepareInternalScopeCreation? program after operation = some mapped.control)
    (copied : ∀ name value, NestedScopeData.readOutcome? program state.scopeOccurrences state.variables
        mapped.control.selection.owner name = some value →
      NestedScopeData.readOutcome? program after.scopeOccurrences after.variables
        mapped.control.selection.owner name = some value)
    (absent : after.variables.scopes.any (·.owner == mapped.control.selection.created.id) = false)
    (read : ∀ names reads, NestedScopeData.readSet? state.scopeOccurrences state.variables.scopes
        mapped.control.selection.owner names = some reads →
      NestedScopeData.readSet? after.scopeOccurrences after.variables.scopes mapped.control.selection.owner names =
        some reads) :
    prepareInternalMappedInvocation? program after operation = some mapped := by
  obtain ⟨id, origin, input, process, scope, entry, returned, inputs, outputs, bindings, reads, rfl, nested, valid, _,
    evaluated, _, frame, readSet, footprint⟩ := prepareInternalMappedInvocation_facts program state _ mapped found
  exact prepareInternalMappedInvocation_of_facts program after mapped id origin input entry process scope returned
    inputs outputs bindings reads nested valid control
    (CallVariableMapping.copyValues?_of_widened _ _ copied inputs bindings evaluated) absent frame
    (read _ reads readSet) footprint

private theorem mapped_control_separated (mapped : PreparedInternalMappedInvocation)
    (other : InternalTransitionStateFootprint)
    (reads : mapped.control.footprint.reads ⊆ mapped.footprint.reads)
    (writes : mapped.control.footprint.writes ⊆ mapped.footprint.writes)
    (separated : localControlStateFootprintsNonInterfering mapped.footprint other = true) :
    localControlStateFootprintsNonInterfering mapped.control.footprint other = true :=
  localControlStateFootprintsNonInterfering_of_subsets _ _ _ reads writes separated

private theorem insertFrame_absent (variables : ScopedVariables) (frame : ScopeVariableScope)
    (owner : ScopeOccurrenceId) (distinct : frame.owner ≠ owner)
    (absent : variables.scopes.any (·.owner == owner) = false) :
    (NestedScopeData.insertFrame variables frame).scopes.any (·.owner == owner) = false := by
  rw [NestedScopeData.insertFrame_scopes]
  apply Bool.eq_false_iff.mpr
  simp only [ne_eq, List.any_eq_true, mem_canonicalInsertBy, beq_iff_eq]
  rintro ⟨scope, inserted | member, same⟩
  · subst inserted
    exact distinct same
  · exact Bool.eq_false_iff.mp absent (List.any_eq_true.mpr ⟨scope, member, by simpa using same⟩)

private theorem mapped_apply_framed (mapped : PreparedInternalMappedInvocation) (state : RuntimeState) :
    mapped.apply state = mapped.control.selection.apply
      { state with variables := NestedScopeData.insertFrame state.variables mapped.frame } := by
  simp only [PreparedInternalMappedInvocation.apply_eq, scopeCreation_apply_variables, scopeCreation_keeps_variables]

private theorem declared_apply_framed (entry : PreparedInternalDeclaredEntry) (state : RuntimeState) :
    entry.apply state = entry.control.selection.apply
      { state with variables := NestedScopeData.insertFrame state.variables entry.frame } := by
  simp only [PreparedInternalDeclaredEntry.apply_eq, scopeCreation_apply_variables, scopeCreation_keeps_variables]

/-- A mapped invocation after a framed creation: the creation's fresh occurrence is on no live chain, and its
frame belongs to that occurrence and is not the invocation's root frame. -/
private theorem prepareInternalMappedInvocation_after_framed (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (leftOperation rightOperation : SemanticOperation)
    (left : PreparedInternalScopeCreation) (leftFrame : ScopeVariableScope) (right : PreparedInternalMappedInvocation)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (leftFound : prepareInternalScopeCreation? program state leftOperation = some left)
    (rightFound : prepareInternalMappedInvocation? program state rightOperation = some right)
    (controls : localControlStateFootprintsNonInterfering left.footprint right.control.footprint = true)
    (leftOwner : leftFrame.owner = left.selection.created.id)
    (distinct : leftFrame.owner ≠ right.control.selection.created.id) :
    prepareInternalMappedInvocation? program
      (left.selection.apply { state with variables := NestedScopeData.insertFrame state.variables leftFrame })
      rightOperation = some right := by
  obtain ⟨_, _, _, _, rightControl, _, _, rightAbsent⟩ :=
    mapped_invocation_shape program state rightOperation right rightFound
  have pair := prepared_scope_creation_pair_complete program instanceId state leftOperation rightOperation
    left right.control programWF stateWF leftFound rightControl controls
  have leftFresh := selectInternalScopeCreation_fresh state leftOperation left.selection
    (prepareInternalScopeCreation_selection_facts program state leftOperation left leftFound).1
  have dead : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ leftFrame.owner := by
    rw [leftOwner]
    exact leftFresh
  let framed : RuntimeState := { state with variables := NestedScopeData.insertFrame state.variables leftFrame }
  have applied := scopeCreation_apply_scopes framed left.selection
  refine prepareInternalMappedInvocation_after program state _ rightOperation right rightFound ?_ ?_ ?_ ?_
  · simp only [framed, scopeCreation_apply_variables]
    exact prepareInternalScopeCreation_variables program _ _ rightOperation right.control pair.2.1
  · intro name value read
    rw [applied.1, applied.2]
    apply readOutcome?_insert_fresh _ program _ left.selection.created leftFresh
    simp only [framed]
    rw [CallVariableMapping.readOutcome?_insertFrame_dead program _ _ leftFrame dead]
    exact read
  · rw [applied.2]
    exact insertFrame_absent state.variables leftFrame _ distinct rightAbsent
  · intro names reads read
    have kept := NestedScopeData.readSet?_insertFrame_dead state leftFrame dead right.control.selection.owner names
    exact readSet?_insert_fresh framed _ left.selection.created leftFresh applied.1 (by rw [applied.2]) _
      names reads (kept.trans read)

/-- A declared entry after a framed creation, as `prepareInternalDeclaredEntry_after_declared` with any framed
left member. -/
private theorem prepareInternalDeclaredEntry_after_framed (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (leftOperation rightOperation : SemanticOperation)
    (left : PreparedInternalScopeCreation) (leftFrame : ScopeVariableScope) (right : PreparedInternalDeclaredEntry)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (leftFound : prepareInternalScopeCreation? program state leftOperation = some left)
    (rightFound : prepareInternalDeclaredEntry? program state rightOperation = some right)
    (controls : localControlStateFootprintsNonInterfering left.footprint right.control.footprint = true)
    (leftOwner : leftFrame.owner = left.selection.created.id)
    (distinct : leftFrame.owner ≠ right.control.selection.created.id) :
    prepareInternalDeclaredEntry? program
      (left.selection.apply { state with variables := NestedScopeData.insertFrame state.variables leftFrame })
      rightOperation = some right := by
  obtain ⟨_, _, _, _, rightControl, _, _⟩ := declared_entry_shape program state rightOperation right rightFound
  have pair := prepared_scope_creation_pair_complete program instanceId state leftOperation rightOperation
    left right.control programWF stateWF leftFound rightControl controls
  have leftFresh := selectInternalScopeCreation_fresh state leftOperation left.selection
    (prepareInternalScopeCreation_selection_facts program state leftOperation left leftFound).1
  have dead : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ leftFrame.owner := by
    rw [leftOwner]
    exact leftFresh
  let framed : RuntimeState := { state with variables := NestedScopeData.insertFrame state.variables leftFrame }
  have applied := scopeCreation_apply_scopes framed left.selection
  refine prepareInternalDeclaredEntry_after program state _ rightOperation right rightFound ?_ ?_ ?_
  · simp only [framed, scopeCreation_apply_variables]
    exact prepareInternalScopeCreation_variables program _ _ rightOperation right.control pair.2.1
  · intro record evaluated
    have kept := NestedScopeData.evaluateFrame?_insertFrame_dead program state leftFrame dead record _
      right.control.selection.owner distinct
    exact evaluateFrame?_insert_fresh program framed _ left.selection.created leftFresh applied.1 applied.2
      record _ _ _ (kept.trans evaluated)
  · intro names reads read
    have kept := NestedScopeData.readSet?_insertFrame_dead state leftFrame dead right.control.selection.owner names
    exact readSet?_insert_fresh framed _ left.selection.created leftFresh applied.1 (by rw [applied.2]) _
      names reads (kept.trans read)

/-- Two mapped invocations commute: their controls commute, each reads off the other's chain, and their root
frames have distinct owners because each reads the frame the other would write. -/
theorem prepared_mapped_invocation_pair (program : Program) (instanceId : SemanticId) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalMappedInvocation)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (leftFound : prepareInternalMappedInvocation? program state leftOperation = some left)
    (rightFound : prepareInternalMappedInvocation? program state rightOperation = some right)
    (separated : localControlStateFootprintsNonInterfering left.footprint right.footprint = true) :
    prepareInternalMappedInvocation? program (left.apply state) rightOperation = some right ∧
      prepareInternalMappedInvocation? program (right.apply state) leftOperation = some left ∧
      right.apply (left.apply state) = left.apply (right.apply state) := by
  obtain ⟨leftReads, leftWrites, leftRead, leftWritten, leftControl, leftOwner, _, _⟩ :=
    mapped_invocation_shape program state leftOperation left leftFound
  obtain ⟨rightReads, rightWrites, rightRead, rightWritten, rightControl, rightOwner, _, _⟩ :=
    mapped_invocation_shape program state rightOperation right rightFound
  have controls := localControlStateFootprintsNonInterfering_symm _ _
    (mapped_control_separated right _ rightReads rightWrites (localControlStateFootprintsNonInterfering_symm _ _
      (mapped_control_separated left _ leftReads leftWrites separated)))
  have leftDistinct : left.frame.owner ≠ right.control.selection.created.id := by
    intro same
    rw [leftOwner] at same
    exact localControlStateFootprintsNonInterfering_write_read _ _ separated _ leftWritten (by rw [same]; exact rightRead)
  have rightDistinct : right.frame.owner ≠ left.control.selection.created.id := by
    intro same
    rw [rightOwner] at same
    exact localControlStateFootprintsNonInterfering_write_read _ _
      (localControlStateFootprintsNonInterfering_symm _ _ separated) _ rightWritten (by rw [same]; exact leftRead)
  have pair := prepared_scope_creation_pair_complete program instanceId state leftOperation rightOperation
    left.control right.control programWF stateWF leftControl rightControl controls
  refine ⟨?_, ?_, ?_⟩
  · rw [mapped_apply_framed]
    exact prepareInternalMappedInvocation_after_framed program instanceId state leftOperation rightOperation
      left.control left.frame right programWF stateWF leftControl rightFound controls leftOwner leftDistinct
  · rw [mapped_apply_framed]
    exact prepareInternalMappedInvocation_after_framed program instanceId state rightOperation leftOperation
      right.control right.frame left programWF stateWF rightControl leftFound
      (localControlStateFootprintsNonInterfering_symm _ _ controls) rightOwner rightDistinct
  · have distinct : left.frame.owner ≠ right.frame.owner := by
      rw [rightOwner]
      exact leftDistinct
    simp only [PreparedInternalMappedInvocation.apply_eq, scopeCreation_apply_variables,
      scopeCreation_keeps_variables, pair.2.2.2.2.2.2]
    rw [insertFrame_commutes state.variables left.frame right.frame distinct]

/-- A mapped invocation and a declared entry commute, as two declared entries do. -/
theorem prepared_mapped_invocation_declared_entry_pair (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (mappedOperation entryOperation : SemanticOperation)
    (mapped : PreparedInternalMappedInvocation) (entry : PreparedInternalDeclaredEntry)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (mappedFound : prepareInternalMappedInvocation? program state mappedOperation = some mapped)
    (entryFound : prepareInternalDeclaredEntry? program state entryOperation = some entry)
    (separated : localControlStateFootprintsNonInterfering mapped.footprint entry.footprint = true) :
    prepareInternalDeclaredEntry? program (mapped.apply state) entryOperation = some entry ∧
      prepareInternalMappedInvocation? program (entry.apply state) mappedOperation = some mapped ∧
      entry.apply (mapped.apply state) = mapped.apply (entry.apply state) := by
  obtain ⟨mappedReads, mappedWrites, mappedRead, mappedWritten, mappedControl, mappedOwner, _, _⟩ :=
    mapped_invocation_shape program state mappedOperation mapped mappedFound
  obtain ⟨entryReads, entryWrites, entryRead, entryWritten, entryControl, entryOwner, _⟩ :=
    declared_entry_shape program state entryOperation entry entryFound
  have controls := localControlStateFootprintsNonInterfering_symm _ _
    (localControlStateFootprintsNonInterfering_of_subsets _ _ _ entryReads entryWrites
      (localControlStateFootprintsNonInterfering_symm _ _
        (mapped_control_separated mapped _ mappedReads mappedWrites separated)))
  have mappedDistinct : mapped.frame.owner ≠ entry.control.selection.created.id := by
    intro same
    rw [mappedOwner] at same
    exact localControlStateFootprintsNonInterfering_write_read _ _ separated _ mappedWritten
      (by rw [same]; exact entryRead)
  have entryDistinct : entry.frame.owner ≠ mapped.control.selection.created.id := by
    intro same
    rw [entryOwner] at same
    exact localControlStateFootprintsNonInterfering_write_read _ _
      (localControlStateFootprintsNonInterfering_symm _ _ separated) _ entryWritten (by rw [same]; exact mappedRead)
  have pair := prepared_scope_creation_pair_complete program instanceId state mappedOperation entryOperation
    mapped.control entry.control programWF stateWF mappedControl entryControl controls
  refine ⟨?_, ?_, ?_⟩
  · rw [mapped_apply_framed]
    exact prepareInternalDeclaredEntry_after_framed program instanceId state mappedOperation entryOperation
      mapped.control mapped.frame entry programWF stateWF mappedControl entryFound controls mappedOwner mappedDistinct
  · rw [declared_apply_framed]
    exact prepareInternalMappedInvocation_after_framed program instanceId state entryOperation mappedOperation
      entry.control entry.frame mapped programWF stateWF entryControl mappedFound
      (localControlStateFootprintsNonInterfering_symm _ _ controls) entryOwner entryDistinct
  · have distinct : mapped.frame.owner ≠ entry.frame.owner := by
      rw [entryOwner]
      exact mappedDistinct
    simp only [PreparedInternalMappedInvocation.apply_eq, PreparedInternalDeclaredEntry.apply_eq,
      scopeCreation_apply_variables, scopeCreation_keeps_variables, pair.2.2.2.2.2.2]
    rw [insertFrame_commutes state.variables mapped.frame entry.frame distinct]

/-- A mapped invocation and an unmapped scope creation commute: the creation never reads variables, and the
invocation's reads walk only live links, which the creation's fresh occurrence keeps. -/
theorem prepared_mapped_invocation_scope_creation_pair (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (mappedOperation scopeOperation : SemanticOperation)
    (mapped : PreparedInternalMappedInvocation) (scope : PreparedInternalScopeCreation)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (mappedFound : prepareInternalMappedInvocation? program state mappedOperation = some mapped)
    (scopeFound : prepareInternalScopeCreation? program state scopeOperation = some scope)
    (separated : localControlStateFootprintsNonInterfering mapped.footprint scope.footprint = true) :
    prepareInternalScopeCreation? program (mapped.apply state) scopeOperation = some scope ∧
      prepareInternalMappedInvocation? program (scope.selection.apply state) mappedOperation = some mapped ∧
      scope.selection.apply (mapped.apply state) = mapped.apply (scope.selection.apply state) := by
  obtain ⟨reads, writes, _, _, control, _, _, absent⟩ :=
    mapped_invocation_shape program state mappedOperation mapped mappedFound
  have pair := prepared_scope_creation_pair_complete program instanceId state mappedOperation scopeOperation
    mapped.control scope programWF stateWF control scopeFound (mapped_control_separated mapped _ reads writes separated)
  have fresh := selectInternalScopeCreation_fresh state scopeOperation scope.selection
    (prepareInternalScopeCreation_selection_facts program state scopeOperation scope scopeFound).1
  have applied := scopeCreation_apply_scopes state scope.selection
  refine ⟨?_, ?_, ?_⟩
  · rw [PreparedInternalMappedInvocation.apply_eq]
    exact prepareInternalScopeCreation_variables program _ _ scopeOperation scope pair.2.1
  · refine prepareInternalMappedInvocation_after program state _ mappedOperation mapped mappedFound pair.1 ?_ ?_ ?_
    · intro name value read
      rw [applied.1, applied.2]
      exact readOutcome?_insert_fresh _ program _ scope.selection.created fresh _ name value read
    · rw [applied.2]
      exact absent
    · exact fun names reads read => readSet?_insert_fresh state _ scope.selection.created fresh applied.1
        (by rw [applied.2]) _ names reads read
  · simp only [PreparedInternalMappedInvocation.apply_eq, scopeCreation_apply_variables, scopeCreation_keeps_variables,
      pair.2.2.2.2.2.2]

/-- A mapped invocation and local control commute: local control moves only tokens and selected-branch records
and keeps every occurrence and variable the invocation reads. -/
theorem prepared_mapped_invocation_local_control_pair (program : Program) (state : RuntimeState)
    (mappedOperation localOperation : SemanticOperation) (mapped : PreparedInternalMappedInvocation)
    (localPrepared : PreparedInternalLocalControl)
    (mappedFound : prepareInternalMappedInvocation? program state mappedOperation = some mapped)
    (localFound : prepareInternalLocalControl? program state localOperation = some localPrepared)
    (canonical : canonicalCollectionOrder state = true)
    (separated : localControlStateFootprintsNonInterfering mapped.footprint localPrepared.footprint = true) :
    prepareInternalLocalControl? program (mapped.apply state) localOperation = some localPrepared ∧
      prepareInternalMappedInvocation? program (localPrepared.selection.apply state) mappedOperation = some mapped ∧
      localPrepared.selection.apply (mapped.apply state) = mapped.apply (localPrepared.selection.apply state) := by
  obtain ⟨reads, writes, _, _, control, _, _, absent⟩ :=
    mapped_invocation_shape program state mappedOperation mapped mappedFound
  have pair := prepared_scope_creation_local_control_pair program state mappedOperation localOperation mapped.control
    localPrepared control localFound canonical (mapped_control_separated mapped _ reads writes separated)
  have moved := localControl_apply_variables state localPrepared.selection state.variables
  refine ⟨?_, ?_, ?_⟩
  · rw [PreparedInternalMappedInvocation.apply_eq]
    exact prepareInternalLocalControl_variables program _ _ (by rw [NestedScopeData.insertFrame_scopes]) localOperation
      localPrepared pair.1
  · refine prepareInternalMappedInvocation_after program state _ mappedOperation mapped mappedFound pair.2.1 ?_ ?_ ?_
    · intro name value read
      rw [moved.1, moved.2.1]
      exact read
    · rw [moved.2.1]
      exact absent
    · intro names reads read
      rw [moved.1, moved.2.1]
      exact read
  · rw [PreparedInternalMappedInvocation.apply_eq, PreparedInternalMappedInvocation.apply_eq,
      (localControl_apply_variables _ localPrepared.selection _).2.2, pair.2.2, scopeCreation_keeps_variables,
      scopeCreation_keeps_variables, moved.2.1]

/-- A mapped invocation and an arming commute: the arming reads exactly its chain links and consulted frames,
and the invocation's frame belongs to the root it creates, which the arming does not read; the arming changes
no occurrence, frame or Process datum the input reads consult. -/
theorem prepared_mapped_invocation_arming_pair (program : Program) (state : RuntimeState)
    (mappedOperation : SemanticOperation) (mapped : PreparedInternalMappedInvocation) (arm : PreparedInternalArming)
    (mappedFound : prepareInternalMappedInvocation? program state mappedOperation = some mapped)
    (armFound : arm.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (separated : localControlStateFootprintsNonInterfering mapped.footprint arm.stateFootprint = true) :
    arm.Prepared program (mapped.apply state) ∧
      prepareInternalMappedInvocation? program (arm.apply state) mappedOperation = some mapped ∧
      arm.apply (mapped.apply state) = mapped.apply (arm.apply state) := by
  obtain ⟨reads, writes, _, _, control, owner, _, absent⟩ :=
    mapped_invocation_shape program state mappedOperation mapped mappedFound
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, nested, _⟩ :=
    prepareInternalMappedInvocation_facts program state mappedOperation mapped mappedFound
  have pair := prepared_scope_creation_arming_pair program state mappedOperation mapped.control arm control armFound
    canonical (mapped_control_separated mapped _ reads writes separated)
  have created := writes (prepared_scope_creation_writes_created program state mappedOperation mapped.control control)
  have unread : InternalStateAtom.scopeOccurrence mapped.frame.owner ∉ arm.stateFootprint.reads := fun read =>
    localControlStateFootprintsNonInterfering_write_read _ _ separated _ (by rw [owner]; exact created) read
  have moved := arming_apply_scope_data state arm
  refine ⟨?_, ?_, ?_⟩
  · rw [PreparedInternalMappedInvocation.apply_eq]
    exact arming_insertFrame program _ mapped.frame arm pair.1 (nested_not_sequential program nested) unread
  · refine prepareInternalMappedInvocation_after program state _ mappedOperation mapped mappedFound pair.2.1 ?_ ?_ ?_
    · intro name value read
      rw [CallVariableMapping.readOutcome?_of_data program state (arm.apply state) moved.1 moved.2.1 moved.2.2]
      exact read
    · rw [moved.2.1]
      exact absent
    · intro names reads read
      rw [moved.1, moved.2.1]
      exact read
  · rw [PreparedInternalMappedInvocation.apply_eq, PreparedInternalMappedInvocation.apply_eq, arming_apply_insertFrame,
      pair.2.2]

end BpmnSemantics.SemanticProcess.InternalCommutation
