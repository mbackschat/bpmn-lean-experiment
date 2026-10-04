import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.EffectCompletion
import BpmnSemantics.SemanticProcess.WaitActivation

/-! SBT-CHAIN-01, SBT-INPUT-01 and SBT-RESULT-01 connect independent chain/read analysis to immutable containing-context evaluation, canonical mapped results and non-target frames. These quantified laws supply the unified reachable suffix invariant. -/

namespace BpmnSemantics.SemanticProcess

/-- SBT-INPUT-01's containing lookup uses exact presence, including explicit null. -/
theorem enclosing_lookup_unique (context : List VariableBinding) (name : String)
    (binding : VariableBinding)
    (unique : context.filter (·.name == name) = [binding])
    (typed : SerialBusinessTask.scalar binding.value = true) :
    enclosingVariable? context name = some binding.value := by
  rw [enclosingVariable?, unique]
  cases value : binding.value <;> simp_all [SerialBusinessTask.scalar]

/-- Each input consults the original context even when an earlier target shadows its source. -/
theorem enclosing_input_cons (context : List VariableBinding) (target name : String)
    (rest : List VariableMapping) (value : VariableValue) (tail : List VariableBinding)
    (lookup : enclosingVariable? context name = some value)
    (remaining : evaluateEnclosingInputMappings context rest = some tail) :
    evaluateEnclosingInputMappings context
      ({ target, expression := .enclosingVariable name } :: rest) =
      some ({ name := target, value } :: tail) := by
  simp [evaluateEnclosingInputMappings, lookup, remaining]

