import BpmnSemantics.SemanticProcess.ParallelScopeWaitReadiness
import BpmnSemantics.SemanticProcess.SerialBusinessTaskDataProofs

/-! # Service input admission and availability

PMIS-DATA-01 separates child-local and captured-item reads from Process data
required before Start, including empty collections. These proofs connect that
immutable analysis to lookup and preserve scalar availability through accepted writes.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

private theorem mapM_member_result {α β : Type} (values : List α) (project : α → Option β)
    (outputs : List β) (mapped : values.mapM project = some outputs)
    (value : α) (member : value ∈ values) : ∃ output ∈ outputs, project value = some output := by
  induction values generalizing outputs with
  | nil => simp at member
  | cons first rest ih =>
    rw [List.mapM_cons] at mapped
    obtain ⟨head, projected, mapped⟩ := Option.bind_eq_some_iff.mp mapped
    obtain ⟨tail, followed, same⟩ := Option.bind_eq_some_iff.mp mapped
    cases Option.some.inj same
    rcases List.mem_cons.mp member with rfl | later
    · exact ⟨head, by simp, projected⟩
    · obtain ⟨output, included, found⟩ := ih tail followed later
      exact ⟨output, by simp [included], found⟩

/-- Successful PMIS analysis retains the exact shared data requirements, rather
than reconstructing them from mutable values after entry.
-/
theorem ParallelScopeStart.analyzeProgram_data_requirements (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis) :
    SequentialScopeData.requirementsFor program analysis.entry.collectionName analysis.entry.itemName
      analysis.entry.childScopeId analysis.entry.bodyInputs analysis.entry.completionBooleanName =
        some (analysis.handlers, analysis.required) := by
  unfold ParallelScopeStart.analyzeProgram at analyzed
  split at analyzed <;> try contradiction
  split at analyzed <;> try contradiction
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
  exact accepted

/-- PMIS-DATA-01 validates initial body mappings and excludes every controller-owned name from their local targets. -/
theorem ParallelScopeStart.analyzeProgram_body_input_admission (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis) :
    SerialBusinessTask.programHandlers program = analysis.handlers ∧
      SequentialScopeData.bodyMappingsValid analysis.handlers analysis.entry.bodyInputs = true ∧
      ∀ mapping ∈ analysis.entry.bodyInputs,
        mapping.target ≠ analysis.entry.itemName ∧ mapping.target ≠ analysis.entry.collectionName ∧
          analysis.entry.completionBooleanName ≠ some mapping.target := by
  have accepted := analyzeProgram_data_requirements program analysis analyzed
  unfold SequentialScopeData.requirementsFor at accepted
  dsimp only at accepted
  split at accepted <;> try contradiction
  rename_i valid
  split at accepted <;> try contradiction
  obtain ⟨reads, _, returned⟩ := Option.bind_eq_some_iff.mp accepted
  have fields := Option.some.inj returned
  have handlers : SerialBusinessTask.programHandlers program = analysis.handlers := congrArg Prod.fst fields
  simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at valid
  refine ⟨handlers, ?_, ?_⟩
  · simpa only [handlers, Bool.not_not, Bool.not_false] using congrArg Bool.not valid.1.2
  · intro mapping member
    have excluded := List.any_eq_false.mp valid.2 mapping member
    have absent : mapping.target ∉ [analysis.entry.collectionName, analysis.entry.itemName] ++
        analysis.entry.completionBooleanName.toList := by
      simpa only [List.contains_eq_mem, decide_eq_true_eq] using excluded
    refine ⟨?_, ?_, ?_⟩
    · intro same
      exact absent (by simp [same])
    · intro same
      exact absent (by simp [same])
    · intro same
      exact absent (by simp [same])

