import BpmnSemantics.SemanticProcess.CommandAdmission
import BpmnSemantics.SemanticProcess.ActivityDataInputOutput

/-! SPC-STRUCTURE-01 and SPC-AVAILABLE-01 derive complete forward order and input obligations from actual admission. Operation projection and committed-start facts link that analysis to execution without assuming control uniqueness or input availability. -/

namespace BpmnSemantics.SemanticProcess.StructuredComposition

def OperationAllowed : SemanticOperation → Prop
  | .initiate .. | .awaitUserTask .. | .awaitDataInputOutputUserTask ..
  | .choose .. | .mergeExclusive .. | .reachNoneEnd .. | .completeScope _ _ _ none => True
  | _ => False

private theorem eraseDups_sublist (names : List String) : List.Sublist names.eraseDups names := by
  cases names with
  | nil => exact List.Sublist.refl _
  | cons name rest =>
      rw [List.eraseDups_cons]
      exact List.Sublist.cons_cons name
        ((eraseDups_sublist (rest.filter (fun other => !other == name))).trans List.filter_sublist)
termination_by names.length
decreasing_by
  have bound := List.length_filter_le (fun other => !other == name) rest
  simp only [List.length_cons]
  omega

private theorem eraseDups_nodup (names : List String) : names.eraseDups.Nodup := by
  cases names with
  | nil => exact List.nodup_nil
  | cons name rest =>
      rw [List.eraseDups_cons, List.nodup_cons]
      refine ⟨by simp, eraseDups_nodup (rest.filter (fun other => !other == name))⟩
termination_by names.length
decreasing_by
  have bound := List.length_filter_le (fun other => !other == name) rest
  simp only [List.length_cons]
  omega

theorem equal_deduplicated_length_has_unique_names (names : List String)
    (sameLength : names.eraseDups.length = names.length) : names.Nodup := by
  have unchanged := (eraseDups_sublist names).eq_of_length sameLength
  rw [← unchanged]
  exact eraseDups_nodup names

theorem remove_selected_vertex_preserves_other_vertices
    (vertices : List Vertex) (selected : Vertex)
    (unique : (vertices.map (·.id)).Nodup) (member : selected ∈ vertices) :
    (selected :: vertices.filter (·.id != selected.id)).Perm vertices := by
  induction vertices with
  | nil => simp at member
  | cons first rest ih =>
      have uniqueParts := List.nodup_cons.mp unique
      rcases List.mem_cons.mp member with same | later
      · subst first
        have retained : rest.filter (·.id != selected.id) = rest := by
          apply List.filter_eq_self.mpr
          intro vertex present
          have different : vertex.id ≠ selected.id := by
            intro equal
            exact uniqueParts.1 (List.mem_map.mpr ⟨vertex, present, equal⟩)
          simpa using different
        simp [retained]
      · have different : first.id ≠ selected.id := by
          intro equal
          exact uniqueParts.1 (List.mem_map.mpr ⟨selected, later, equal.symm⟩)
        simp only [List.filter_cons]
        simp only [bne_iff_ne]
        rw [ite_eq_left different]
        exact (List.Perm.swap first selected _).trans (List.Perm.cons first (ih uniqueParts.2 later))

theorem topological_order_preserves_vertices
    (fuel : Nat) (vertices ordered : List Vertex)
    (unique : (vertices.map (·.id)).Nodup)
    (sorted : topologicalOrder fuel vertices = some ordered) : ordered.Perm vertices := by
  induction fuel generalizing vertices ordered with
  | zero =>
      simp only [topologicalOrder] at sorted
      split at sorted
      · rename_i empty
        have noVertices : vertices = [] := by simpa using empty
        simpa [noVertices] using sorted.symm
      · contradiction
  | succ fuel ih =>
      simp only [topologicalOrder] at sorted
      split at sorted
      · rename_i empty
        have noVertices : vertices = [] := by simpa using empty
        simpa [noVertices] using sorted.symm
      · simp only [bind, pure, Option.bind_some, Option.bind_eq_some_iff] at sorted
        obtain ⟨first, selected, rest, remainder, sorted⟩ := sorted
        cases Option.some.inj sorted
        have included := List.mem_of_find?_eq_some selected
        have sub : List.Sublist (vertices.filter (·.id != first.id)) vertices := List.filter_sublist
        have uniqueRest := (sub.map (·.id)).nodup unique
        exact (List.Perm.cons first (ih _ _ uniqueRest remainder)).trans
          (remove_selected_vertex_preserves_other_vertices vertices first unique included)

theorem incoming_membership (vertices : List Vertex) (vertex : Vertex) (id : String) :
    vertex ∈ incoming vertices id ↔ vertex ∈ vertices ∧ id ∈ vertex.outputs := by
  simp only [incoming, List.mem_flatMap, List.mem_map, List.mem_filter, beq_iff_eq]
  constructor
  · rintro ⟨predecessor, member, edge, ⟨edgeMember, same⟩, rfl⟩
    exact ⟨member, by simpa [same] using edgeMember⟩
  · rintro ⟨member, edge⟩
    exact ⟨vertex, member, id, ⟨edge, rfl⟩, rfl⟩