/-- SBT-SNAPSHOT-01 ties the stored local scope to the same evaluated snapshot as the wait. -/
theorem serial_activation_local_snapshot (state : RuntimeState)
    (instanceId : SemanticId) (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (effect : EffectDefinition) (arguments : List VariableBinding)
    (evaluated : evaluateEnclosingInputMappings state.variables.process.bindings effect.inputMappings = some arguments)
    (fresh : ∀ scope ∈ state.variables.activities,
      activityScopeMatches
        ⟨instanceId, ⟨effect.elementId.value⟩, effectActivationCount state effect.elementId + 1⟩ scope = false) :
    let effectOwner : EffectOccurrenceId :=
      ⟨instanceId, ⟨effect.elementId.value⟩, effectActivationCount state effect.elementId + 1⟩
    (activateEffect state instanceId owner input output effect none).variables.activities.filter
      (activityScopeMatches effectOwner) = [{ owner := .effectOccurrence effectOwner, bindings := arguments }] := by
  simp only [activateEffect, evaluated, Option.getD_some, addActivityVariableScope]
  exact filter_insertActivityVariableScope_eq_singleton _ _
    (by simp [activityScopeMatches, localDataOwnerMatches]) fresh

/-- A successful patch exposes exact distinct source coverage and every evaluated output before the atomic merge. -/
theorem serial_patch_sound (handlers : List String) (outputs : List VariableMapping)
    (bindings patch merged : List VariableBinding)
    (completed : serialEffectPatch? handlers outputs bindings patch = some merged) :
    SerialBusinessTask.bindingsValid handlers patch = true ∧
    ∃ sources writes,
      outputs.mapM (fun mapping => match mapping.expression with
        | .localVariable name => some name | _ => none) = some sources ∧
      sources.eraseDups.length = patch.length ∧
      sources.all (fun name => patch.any (·.name == name)) = true ∧
      outputs.mapM (fun mapping => match mapping.expression with
        | .localVariable name => do
            let value ← enclosingVariable? patch name
            return { name := mapping.target, value : VariableBinding }
        | _ => none) = some writes ∧
      merged = mergeProcessVariableBindings bindings writes := by
  unfold serialEffectPatch? at completed
  split at completed
  · contradiction
  · rename_i valid
    have valid' : SerialBusinessTask.bindingsValid handlers patch = true := by simpa using valid
    obtain ⟨sources, sourcesEq, completed⟩ := Option.bind_eq_some_iff.mp completed
    split at completed
    · contradiction
    · rename_i covered
      obtain ⟨writes, writesEq, completed⟩ := Option.bind_eq_some_iff.mp completed
      simp only [Option.pure_def, Option.some.injEq] at completed
      have coverage : sources.eraseDups.length = patch.length ∧
          sources.all (fun name => patch.any (·.name == name)) = true := by simpa using covered
      exact ⟨valid', sources, writes, sourcesEq, coverage.1, coverage.2, writesEq, completed.symm⟩

/-- SBT-RESULT-01 writes the complete mapped patch and preserves every binding outside its targets. -/
theorem serial_patch_frame (existing writes : List VariableBinding) (binding : VariableBinding)
    (present : binding ∈ existing) (untouched : binding.name ∉ writes.map (·.name)) :
    binding ∈ mergeProcessVariableBindings existing writes := by
  apply (mergeProcessVariableBindings_perm existing writes).mem_iff.mpr
  apply List.mem_append_right
  apply List.mem_filter.mpr
  exact ⟨present, by simp only [List.contains_eq_mem]; simp [untouched]⟩

/-- Completing one effect disposes exactly its owner and preserves every other local scope. -/
theorem serial_scope_completion_disposes_exactly (handlers : List String)
    (before after : ScopedVariables) (owner : EffectOccurrenceId)
    (outputs : List VariableMapping) (result : EffectExecutionResult)
    (completed : completeSerialActivityScope? handlers before owner outputs result = some after) :
    (before.activities.filter (activityScopeMatches owner)).length = 1 ∧
    after.activities = before.activities.filter (fun scope => !activityScopeMatches owner scope) ∧
    after.processInterfaces = before.processInterfaces := by
  unfold completeSerialActivityScope? at completed
  split at completed
  · rename_i scope patch selection resultEq
    obtain ⟨bindings, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases completed
    constructor
    · grind
    · exact ⟨rfl, rfl⟩
  · contradiction

/-- SBT-AVAILABLE-01 classifies every read as initially required or supplied by an earlier declared Service output. Human vertices have no writes. -/
theorem serial_read_has_required_or_prior_output
    (earlier : List SerialBusinessTask.Vertex) (vertex : SerialBusinessTask.Vertex)
    (suffix : List SerialBusinessTask.Vertex) (produced : List String) (name : String)
    (read : name ∈ vertex.reads) :
    name ∈ SerialBusinessTask.requiredInputs (earlier ++ vertex :: suffix) produced ∨
      name ∈ produced ∨ ∃ prior ∈ earlier, name ∈ prior.writes := by
  induction earlier generalizing produced with
  | nil =>
      by_cases present : name ∈ produced
      · exact Or.inr (Or.inl present)
      · apply Or.inl
        simp only [List.nil_append, SerialBusinessTask.requiredInputs, List.mem_append]
        exact Or.inl (List.mem_filter.mpr ⟨read, by simp [List.contains_eq_mem, present]⟩)
  | cons first rest ih =>
      rcases ih (first.writes ++ produced) with needed | supplied | ⟨prior, member, written⟩
      · apply Or.inl
        simp only [List.cons_append, SerialBusinessTask.requiredInputs, List.mem_append]
        exact Or.inr needed
      · rcases List.mem_append.mp supplied with written | initial
        · exact Or.inr (Or.inr ⟨first, by simp, written⟩)
        · exact Or.inr (Or.inl initial)
      · exact Or.inr (Or.inr ⟨prior, by simp [member], written⟩)


namespace SerialBusinessTask

def OperationAllowed : SemanticOperation → Prop
  | .initiate .. | .awaitUserTask .. | .awaitEffect _ _ _ _ _ none
  | .reachNoneEnd .. | .completeScope _ _ _ none => True
  | _ => False

theorem unique_some {values : List α} {value : α}
    (found : StructuredComposition.unique? values = some value) : values = [value] := by
  cases values with
  | nil => simp [StructuredComposition.unique?] at found
  | cons first rest =>
      cases rest with
      | nil => simpa [StructuredComposition.unique?] using found
      | cons second more => simp [StructuredComposition.unique?] at found

private theorem mapM_member_some (values : List α) (project : α → Option β)
    (results : List β) (mapped : values.mapM project = some results)
    (value : α) (member : value ∈ values) :
    ∃ result ∈ results, project value = some result := by
  induction values generalizing results with
  | nil => simp at member
  | cons first rest ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨head, headEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨tail, tailEq, resultEq⟩ := Option.bind_eq_some_iff.mp mapped
      cases Option.some.inj resultEq
      rcases List.mem_cons.mp member with rfl | later
      · exact ⟨head, by simp, headEq⟩
      · obtain ⟨result, included, projected⟩ := ih tail tailEq later
        exact ⟨result, List.mem_cons_of_mem _ included, projected⟩

theorem program_analysis_projection (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    ∃ id origin scope vertices,
      program.operations.filter StructuredComposition.isScopeCompletion = [.completeScope id origin scope none] ∧
      (program.operations.filter fun op => !StructuredComposition.isScopeCompletion op).mapM
        (operationVertex? program) = some vertices ∧ analyze vertices = some analysis := by
  unfold programAnalysis at analyzed
  split at analyzed
  · contradiction
  · obtain ⟨completion, selected, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
    cases completion <;> try simp only at analyzed
    all_goals try contradiction
    case completeScope id origin scope output =>
      cases output with
      | some output => contradiction
      | none =>
          dsimp only at analyzed
          split at analyzed
          · contradiction
          · obtain ⟨vertices, projected, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
            exact ⟨id, origin, scope, vertices, unique_some selected, projected, analyzed⟩

theorem projected_operation_allowed (program : Program) (operation : SemanticOperation)
    (vertex : Vertex) (projected : operationVertex? program operation = some vertex) :
    OperationAllowed operation := by
  cases operation <;> simp_all [OperationAllowed, operationVertex?]
  case awaitEffect id origin input output effect route =>
    cases route <;> simp_all

theorem program_analysis_operations_allowed (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    ∀ operation ∈ program.operations, OperationAllowed operation := by
  obtain ⟨id, origin, scope, vertices, completion, projected, _⟩ :=
    program_analysis_projection program analysis analyzed
  intro operation member
  by_cases completes : StructuredComposition.isScopeCompletion operation = true
  · have included := List.mem_filter.mpr ⟨member, completes⟩
    rw [completion] at included
    rw [List.mem_singleton.mp included]
    trivial
  · have included : operation ∈ program.operations.filter (fun op => !StructuredComposition.isScopeCompletion op) :=
      List.mem_filter.mpr ⟨member, by simpa using completes⟩
    obtain ⟨vertex, _, matched⟩ := mapM_member_some _ _ _ projected operation included
    exact projected_operation_allowed program operation vertex matched

def ChainLinks : List Vertex → Prop
  | [] => True
  | [vertex] => vertex.kind = .finish ∧ vertex.outputs = []
  | vertex :: next :: rest => vertex.outputs = [next.id] ∧ ChainLinks (next :: rest)

/-- One traversal certificate supplies exact head selection, whole-chain coverage and adjacent links from the same recursive admission. -/
theorem follow_certificate (fuel : Nat) (vertices ordered : List Vertex) (id : String)
    (followed : follow fuel vertices id = some ordered) :
    (∃ vertex rest, ordered = vertex :: rest ∧ vertices.filter (·.id == id) = [vertex] ∧ vertex.id = id) ∧
      ordered.Perm vertices ∧ ChainLinks ordered := by
  induction fuel generalizing vertices ordered id with
  | zero => simp [follow] at followed
  | succ fuel ih =>
      simp only [follow] at followed
      obtain ⟨vertex, selected, followed⟩ := Option.bind_eq_some_iff.mp followed
      have unique := unique_some selected
      have member : vertex ∈ vertices.filter (·.id == id) := by rw [unique]; simp
      have named : vertex.id = id := by simpa using (List.mem_filter.mp member).2
      have partition : (vertex :: vertices.filter (·.id != id)).Perm vertices := by
        have partition := List.filter_append_perm (fun v : Vertex => v.id == id) vertices
        simpa only [unique, List.singleton_append, bne] using partition
      split at followed
      · rename_i finish outputs
        split at followed
        · rename_i empty
          cases Option.some.inj followed
          have noRest : vertices.filter (·.id != id) = [] := by simpa using empty
          exact ⟨⟨vertex, [], rfl, unique, named⟩, by simpa [noRest] using partition, finish, outputs⟩
        · contradiction
      · rename_i next kind outputs
        obtain ⟨tail, tailFollowed, followed⟩ := Option.bind_eq_some_iff.mp followed
        obtain ⟨⟨head, rest, rfl, _, nextName⟩, permutation, linked⟩ := ih _ _ _ tailFollowed
        cases Option.some.inj followed
        exact ⟨⟨vertex, head :: rest, rfl, unique, named⟩, (permutation.cons vertex).trans partition,
          by simpa [nextName] using outputs, linked⟩
      · rename_i next kind outputs
        obtain ⟨tail, tailFollowed, followed⟩ := Option.bind_eq_some_iff.mp followed
        obtain ⟨⟨head, rest, rfl, _, nextName⟩, permutation, linked⟩ := ih _ _ _ tailFollowed
        cases Option.some.inj followed
        exact ⟨⟨vertex, head :: rest, rfl, unique, named⟩, (permutation.cons vertex).trans partition,
          by simpa [nextName] using outputs, linked⟩
      · rename_i next kind outputs
        obtain ⟨tail, tailFollowed, followed⟩ := Option.bind_eq_some_iff.mp followed
        obtain ⟨⟨head, rest, rfl, _, nextName⟩, permutation, linked⟩ := ih _ _ _ tailFollowed
        cases Option.some.inj followed
        exact ⟨⟨vertex, head :: rest, rfl, unique, named⟩, (permutation.cons vertex).trans partition,
          by simpa [nextName] using outputs, linked⟩
      · contradiction

/-- Following the admitted chain consumes every vertex exactly once, excluding disconnected material and repeated visits. -/
theorem follow_preserves_all_vertices (fuel : Nat) (vertices ordered : List Vertex) (id : String)
    (followed : follow fuel vertices id = some ordered) : ordered.Perm vertices :=
  (follow_certificate fuel vertices ordered id followed).2.1

def BindingPresent (bindings : List VariableBinding) (name : String) : Prop :=
  ∃ binding ∈ bindings, binding.name = name

/-- Canonical string/null ingress never deletes a present name, including when a new explicit null replaces its value. -/
theorem merge_preserves_binding_presence (existing patch : List VariableBinding) (name : String)
    (present : BindingPresent existing name) :
    BindingPresent (mergeProcessVariableBindings existing patch) name := by
  by_cases replaced : name ∈ patch.map (·.name)
  · obtain ⟨binding, member, same⟩ := List.mem_map.mp replaced
    refine ⟨binding, (mergeProcessVariableBindings_perm existing patch).mem_iff.mpr ?_, same⟩
    exact List.mem_append_left _ member
  · obtain ⟨binding, member, same⟩ := present
    exact ⟨binding, serial_patch_frame existing patch binding member (by simpa [same] using replaced), same⟩

/-- Actual validated output mapping writes every declared target, independently of source fan-out. -/
theorem completed_patch_supplies_target (handlers : List String) (outputs : List VariableMapping)
    (before patch after : List VariableBinding) (mapping : VariableMapping)
    (declared : mapping ∈ outputs)
    (completed : serialEffectPatch? handlers outputs before patch = some after) :
    BindingPresent after mapping.target := by
  obtain ⟨_, sources, writes, _, _, _, mapped, rfl⟩ := serial_patch_sound handlers outputs before patch after completed
  obtain ⟨binding, member, projected⟩ := mapM_member_some outputs _ writes mapped mapping declared
  have target : binding.name = mapping.target := by
    cases expression : mapping.expression <;> simp only [expression] at projected
    all_goals try contradiction
    case localVariable name =>
      obtain ⟨value, _, projected⟩ := Option.bind_eq_some_iff.mp projected
      cases Option.some.inj projected
      rfl
  refine ⟨binding, (mergeProcessVariableBindings_perm before writes).mem_iff.mpr ?_, target⟩
  exact List.mem_append_left _ member

/-- Successful effect results preserve all previously available Process inputs. -/
theorem completed_patch_preserves_presence (handlers : List String) (outputs : List VariableMapping)
    (before patch after : List VariableBinding) (name : String)
    (present : BindingPresent before name)
    (completed : serialEffectPatch? handlers outputs before patch = some after) :
    BindingPresent after name := by
  obtain ⟨_, sources, writes, _, _, _, _, rfl⟩ := serial_patch_sound handlers outputs before patch after completed
  exact merge_preserves_binding_presence before writes name present


/-- SBT-AVAILABLE-01 tracks only the unfinished chain; it records presence, including explicit null. -/
def SuffixAvailable (bindings : List VariableBinding) (remaining : List Vertex) : Prop :=
  ∀ name ∈ requiredInputs remaining [], BindingPresent bindings name

theorem required_input_not_already_produced (vertices : List Vertex) (produced : List String)
    (name : String) (needed : name ∈ requiredInputs vertices produced) : name ∉ produced := by
  induction vertices generalizing produced with
  | nil => simp [requiredInputs] at needed
  | cons vertex rest ih =>
      simp only [requiredInputs, List.mem_append] at needed
      rcases needed with current | later
      · have absent := (List.mem_filter.mp current).2
        simpa [List.contains_eq_mem] using absent
      · have absent := ih (vertex.writes ++ produced) later
        exact fun member => absent (List.mem_append_right _ member)

theorem required_input_changes_initial_production (vertices : List Vertex)
    (oldProduced newProduced : List String) (name : String)
    (needed : name ∈ requiredInputs vertices oldProduced) (absent : name ∉ newProduced) :
    name ∈ requiredInputs vertices newProduced := by
  induction vertices generalizing oldProduced newProduced with
  | nil => simp [requiredInputs] at needed
  | cons vertex rest ih =>
      simp only [requiredInputs, List.mem_append] at needed ⊢
      rcases needed with current | later
      · exact Or.inl (List.mem_filter.mpr ⟨(List.mem_filter.mp current).1,
          by simp [List.contains_eq_mem, absent]⟩)
      · apply Or.inr
        apply ih (vertex.writes ++ oldProduced) (vertex.writes ++ newProduced) later
        have excluded := required_input_not_already_produced rest (vertex.writes ++ oldProduced) name later
        intro present
        rcases List.mem_append.mp present with written | supplied
        · exact excluded (List.mem_append_left _ written)
        · exact absent supplied

/-- Every current input read is required by the unfinished suffix before the current Service produces anything. -/
theorem suffix_available_current_read (bindings : List VariableBinding)
    (vertex : Vertex) (rest : List Vertex) (available : SuffixAvailable bindings (vertex :: rest))
    (name : String) (read : name ∈ vertex.reads) : BindingPresent bindings name := by
  apply available name
  simp only [requiredInputs, List.mem_append]
  exact Or.inl (List.mem_filter.mpr ⟨read, by simp⟩)

/-- Human completion promises no writes, so advancing its suffix relies only on preserved incoming presence. -/
theorem human_merge_advances_available_suffix (before patch : List VariableBinding)
    (vertex : Vertex) (rest : List Vertex) (noWrites : vertex.writes = [])
    (available : SuffixAvailable before (vertex :: rest)) :
    SuffixAvailable (mergeProcessVariableBindings before patch) rest := by
  intro name needed
  apply merge_preserves_binding_presence before patch name
  apply available name
  simp only [requiredInputs, noWrites, List.nil_append, List.mem_append]
  exact Or.inr needed

/-- Only a fully validated actual result can advance the available suffix; every newly required target is supplied atomically by its explicit result source. -/
theorem successful_result_advances_available_suffix (handlers : List String)
    (outputs : List VariableMapping) (before patch after : List VariableBinding)
    (vertex : Vertex) (rest : List Vertex)
    (targets : vertex.writes = outputs.map (·.target))
    (available : SuffixAvailable before (vertex :: rest))
    (completed : serialEffectPatch? handlers outputs before patch = some after) :
    SuffixAvailable after rest := by
  intro name needed
  by_cases supplied : name ∈ vertex.writes
  · rw [targets] at supplied
    obtain ⟨mapping, declared, same⟩ := List.mem_map.mp supplied
    rw [← same]
    exact completed_patch_supplies_target handlers outputs before patch after mapping declared completed
  · apply completed_patch_preserves_presence handlers outputs before patch after name _ completed
    apply available name
    simp only [requiredInputs, List.append_nil, List.mem_append]
    exact Or.inr (required_input_changes_initial_production rest [] vertex.writes name needed supplied)

theorem follow_head (fuel : Nat) (vertices ordered : List Vertex) (id : String)
    (followed : follow fuel vertices id = some ordered) :
    ∃ vertex rest, ordered = vertex :: rest ∧ vertices.filter (·.id == id) = [vertex] ∧ vertex.id = id :=
  (follow_certificate fuel vertices ordered id followed).1

theorem follow_has_chain_links (fuel : Nat) (vertices ordered : List Vertex) (id : String)
    (followed : follow fuel vertices id = some ordered) : ChainLinks ordered :=
  (follow_certificate fuel vertices ordered id followed).2.2

/-- Independent chain admission returns the complete linked order and computes initial obligations from that exact order. -/
theorem analysis_ordered_facts (vertices : List Vertex) (analysis : Analysis)
    (analyzed : analyze vertices = some analysis) :
    analysis.ordered.Perm vertices ∧ ChainLinks analysis.ordered ∧
    analysis.required = (requiredInputs analysis.ordered []).eraseDups ∧
    ∃ first rest, analysis.ordered = first :: rest ∧ first.kind = .start ∧
      vertices.filter (·.kind == .start) = [first] := by
  unfold analyze at analyzed
  split at analyzed
  · contradiction
  · obtain ⟨start, selected, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
    obtain ⟨ordered, followed, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
    cases Option.some.inj analyzed
    obtain ⟨first, rest, orderEq, unique, named⟩ := follow_head vertices.length vertices ordered start.id followed
    have starts := unique_some selected
    have startMember : start ∈ vertices.filter (·.kind == .start) := by rw [starts]; simp
    have startKind : start.kind = .start := by simpa using (List.mem_filter.mp startMember).2
    have startSelected : start ∈ vertices.filter (·.id == start.id) :=
      List.mem_filter.mpr ⟨(List.mem_filter.mp startMember).1, by simp⟩
    rw [unique] at startSelected
    have same := List.mem_singleton.mp startSelected
    exact ⟨follow_preserves_all_vertices _ _ _ _ followed, follow_has_chain_links _ _ _ _ followed,
      rfl, first, rest, orderEq, same ▸ startKind, by simpa [same] using starts⟩

/-- The serial start predicate supplies exactly the obligations computed independently from the admitted IL chain. -/
theorem admitted_start_bindings_supply_suffix (program : Program) (analysis : Analysis)
    (bindings : List VariableBinding) (analyzed : programAnalysis program = some analysis)
    (admitted : startBindingsAdmitted program bindings = true) :
    bindingsValid (programHandlers program) bindings = true ∧ SuffixAvailable bindings analysis.ordered := by
  have admitted' : bindingsValid (programHandlers program) bindings = true ∧
      analysis.required.all (fun name => bindings.any (·.name == name)) = true := by
    simpa [startBindingsAdmitted, analyzed] using admitted
  obtain ⟨_, _, _, vertices, _, _, graph⟩ := program_analysis_projection program analysis analyzed
  have required := (analysis_ordered_facts vertices analysis graph).2.2.1
  refine ⟨admitted'.1, ?_⟩
  intro name needed
  have included : name ∈ analysis.required := by simpa [required] using needed
  obtain ⟨binding, member, same⟩ := List.any_eq_true.mp (List.all_eq_true.mp admitted'.2 name included)
  exact ⟨binding, member, by simpa using same⟩

/-- A serial output names exactly one consuming operation, independently of runtime tokens. -/
theorem consumer_exact (program : Program) (place : ControlPlaceId) (id : String)
    (found : consumer? program place = some id) :
    ∃ operation, program.operations.filter (fun op => (operationInputs op).contains place) = [operation] ∧
      operation.id.value = id := by
  unfold consumer? at found
  obtain ⟨operation, selected, found⟩ := Option.bind_eq_some_iff.mp found
  exact ⟨operation, unique_some selected, Option.some.inj found⟩

private theorem mapM_result_member (values : List α) (project : α → Option β)
    (results : List β) (mapped : values.mapM project = some results)
    (result : β) (member : result ∈ results) :
    ∃ value ∈ values, project value = some result := by
  induction values generalizing results with
  | nil => simp only [List.mapM_nil, Option.pure_def, Option.some.injEq] at mapped; subst results; simp at member
  | cons first rest ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨head, headEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨tail, tailEq, resultEq⟩ := Option.bind_eq_some_iff.mp mapped
      cases Option.some.inj resultEq
      rcases List.mem_cons.mp member with rfl | later
      · exact ⟨first, by simp, headEq⟩
      · obtain ⟨value, included, projected⟩ := ih tail tailEq later
        exact ⟨value, List.mem_cons_of_mem _ included, projected⟩

theorem operation_projection_identity (program : Program) (operation : SemanticOperation)
    (vertex : Vertex) (projected : operationVertex? program operation = some vertex) :
    vertex.id = operation.id.value := by
  cases operation <;> simp_all [operationVertex?, Option.bind_eq_some_iff]
  all_goals try grind
  all_goals split at projected <;> simp_all [Option.bind_eq_some_iff] <;> grind

/-- Every vertex in the admitted order comes from an actual IL operation; its port relationships are independently projected. -/
theorem ordered_vertex_has_operation (program : Program) (analysis : Analysis) (vertex : Vertex)
    (analyzed : programAnalysis program = some analysis) (included : vertex ∈ analysis.ordered) :
    ∃ operation ∈ program.operations, operationVertex? program operation = some vertex := by
  obtain ⟨_, _, _, vertices, _, projected, graph⟩ := program_analysis_projection program analysis analyzed
  have included' := (analysis_ordered_facts vertices analysis graph).1.mem_iff.mp included
  obtain ⟨operation, member, found⟩ := mapM_result_member _ _ _ projected vertex included'
  exact ⟨operation, (List.mem_filter.mp member).1, found⟩

/-- Every admitted non-completion operation occurs in the exact independently computed order. -/
theorem operation_has_ordered_vertex (program : Program) (analysis : Analysis)
    (operation : SemanticOperation) (analyzed : programAnalysis program = some analysis)
    (member : operation ∈ program.operations)
    (notCompletion : StructuredComposition.isScopeCompletion operation = false) :
    ∃ vertex ∈ analysis.ordered, operationVertex? program operation = some vertex := by
  obtain ⟨_, _, _, vertices, _, projected, graph⟩ := program_analysis_projection program analysis analyzed
  have filtered : operation ∈ program.operations.filter (fun op => !StructuredComposition.isScopeCompletion op) :=
    List.mem_filter.mpr ⟨member, by simp [notCompletion]⟩
  obtain ⟨vertex, included, found⟩ := mapM_member_some _ _ _ projected operation filtered
  exact ⟨vertex, (analysis_ordered_facts vertices analysis graph).1.mem_iff.mpr included, found⟩

theorem chain_links_tail (vertex : Vertex) (rest : List Vertex)
    (linked : ChainLinks (vertex :: rest)) : ChainLinks rest := by
  cases rest with
  | nil => trivial
  | cons next more => exact linked.2

theorem chain_links_suffix (earlier remaining : List Vertex)
    (linked : ChainLinks (earlier ++ remaining)) : ChainLinks remaining := by
  induction earlier with
  | nil => exact linked
  | cons vertex rest ih => exact ih (chain_links_tail vertex (rest ++ remaining) linked)

theorem chain_output_selects_next (vertex : Vertex) (rest : List Vertex) (id : String)
    (linked : ChainLinks (vertex :: rest)) (outputs : vertex.outputs = [id]) :
    ∃ next more, rest = next :: more ∧ next.id = id ∧ ChainLinks rest := by
  cases rest with
  | nil => simp [ChainLinks, outputs] at linked
  | cons next more =>
      have same : [next.id] = [id] := linked.1.symm.trans outputs
      exact ⟨next, more, rfl, by simpa using same, linked.2⟩

theorem chain_end_has_no_suffix (vertex : Vertex) (rest : List Vertex)
    (linked : ChainLinks (vertex :: rest)) (outputs : vertex.outputs = []) : rest = [] := by
  cases rest with
  | nil => rfl
  | cons next more => simp [ChainLinks, outputs] at linked

private theorem pairwise_names_sorted (bindings : List VariableBinding)
    (ordered : bindings.Pairwise (fun left right => left.name < right.name)) :
    strictlySortedStrings (bindings.map (·.name)) = true := by
  induction bindings with
  | nil => rfl
  | cons first rest ih =>
    obtain ⟨before, tail⟩ := List.pairwise_cons.mp ordered
    cases rest with
    | nil => rfl
    | cons next more =>
      simp only [List.map_cons, strictlySortedStrings, Bool.and_eq_true, decide_eq_true_eq]
      exact ⟨before next (by simp), ih tail⟩

/-- The actual merge preserves the profile's scalar/name domain and canonical order. -/
theorem bindings_merge_valid (handlers : List String) (existing patch : List VariableBinding)
    (existingUnique : (existing.map (·.name)).Nodup) (patchUnique : (patch.map (·.name)).Nodup)
    (existingValid : bindingsValid handlers existing = true)
    (patchValid : bindingsValid handlers patch = true) :
    bindingsValid handlers (mergeProcessVariableBindings existing patch) = true := by
  apply Bool.and_eq_true_iff.mpr
  refine ⟨pairwise_names_sorted _ (mergeProcessVariableBindings_strictOrder _ _ existingUnique patchUnique), ?_⟩
  apply List.all_eq_true.mpr
  intro binding member
  have included := (mergeProcessVariableBindings_perm existing patch).mem_iff.mp member
  rcases List.mem_append.mp included with written | retained
  · exact List.all_eq_true.mp (Bool.and_eq_true_iff.mp patchValid).2 binding written
  · exact List.all_eq_true.mp (Bool.and_eq_true_iff.mp existingValid).2 binding (List.mem_filter.mp retained).1

theorem enclosing_value_scalar (context : List VariableBinding) (name : String) (value : VariableValue)
    (found : enclosingVariable? context name = some value) : scalar value = true := by
  unfold enclosingVariable? at found
  split at found <;> try contradiction
  split at found <;> simp_all [scalar]
  all_goals cases value <;> simp_all

/-- Every mapped write comes from the explicit local result; target identity and scalar type survive fan-out. -/
theorem output_writes_domain (handlers : List String) (outputs : List VariableMapping)
    (patch writes : List VariableBinding)
    (allowed : outputs.all (fun m => nameAllowed handlers m.target && match m.expression with
      | .localVariable name => nameAllowed handlers name | _ => false) = true)
    (mapped : outputs.mapM (fun mapping => match mapping.expression with
      | .localVariable name => do
          let value ← enclosingVariable? patch name
          return { name := mapping.target, value : VariableBinding }
      | _ => none) = some writes) :
    writes.map (·.name) = outputs.map (·.target) ∧
      writes.all (fun b => nameAllowed handlers b.name && scalar b.value) = true := by
  induction outputs generalizing writes with
  | nil =>
    simp only [List.mapM_nil, Option.pure_def, Option.some.injEq] at mapped
    subst writes
    exact ⟨rfl, rfl⟩
  | cons first rest ih =>
    simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
    obtain ⟨head, headEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
    obtain ⟨tail, tailEq, resultEq⟩ := Option.bind_eq_some_iff.mp mapped
    cases Option.some.inj resultEq
    have allowedParts := Bool.and_eq_true_iff.mp allowed
    obtain ⟨names, domain⟩ := ih tail allowedParts.2 tailEq
    cases expression : first.expression <;> simp only [expression] at headEq <;> try contradiction
    case localVariable name =>
      obtain ⟨value, found, headEq⟩ := Option.bind_eq_some_iff.mp headEq
      cases Option.some.inj headEq
      exact ⟨by simp [names], Bool.and_eq_true_iff.mpr ⟨Bool.and_eq_true_iff.mpr
        ⟨(Bool.and_eq_true_iff.mp allowedParts.1).1, enclosing_value_scalar patch name value found⟩, domain⟩⟩

/-- Exact successful local-result mapping preserves canonical Process data for every admitted output list. -/
theorem serial_patch_preserves_domain (handlers : List String) (inputs outputs : List VariableMapping)
    (before patch after : List VariableBinding)
    (beforeUnique : (before.map (·.name)).Nodup)
    (outputUnique : (outputs.map (·.target)).Nodup)
    (beforeValid : bindingsValid handlers before = true)
    (mappings : mappingsValid handlers inputs outputs = true)
    (completed : serialEffectPatch? handlers outputs before patch = some after) :
    bindingsValid handlers after = true := by
  obtain ⟨_, _, writes, _, _, _, mapped, merged⟩ := serial_patch_sound handlers outputs before patch after completed
  have valid := Bool.and_eq_true_iff.mp mappings
  obtain ⟨names, domain⟩ := output_writes_domain handlers outputs patch writes valid.2 mapped
  have ordered := (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp valid.1).1).2
  rw [merged]
  exact bindings_merge_valid handlers before writes beforeUnique (by simpa [names] using outputUnique)
    beforeValid (Bool.and_eq_true_iff.mpr ⟨by simpa [names] using ordered, domain⟩)

/-- Availability is evaluated against the immutable containing bindings for every input, never an earlier input-local write. -/
theorem inputs_evaluable (handlers : List String) (context : List VariableBinding)
    (inputs : List VariableMapping)
    (admitted : inputs.all (fun m => nameAllowed handlers m.target && match m.expression with
      | .stringLiteral value => literalValid value
      | .enclosingVariable name => nameAllowed handlers name
      | .localVariable _ => false) = true)
    (available : ∀ name ∈ readNames inputs, ∃ value, enclosingVariable? context name = some value) :
    ∃ arguments, evaluateEnclosingInputMappings context inputs = some arguments := by
  induction inputs with
  | nil => exact ⟨[], rfl⟩
  | cons first rest ih =>
    have tailAvailable : ∀ name ∈ readNames rest, ∃ value, enclosingVariable? context name = some value := by
      intro name member
      apply available name
      cases first.expression <;> simp_all [readNames]
    obtain ⟨tail, evaluated⟩ := ih (Bool.and_eq_true_iff.mp admitted).2 tailAvailable
    have firstAllowed := (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp admitted).1).2
    cases expression : first.expression with
    | localVariable name => simp [expression] at firstAllowed
    | stringLiteral value =>
        exact ⟨{ name := first.target, value := .string value } :: tail,
          by simp [evaluateEnclosingInputMappings, expression, evaluated]⟩
    | enclosingVariable name =>
        obtain ⟨value, found⟩ := available name (by simp [readNames, expression])
        exact ⟨{ name := first.target, value } :: tail,
          by simp [evaluateEnclosingInputMappings, expression, found, evaluated]⟩

/-- The exact start-builder owner is the independently admitted sole hosting root, with its first activation. -/
def DeclaredRoot (program : Program) (owner : ScopeOccurrenceId) : Prop :=
  ∃ root, program.definitionScopes = [root] ∧ root.parentScopeId = none ∧
    root.originElementId.value = program.processId.value ∧
    owner.definitionScopeId = root.id ∧ owner.activation = 1

theorem analyzed_start_root_declared (program : Program) (analysis : Analysis)
    (instanceId : SemanticId) (root : DefinitionScope)
    (analyzed : programAnalysis program = some analysis)
    (found : rootDefinitionScope? program = some root) :
    DeclaredRoot program ⟨instanceId, root.id, 1⟩ := by
  have one : program.definitionScopes.length = 1 := by
    unfold programAnalysis at analyzed
    split at analyzed
    · contradiction
    · rename_i admitted
      simp at admitted
      exact admitted.1.1.1.1.1.2
  obtain ⟨definition, scopes⟩ := List.length_eq_one_iff.mp one
  have filtered : program.definitionScopes.filter (fun scope => scope.parentScopeId.isNone &&
      scope.originElementId.value = program.processId.value) = [root] := by
    unfold rootDefinitionScope? at found
    split at found
    · cases Option.some.inj found
      assumption
    · contradiction
  have member : root ∈ program.definitionScopes :=
    (List.mem_filter.mp (show root ∈ program.definitionScopes.filter (fun scope =>
      scope.parentScopeId.isNone && scope.originElementId.value = program.processId.value) by rw [filtered]; simp)).1
  have same : root = definition := by simpa [scopes] using member
  have valid := (List.mem_filter.mp (show root ∈ program.definitionScopes.filter (fun scope =>
      scope.parentScopeId.isNone && scope.originElementId.value = program.processId.value) by rw [filtered]; simp)).2
  have valid' : root.parentScopeId = none ∧ root.originElementId.value = program.processId.value := by simpa using valid
  exact ⟨root, by simpa [same] using scopes, valid'.1, valid'.2, rfl, rfl⟩



theorem refined_unique_filter (values : List α) (key predicate : α → Bool) (value : α)
    (unique : values.filter key = [value])
    (refines : ∀ candidate ∈ values, predicate candidate = true → key candidate = true)
    (accepted : predicate value = true) : values.filter predicate = [value] := by
  have restriction : values.filter predicate = (values.filter key).filter predicate := by
    rw [List.filter_filter]
    apply List.filter_congr
    intro candidate member
    cases selected : predicate candidate with
    | false => simp
    | true => simp [refines candidate member selected]
  rw [restriction, unique]
  simp [accepted]


/-- The serial profile excludes foreign runtime work; an empty running root remains distinct from committed completion. -/
def RootLifecycle (owner : ScopeOccurrenceId) (state : RuntimeState) : Prop :=
  (state.control = .running owner.processInstanceId ∧ state.scopeOccurrences = [{ id := owner, parent := none }]) ∨
  (state.control = .completed owner.processInstanceId ∧ state.scopeOccurrences = [] ∧
    state.tokens = [] ∧ state.waits = [] ∧ state.effectWaits = [] ∧ state.initiationPending = false)

theorem root_lifecycle_running_of_token (owner : ScopeOccurrenceId) (state : RuntimeState)
    (life : RootLifecycle owner state) (token : ControlToken) (live : token ∈ state.tokens) :
    state.control = .running owner.processInstanceId ∧ state.scopeOccurrences = [{ id := owner, parent := none }] := by
  rcases life with running | ⟨_, _, empty, _⟩
  · exact running
  · simp [empty] at live

private theorem owned_quiet_empty (values : List α) (key : α → ScopeOccurrenceId) (owner : ScopeOccurrenceId)
    (owned : ∀ value ∈ values, key value = owner)
    (quiet : (values.any fun value => key value == owner) = false) : values = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro value member
  have present : (values.any fun value => key value == owner) = true :=
    List.any_eq_true.mpr ⟨value, member, by simp [owned value member]⟩
  rw [quiet] at present
  contradiction

theorem quiescent_root_frontier_empty (state : RuntimeState) (owner : ScopeOccurrenceId)
    (tokens : ∀ token ∈ state.tokens, token.owner = owner)
    (humans : ∀ wait ∈ state.waits, wait.owner = owner)
    (effects : ∀ wait ∈ state.effectWaits, wait.owner = owner)
    (quiet : scopeQuiescent state owner = true) :
    state.tokens = [] ∧ state.waits = [] ∧ state.effectWaits = [] := by
  simp only [scopeQuiescent, Bool.and_eq_true] at quiet
  exact ⟨owned_quiet_empty _ _ _ tokens (by simpa using quiet.1.1.1.1.1.1.1.1.1.1),
    owned_quiet_empty _ _ _ humans (by simpa using quiet.1.1.1.1.1.1.1.1.1.2),
    owned_quiet_empty _ _ _ effects (by simpa using quiet.1.1.1.1.1.1.2)⟩

def ForeignRuntimeEmpty (state : RuntimeState) : Prop :=
  state.messageWaits = [] ∧ state.timerWaits = [] ∧ state.effectIncidents = [] ∧
  state.selectedBranchSets = [] ∧ state.eventRaces = [] ∧ state.calledProcessOccurrences = [] ∧
  state.activityOccurrences = [] ∧ state.sequentialMultiInstanceControllers = [] ∧ state.parallelMultiInstanceControllers = [] ∧
  state.compensationActivityRetentions = [] ∧ state.compensationParentContextRetentions = [] ∧
  state.compensationTriggers = [] ∧ state.compensationHandlerEffectWaits = [] ∧
  state.eventSubProcessMessageSubscriptions = [] ∧ state.variables.processInterfaces = [] ∧ state.logicalTimeMs = 0 ∧
  state.messageActivations = [] ∧ state.timerActivations = [] ∧ state.eventRaceActivations = [] ∧
  state.callActivations = [] ∧ state.activityActivations = []

/-- These issuance facts are exactly the retained counter/order checks read by serial command admission. -/
def IssuanceFrame (state : RuntimeState) : Prop :=
  orderedBy activationBefore state.activations = true ∧
  orderedBy effectActivationBefore state.effectActivations = true ∧
  orderedBy scopeActivationBefore state.scopeActivations = true ∧
  state.waits.all (fun wait => decide (wait.activation ≤ activationCount state wait.task.id)) = true

theorem user_activation_issuance (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId) (task : UserTaskDefinition)
    (issued : IssuanceFrame state) (empty : state.waits = []) :
    IssuanceFrame (activateUserTask state instanceId owner input output task) := by
  have order := InternalCommutation.orderedBy_replaceStringKey (fun value : TaskActivation => value.taskId.value)
    activationBefore (fun _ _ => rfl) { taskId := task.id, count := activationCount state task.id + 1 }
    (fun activation => decide (activation.taskId ≠ task.id)) state.activations issued.1
  have count := activationCount_setActivationCount_self state task.id (activationCount state task.id + 1)
  change taskActivationCount (setActivationCount state.activations task.id (activationCount state task.id + 1)) task.id = _ at count
  simpa [IssuanceFrame, activateUserTask, empty, insertUserTaskWait, activationCount,
    setActivationCount, insertTaskActivation_eq_canonicalInsertBy] using
    And.intro order (And.intro issued.2.1 (And.intro issued.2.2.1 (show
      (activationCount state task.id + 1 ≤ taskActivationCount
        (setActivationCount state.activations task.id (activationCount state task.id + 1)) task.id) from by rw [count]; exact Nat.le_refl _)))

theorem effect_activation_issuance (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input output : ControlPlaceId) (effect : EffectDefinition)
    (issued : IssuanceFrame state) :
    IssuanceFrame (activateEffect state instanceId owner input output effect none) := by
  have order := InternalCommutation.orderedBy_replaceStringKey (fun value : EffectActivation => value.elementId.value)
    effectActivationBefore (fun _ _ => rfl)
    { elementId := effect.elementId, count := effectActivationCount state effect.elementId + 1 }
    (fun activation => decide (activation.elementId ≠ effect.elementId)) state.effectActivations issued.2.1
  exact ⟨issued.1, order, issued.2.2.1, issued.2.2.2⟩

def RootFrame (owner : ScopeOccurrenceId) (state : RuntimeState) : Prop :=
  (∀ token ∈ state.tokens, token.owner = owner) ∧
  (∀ wait ∈ state.waits, wait.owner = owner ∧ wait.processInstanceId = owner.processInstanceId) ∧
  (∀ wait ∈ state.effectWaits, wait.owner = owner ∧ wait.processInstanceId = owner.processInstanceId) ∧
  RootLifecycle owner state ∧ ForeignRuntimeEmpty state ∧ IssuanceFrame state


/-- A quiescent serial root has one actual completion rewrite, shared by the frame and progress proofs. -/
theorem root_completion_shape (before after : RuntimeState) (owner : ScopeOccurrenceId) (scope : DefinitionScopeId)
    (framed : RootFrame owner before) (completed : completeScopeState? before scope none = some after) :
    before.control = .running owner.processInstanceId ∧
    scopeQuiescent before owner = true ∧ before.initiationPending = false ∧
      after = { before with control := .completed owner.processInstanceId, scopeOccurrences := [] } := by
  have listeners : before.eventSubProcessMessageSubscriptions = [] := by
    have foreign := framed.2.2.2.2.1; simp_all [ForeignRuntimeEmpty]
  have retentions : before.compensationActivityRetentions = [] := by
    have foreign := framed.2.2.2.2.1; simp_all [ForeignRuntimeEmpty]
  rcases framed.2.2.2.1 with ⟨running, scopes⟩ | ⟨_, scopes, _⟩
  · by_cases same : owner.definitionScopeId = scope
    · simp only [completeScopeState?, scopes, List.filter_cons, same, decide_true, ↓reduceIte, List.filter_nil] at completed
      split at completed
      · contradiction
      · rename_i quiet
        simp only [completeQuiescentScope?, running] at completed
        split at completed
        · contradiction
        · rename_i pending
          refine ⟨running, by simpa using quiet, by simpa using pending, ?_⟩
          have result := (Option.some.inj completed).symm
          simpa [listeners, retentions] using result
    · simp [completeScopeState?, scopes, same] at completed
  · simp [completeScopeState?, scopes] at completed

theorem human_wait_census (program : Program) (wait : UserTaskWait)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (wellFormed : programWellFormed program = true)
    (member : .awaitUserTask id origin input wait.output wait.task ∈ program.operations)
    (metadata : wait.metadata = wait.task.metadata) :
    program.operations.filter (fun operation => match operation with
      | .awaitUserTask _ _ _ output task => task == wait.task && output == wait.output && wait.metadata == task.metadata
      | _ => false) = [.awaitUserTask id origin input wait.output wait.task] := by
  apply refined_unique_filter program.operations
    (fun operation => operationDeclaresWaitKey operation (userTaskWaitDeclarationKey wait.task.id)) _
    (.awaitUserTask id origin input wait.output wait.task)
  · exact programWellFormed_waitDeclarer program _ _ wellFormed member
      (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys])
  · intro operation _ selected
    cases operation <;> try simp only [Bool.false_eq_true] at selected
    case awaitUserTask id origin input output task =>
      simp only [Bool.and_eq_true, beq_iff_eq] at selected
      simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, selected.1.1]
  · simp [metadata]