/-- Admission validates output target order for every Service declaration,
including declarations in repeated bodies.
-/
theorem ParallelScopeStart.effect_output_targets_unique (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (declared : SemanticOperation.awaitEffect id origin input output effect route ∈ program.operations) :
    (effect.outputMappings.map (·.target)).Nodup := by
  have accepted := analyzeProgram_data_requirements program analysis analyzed
  unfold SequentialScopeData.requirementsFor at accepted
  dsimp only at accepted
  split at accepted <;> try contradiction
  split at accepted <;> try contradiction
  obtain ⟨reads, mapped, _⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨names, _, checked⟩ := mapM_member_result program.operations _ reads mapped _ declared
  simp only at checked
  split at checked <;> try contradiction
  split at checked <;> try contradiction
  rename_i valid
  simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at valid
  have mappings : SerialBusinessTask.mappingsValid (SerialBusinessTask.programHandlers program) effect.inputMappings effect.outputMappings = true := by
    simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not valid.1.1.2
  exact strictlySortedStrings_nodup _
    (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappings).1).1).2

/-- Every parent Service read is required at Start and excludes the collection
and Boolean condition. Body-local and captured-item exemptions apply only to
operations owned by the repeated child definition.
-/
theorem ParallelScopeStart.parent_effect_requirements (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (candidate : InternalOperationOccurrence)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitEffect id origin input output effect route))
    (parent : candidate.owner.definitionScopeId ≠ analysis.entry.childScopeId) :
    SerialBusinessTask.mappingsValid analysis.handlers effect.inputMappings effect.outputMappings = true ∧
      ∀ name ∈ SerialBusinessTask.readNames effect.inputMappings,
        name ∈ analysis.required ∧ name ≠ analysis.entry.collectionName ∧ analysis.entry.completionBooleanName ≠ some name := by
  have declared := (resolveInternalOperationOccurrence_declaration program state candidate _ resolved).1
  have owned := resolved_definition_owner program state candidate _ resolved
  have accepted := analyzeProgram_data_requirements program analysis analyzed
  unfold SequentialScopeData.requirementsFor at accepted
  dsimp only at accepted
  split at accepted <;> try contradiction
  split at accepted <;> try contradiction
  obtain ⟨reads, mapped, returned⟩ := Option.bind_eq_some_iff.mp accepted
  have fields := Option.some.inj returned
  obtain ⟨names, included, checked⟩ := mapM_member_result program.operations _ reads mapped _ declared
  simp only at checked
  split at checked <;> try contradiction
  rename_i bindings owner selected
  have ownerEq : owner.scopeId = candidate.owner.definitionScopeId := by
    have filters : program.operationScopes.filter (fun binding => decide (binding.operationId = id)) = [owner] := by
      simpa only [Bool.beq_eq_decide_eq] using selected
    change operationOwningScope? program id = some candidate.owner.definitionScopeId at owned
    unfold operationOwningScope? at owned
    rw [filters] at owned
    exact Option.some.inj owned
  split at checked <;> try contradiction
  rename_i valid
  simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at valid
  have handlers : SerialBusinessTask.programHandlers program = analysis.handlers := congrArg Prod.fst fields
  have required := congrArg Prod.snd fields
  dsimp only at required
  refine ⟨?_, ?_⟩
  · simpa only [handlers, Bool.not_not, Bool.not_false] using congrArg Bool.not valid.1.1.2
  · intro name member
    have keep : (owner.scopeId != analysis.entry.childScopeId) = true := by simp [ownerEq, parent]
    have namesEq : SerialBusinessTask.readNames effect.inputMappings = names := by
      have allKept : (SerialBusinessTask.readNames effect.inputMappings).filter (fun name =>
          owner.scopeId != analysis.entry.childScopeId ||
            (!(analysis.entry.bodyInputs.map (·.target)).contains name && name != analysis.entry.itemName)) =
          SerialBusinessTask.readNames effect.inputMappings := List.filter_eq_self.mpr (by simp [keep])
      simpa only [allKept, Option.some.injEq] using checked
    have readIncluded : name ∈ reads.flatten := List.mem_flatten.mpr ⟨names, included, namesEq ▸ member⟩
    refine ⟨?_, ?_⟩
    · rw [← required]
      simpa only [List.mem_eraseDups, List.mem_append] using Or.inr readIncluded
    · have scalarReads : (SerialBusinessTask.readNames effect.inputMappings).all
          (fun name => name != analysis.entry.collectionName && analysis.entry.completionBooleanName != some name) = true := by
        simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not valid.2
      simpa only [Bool.and_eq_true, bne_iff_ne] using List.all_eq_true.mp scalarReads name member