inductive ForwardOrder : List Vertex → Prop where
  | nil : ForwardOrder []
  | cons (first : Vertex) (rest : List Vertex)
      (noBackwardEdge : ∀ vertex ∈ first :: rest, first.id ∉ vertex.outputs)
      (forward : ForwardOrder rest) : ForwardOrder (first :: rest)

theorem forward_edge_target_is_later
    (earlier later : List Vertex) (source target : Vertex)
    (forward : ForwardOrder (earlier ++ source :: later))
    (member : target ∈ earlier ++ source :: later)
    (edge : target.id ∈ source.outputs) : target ∈ later := by
  induction earlier with
  | nil =>
      cases forward with
      | cons _ _ noBackward _ =>
          rcases List.mem_cons.mp member with same | afterSource
          · subst target
            exact False.elim (noBackward source (by simp) edge)
          · exact afterSource
  | cons first rest ih =>
      cases forward with
      | cons _ _ noBackward forwardRest =>
          rcases List.mem_cons.mp member with same | afterFirst
          · subst target
            exact False.elim (noBackward source (by simp) edge)
          · exact ih forwardRest afterFirst

theorem forward_predecessor_is_earlier
    (earlier later : List Vertex) (vertex predecessor : Vertex)
    (forward : ForwardOrder (earlier ++ vertex :: later))
    (member : predecessor ∈ earlier ++ vertex :: later)
    (edge : vertex.id ∈ predecessor.outputs) : predecessor ∈ earlier := by
  induction earlier with
  | nil =>
      cases forward with
      | cons _ _ noBackward _ => exact False.elim (noBackward predecessor member edge)
  | cons first rest ih =>
      cases forward with
      | cons _ _ _ forwardRest =>
          rcases List.mem_cons.mp member with same | following
          · simp [same]
          · exact List.mem_cons_of_mem first (ih forwardRest following)

theorem topological_order_has_only_forward_edges
    (fuel : Nat) (vertices ordered : List Vertex)
    (unique : (vertices.map (·.id)).Nodup)
    (sorted : topologicalOrder fuel vertices = some ordered) : ForwardOrder ordered := by
  induction fuel generalizing vertices ordered with
  | zero =>
      simp only [topologicalOrder] at sorted
      split at sorted
      · cases Option.some.inj sorted
        exact .nil
      · contradiction
  | succ fuel ih =>
      have permutation := topological_order_preserves_vertices (fuel + 1) vertices ordered unique sorted
      simp only [topologicalOrder] at sorted
      split at sorted
      · cases Option.some.inj sorted
        exact .nil
      · simp only [bind, pure, Option.bind_some, Option.bind_eq_some_iff] at sorted
        obtain ⟨first, selected, rest, remainder, sorted⟩ := sorted
        cases Option.some.inj sorted
        have empty : incoming vertices first.id = [] := by
          simpa using List.find?_some selected
        have sub : List.Sublist (vertices.filter (·.id != first.id)) vertices := List.filter_sublist
        apply ForwardOrder.cons first rest
        · intro vertex member edge
          have incomingMember := (incoming_membership vertices vertex first.id).mpr
            ⟨permutation.mem_iff.mp member, edge⟩
          simp [empty] at incomingMember
        · exact ih _ _ ((sub.map (·.id)).nodup unique) remainder

theorem analysis_computes_from_complete_forward_order
    (vertices : List Vertex) (analysis : Analysis)
    (analyzed : analyze vertices = some analysis) :
    (vertices.map (·.id)).Nodup ∧ analysis.ordered.Perm vertices ∧
      ForwardOrder analysis.ordered ∧ aritiesValid vertices = true ∧
      analysis.required = requiredInputs vertices analysis.ordered ∧
      analysis.maximumBurst = maximumBurst vertices analysis.ordered := by
  unfold analyze at analyzed
  split at analyzed
  · contradiction
  · rename_i guard
    have valid := guard
    simp at valid
    have unique : (vertices.map (·.id)).Nodup :=
      equal_deduplicated_length_has_unique_names _ (by simpa using valid.1.1.1.1)
    simp only [bind, Option.bind_eq_some_iff] at analyzed
    obtain ⟨ordered, sorted, analyzed⟩ := analyzed
    split at analyzed
    · contradiction
    · cases Option.some.inj analyzed
      exact ⟨unique, topological_order_preserves_vertices _ _ _ unique sorted,
        topological_order_has_only_forward_edges _ _ _ unique sorted, valid.2, rfl, rfl⟩

theorem accumulated_requirements_retained
    (vertices : List Vertex) (accumulated : List DataFact × List String) (vertex : Vertex)
    (name : String) (required : name ∈ accumulated.2) :
    name ∈ (accumulateDataFacts vertices accumulated vertex).2 := by
  cases read : vertex.reads with
  | none => simpa [accumulateDataFacts, read] using required
  | some input =>
      simp only [accumulateDataFacts, read]
      split
      · exact required
      · exact List.mem_cons_of_mem _ required

theorem folded_requirements_retained
    (vertices ordered : List Vertex) (accumulated : List DataFact × List String)
    (name : String) (required : name ∈ accumulated.2) :
    name ∈ (ordered.foldl (accumulateDataFacts vertices) accumulated).2 := by
  induction ordered generalizing accumulated with
  | nil => exact required
  | cons vertex rest ih =>
      exact ih _ (accumulated_requirements_retained vertices accumulated vertex name required)