theorem effect_wait_census (program : Program) (wait : EffectWait)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId) (effect : EffectDefinition)
    (wellFormed : programWellFormed program = true)
    (member : .awaitEffect id origin input wait.output effect none ∈ program.operations)
    (element : effect.elementId = wait.elementId) (descriptor : effect.descriptor = wait.descriptor)
    (outputs : effect.outputMappings = wait.outputMappings) (route : wait.bpmnErrorRoute = none)
    (snapshot : inputSnapshotMatches effect.inputMappings wait.arguments = true) :
    program.operations.filter (fun operation => match operation with
      | .awaitEffect _ _ _ output effect none => effect.elementId == wait.elementId &&
          effect.descriptor == wait.descriptor && output == wait.output &&
          effect.outputMappings == wait.outputMappings && wait.bpmnErrorRoute.isNone &&
          inputSnapshotMatches effect.inputMappings wait.arguments
      | _ => false) = [.awaitEffect id origin input wait.output effect none] := by
  have aligned := programWellFormed_awaitEffect_elements_align program wellFormed id origin input wait.output effect none member
  apply refined_unique_filter program.operations
    (fun operation => operationDeclaresWaitKey operation (effectWaitDeclarationKey wait.elementId)) _
    (.awaitEffect id origin input wait.output effect none)
  · exact programWellFormed_waitDeclarer program _ _ wellFormed member
      (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, aligned, element])
  · intro operation included selected
    cases operation <;> try simp only [Bool.false_eq_true] at selected
    case awaitEffect id origin input output effect route =>
      cases route with
      | some route => contradiction
      | none =>
          have aligns := programWellFormed_awaitEffect_elements_align program wellFormed id origin input output effect none included
          simp only [Bool.and_eq_true, beq_iff_eq] at selected
          simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, aligns, selected.1.1.1.1.1]
  · simp [element, descriptor, outputs, route, snapshot]