/-- PMIS-DATA-01 classifies every resolved child Service read as an initial local, captured item, or pre-Start Process requirement. -/
theorem ParallelScopeStart.child_effect_requirements (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (candidate : InternalOperationOccurrence)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitEffect id origin input output effect route))
    (child : candidate.owner.definitionScopeId = analysis.entry.childScopeId) :
    SerialBusinessTask.mappingsValid analysis.handlers effect.inputMappings effect.outputMappings = true ∧
      ∀ name ∈ SerialBusinessTask.readNames effect.inputMappings,
        (name ∈ analysis.entry.bodyInputs.map (·.target) ∨ name = analysis.entry.itemName ∨ name ∈ analysis.required) ∧
          name ≠ analysis.entry.collectionName ∧ analysis.entry.completionBooleanName ≠ some name := by
  have declared := (resolveInternalOperationOccurrence_declaration program state candidate _ resolved).1
  have owned := resolved_definition_owner program state candidate _ resolved
  have accepted := analyzeProgram_data_requirements program analysis analyzed
  unfold SequentialScopeData.requirementsFor at accepted
  dsimp only at accepted
  split at accepted <;> try contradiction
  split at accepted <;> try contradiction
  obtain ⟨reads, mapped, returned⟩ := Option.bind_eq_some_iff.mp accepted
  have fields := Option.some.inj returned
  obtain ⟨names, included, checked⟩ := mapM_member_result program.operations _ reads mapped _ declared
  simp only at checked
  split at checked <;> try contradiction
  rename_i bindings owner selected
  have ownerEq : owner.scopeId = candidate.owner.definitionScopeId := by
    have filters : program.operationScopes.filter (fun binding => decide (binding.operationId = id)) = [owner] := by
      simpa only [Bool.beq_eq_decide_eq] using selected
    change operationOwningScope? program id = some candidate.owner.definitionScopeId at owned
    unfold operationOwningScope? at owned
    rw [filters] at owned
    exact Option.some.inj owned
  split at checked <;> try contradiction
  rename_i valid
  simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at valid
  have handlers : SerialBusinessTask.programHandlers program = analysis.handlers := congrArg Prod.fst fields
  have required := congrArg Prod.snd fields
  dsimp only at required
  refine ⟨?_, ?_⟩
  · simpa only [handlers, Bool.not_not, Bool.not_false] using congrArg Bool.not valid.1.1.2
  · intro name member
    have scalarReads : (SerialBusinessTask.readNames effect.inputMappings).all
        (fun name => name != analysis.entry.collectionName && analysis.entry.completionBooleanName != some name) = true := by
      simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not valid.2
    refine ⟨?_, by simpa only [Bool.and_eq_true, bne_iff_ne] using List.all_eq_true.mp scalarReads name member⟩
    by_cases localName : name ∈ analysis.entry.bodyInputs.map (·.target)
    · exact Or.inl localName
    · by_cases item : name = analysis.entry.itemName
      · exact Or.inr (Or.inl item)
      · refine Or.inr (Or.inr ?_)
        have namesEq : (SerialBusinessTask.readNames effect.inputMappings).filter (fun name =>
            owner.scopeId != analysis.entry.childScopeId ||
              (!(analysis.entry.bodyInputs.map (·.target)).contains name && name != analysis.entry.itemName)) = names :=
          Option.some.inj checked
        have retained : name ∈ names := by
          rw [← namesEq]
          apply List.mem_filter.mpr
          exact ⟨member, by simp [ownerEq, child, List.contains_eq_mem, localName, item]⟩
        have readIncluded : name ∈ reads.flatten := List.mem_flatten.mpr ⟨names, included, retained⟩
        rw [← required]
        simpa only [List.mem_eraseDups, List.mem_append] using Or.inr readIncluded