theorem every_read_has_an_initial_or_predecessor_obligation
    (vertices earlier later : List Vertex) (vertex : Vertex) (name : String)
    (read : vertex.reads = some name) :
    name ∈ requiredInputs vertices (earlier ++ vertex :: later) ∨
      name ∈ definiteInputs vertices
        (earlier.foldl (accumulateDataFacts vertices) ([], [])).1 vertex.id := by
  by_cases available : name ∈ definiteInputs vertices
      (earlier.foldl (accumulateDataFacts vertices) ([], [])).1 vertex.id
  · exact Or.inr available
  · apply Or.inl
    unfold requiredInputs
    apply List.mem_eraseDups.mpr
    rw [List.foldl_append, List.foldl_cons]
    apply folded_requirements_retained
    simp [accumulateDataFacts, read, available]

theorem accumulation_preserves_other_fact
    (vertices : List Vertex) (accumulated : List DataFact × List String)
    (vertex : Vertex) (id : String) (different : vertex.id ≠ id) :
    ((accumulateDataFacts vertices accumulated vertex).1.find? (·.id == id)) =
      accumulated.1.find? (·.id == id) := by
  simp [accumulateDataFacts, different]

theorem fold_preserves_other_fact
    (vertices ordered : List Vertex) (accumulated : List DataFact × List String)
    (id : String) (different : ∀ vertex ∈ ordered, vertex.id ≠ id) :
    ((ordered.foldl (accumulateDataFacts vertices) accumulated).1.find? (·.id == id)) =
      accumulated.1.find? (·.id == id) := by
  induction ordered generalizing accumulated with
  | nil => rfl
  | cons vertex rest ih =>
      rw [List.foldl_cons, ih _ (by
        intro later member
        exact different later (List.mem_cons_of_mem _ member))]
      exact accumulation_preserves_other_fact vertices accumulated vertex id
        (different vertex (by simp))

theorem completed_data_analysis_retains_each_fact
    (vertices earlier later : List Vertex) (vertex : Vertex)
    (different : ∀ following ∈ later, following.id ≠ vertex.id) :
    let accumulated := earlier.foldl (accumulateDataFacts vertices) ([], [])
    let before := definiteInputs vertices accumulated.1 vertex.id
    let after := match vertex.writes with | some name => name :: before | none => before
    (((earlier ++ vertex :: later).foldl (accumulateDataFacts vertices) ([], [])).1.find?
      (·.id == vertex.id)) = some { id := vertex.id, written := after } := by
  dsimp only
  rw [List.foldl_append, List.foldl_cons, fold_preserves_other_fact _ _ _ _ different]
  simp [accumulateDataFacts]
  rfl

theorem definite_inputs_depend_on_predecessor_facts
    (vertices : List Vertex) (left right : List DataFact) (id : String)
    (same : ∀ predecessor ∈ incoming vertices id,
      left.find? (·.id == predecessor.id) = right.find? (·.id == predecessor.id)) :
    definiteInputs vertices left id = definiteInputs vertices right id := by
  have sets : (incoming vertices id).map (fun predecessor =>
      ((left.find? (·.id == predecessor.id)).map (·.written)).getD []) =
      (incoming vertices id).map (fun predecessor =>
        ((right.find? (·.id == predecessor.id)).map (·.written)).getD []) := by
    apply List.map_congr_left
    intro predecessor member
    rw [same predecessor member]
  unfold definiteInputs
  rw [sets]

theorem completed_analysis_preserves_predecessor_inputs
    (vertices earlier later : List Vertex) (vertex : Vertex)
    (unique : ((earlier ++ vertex :: later).map (·.id)).Nodup)
    (permutation : (earlier ++ vertex :: later).Perm vertices)
    (forward : ForwardOrder (earlier ++ vertex :: later)) :
    definiteInputs vertices
      ((earlier ++ vertex :: later).foldl (accumulateDataFacts vertices) ([], [])).1 vertex.id =
      definiteInputs vertices (earlier.foldl (accumulateDataFacts vertices) ([], [])).1 vertex.id := by
  apply definite_inputs_depend_on_predecessor_facts
  intro predecessor member
  obtain ⟨included, edge⟩ := (incoming_membership vertices predecessor vertex.id).mp member
  have previous := forward_predecessor_is_earlier earlier later vertex predecessor forward
    (permutation.mem_iff.mpr included) edge
  rw [List.foldl_append]
  apply fold_preserves_other_fact
  intro following follows
  have separated := (List.nodup_append.mp (by simpa only [List.map_append] using unique)).2.2
  have distinct := separated predecessor.id (List.mem_map.mpr ⟨predecessor, previous, rfl⟩)
    following.id (List.mem_map.mpr ⟨following, follows, rfl⟩)
  exact Ne.symm distinct

