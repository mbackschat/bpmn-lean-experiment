module

public import BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
public import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws

/-! PMIS-DATA-01: collection preservation and provenance proofs remain outside the executable command dependency graph. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Both repeated-scope write kinds derive collection exclusion from their successful shared guard before either scope or Process merging. -/
theorem writeBoundMultiInstanceScopeValues_preserves_collection
    (variables result : ScopedVariables) (owner : ScopeOccurrenceId)
    (collection item : String) (condition : Option String) (handlers : List String)
    (values : List VariableBinding) (kind : MultiInstanceScopeWriteKind) (binding : VariableBinding)
    (unique : variables.process.bindings.filter (·.name == collection) = [binding])
    (written : writeBoundMultiInstanceScopeValues? variables owner collection item condition handlers values kind = some result) :
    result.process.bindings.filter (·.name == collection) = [binding] := by
  unfold writeBoundMultiInstanceScopeValues? at written
  dsimp only at written
  split at written <;> try contradiction
  rename_i checks
  simp only [Bool.or_eq_true, not_or, Bool.not_eq_true', Bool.not_eq_false, decide_eq_true_eq] at checks
  have untouched : ∀ value ∈ values, value.name ≠ collection := by
    intro value member
    have permitted := List.all_eq_true.mp checks.1 value member
    simp only [Bool.and_eq_true] at permitted
    exact by simpa only [bne_iff_ne] using permitted.1.1.2
  obtain ⟨bodyVariables, bodyWrite, written⟩ := Option.bind_eq_some_iff.mp written
  have bodyCollection := conditionScopedWrite_untouched variables bodyVariables owner _ collection binding unique
    (fun value member => untouched value (List.mem_filter.mp member).1) bodyWrite
  cases Option.some.inj written
  exact conditionMerge_untouched _ _ collection binding bodyCollection
    (fun value member => untouched value (List.mem_filter.mp member).1)

/-- Exact selected-entry provenance connects the real population-bound writer to the shared protected collection law. -/
theorem writeParallelScopeValues_preserves_collection
    {program : Program} {state : RuntimeState} {owner : ScopeOccurrenceId}
    {values : List VariableBinding} {kind : MultiInstanceScopeWriteKind} {result : ScopedVariables}
    (entry : ParallelScopeEntry) (binding : VariableBinding)
    (selected : ((program.operations.filterMap parallelScopeEntry?).filter
      (·.childScopeId == owner.definitionScopeId)) = [entry])
    (unique : state.variables.process.bindings.filter (·.name == entry.collectionName) = [binding])
    (written : writeParallelScopeValues? program state owner values kind = some result) :
    result.process.bindings.filter (·.name == entry.collectionName) = [binding] := by
  unfold writeParallelScopeValues? at written
  simp only [selected] at written
  obtain ⟨bound, _, written⟩ := Option.bind_eq_some_iff.mp written
  exact writeBoundMultiInstanceScopeValues_preserves_collection state.variables result owner entry.collectionName
    entry.itemName entry.completionBooleanName _ values kind binding unique written

/-- Actual scoped Human completion retains the captured collection for its exact wait and selected entry. -/
theorem completeParallelScopeUserTask_preserves_collection
    {program : Program} {before after : RuntimeState} {id : UserTaskInstanceId} {values : List VariableBinding}
    (wait : UserTaskWait) (entry : ParallelScopeEntry) (binding : VariableBinding)
    (selectedWait : before.waits.filter ((taskIdNamesWait id)) = [wait])
    (selectedEntry : ((program.operations.filterMap parallelScopeEntry?).filter
      (·.childScopeId == wait.owner.definitionScopeId)) = [entry])
    (unique : before.variables.process.bindings.filter (·.name == entry.collectionName) = [binding])
    (completed : completeParallelScopeUserTask? program before id values = some after) :
    after.variables.process.bindings.filter (·.name == entry.collectionName) = [binding] := by
  simp only [completeParallelScopeUserTask?, selectedWait] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact writeParallelScopeValues_preserves_collection (result := variables) entry binding selectedEntry unique written

/-- Actual scoped Service completion applies projected writes through the same collection guard before effect disposal. -/
theorem completeParallelScopeEffect_preserves_collection
    {program : Program} {before after : RuntimeState} {id : EffectOccurrenceId} {result : EffectExecutionResult}
    (wait : EffectWait) (entry : ParallelScopeEntry) (binding : VariableBinding)
    (selectedWait : before.effectWaits.filter (effectIdNamesWait id) = [wait])
    (selectedEntry : ((program.operations.filterMap parallelScopeEntry?).filter
      (·.childScopeId == wait.owner.definitionScopeId)) = [entry])
    (unique : before.variables.process.bindings.filter (·.name == entry.collectionName) = [binding])
    (completed : completeParallelScopeEffect? program before id result = some after) :
    after.variables.process.bindings.filter (·.name == entry.collectionName) = [binding] := by
  simp only [completeParallelScopeEffect?, selectedWait] at completed
  cases result <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact writeParallelScopeValues_preserves_collection (result := variables) entry binding selectedEntry unique written
  case h_2 =>
    rename_i patch missingResult impossible
    exact False.elim (impossible patch rfl)

/-- A merge cannot invent a stringList binding when its actual replacement population contains none. -/
theorem mergeProcessVariableBindings_stringList_provenance (existing patch : List VariableBinding)
    (name : String) (items : List String)
    (absent : ∀ binding ∈ patch, binding.value ≠ .stringList items)
    (member : ({ name, value := .stringList items } : VariableBinding) ∈ mergeProcessVariableBindings existing patch) :
    ({ name, value := .stringList items } : VariableBinding) ∈ existing := by
  have covered := (mergeProcessVariableBindings_perm existing patch).mem_iff.mp member
  rcases List.mem_append.mp covered with added | retained
  · exact False.elim (absent _ added rfl)
  · exact (List.mem_filter.mp retained).1

private theorem scope_write_stringList_provenance (variables result : ScopedVariables)
    (owner : ScopeOccurrenceId) (patch : List VariableBinding)
    (written : writeScopeVariables? variables owner patch = some result)
    (name : String) (items : List String)
    (member : ({ name, value := .stringList items } : VariableBinding) ∈ result.process.bindings) :
    ({ name, value := .stringList items } : VariableBinding) ∈ variables.process.bindings := by
  unfold writeScopeVariables? at written
  obtain ⟨scope, _, written⟩ := Option.bind_eq_some_iff.mp written
  split at written <;> try contradiction
  rename_i checks
  simp only [Bool.or_eq_true, not_or, Bool.not_eq_true', Bool.not_eq_false] at checks
  cases Option.some.inj written
  apply mergeProcessVariableBindings_stringList_provenance _ _ name items _ member
  intro binding included same
  have scalar := List.all_eq_true.mp checks.2 binding (List.mem_filter.mp included).1
  simp [same, scopeVariableScalar] at scalar

/-- Successful repeated-scope writes permit only scalar or Boolean values, so every resulting named stringList binding predates the write. -/
theorem writeBoundMultiInstanceScopeValues_stringList_provenance (variables result : ScopedVariables)
    (owner : ScopeOccurrenceId) (collection item : String) (condition : Option String) (handlers : List String)
    (values : List VariableBinding) (kind : MultiInstanceScopeWriteKind)
    (written : writeBoundMultiInstanceScopeValues? variables owner collection item condition handlers values kind = some result)
    (name : String) (items : List String)
    (member : ({ name, value := .stringList items } : VariableBinding) ∈ result.process.bindings) :
    ({ name, value := .stringList items } : VariableBinding) ∈ variables.process.bindings := by
  unfold writeBoundMultiInstanceScopeValues? at written
  dsimp only at written
  split at written <;> try contradiction
  rename_i checks
  simp only [Bool.or_eq_true, not_or, Bool.not_eq_true', Bool.not_eq_false, decide_eq_true_eq] at checks
  have absent : ∀ binding ∈ values, binding.value ≠ .stringList items := by
    intro binding included same
    have permitted := List.all_eq_true.mp checks.1 binding included
    simp [same, scopeVariableScalar] at permitted
  obtain ⟨bodyVariables, bodyWrite, written⟩ := Option.bind_eq_some_iff.mp written
  cases Option.some.inj written
  have retained := mergeProcessVariableBindings_stringList_provenance _ _ name items
    (fun binding included => absent binding (List.mem_filter.mp included).1) member
  exact scope_write_stringList_provenance variables bodyVariables owner _ bodyWrite name items retained

/-- Actual population-bound write success supplies its entry and frame provenance; no caller entry selector is needed for stringList ancestry. -/
theorem writeParallelScopeValues_stringList_provenance {program : Program} {state : RuntimeState}
    {owner : ScopeOccurrenceId} {values : List VariableBinding} {kind : MultiInstanceScopeWriteKind} {result : ScopedVariables}
    (written : writeParallelScopeValues? program state owner values kind = some result)
    (name : String) (items : List String)
    (member : ({ name, value := .stringList items } : VariableBinding) ∈ result.process.bindings) :
    ({ name, value := .stringList items } : VariableBinding) ∈ state.variables.process.bindings := by
  unfold writeParallelScopeValues? at written
  split at written <;> try contradiction
  obtain ⟨binding, _, written⟩ := Option.bind_eq_some_iff.mp written
  exact writeBoundMultiInstanceScopeValues_stringList_provenance state.variables result owner _ _ _ _ values kind written name items member

/-- Actual scoped Human completion only forwards stringList bindings already present in Process data. -/
theorem completeParallelScopeUserTask_stringList_provenance (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : completeParallelScopeUserTask? program before id values = some after)
    (name : String) (items : List String)
    (member : ({ name, value := .stringList items } : VariableBinding) ∈ after.variables.process.bindings) :
    ({ name, value := .stringList items } : VariableBinding) ∈ before.variables.process.bindings := by
  unfold completeParallelScopeUserTask? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact writeParallelScopeValues_stringList_provenance written name items member

/-- Actual scoped Service projection and disposal cannot introduce stringList Process data. -/
theorem completeParallelScopeEffect_stringList_provenance (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (result : EffectExecutionResult)
    (completed : completeParallelScopeEffect? program before id result = some after)
    (name : String) (items : List String)
    (member : ({ name, value := .stringList items } : VariableBinding) ∈ after.variables.process.bindings) :
    ({ name, value := .stringList items } : VariableBinding) ∈ before.variables.process.bindings := by
  unfold completeParallelScopeEffect? at completed
  split at completed <;> try contradiction
  cases result <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact writeParallelScopeValues_stringList_provenance written name items member
  case h_2 =>
    rename_i patch missingResult impossible
    exact False.elim (impossible patch rfl)

end BpmnSemantics.SemanticProcess

namespace BpmnSemantics.SemanticProcess.ParallelScopeCommand

private theorem admitted_human_collection (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (before : RuntimeState) (commandId : SemanticId) (id : UserTaskInstanceId) (values : List VariableBinding)
    (admitted : stimulusAdmitted program before (.completeUserTaskInstance commandId id values) = true) :
    (∃ binding, before.variables.process.bindings.filter (·.name == analysis.entry.collectionName) = [binding]) ∧
      ∀ value ∈ values, value.name ≠ analysis.entry.collectionName := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases choice : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, choice] at analyzed
    | true => rfl
  simp only [stimulusAdmitted, selected, Bool.not_true, Bool.false_eq_true, ite_false, analyzed] at admitted
  split at admitted <;> try contradiction
  rename_i valid
  simp only [Bool.and_eq_true] at admitted
  have patch := admitted.2
  simp only [humanValuesAdmitted, Bool.and_eq_true] at patch
  have untouched : ∀ value ∈ values, value.name ≠ analysis.entry.collectionName := by
    intro value member
    have accepted := List.all_eq_true.mp patch.2 value member
    simp only [Bool.and_eq_true] at accepted
    exact by simpa only [bne_iff_ne] using accepted.1.1.2
  refine ⟨?_, untouched⟩
  cases capacity : ParallelScopeStart.programStateCapacity program before with
  | none => simp [capacity] at admitted
  | some result =>
    unfold ParallelScopeStart.programStateCapacity at capacity
    split at capacity <;> try contradiction
    simp only [analyzed, bind, Option.bind_some, pure] at capacity
    obtain ⟨initialCapacity, _, capacity⟩ := Option.bind_eq_some_iff.mp capacity
    split at capacity <;> try contradiction
    split at capacity <;> try contradiction
    rename_i binding unique
    exact ⟨binding, unique⟩

/-- Actual Human admission excludes collection writes before the ordinary completion merge, preserving its captured binding exactly. -/
theorem completeTask_ordinary_preserves_admitted_collection
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (before after : RuntimeState) (commandId : SemanticId) (id : UserTaskInstanceId)
    (values : List VariableBinding) (wait : UserTaskWait)
    (admitted : stimulusAdmitted program before (.completeUserTaskInstance commandId id values) = true)
    (selected : before.waits.filter ((taskIdNamesWait id)) = [wait])
    (ordinary : hasParallelScopeDefinition program wait.owner = false)
    (completed : completeTask? program before id values = some after) :
    after.variables.process.bindings.filter (·.name == analysis.entry.collectionName) =
      before.variables.process.bindings.filter (·.name == analysis.entry.collectionName) := by
  obtain ⟨⟨binding, unique⟩, untouched⟩ := admitted_human_collection program analysis analyzed before commandId id values admitted
  have merged := conditionMerge_untouched before.variables.process.bindings values analysis.entry.collectionName binding unique untouched
  simp only [completeTask?, selected, ordinary, Bool.false_eq_true, ite_false] at completed
  obtain ⟨next, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
  unfold completeUserTask at applied
  split at applied <;> try contradiction
  cases Option.some.inj applied
  cases Option.some.inj completed
  simpa only [unique] using merged

/-- Actual Human admission supplies the collection binding; exact entry provenance lifts its scoped completion without an output-data premise. -/
theorem completeTask_scoped_preserves_admitted_collection
    (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (before after : RuntimeState) (commandId : SemanticId) (id : UserTaskInstanceId)
    (values : List VariableBinding) (wait : UserTaskWait)
    (admitted : stimulusAdmitted program before (.completeUserTaskInstance commandId id values) = true)
    (selectedWait : before.waits.filter ((taskIdNamesWait id)) = [wait])
    (selectedEntry : ((program.operations.filterMap parallelScopeEntry?).filter
      (·.childScopeId == wait.owner.definitionScopeId)) = [analysis.entry])
    (parallel : hasParallelScopeDefinition program wait.owner = true)
    (completed : completeTask? program before id values = some after) :
    after.variables.process.bindings.filter (·.name == analysis.entry.collectionName) =
      before.variables.process.bindings.filter (·.name == analysis.entry.collectionName) := by
  obtain ⟨⟨binding, unique⟩, _⟩ := admitted_human_collection program analysis analyzed before commandId id values admitted
  simp only [completeTask?, selectedWait, parallel, ite_true] at completed
  have preserved := completeParallelScopeUserTask_preserves_collection wait analysis.entry binding selectedWait selectedEntry unique completed
  simpa only [unique] using preserved

private theorem mapped_output_property {α β : Type} (values : List α) (map : α → Option β)
    (outputs : List β) (property : β → Prop)
    (mapped : values.mapM map = some outputs)
    (each : ∀ value output, map value = some output → property output) :
    ∀ output ∈ outputs, property output := by
  induction values generalizing outputs with
  | nil => simp only [List.mapM_nil, Option.pure_def, Option.some.injEq] at mapped; subst outputs; simp
  | cons head tail ih =>
    rw [List.mapM_cons] at mapped
    obtain ⟨first, chosen, remainder⟩ := Option.bind_eq_some_iff.mp mapped
    obtain ⟨remaining, tailMapped, same⟩ := Option.bind_eq_some_iff.mp remainder
    cases Option.some.inj same
    intro output member
    rcases List.mem_cons.mp member with identity | later
    · subst output; exact each head first chosen
    · exact ih remaining tailMapped output later

private theorem enclosing_stringList_refused (bindings : List VariableBinding) (name : String)
    (items : List String) (found : enclosingVariable? bindings name = some (.stringList items)) : False := by
  unfold enclosingVariable? at found
  split at found <;> try contradiction
  split at found <;> simp_all

private theorem serialEffectPatch_stringList_provenance (handlers : List String)
    (outputs : List VariableMapping) (bindings patch result : List VariableBinding)
    (written : serialEffectPatch? handlers outputs bindings patch = some result)
    (name : String) (items : List String) (member : ({ name, value := .stringList items } : VariableBinding) ∈ result) :
    ({ name, value := .stringList items } : VariableBinding) ∈ bindings := by
  unfold serialEffectPatch? at written
  split at written <;> try contradiction
  obtain ⟨sources, _, written⟩ := Option.bind_eq_some_iff.mp written
  split at written <;> try contradiction
  obtain ⟨writes, mapped, written⟩ := Option.bind_eq_some_iff.mp written
  cases Option.some.inj written
  have absent : ∀ binding ∈ writes, binding.value ≠ .stringList items := by
    apply mapped_output_property outputs _ writes (fun binding => binding.value ≠ .stringList items) mapped
    intro mapping binding chosen
    cases expression : mapping.expression <;> simp only [expression] at chosen <;> try contradiction
    obtain ⟨value, found, chosen⟩ := Option.bind_eq_some_iff.mp chosen
    cases Option.some.inj chosen
    intro identity
    change value = .stringList items at identity
    rw [identity] at found
    exact enclosing_stringList_refused patch _ items found
  exact mergeProcessVariableBindings_stringList_provenance bindings writes name items absent member

/-- Ordinary Service mapping can replace or discard scalar targets but cannot create a named stringList binding. -/
theorem completeSerialEffect_stringList_provenance (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (result : EffectExecutionResult)
    (completed : completeSerialEffect? program before id result = some after)
    (name : String) (items : List String)
    (member : ({ name, value := .stringList items } : VariableBinding) ∈ after.variables.process.bindings) :
    ({ name, value := .stringList items } : VariableBinding) ∈ before.variables.process.bindings := by
  unfold completeSerialEffect? at completed
  split at completed <;> try contradiction
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  unfold completeSerialActivityScope? at written
  split at written <;> try contradiction
  obtain ⟨bindings, mapped, written⟩ := Option.bind_eq_some_iff.mp written
  cases Option.some.inj written
  cases Option.some.inj completed
  exact serialEffectPatch_stringList_provenance _ _ before.variables.process.bindings _ bindings mapped name items member

/-- The real ordinary dispatch branch inherits mapped-result provenance without wait-to-declaration or cardinality premises. -/
theorem completeEffect_ordinary_stringList_provenance (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (result : EffectExecutionResult) (wait : EffectWait)
    (selected : before.effectWaits.filter (effectIdNamesWait id) = [wait])
    (ordinary : hasParallelScopeDefinition program wait.owner = false)
    (completed : completeEffect? program before id result = some after)
    (name : String) (items : List String)
    (member : ({ name, value := .stringList items } : VariableBinding) ∈ after.variables.process.bindings) :
    ({ name, value := .stringList items } : VariableBinding) ∈ before.variables.process.bindings := by
  simp only [completeEffect?, selected, ordinary, Bool.false_eq_true, ite_false] at completed
  exact completeSerialEffect_stringList_provenance program before after id result completed name items member

/-- Actual selected Human admission forbids stringList patch values on the ordinary route; the scoped route derives the same ancestry from its writer. -/
theorem completeTask_stringList_provenance (program : Program) (before after : RuntimeState)
    (commandId : SemanticId) (id : UserTaskInstanceId) (values : List VariableBinding)
    (selected : ParallelScopeStart.programSelected program = true)
    (admitted : stimulusAdmitted program before (.completeUserTaskInstance commandId id values) = true)
    (completed : completeTask? program before id values = some after)
    (name : String) (items : List String)
    (member : ({ name, value := .stringList items } : VariableBinding) ∈ after.variables.process.bindings) :
    ({ name, value := .stringList items } : VariableBinding) ∈ before.variables.process.bindings := by
  have absent : ∀ binding ∈ values, binding.value ≠ .stringList items := by
    simp only [stimulusAdmitted, selected, Bool.not_true, Bool.false_eq_true, ite_false] at admitted
    split at admitted <;> try contradiction
    split at admitted <;> try contradiction
    simp only [humanValuesAdmitted, Bool.and_eq_true] at admitted
    intro binding included same
    have permitted := List.all_eq_true.mp admitted.2.2 binding included
    simp [same, SerialBusinessTask.scalar] at permitted
  unfold completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · exact completeParallelScopeUserTask_stringList_provenance program before after id values completed name items member
  · obtain ⟨next, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact mergeProcessVariableBindings_stringList_provenance _ values name items absent member

/-- Both actual Service dispatch routes preserve named stringList ancestry without declaration, cardinality or entry-selector premises. -/
theorem completeEffect_stringList_provenance (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (result : EffectExecutionResult)
    (completed : completeEffect? program before id result = some after)
    (name : String) (items : List String)
    (member : ({ name, value := .stringList items } : VariableBinding) ∈ after.variables.process.bindings) :
    ({ name, value := .stringList items } : VariableBinding) ∈ before.variables.process.bindings := by
  unfold completeEffect? at completed
  split at completed <;> try contradiction
  split at completed
  · exact completeParallelScopeEffect_stringList_provenance program before after id result completed name items member
  · exact completeSerialEffect_stringList_provenance program before after id result completed name items member

end BpmnSemantics.SemanticProcess.ParallelScopeCommand

namespace BpmnSemantics.SemanticProcess.ParallelScopeStart

private theorem analysis_condition_distinct (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) :
    analysis.entry.completionBooleanName ≠ some analysis.entry.collectionName := by
  unfold analyzeProgram at analyzed
  split at analyzed <;> try contradiction
  split at analyzed <;> try contradiction
  rename_i entries entry entryEq
  repeat' (split at analyzed <;> try contradiction)
  try dsimp only at analyzed
  repeat' (split at analyzed <;> try contradiction)
  try dsimp only at analyzed
  repeat' (split at analyzed <;> try contradiction)
  obtain ⟨waits, _, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
  obtain ⟨first, _, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
  obtain ⟨converted, _, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
  obtain ⟨ordered, _, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
  obtain ⟨requirements, accepted, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
  obtain ⟨width, _, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
  cases requirements
  cases Option.some.inj analyzed
  unfold SequentialScopeData.requirementsFor at accepted
  dsimp only at accepted
  split at accepted <;> try contradiction
  rename_i checks
  intro same
  simp only at same
  by_cases collision : entry.itemName = entry.collectionName <;>
    simp_all [List.eraseDups_cons]

/-- PMIS-END-01 obtains the unique Boolean retirement condition from actual resumption capacity, including the immutable name-separation check. -/
theorem programStateCapacity_condition (program : Program) (analysis : ProgramAnalysis)
    (state : RuntimeState) (capacity : ProgramCapacity)
    (analyzed : analyzeProgram program = some analysis)
    (accepted : programStateCapacity program state = some capacity) :
    match analysis.entry.completionBooleanName with
    | none => True
    | some name => ∃ flag, state.variables.process.bindings.filter (·.name == name) =
        [{ name, value := .boolean flag }] := by
  obtain ⟨actual, _, _, actualAnalysis, admitted, _⟩ := programStartCapacity_bound_certificate
    program state.variables.process.bindings capacity
    (programStateCapacity_retains_start_capacity program state capacity accepted)
  have same : actual = analysis := Option.some.inj (actualAnalysis.symm.trans analyzed)
  subst actual
  cases condition : analysis.entry.completionBooleanName with
  | none => trivial
  | some name =>
    have distinct : name ≠ analysis.entry.collectionName := by
      simpa only [condition, ne_eq, Option.some.injEq] using analysis_condition_distinct program analysis analyzed
    simp only [SequentialScopeData.startBindingsAdmitted, Bool.and_eq_true] at admitted
    obtain ⟨⟨⟨⟨sorted, values⟩, _⟩, present⟩, _⟩ := admitted
    simp only [condition, Option.all_some] at present
    obtain ⟨binding, member, named⟩ := List.any_eq_true.mp present
    have nameEq : binding.name = name := by simpa using named
    have census := filter_key_eq_singleton_of_nodup state.variables.process.bindings (·.name) binding
      (strictlySortedStrings_nodup _ sorted) member
    have typed := (Bool.and_eq_true_iff.mp (List.all_eq_true.mp values binding member)).2
    simp only [SequentialScopeData.startBindingValueValid, nameEq, beq_eq_false_iff_ne.mpr distinct,
      condition, beq_self_eq_true, Bool.false_eq_true, ↓reduceIte] at typed
    cases value : binding.value <;> simp only [value, Bool.false_eq_true] at typed
    rename_i flag
    refine ⟨flag, ?_⟩
    cases binding
    simp_all [Bool.beq_eq_decide_eq]

/-- A quiescent bound body with admitted resumption data can retire; condition availability is derived rather than supplied by the caller. -/
theorem programStateCapacity_retirement_ready (program : Program) (analysis : ProgramAnalysis)
    (state : RuntimeState) (capacity : ProgramCapacity) (target : ScopeOccurrenceId)
    (binding : ParallelScopeBinding)
    (analyzed : analyzeProgram program = some analysis)
    (accepted : programStateCapacity program state = some capacity)
    (bound : parallelScopeBinding? analysis.entry state target = some binding)
    (quiescent : scopeQuiescent state target = true)
    (noActivity : state.activityOccurrences.any (fun activity => activity.owner == target) = false) :
    ∃ after, completeParallelScope? analysis.entry state target = some after :=
  completeParallelScope_ready analysis.entry state target binding bound
    (parallelScopeBinding_member analysis.entry state target binding bound) quiescent noActivity
    (programStateCapacity_condition program analysis state capacity analyzed accepted)

end BpmnSemantics.SemanticProcess.ParallelScopeStart