/-- Successful capacity admission supplies a unique scalar lookup for each
required parent read; explicit null remains an available value.
-/
theorem ParallelScopeStart.capacity_scalar_read (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (bindings : List VariableBinding) (capacity : ParallelScopeStart.ProgramCapacity)
    (accepted : ParallelScopeStart.programStartCapacity program bindings = some capacity)
    (name : String) (required : name ∈ analysis.required)
    (notCollection : name ≠ analysis.entry.collectionName) (notCondition : analysis.entry.completionBooleanName ≠ some name) :
    ∃ value, enclosingVariable? bindings name = some value := by
  obtain ⟨actual, _, _, same, admitted, _⟩ := ParallelScopeStart.programStartCapacity_bound_certificate program bindings capacity accepted
  rw [analyzed] at same
  cases Option.some.inj same
  simp only [SequentialScopeData.startBindingsAdmitted, Bool.and_eq_true] at admitted
  obtain ⟨⟨⟨⟨sorted, values⟩, _⟩, _⟩, supplied⟩ := admitted
  obtain ⟨binding, present, named⟩ := List.any_eq_true.mp (List.all_eq_true.mp supplied name required)
  have nameEq : binding.name = name := eq_of_beq named
  have single := filter_key_eq_singleton_of_nodup bindings (·.name) binding (strictlySortedStrings_nodup _ sorted) present
  have typed := (Bool.and_eq_true_iff.mp (List.all_eq_true.mp values binding present)).2
  have scalar : SerialBusinessTask.scalar binding.value = true := by
    simpa only [SequentialScopeData.startBindingValueValid, nameEq, beq_eq_false_iff_ne.mpr notCollection,
      beq_eq_false_iff_ne.mpr notCondition, Bool.false_eq_true, ↓reduceIte] using typed
  exact ⟨binding.value, enclosing_lookup_unique bindings name binding
    (by simpa only [nameEq, Bool.beq_eq_decide_eq] using single) scalar⟩

/-- Admission's scalar requirements make all parent Service inputs evaluable
at the checked Process context, without assuming an evaluator successor.
-/
theorem ParallelScopeStart.capacity_parent_effect_inputs (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (capacity : ParallelScopeStart.ProgramCapacity)
    (accepted : ParallelScopeStart.programStartCapacity program state.variables.process.bindings = some capacity)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitEffect id origin input output effect route))
    (parent : candidate.owner.definitionScopeId ≠ analysis.entry.childScopeId) :
    ∃ arguments, evaluateEffectInputs? program state candidate.owner effect.inputMappings = some arguments := by
  obtain ⟨mappings, reads⟩ := parent_effect_requirements program analysis analyzed state candidate id origin input output effect route resolved parent
  have selected : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at analyzed
    | true => simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using chosen
  have ordinary : sequentialScopeProgramSelected program = false := by simp [sequentialScopeProgramSelected, selected]
  simp only [evaluateEffectInputs?, ordinary, Bool.false_and, Bool.false_eq_true, ↓reduceIte]
  apply SerialBusinessTask.inputs_evaluable analysis.handlers state.variables.process.bindings effect.inputMappings
  · exact strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappings).1).1).1
  · exact (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappings).1).2
  · intro name member
    obtain ⟨required, notCollection, notCondition⟩ := reads name member
    exact capacity_scalar_read program analysis analyzed state.variables.process.bindings capacity accepted name required notCollection notCondition


private theorem scalar_lookup_certificate (bindings : List VariableBinding) (name : String)
    (value : VariableValue) (found : enclosingVariable? bindings name = some value) :
    ∃ binding, bindings.filter (fun binding => decide (binding.name = name)) = [binding] ∧
      SerialBusinessTask.scalar binding.value = true := by
  unfold enclosingVariable? at found
  split at found <;> try contradiction
  rename_i candidates binding selected
  refine ⟨binding, by simpa only [Bool.beq_eq_decide_eq] using selected, ?_⟩
  cases typed : binding.value <;> simp_all [SerialBusinessTask.scalar]