theorem completed_analysis_has_local_write_equation
    (vertices earlier later : List Vertex) (vertex : Vertex)
    (unique : ((earlier ++ vertex :: later).map (·.id)).Nodup)
    (permutation : (earlier ++ vertex :: later).Perm vertices)
    (forward : ForwardOrder (earlier ++ vertex :: later)) :
    let facts := ((earlier ++ vertex :: later).foldl (accumulateDataFacts vertices) ([], [])).1
    (facts.find? (·.id == vertex.id)) = some
      { id := vertex.id
        written := match vertex.writes with
          | some name => name :: definiteInputs vertices facts vertex.id
          | none => definiteInputs vertices facts vertex.id } := by
  dsimp only
  rw [completed_analysis_preserves_predecessor_inputs vertices earlier later vertex unique permutation forward]
  apply completed_data_analysis_retains_each_fact
  intro following member same
  have suffix := (List.nodup_append.mp (by simpa only [List.map_append] using unique)).2.1
  have fresh := (List.nodup_cons.mp suffix).1
  exact fresh (List.mem_map.mpr ⟨following, member, same⟩)

theorem every_read_has_a_completed_analysis_obligation
    (vertices earlier later : List Vertex) (vertex : Vertex) (name : String)
    (unique : ((earlier ++ vertex :: later).map (·.id)).Nodup)
    (permutation : (earlier ++ vertex :: later).Perm vertices)
    (forward : ForwardOrder (earlier ++ vertex :: later))
    (read : vertex.reads = some name) :
    name ∈ requiredInputs vertices (earlier ++ vertex :: later) ∨
      name ∈ definiteInputs vertices
        ((earlier ++ vertex :: later).foldl (accumulateDataFacts vertices) ([], [])).1 vertex.id := by
  rw [completed_analysis_preserves_predecessor_inputs vertices earlier later vertex unique permutation forward]
  exact every_read_has_an_initial_or_predecessor_obligation vertices earlier later vertex name read