theorem canonical_present_binding_evaluable (handlers : List String) (context : List VariableBinding)
    (name : String) (canonical : bindingsValid handlers context = true)
    (present : BindingPresent context name) : ∃ value, enclosingVariable? context name = some value := by
  obtain ⟨binding, member, named⟩ := present
  have single := filter_key_eq_singleton_of_nodup context (·.name) binding
    (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp canonical).1) member
  refine ⟨binding.value, enclosing_lookup_unique context name binding ?_ ?_⟩
  · simpa only [Bool.beq_eq_decide_eq, named] using single
  · exact (Bool.and_eq_true_iff.mp (List.all_eq_true.mp (Bool.and_eq_true_iff.mp canonical).2 binding member)).2


/-- Canonical scalar payloads covering exactly the declared sources always produce a complete mapped patch. -/
theorem serial_patch_exists (handlers : List String) (outputs : List VariableMapping)
    (parent patch : List VariableBinding) (sources : List String)
    (collected : outputs.mapM (fun m => match m.expression with | .localVariable n => some n | _ => none) = some sources)
    (valid : bindingsValid handlers patch = true) (count : sources.eraseDups.length = patch.length)
    (covered : sources.all (fun name => patch.any (·.name == name)) = true) :
    ∃ bindings, serialEffectPatch? handlers outputs parent patch = some bindings := by
  let write := fun m : VariableMapping => match m.expression with
    | .localVariable name => (enclosingVariable? patch name).bind (fun value => some ({ name := m.target, value } : VariableBinding))
    | _ => none
  have mapped : ∃ writes, outputs.mapM write = some writes := by
    clear count
    induction outputs generalizing sources with
    | nil => exact ⟨[], rfl⟩
    | cons mapping rest ih =>
      cases expression : mapping.expression <;> simp [List.mapM_cons, expression, Option.bind_eq_some_iff] at collected
      case localVariable name =>
        obtain ⟨tail, tailMapped, rfl⟩ := collected
        have coverParts := Bool.and_eq_true_iff.mp covered
        obtain ⟨binding, member, named⟩ := List.any_eq_true.mp coverParts.1
        obtain ⟨value, evaluated⟩ := canonical_present_binding_evaluable handlers patch name valid ⟨binding, member, by simpa using named⟩
        obtain ⟨writes, writesMapped⟩ := ih tail tailMapped coverParts.2
        exact ⟨{ name := mapping.target, value } :: writes, by simp [write, expression, evaluated, writesMapped]⟩
  obtain ⟨writes, writesMapped⟩ := mapped
  simp only [serialEffectPatch?, valid, Bool.not_true, Bool.false_eq_true, ↓reduceIte]
  change ∃ bindings, (outputs.mapM (fun m : VariableMapping => match m.expression with | .localVariable n => some n | _ => none)).bind (fun names =>
    if !(names.eraseDups.length == patch.length && names.all (fun name => patch.any (·.name == name))) then none
    else (outputs.mapM write).bind (fun writes => some (mergeProcessVariableBindings parent writes))) = some bindings
  rw [collected]
  simp only [Option.bind_some, count, beq_self_eq_true, covered, Bool.and_self, Bool.not_true, Bool.false_eq_true, ↓reduceIte]
  change ∃ bindings, (outputs.mapM write).bind (fun writes => some (mergeProcessVariableBindings parent writes)) = some bindings
  rw [writesMapped]
  exact ⟨_, rfl⟩

def IsSerialCompletion (stimulus : Stimulus) : Prop :=
  match stimulus with | .completeUserTaskInstance .. | .completeEffect .. => True | _ => False

end SerialBusinessTask
end BpmnSemantics.SemanticProcess