/-- Replacing a scalar read with another scalar, including null, preserves a
unique lookup. This needs uniqueness only in the patch and at the selected read,
not a scalar-only Process store: collection and condition values may coexist.
-/
theorem parallelScope_scalar_read_merge (existing patch : List VariableBinding) (name : String)
    (available : ∃ value, enclosingVariable? existing name = some value)
    (unique : (patch.map (·.name)).Nodup)
    (typed : ∀ binding ∈ patch, binding.name = name → SerialBusinessTask.scalar binding.value = true) :
    ∃ value, enclosingVariable? (mergeProcessVariableBindings existing patch) name = some value := by
  obtain ⟨oldValue, found⟩ := available
  obtain ⟨old, census, oldScalar⟩ := scalar_lookup_certificate existing name oldValue found
  by_cases replaced : name ∈ patch.map (·.name)
  · obtain ⟨binding, member, named⟩ := List.mem_map.mp replaced
    have single := filter_key_eq_singleton_of_nodup patch (·.name) binding unique member
    have removed : (existing.filter (fun binding => !(patch.map (·.name)).contains binding.name)).filter
        (fun binding => decide (binding.name = name)) = [] := by
      apply List.filter_eq_nil_iff.mpr
      intro value present
      have retained := (List.mem_filter.mp present).2
      by_cases same : value.name = name
      · simp [same, replaced] at retained
      · simp [same]
    have selected := (mergeProcessVariableBindings_perm existing patch).filter (fun binding => decide (binding.name = name))
    rw [List.filter_append, removed, List.append_nil] at selected
    rw [← named, single] at selected
    have exactOne : (mergeProcessVariableBindings existing patch).filter (fun value => decide (value.name = name)) = [binding] := by
      simpa [named] using selected
    exact ⟨binding.value, enclosing_lookup_unique _ name binding
      (by simpa only [Bool.beq_eq_decide_eq] using exactOne) (typed binding member named)⟩
  · have untouched : ∀ binding ∈ patch, binding.name ≠ name := by
      intro binding member same
      exact replaced (List.mem_map.mpr ⟨binding, member, same⟩)
    have single := sequentialScope_merge_preserves_protected existing patch name old census untouched
    exact ⟨old.value, enclosing_lookup_unique _ name old
      (by simpa only [Bool.beq_eq_decide_eq] using single) oldScalar⟩

/-- The shared nearest-existing writer preserves every available Process scalar:
local writes stay local, while the Process patch has unique scalar names.
-/
theorem parallelScope_scope_write_scalar_read (before after : ScopedVariables) (owner : ScopeOccurrenceId)
    (patch : List VariableBinding) (written : writeScopeVariables? before owner patch = some after)
    (name : String) (available : ∃ value, enclosingVariable? before.process.bindings name = some value) :
    ∃ value, enclosingVariable? after.process.bindings name = some value := by
  unfold writeScopeVariables? at written
  obtain ⟨scope, _, written⟩ := Option.bind_eq_some_iff.mp written
  split at written <;> try contradiction
  rename_i accepted
  simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at accepted
  cases Option.some.inj written
  apply parallelScope_scalar_read_merge _ _ name available
  · have unique : (patch.map (·.name)).Nodup := by
      have checked : scopeVariableNamesUnique patch = true := by
        simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not accepted.1.2
      exact of_decide_eq_true checked
    exact (List.filter_sublist.map (fun value : VariableBinding => value.name)).nodup unique
  · intro binding member _
    have valid : patch.all (fun binding => scopeVariableScalar binding.value) = true := by
      simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not accepted.2
    have scalar := List.all_eq_true.mp valid binding (List.mem_filter.mp member).1
    cases value : binding.value <;> simp_all only [scopeVariableScalar, SerialBusinessTask.scalar, Bool.false_eq_true]

/-- The protected Boolean condition cannot invalidate a different scalar read;
both Human and Service body writers reuse the same typed Process merge.
-/
theorem parallelScope_bound_write_scalar_read (before after : ScopedVariables) (owner : ScopeOccurrenceId)
    (collection item : String) (condition : Option String) (handlers : List String)
    (patch : List VariableBinding) (kind : MultiInstanceScopeWriteKind)
    (written : writeBoundMultiInstanceScopeValues? before owner collection item condition handlers patch kind = some after)
    (name : String) (notCondition : condition ≠ some name)
    (available : ∃ value, enclosingVariable? before.process.bindings name = some value) :
    ∃ value, enclosingVariable? after.process.bindings name = some value := by
  unfold writeBoundMultiInstanceScopeValues? at written
  dsimp only at written
  split at written <;> try contradiction
  obtain ⟨middle, bodyWrite, written⟩ := Option.bind_eq_some_iff.mp written
  cases Option.some.inj written
  obtain ⟨value, found⟩ := parallelScope_scope_write_scalar_read before middle owner _ bodyWrite name available
  obtain ⟨binding, census, typed⟩ := scalar_lookup_certificate middle.process.bindings name value found
  have untouched : ∀ binding ∈ patch.filter (fun binding => condition == some binding.name), binding.name ≠ name := by
    intro binding member same
    exact notCondition (by simpa only [same, beq_iff_eq] using (List.mem_filter.mp member).2)
  have single := sequentialScope_merge_preserves_protected middle.process.bindings _ name binding census untouched
  exact ⟨binding.value, enclosing_lookup_unique _ name binding
    (by simpa only [Bool.beq_eq_decide_eq] using single) typed⟩