theorem program_analysis_excludes_foreign_declarations
    (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    program.definitionScopes.length = 1 ∧
      program.internalSchedulingMode = .rejectObservableChoice ∧
      program.compensationActivityRetention = none ∧
      program.compensationEventSubProcessSnapshots = none ∧
      program.compensationExecution = none := by
  unfold programAnalysis at analyzed
  split at analyzed
  · contradiction
  · rename_i allowed
    simpa [Bool.and_eq_true, and_assoc] using allowed

private theorem unique_some {values : List α} {value : α}
    (found : unique? values = some value) : values = [value] := by
  cases values with
  | nil => simp [unique?] at found
  | cons first rest =>
      cases rest with
      | nil => simpa [unique?] using found
      | cons second more => simp [unique?] at found

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

theorem program_analysis_projection
    (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    ∃ id origin scope vertices,
      program.operations.filter isScopeCompletion = [.completeScope id origin scope none] ∧
      (program.operations.filter fun op => !isScopeCompletion op).mapM
        (operationVertex? program) = some vertices ∧ analyze vertices = some analysis := by
  unfold programAnalysis at analyzed
  split at analyzed
  · contradiction
  · split at analyzed
    · contradiction
    simp only [bind, Option.bind_eq_some_iff] at analyzed
    obtain ⟨completion, selected, analyzed⟩ := analyzed
    cases completion <;> try simp only at analyzed
    all_goals try contradiction
    case completeScope id origin scope output =>
      cases output with
      | some output => contradiction
      | none =>
          obtain ⟨vertices, projected, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
          exact ⟨id, origin, scope, vertices, unique_some selected, projected, analyzed⟩

theorem program_analysis_projects_each_executable_operation
    (program : Program) (analysis : Analysis) (operation : SemanticOperation)
    (analyzed : programAnalysis program = some analysis)
    (member : operation ∈ program.operations) (notCompletion : isScopeCompletion operation = false) :
    ∃ vertex ∈ analysis.ordered, operationVertex? program operation = some vertex := by
  obtain ⟨_, _, _, vertices, _, projected, graph⟩ :=
    program_analysis_projection program analysis analyzed
  have included : operation ∈ program.operations.filter (fun op => !isScopeCompletion op) :=
    List.mem_filter.mpr ⟨member, by simp [notCompletion]⟩
  obtain ⟨vertex, vertexMember, matched⟩ := mapM_member_some _ _ _ projected operation included
  have permutation := (analysis_computes_from_complete_forward_order vertices analysis graph).2.1
  exact ⟨vertex, permutation.mem_iff.mpr vertexMember, matched⟩

theorem projected_operation_preserves_identity
    (program : Program) (operation : SemanticOperation) (vertex : Vertex)
    (projected : operationVertex? program operation = some vertex) :
    vertex.id = operation.id.value := by
  cases operation <;> simp [operationVertex?, bind, Option.bind_eq_some_iff] at projected
  all_goals first
    | (rcases projected with ⟨_, _, rfl⟩; rfl)
    | (rcases projected with ⟨_, _, _, rfl⟩; rfl)
    | (cases projected; rfl)
    | (split at projected <;> simp_all [Option.bind_eq_some_iff]; rcases projected with ⟨_, _, rfl⟩; rfl)

theorem consumer_identifies_unique_input_operation
    (program : Program) (place : ControlPlaceId) (id : String)
    (found : consumer? program place = some id) :
    ∃ operation ∈ program.operations,
      program.operations.filter (fun op => (operationInputs op).contains place) = [operation] ∧
      place ∈ operationInputs operation ∧ operation.id.value = id := by
  simp only [consumer?, bind, pure, Option.bind_eq_some_iff] at found
  obtain ⟨operation, selected, named⟩ := found
  have exactFilter := unique_some selected
  have member : operation ∈ program.operations.filter
      (fun op => (operationInputs op).contains place) := by
    rw [exactFilter]
    simp
  obtain ⟨included, consumes⟩ := List.mem_filter.mp member
  exact ⟨operation, included, exactFilter, by simpa using consumes, Option.some.inj named⟩

theorem consumer_names_the_input_operation
    (program : Program) (place : ControlPlaceId) (id : String) (operation : SemanticOperation)
    (found : consumer? program place = some id)
    (member : operation ∈ program.operations) (input : place ∈ operationInputs operation) :
    id = operation.id.value := by
  obtain ⟨selected, _, singleton, _, named⟩ :=
    consumer_identifies_unique_input_operation program place id found
  have included : operation ∈ program.operations.filter
      (fun op => (operationInputs op).contains place) := List.mem_filter.mpr ⟨member, by simpa using input⟩
  rw [singleton] at included
  have same := List.mem_singleton.mp included
  simpa [same] using named.symm

theorem projection_maps_declared_outputs
    (program : Program) (operation : SemanticOperation) (vertex : Vertex)
    (projected : operationVertex? program operation = some vertex) :
    (SemanticProcess.operationOutputs operation).mapM (consumer? program) = some vertex.outputs := by
  cases operation <;> simp only [operationVertex?] at projected
  all_goals try contradiction
  all_goals try (split at projected <;> try contradiction)
  all_goals first
    | (simp only [bind, pure, Option.bind_eq_some_iff] at projected
       obtain ⟨output, found, same⟩ := projected
       cases Option.some.inj same
       simp [SemanticProcess.operationOutputs, found])
    | (cases Option.some.inj projected; rfl)

theorem projected_output_has_analyzed_edge
    (program : Program) (operation : SemanticOperation) (vertex : Vertex) (output : ControlPlaceId)
    (projected : operationVertex? program operation = some vertex)
    (member : output ∈ SemanticProcess.operationOutputs operation) :
    ∃ target ∈ vertex.outputs, consumer? program output = some target := by
  exact mapM_member_some _ _ _ (projection_maps_declared_outputs program operation vertex projected)
    output member

theorem consumer_has_analyzed_target
    (program : Program) (analysis : Analysis) (place : ControlPlaceId) (id : String)
    (analyzed : programAnalysis program = some analysis)
    (found : consumer? program place = some id) :
    ∃ operation ∈ program.operations, ∃ vertex ∈ analysis.ordered,
      place ∈ operationInputs operation ∧
      operationVertex? program operation = some vertex ∧ vertex.id = id := by
  obtain ⟨operation, member, _, consumes, named⟩ :=
    consumer_identifies_unique_input_operation program place id found
  have executable : isScopeCompletion operation = false := by
    cases operation <;> simp only [operationInputs, List.mem_nil_iff] at consumes <;>
      first | contradiction | rfl
  obtain ⟨vertex, included, projected⟩ :=
    program_analysis_projects_each_executable_operation program analysis operation analyzed member executable
  exact ⟨operation, member, vertex, included, consumes, projected,
    (projected_operation_preserves_identity program operation vertex projected).trans named⟩

theorem completion_contract_has_analyzed_vertex
    (program : Program) (analysis : Analysis) (taskId : TaskDefinitionId)
    (contract : DataInputOutputTaskContract)
    (analyzed : programAnalysis program = some analysis)
    (declared : dataInputOutputTaskContract? program taskId = some contract) :
    ∃ vertex ∈ analysis.ordered, ∃ target,
      consumer? program contract.output = some target ∧
      vertex =
        { id := contract.operationId.value, kind := .task, outputs := [target]
          reads := some contract.directInput.source.id
          writes := some contract.directOutput.target.id } ∧
      contract.directInput.source = .property contract.directInput.source.id ∧
      contract.directOutput.target = .property contract.directOutput.target.id := by
  obtain ⟨_, origin, member⟩ := dataInputOutputTaskContract_facts declared
  obtain ⟨vertex, included, projected⟩ := program_analysis_projects_each_executable_operation
    program analysis _ analyzed member rfl
  cases source : contract.directInput.source <;> cases target : contract.directOutput.target <;>
    simp [operationVertex?, source, target, bind, Option.bind_eq_some_iff] at projected
  obtain ⟨next, consumer, same⟩ := projected
  exact ⟨vertex, included, next, consumer, by simpa [source, target, ActivityDataInputSource.id,
    ActivityDataOutputTarget.id, SemanticOperation.id] using same.symm, rfl, rfl⟩

theorem analysis_ordered_ids_unique (vertices : List Vertex) (analysis : Analysis)
    (analyzed : analyze vertices = some analysis) : (analysis.ordered.map (·.id)).Nodup := by
  obtain ⟨unique, permutation, _⟩ := analysis_computes_from_complete_forward_order vertices analysis analyzed
  exact (permutation.map (·.id)).nodup_iff.mpr unique

theorem analyzed_start_has_no_predecessors
    (vertices : List Vertex) (analysis : Analysis) (vertex : Vertex)
    (analyzed : analyze vertices = some analysis) (member : vertex ∈ analysis.ordered)
    (kind : vertex.kind = .start) : incoming vertices vertex.id = [] := by
  obtain ⟨_, permutation, _, arities, _⟩ :=
    analysis_computes_from_complete_forward_order vertices analysis analyzed
  have selected := List.all_eq_true.mp arities vertex (permutation.mem_iff.mp member)
  simp [kind] at selected
  exact selected.2.1

theorem analysis_data_fact_equation
    (vertices : List Vertex) (analysis : Analysis) (vertex : Vertex)
    (analyzed : analyze vertices = some analysis) (member : vertex ∈ analysis.ordered) :
    let facts := (analysis.ordered.foldl (accumulateDataFacts vertices) ([], [])).1
    (facts.find? (·.id == vertex.id)) = some
      { id := vertex.id
        written := match vertex.writes with
          | some name => name :: definiteInputs vertices facts vertex.id
          | none => definiteInputs vertices facts vertex.id } := by
  obtain ⟨earlier, later, ordered⟩ := List.mem_iff_append.mp member
  have unique := analysis_ordered_ids_unique vertices analysis analyzed
  obtain ⟨_, permutation, forward, _⟩ :=
    analysis_computes_from_complete_forward_order vertices analysis analyzed
  rw [ordered] at unique permutation forward ⊢
  exact completed_analysis_has_local_write_equation vertices earlier later vertex unique permutation forward

theorem analysis_read_obligation
    (vertices : List Vertex) (analysis : Analysis) (vertex : Vertex) (name : String)
    (analyzed : analyze vertices = some analysis) (member : vertex ∈ analysis.ordered)
    (read : vertex.reads = some name) :
    name ∈ analysis.required ∨ name ∈ definiteInputs vertices
      (analysis.ordered.foldl (accumulateDataFacts vertices) ([], [])).1 vertex.id := by
  obtain ⟨earlier, later, ordered⟩ := List.mem_iff_append.mp member
  have unique := analysis_ordered_ids_unique vertices analysis analyzed
  obtain ⟨_, permutation, forward, _, required, _⟩ :=
    analysis_computes_from_complete_forward_order vertices analysis analyzed
  rw [required, ordered]
  rw [ordered] at unique permutation forward
  exact every_read_has_a_completed_analysis_obligation vertices earlier later vertex name
    unique permutation forward read

theorem projected_operation_allowed (program : Program) (operation : SemanticOperation)
    (vertex : Vertex) (projected : operationVertex? program operation = some vertex) :
    OperationAllowed operation := by
  cases operation <;> simp_all [OperationAllowed, operationVertex?]

theorem program_analysis_operations_allowed
    (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    ∀ operation ∈ program.operations, OperationAllowed operation := by
  obtain ⟨id, origin, scope, vertices, completion, projected, _⟩ :=
    program_analysis_projection program analysis analyzed
  intro operation member
  by_cases completes : isScopeCompletion operation = true
  · have included := List.mem_filter.mpr ⟨member, completes⟩
    rw [completion] at included
    have same := List.mem_singleton.mp included
    rw [same]
    trivial
  · have included : operation ∈ program.operations.filter (fun op => !isScopeCompletion op) :=
      List.mem_filter.mpr ⟨member, by simpa using completes⟩
    obtain ⟨vertex, _, matched⟩ := mapM_member_some _ _ _ projected operation included
    exact projected_operation_allowed program operation vertex matched

theorem allowed_operations_filterMap_absent
    (program : Program) (project : SemanticOperation → Option α)
    (allowed : ∀ operation ∈ program.operations, OperationAllowed operation)
    (excluded : ∀ operation, OperationAllowed operation → project operation = none) :
    program.operations.filterMap project = [] := by
  apply List.filterMap_eq_nil_iff.mpr
  intro operation member
  exact excluded operation (allowed operation member)

theorem allowed_operations_filter_absent
    (program : Program) (select : SemanticOperation → Bool)
    (allowed : ∀ operation ∈ program.operations, OperationAllowed operation)
    (excluded : ∀ operation, OperationAllowed operation → select operation = false) :
    program.operations.filter select = [] := by
  apply List.filter_eq_nil_iff.mpr
  intro operation member
  simp [excluded operation (allowed operation member)]

theorem admitted_completion_foreign_families_absent
    (program : Program) (analysis : Analysis) (taskId : TaskDefinitionId)
    (analyzed : programAnalysis program = some analysis) :
    parallelMultiInstanceEntryForTask? program taskId = none ∧
      sequentialMultiInstanceOperationForTask? program taskId = none ∧
      isMessageMonitoredTaskDefinition program taskId = false ∧
      isMessageBoundedTaskDefinition program taskId = false ∧
      isBoundedTaskDefinition program taskId = false ∧
      dataInputTaskOperations program = [] ∧ dataOutputTaskOperations program = [] ∧
      isMonitoredTaskDefinition program taskId = false := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
  · unfold parallelMultiInstanceEntryForTask?
    rw [allowed_operations_filter_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed, ParallelMultiInstanceArm.ofOperation?])]
  · unfold sequentialMultiInstanceOperationForTask?
    rw [allowed_operations_filter_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])]
  · unfold isMessageMonitoredTaskDefinition messageMonitoredTaskDefinitions
    rw [allowed_operations_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])]
    rfl
  · unfold isMessageBoundedTaskDefinition messageBoundedTaskOperations
    rw [allowed_operations_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])]
    rfl
  · unfold isBoundedTaskDefinition boundedTaskOperations
    rw [allowed_operations_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])]
    rfl
  · exact allowed_operations_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])
  · exact allowed_operations_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])
  · unfold isMonitoredTaskDefinition monitoredTaskOperations
    rw [allowed_operations_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])]
    rfl