/-- A mapped Service result preserves scalar availability when its stored output
list has the admitted unique targets. Payload validation alone does not establish
that declaration-bound premise for an arbitrary injected wait.
-/
theorem parallelScope_serial_patch_scalar_read (handlers : List String) (outputs : List VariableMapping)
    (before patch after : List VariableBinding) (written : serialEffectPatch? handlers outputs before patch = some after)
    (unique : (outputs.map (·.target)).Nodup)
    (name : String) (available : ∃ value, enclosingVariable? before name = some value) :
    ∃ value, enclosingVariable? after name = some value := by
  obtain ⟨_, sources, writes, _, _, _, mapped, merged⟩ := serial_patch_sound handlers outputs before patch after written
  have mappedShape (mappings : List VariableMapping) (writtenValues : List VariableBinding)
      (mapped : mappings.mapM (fun mapping => match mapping.expression with
        | .localVariable name => do
            let value ← enclosingVariable? patch name
            return { name := mapping.target, value : VariableBinding }
        | _ => none) = some writtenValues) :
      writtenValues.map (·.name) = mappings.map (·.target) ∧
        ∀ binding ∈ writtenValues, SerialBusinessTask.scalar binding.value = true := by
    induction mappings generalizing writtenValues with
    | nil =>
      simp only [List.mapM_nil, Option.pure_def, Option.some.injEq] at mapped
      subst writtenValues
      exact ⟨rfl, by simp⟩
    | cons first rest ih =>
      rw [List.mapM_cons] at mapped
      obtain ⟨head, chosen, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨tail, followed, same⟩ := Option.bind_eq_some_iff.mp mapped
      cases Option.some.inj same
      have remaining := ih tail followed
      cases expression : first.expression <;> simp only [expression] at chosen <;> try contradiction
      obtain ⟨value, found, chosen⟩ := Option.bind_eq_some_iff.mp chosen
      cases Option.some.inj chosen
      refine ⟨by simp [remaining.1], ?_⟩
      intro binding member
      rcases List.mem_cons.mp member with rfl | later
      · exact SerialBusinessTask.enclosing_value_scalar patch _ value found
      · exact remaining.2 binding later
  have shape := mappedShape outputs writes mapped
  rw [merged]
  exact parallelScope_scalar_read_merge before writes name available (shape.1 ▸ unique)
    (fun binding member _ => shape.2 binding member)

/-- Capacity admission plus actual prefix invariants removes the arbitrary
input-evaluation premise from native parent Service enabledness at that context.
-/
theorem ParallelScopeInternalPrefixReachable.parent_effect_enabled_at_capacity (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (capacity : ParallelScopeStart.ProgramCapacity)
    (accepted : ParallelScopeStart.programStartCapacity program state.variables.process.bindings = some capacity)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitEffect id origin input output effect route))
    (parent : candidate.owner.definitionScopeId ≠ analysis.entry.childScopeId)
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1) :
    ∃ after, applyInternalOperationOccurrence? program state candidate = some after := by
  obtain ⟨arguments, inputs⟩ := ParallelScopeStart.capacity_parent_effect_inputs program analysis analyzed state capacity accepted
    candidate id origin input output effect route resolved parent
  exact ⟨_, reachable.parent_effect_enabled program analysis analyzed state instanceId running candidate id origin input output
    effect route resolved parent unit arguments inputs⟩