theorem running_start_control_fields
    (program : Program) (instanceId : SemanticId) (bindings : List VariableBinding)
    (started : RuntimeState)
    (created : runningProgramStartState? program instanceId bindings = some started) :
    started.tokens = [] ∧ started.waits = [] ∧ started.initiationPending = true := by
  simp only [runningProgramStartState?, bind, pure, Option.bind_eq_some_iff] at created
  obtain ⟨root, found, created⟩ := created
  cases Option.some.inj created
  exact ⟨rfl, rfl, rfl⟩

theorem committed_initial_start_control_fields
    (program : Program) (commandId processId instanceId : SemanticId)
    (bindings : List VariableBinding)
    (_profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    let started := (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).state
    started.tokens = [] ∧ started.waits = [] ∧ started.initiationPending = true := by
  dsimp only
  obtain ⟨_, variables, created⟩ := admitStimulus_committed_start_shape program
    (.startProcess commandId processId instanceId bindings) instanceId rfl committed
  exact running_start_control_fields program instanceId variables _ created

theorem refused_start_preserves_state
    (program : Program) (state : RuntimeState)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (refused : structuredCompositionStartBindingsAdmitted program bindings = false) :
    admitStimulus program state (.startProcess commandId processId instanceId bindings) =
      { outcome := .rejected, state } := by
  cases snapshot : program.compensationEventSubProcessSnapshots <;>
    cases control : state.control <;>
    cases incidents : state.effectIncidents <;>
    simp [admitStimulus, snapshot, control, incidents, profile, refused]

theorem committed_start_bindings_admitted
    (program : Program) (state : RuntimeState)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (committed : (admitStimulus program state
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    structuredCompositionStartBindingsAdmitted program bindings = true := by
  cases selected : structuredCompositionStartBindingsAdmitted program bindings with
  | true => rfl
  | false =>
      have rejected := refused_start_preserves_state program state commandId processId
        instanceId bindings profile selected
      rw [rejected] at committed
      contradiction

theorem committed_start_bindings_canonical_and_typed
    (program : Program) (state : RuntimeState)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (analysis : Analysis)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program state
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    SemanticProcessJson.bindingNamesStrictlyIncrease bindings = true ∧
      processDataBindingsAdmitted program.identity.semanticProfile .processStart bindings = true := by
  have admitted := committed_start_bindings_admitted program state commandId processId instanceId
    bindings profile committed
  simp only [structuredCompositionStartBindingsAdmitted, analyzed, Bool.and_eq_true] at admitted
  exact ⟨admitted.1.1.1.2, admitted.1.2⟩

theorem committed_start_supplies_required_bindings
    (program : Program) (state : RuntimeState)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (analysis : Analysis)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program state
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    ∀ name ∈ analysis.required, ∃ binding ∈ bindings, binding.name = name := by
  have admitted := committed_start_bindings_admitted program state commandId processId instanceId
    bindings profile committed
  simp only [structuredCompositionStartBindingsAdmitted, analyzed, Bool.and_eq_true,
    decide_eq_true_eq] at admitted
  intro name member
  obtain ⟨binding, present, sameName⟩ := List.any_eq_true.mp
    (List.all_eq_true.mp admitted.2 name member)
  exact ⟨binding, present, by simpa using sameName⟩

def burstRank (ordered : List Vertex) (id : String) : Nat :=
  (((burstFacts ordered).find? (·.id == id)).map (·.remaining)).getD 0

private theorem maximum_fold_congr (ids : List String) (left right : String → Nat)
    (same : ∀ id ∈ ids, left id = right id) (initial : Nat) :
    ids.foldl (fun n id => max n (left id)) initial =
      ids.foldl (fun n id => max n (right id)) initial := by
  induction ids generalizing initial with
  | nil => rfl
  | cons first rest ih =>
      simp only [List.foldl_cons, same first (by simp)]
      exact ih (fun id member => same id (by simp [member])) _

theorem burst_rank_cons_other (first : Vertex) (rest : List Vertex) (id : String)
    (different : first.id ≠ id) : burstRank (first :: rest) id = burstRank rest id := by
  simp [burstRank, burstFacts, different]

/-- Forward order makes the admission fold's suffix lookups equal the final graph lookups. -/
theorem burst_rank_equation (ordered : List Vertex) (vertex : Vertex)
    (unique : (ordered.map (·.id)).Nodup) (forward : ForwardOrder ordered)
    (member : vertex ∈ ordered) :
    burstRank ordered vertex.id = match vertex.kind with
      | .task => 1
      | .finish => 2
      | _ => 1 + vertex.outputs.foldl (fun n id => max n (burstRank ordered id)) 0 := by
  induction ordered with
  | nil => simp at member
  | cons first rest ih =>
      cases forward with
      | cons _ _ noBackward forwardRest =>
          have uniqueParts := List.nodup_cons.mp unique
          have outputsAgree : ∀ v ∈ first :: rest,
              v.outputs.foldl (fun n id => max n (burstRank (first :: rest) id)) 0 =
                v.outputs.foldl (fun n id => max n (burstRank rest id)) 0 := by
            intro v present
            apply maximum_fold_congr
            intro id edge
            apply burst_rank_cons_other
            intro same
            exact noBackward v present (same ▸ edge)
          rcases List.mem_cons.mp member with same | later
          · subst vertex
            have agree := outputsAgree first (by simp)
            rw [agree]
            cases kind : first.kind <;> simp [burstRank, burstFacts, kind]
          · have different : first.id ≠ vertex.id := by
              intro same
              exact uniqueParts.1 (List.mem_map.mpr ⟨vertex, later, same.symm⟩)
            rw [burst_rank_cons_other first rest vertex.id different]
            have equation := ih uniqueParts.2 forwardRest later
            have agree := outputsAgree vertex (by simp [later])
            simpa only [agree] using equation

private theorem maximum_fold_bounds_initial (ids : List α) (rank : α → Nat)
    (initial : Nat) : initial ≤ ids.foldl (fun n id => max n (rank id)) initial := by
  induction ids generalizing initial with
  | nil => exact Nat.le_refl _
  | cons first rest ih =>
      exact Nat.le_trans (Nat.le_max_left _ _) (ih _)

private theorem maximum_fold_bounds_member (ids : List α) (rank : α → Nat)
    (id : α) (member : id ∈ ids) (initial : Nat) :
    rank id ≤ ids.foldl (fun n id => max n (rank id)) initial := by
  induction ids generalizing initial with
  | nil => simp at member
  | cons first rest ih =>
      rcases List.mem_cons.mp member with same | later
      · subst first
        exact Nat.le_trans (Nat.le_max_right _ _) (maximum_fold_bounds_initial rest rank _)
      · exact ih later _

theorem burst_rank_positive (ordered : List Vertex) (vertex : Vertex)
    (unique : (ordered.map (·.id)).Nodup) (forward : ForwardOrder ordered)
    (member : vertex ∈ ordered) : 0 < burstRank ordered vertex.id := by
  rw [burst_rank_equation ordered vertex unique forward member]
  cases vertex.kind <;> simp only <;> omega

/-- Only automatic routing edges consume their source rank; task completion starts a new burst. -/
theorem automatic_edge_decreases_burst_rank (ordered : List Vertex) (vertex : Vertex)
    (target : String) (unique : (ordered.map (·.id)).Nodup) (forward : ForwardOrder ordered)
    (member : vertex ∈ ordered) (edge : target ∈ vertex.outputs)
    (automatic : vertex.kind = .start ∨ vertex.kind = .choice ∨ vertex.kind = .merge) :
    burstRank ordered target < burstRank ordered vertex.id := by
  have bound := maximum_fold_bounds_member vertex.outputs (burstRank ordered) target edge 0
  rw [burst_rank_equation ordered vertex unique forward member]
  rcases automatic with kind | kind | kind <;> simp only [kind] <;> omega

theorem maximum_burst_bounds_resumption (vertices ordered : List Vertex) (vertex : Vertex)
    (member : vertex ∈ vertices) :
    (vertex.kind = .start → burstRank ordered vertex.id ≤ maximumBurst vertices ordered) ∧
      (vertex.kind = .task → ∀ target ∈ vertex.outputs,
        burstRank ordered target ≤ maximumBurst vertices ordered) := by
  have bound := maximum_fold_bounds_member vertices (fun v => match v.kind with
    | .start => burstRank ordered v.id
    | .task => v.outputs.foldl (fun n id => max n (burstRank ordered id)) 0
    | _ => 0) vertex member 0
  change (match vertex.kind with
    | .start => burstRank ordered vertex.id
    | .task => vertex.outputs.foldl (fun n id => max n (burstRank ordered id)) 0
    | _ => 0) ≤ maximumBurst vertices ordered at bound
  constructor
  · intro kind
    simpa only [kind] using bound
  · intro kind target edge
    have localBound := maximum_fold_bounds_member vertex.outputs (burstRank ordered) target edge 0
    exact Nat.le_trans localBound (by simpa only [kind] using bound)

theorem committed_start_bounds_analysis
    (program : Program) (state : RuntimeState) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program state
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    analysis.maximumBurst ≤ scenarioClosureLimit := by
  have admitted := committed_start_bindings_admitted program state commandId processId instanceId bindings profile committed
  simp only [structuredCompositionStartBindingsAdmitted, analyzed, Bool.and_eq_true, decide_eq_true_eq] at admitted
  exact admitted.1.1.1.1

end BpmnSemantics.SemanticProcess.StructuredComposition