private theorem parallel_write_scalar_read (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (before : RuntimeState) (after : ScopedVariables) (owner : ScopeOccurrenceId)
    (patch : List VariableBinding) (kind : MultiInstanceScopeWriteKind)
    (written : writeParallelScopeValues? program before owner patch kind = some after)
    (name : String) (notCondition : analysis.entry.completionBooleanName ≠ some name)
    (available : ∃ value, enclosingVariable? before.variables.process.bindings name = some value) :
    ∃ value, enclosingVariable? after.process.bindings name = some value := by
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := ParallelScopeStart.analyzeProgram_body_certificate program analysis analyzed
  unfold writeParallelScopeValues? at written
  rw [entries] at written
  cases selected : (analysis.entry.childScopeId == owner.definitionScopeId) <;>
    simp only [List.filter_cons, List.filter_nil, selected, Bool.false_eq_true, ↓reduceIte, bind] at written <;> try contradiction
  obtain ⟨binding, _, written⟩ := Option.bind_eq_some_iff.mp written
  exact parallelScope_bound_write_scalar_read _ after owner _ _ _ _ patch kind written name notCondition available

/-- Admitted Human completion preserves every available scalar other than the
protected condition, through either the parent or repeated-body route.
-/
theorem ParallelScopeCommand.completeTask_scalar_read (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (before after : RuntimeState) (id : UserTaskInstanceId) (values : List VariableBinding)
    (dataAdmitted : ParallelScopeCommand.humanValuesAdmitted analysis values = true)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after)
    (name : String) (notCondition : analysis.entry.completionBooleanName ≠ some name)
    (available : ∃ value, enclosingVariable? before.variables.process.bindings name = some value) :
    ∃ value, enclosingVariable? after.variables.process.bindings name = some value := by
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact parallel_write_scalar_read program analysis analyzed before variables _ values .userTask written name notCondition available
  · obtain ⟨middle, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    obtain ⟨sorted, permitted⟩ := Bool.and_eq_true_iff.mp dataAdmitted
    apply parallelScope_scalar_read_merge _ values name available (strictlySortedStrings_nodup _ sorted)
    intro binding member same
    have typed := List.all_eq_true.mp permitted binding member
    simp only [Bool.and_eq_true] at typed
    simpa only [same, beq_eq_false_iff_ne.mpr notCondition, Bool.false_eq_true, ↓reduceIte] using typed.2

/-- Service completion preserves scalar reads on both routes. The ordinary route
uses output-target uniqueness from the stored wait; proving that fact from actual
issuance is a separate reachability obligation, not a payload-admission consequence.
-/
theorem ParallelScopeCommand.completeEffect_scalar_read (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (before after : RuntimeState) (id : EffectOccurrenceId) (result : EffectExecutionResult)
    (outputTargets : ∀ wait ∈ before.effectWaits, (wait.outputMappings.map (·.target)).Nodup)
    (completed : ParallelScopeCommand.completeEffect? program before id result = some after)
    (name : String) (notCondition : analysis.entry.completionBooleanName ≠ some name)
    (available : ∃ value, enclosingVariable? before.variables.process.bindings name = some value) :
    ∃ value, enclosingVariable? after.variables.process.bindings name = some value := by
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selected
  have member : wait ∈ before.effectWaits := (List.mem_filter.mp
    (selected.symm ▸ (show wait ∈ [wait] from by simp))).1
  split at completed
  · unfold completeParallelScopeEffect? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact parallel_write_scalar_read program analysis analyzed before variables _ _ .serviceTask written name notCondition available
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeSerialActivityScope? at written
    split at written <;> try contradiction
    obtain ⟨bindings, mapped, written⟩ := Option.bind_eq_some_iff.mp written
    cases Option.some.inj written
    cases Option.some.inj completed
    exact parallelScope_serial_patch_scalar_read _ wait.outputMappings _ _ bindings mapped (outputTargets wait member) name available


/-- A valid result payload does not validate an arbitrary stored output list.
Actual issuance must supply declaration-bound target uniqueness before the
ordinary completion route can be used in scalar-availability preservation.
-/
theorem parallelScope_result_payload_does_not_ensure_unique_targets :
    serialEffectPatch? []
      [{ target := "out", expression := .localVariable "value" },
       { target := "out", expression := .localVariable "value" }]
      [] [{ name := "value", value := .string "ok" }] =
        some [{ name := "out", value := .string "ok" }, { name := "out", value := .string "ok" }] := by
  decide +kernel

end BpmnSemantics.SemanticProcess
