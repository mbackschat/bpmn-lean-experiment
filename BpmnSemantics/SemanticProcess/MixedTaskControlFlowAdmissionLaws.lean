import BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import BpmnSemantics.SemanticProcess.GraphReachabilityLaws

/-! MTCF-DATA-01 and MTCF-PROGRESS-01 connect the executable graph certificates to declarative paths and ranks so runtime proofs need not trust a finite search result without its saturation evidence. -/

namespace BpmnSemantics.SemanticProcess.MixedTaskControlFlow

structure AdmissionFacts (vertices : List Vertex) (analysis : Analysis) : Prop where
  vertices_eq : analysis.vertices = vertices
  structural : uniqueNames (vertices.map (·.id)) = true ∧ aritiesValid vertices = true
  start : ∃ vertex ∈ vertices, vertex.kind = .start ∧ vertex.id = analysis.startId
  finish : ∃ vertex ∈ vertices, vertex.kind = .finish ∧ vertex.id = analysis.finishId
  start_unique : (vertices.filter (·.kind == .start)).length = 1
  finish_unique : (vertices.filter (·.kind == .finish)).length = 1
  reachable : allReachableWithin (vertices.map (·.id)) (edges vertices) vertices.length analysis.startId = true
  coreachable : allCoreachableWithin (vertices.map (·.id)) (edges vertices) vertices.length [analysis.finishId] = true
  cut_acyclic : acyclicClosed (cutEdges vertices) vertices.length = true
  writer_closed : writerSearchesClosed vertices analysis.startId = true
  required_eq : analysis.required = requiredInputs vertices analysis.startId
  cutOrder_derived : cutTopologicalOrder vertices.length vertices = some analysis.cutOrder
  ranks_derived : deriveRanks analysis.cutOrder = some analysis.ranks
  ranks_valid : ranksValid vertices analysis.ranks = true
  burst_eq : maximumBurst? vertices analysis.ranks = some analysis.maximumBurst
  bounded : analysis.maximumBurst ≤ scenarioClosureLimit

private theorem unique_selected (values : List α) (value : α)
    (selected : StructuredComposition.unique? values = some value) : value ∈ values := by
  cases values with
  | nil => simp [StructuredComposition.unique?] at selected
  | cons head tail =>
      cases tail with
      | nil => simpa [StructuredComposition.unique?, eq_comm] using selected
      | cons next rest => simp [StructuredComposition.unique?] at selected

private theorem unique_length (values : List α) (value : α)
    (selected : StructuredComposition.unique? values = some value) : values.length = 1 := by
  cases values with
  | nil => simp [StructuredComposition.unique?] at selected
  | cons head tail =>
      cases tail with
      | nil => rfl
      | cons next rest => simp [StructuredComposition.unique?] at selected

theorem analyze_facts (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) : AdmissionFacts vertices analysis := by
  unfold analyze at accepted
  split at accepted
  · simp at accepted
  · rename_i initial
    cases startEq : StructuredComposition.unique? (vertices.filter (·.kind == .start)) with
    | none => simp [startEq] at accepted
    | some start =>
      simp only [startEq, Option.bind_eq_bind, Option.pure_def, Option.bind_some] at accepted
      cases finishEq : StructuredComposition.unique? (vertices.filter (·.kind == .finish)) with
      | none => simp [finishEq] at accepted
      | some finish =>
        simp only [finishEq, Option.bind_some] at accepted
        split at accepted
        · simp at accepted
        · rename_i graph
          cases orderEq : cutTopologicalOrder vertices.length vertices with
          | none => simp [orderEq] at accepted
          | some order =>
            simp only [orderEq, Option.bind_some] at accepted
            cases ranksEq : deriveRanks order with
            | none => simp [ranksEq] at accepted
            | some ranks =>
              simp only [ranksEq, Option.bind_some] at accepted
              cases burstEq : maximumBurst? vertices ranks with
              | none => simp [burstEq] at accepted
              | some burst =>
                simp only [burstEq, Option.bind_some] at accepted
                split at accepted
                · simp at accepted
                · rename_i final
                  simp only [Option.some.injEq] at accepted
                  subst analysis
                  simp only [Bool.not_eq_true, Bool.not_eq_false', Bool.and_eq_true,
                    decide_eq_true_eq] at initial graph final
                  have startMember := unique_selected _ _ startEq
                  have finishMember := unique_selected _ _ finishEq
                  simp only [List.mem_filter, beq_iff_eq] at startMember finishMember
                  exact ⟨rfl, ⟨initial.1.1.1, initial.1.1.2⟩,
                    ⟨start, startMember.1, startMember.2, rfl⟩,
                    ⟨finish, finishMember.1, finishMember.2, rfl⟩,
                    unique_length _ _ startEq, unique_length _ _ finishEq,
                    graph.1.1.1, graph.1.1.2, graph.1.2, graph.2, rfl, orderEq, ranksEq,
                    final.1, burstEq, final.2⟩

theorem admitted_cut_has_no_cycle (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (path : List String) :
    ¬ DirectedCycle (cutEdges vertices) path :=
  acyclicClosed_excludes_directedCycle _ _ (analyze_facts vertices analysis accepted).cut_acyclic path

theorem required_of_writer_free_path (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (reader : Vertex) (name : String)
    (member : reader ∈ vertices) (reads : name ∈ reader.reads)
    (path : GraphReaches (writerBarrierEdges vertices name) analysis.startId reader.id) :
    name ∈ analysis.required := by
  have facts := analyze_facts vertices analysis accepted
  have readMember : name ∈ readNames vertices := by
    simp only [readNames, List.mem_eraseDups, List.mem_flatMap]
    exact ⟨reader, member, reads⟩
  have closed := facts.writer_closed
  simp only [writerSearchesClosed, List.all_eq_true] at closed
  have reached := reachableWithin_complete _ _ _ _ (closed name readMember) path
  rw [facts.required_eq]
  simp only [requiredInputs, List.mem_filter]
  refine ⟨readMember, ?_⟩
  simp only [List.any_eq_true]
  exact ⟨reader, member, by simp [reads, reached]⟩

private theorem cut_order_retains_id (fuel : Nat) (vertices ordered : List Vertex)
    (selected : cutTopologicalOrder fuel vertices = some ordered)
    (vertex : Vertex) (member : vertex ∈ vertices) : vertex.id ∈ ordered.map (·.id) := by
  induction fuel generalizing vertices ordered with
  | zero =>
      simp only [cutTopologicalOrder] at selected
      split at selected
      · rename_i empty
        simp only [List.isEmpty_iff] at empty
        simp [empty] at member
      · simp at selected
  | succ fuel ih =>
      simp only [cutTopologicalOrder] at selected
      split at selected
      · rename_i empty
        simp only [List.isEmpty_iff] at empty
        simp [empty] at member
      · cases firstEq : vertices.find? (fun v => !(cutEdges vertices).any (·.target == v.id)) with
        | none => simp [firstEq] at selected
        | some first =>
          simp only [firstEq, Option.bind_eq_bind, Option.pure_def, Option.bind_some] at selected
          obtain ⟨rest, restEq, resultEq⟩ := Option.bind_eq_some_iff.mp selected
          cases Option.some.inj resultEq
          by_cases same : vertex.id = first.id
          · simp [same]
          · have retained := ih _ _ restEq (by simp [member, same])
            exact List.mem_cons_of_mem _ retained

private theorem derived_rank_ids (ordered : List Vertex) (ranks : List Rank)
    (derived : deriveRanks ordered = some ranks) :
    ranks.map (·.id) = ordered.map (·.id) := by
  induction ordered generalizing ranks with
  | nil =>
      simp only [deriveRanks, Option.some.injEq] at derived
      subst ranks
      rfl
  | cons vertex rest ih =>
      simp only [deriveRanks, Option.bind_eq_bind] at derived
      obtain ⟨tail, tailEq, derived⟩ := Option.bind_eq_some_iff.mp derived
      obtain ⟨rank, rankEq, resultEq⟩ := Option.bind_eq_some_iff.mp derived
      cases Option.some.inj resultEq
      simpa using congrArg (List.cons vertex.id) (ih tail tailEq)

theorem admitted_rank_exists (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (vertex : Vertex) (member : vertex ∈ vertices) :
    ∃ rank, rank? analysis.ranks vertex.id = some rank := by
  have facts := analyze_facts vertices analysis accepted
  have idMember := cut_order_retains_id _ _ _ facts.cutOrder_derived vertex member
  rw [← derived_rank_ids _ _ facts.ranks_derived] at idMember
  obtain ⟨row, rowMember, same⟩ := List.mem_map.mp idMember
  cases found : analysis.ranks.find? (·.id == vertex.id) with
  | none =>
      have absent := List.find?_eq_none.mp found row rowMember
      simp [same] at absent
  | some rank => exact ⟨rank.remaining, by simp [rank?, found]⟩

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

private theorem max_bounds_initial (values : List Nat) (initial : Nat) :
    initial ≤ values.foldl max initial := by
  induction values generalizing initial with
  | nil => exact Nat.le_refl _
  | cons first rest ih => exact Nat.le_trans (Nat.le_max_left _ _) (ih _)

private theorem max_bounds_member (values : List Nat) (value : Nat)
    (member : value ∈ values) (initial : Nat) : value ≤ values.foldl max initial := by
  induction values generalizing initial with
  | nil => simp at member
  | cons first rest ih =>
      rcases List.mem_cons.mp member with rfl | later
      · exact Nat.le_trans (Nat.le_max_right _ _) (max_bounds_initial rest _)
      · exact ih later _

theorem admitted_rank_equation (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (vertex : Vertex) (member : vertex ∈ vertices) :
    rank? analysis.ranks vertex.id = vertexRank? analysis.ranks vertex := by
  have valid := (analyze_facts vertices analysis accepted).ranks_valid
  simp only [ranksValid, List.all_eq_true, beq_iff_eq] at valid
  exact valid vertex member

theorem admitted_wait_rank (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (vertex : Vertex) (member : vertex ∈ vertices)
    (wait : isWait vertex.kind = true) : rank? analysis.ranks vertex.id = some 1 := by
  rw [admitted_rank_equation vertices analysis accepted vertex member]
  cases kind : vertex.kind <;> simp_all [isWait, vertexRank?]

theorem admitted_finish_rank (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (vertex : Vertex) (member : vertex ∈ vertices)
    (finish : vertex.kind = .finish) : rank? analysis.ranks vertex.id = some 2 := by
  rw [admitted_rank_equation vertices analysis accepted vertex member]
  simp [vertexRank?, finish]

private theorem internal_rank_equation (ranks : List Rank) (vertex : Vertex)
    (internal : isWait vertex.kind = false) (notFinish : vertex.kind ≠ .finish) :
    vertexRank? ranks vertex =
      (vertex.outputs.mapM (rank? ranks)).map (fun values => 1 + values.foldl max 0) := by
  cases kind : vertex.kind <;> simp_all [isWait, vertexRank?]
  all_goals cases vertex.outputs.mapM (rank? ranks) <;> rfl

theorem admitted_internal_edge_decreases (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (vertex : Vertex) (member : vertex ∈ vertices)
    (internal : isWait vertex.kind = false) (target : String) (edge : target ∈ vertex.outputs) :
    ∃ sourceRank targetRank,
      rank? analysis.ranks vertex.id = some sourceRank ∧
      rank? analysis.ranks target = some targetRank ∧ targetRank < sourceRank := by
  have facts := analyze_facts vertices analysis accepted
  have notFinish : vertex.kind ≠ .finish := by
    intro finish
    have arity := facts.structural.2
    simp only [aritiesValid, List.all_eq_true] at arity
    have valid := arity vertex member
    simp [finish] at valid
    have empty : vertex.outputs = [] := valid.2.2
    simp [empty] at edge
  obtain ⟨sourceRank, sourceEq⟩ := admitted_rank_exists vertices analysis accepted vertex member
  have equation := admitted_rank_equation vertices analysis accepted vertex member
  rw [sourceEq, internal_rank_equation analysis.ranks vertex internal notFinish] at equation
  obtain ⟨values, mapped, sumEq⟩ := Option.map_eq_some_iff.mp equation.symm
  obtain ⟨targetRank, rankMember, targetEq⟩ := mapM_member_some _ _ _ mapped target edge
  refine ⟨sourceRank, targetRank, sourceEq, targetEq, ?_⟩
  have bound := max_bounds_member values targetRank rankMember 0
  omega

theorem admitted_cut_edge_decreases (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (edge : GraphEdge String)
    (member : edge ∈ cutEdges vertices) :
    ∃ sourceRank targetRank,
      rank? analysis.ranks edge.source = some sourceRank ∧
      rank? analysis.ranks edge.target = some targetRank ∧ targetRank < sourceRank := by
  simp only [cutEdges, edges, List.mem_flatMap, List.mem_filter, List.mem_map] at member
  obtain ⟨vertex, ⟨vertexMember, internal⟩, target, targetMember, rfl⟩ := member
  exact admitted_internal_edge_decreases vertices analysis accepted vertex vertexMember
    (by simpa using internal) target targetMember

theorem admitted_entry_rank_bounded (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (vertex : Vertex) (member : vertex ∈ vertices)
    (entry : String)
    (selected : (vertex.kind = .start ∧ entry = vertex.id) ∨
      (isWait vertex.kind = true ∧ entry ∈ vertex.outputs)) :
    ∃ rank, rank? analysis.ranks entry = some rank ∧ rank ≤ scenarioClosureLimit := by
  have facts := analyze_facts vertices analysis accepted
  have entryMember : entry ∈ vertices.flatMap (fun vertex => match vertex.kind with
      | .start => [vertex.id] | .human | .service => vertex.outputs | _ => []) := by
    apply List.mem_flatMap.mpr
    refine ⟨vertex, member, ?_⟩
    rcases selected with ⟨kind, rfl⟩ | ⟨wait, included⟩
    · simp [kind]
    · cases kind : vertex.kind <;> simp_all [isWait]
  have maximum := facts.burst_eq
  simp only [maximumBurst?, Option.bind_eq_bind] at maximum
  obtain ⟨values, mapped, result⟩ := Option.bind_eq_some_iff.mp maximum
  have resultEq := Option.some.inj result
  obtain ⟨rank, included, rankEq⟩ := mapM_member_some _ _ _ mapped entry entryMember
  refine ⟨rank, rankEq, ?_⟩
  have bound := max_bounds_member values rank included 0
  have bounded := facts.bounded
  omega

/-- Reachability propagates the entry budget to every vertex: internal edges decrease it, and wait continuations begin a newly bounded burst. -/
theorem admitted_rank_bounded (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (vertex : Vertex) (member : vertex ∈ vertices) :
    (rank? analysis.ranks vertex.id).getD 0 ≤ scenarioClosureLimit := by
  have facts := analyze_facts vertices analysis accepted
  obtain ⟨start, startMember, kind, named⟩ := facts.start
  obtain ⟨rank, ranked, bounded⟩ := admitted_entry_rank_bounded vertices analysis accepted start startMember
    analysis.startId (Or.inl ⟨kind, named.symm⟩)
  have path := reachableWithin_sound (edges vertices) vertices.length analysis.startId vertex.id
    (List.all_eq_true.mp facts.reachable vertex.id (List.mem_map.mpr ⟨vertex, member, rfl⟩))
  generalize sourceEq : analysis.startId = source at path ranked
  generalize targetEq : vertex.id = target at path ⊢
  clear sourceEq targetEq
  induction path with
  | refl => simpa [ranked] using bounded
  | @step middle target path edge ih =>
      obtain ⟨previous, included, outputs⟩ := List.mem_flatMap.mp edge
      obtain ⟨output, outputMember, endpoints⟩ := List.mem_map.mp outputs
      have equal : previous.id = middle ∧ output = target := by simpa only [GraphEdge.mk.injEq] using endpoints
      cases wait : isWait previous.kind with
      | true =>
          obtain ⟨nextRank, found, bound⟩ := admitted_entry_rank_bounded vertices analysis accepted previous included target
            (Or.inr ⟨wait, equal.2 ▸ outputMember⟩)
          simpa [found] using bound
      | false =>
          obtain ⟨previousRank, nextRank, previousFound, nextFound, decreased⟩ :=
            admitted_internal_edge_decreases vertices analysis accepted previous included wait output outputMember
          rw [equal.1] at previousFound
          rw [equal.2] at nextFound
          simp only [previousFound, Option.getD_some] at ih
          simp only [nextFound, Option.getD_some]
          omega

/-- General continuation analysis must not broaden the inherited Service Task source shape (MBERR-CATCH-01). -/
theorem unrouted_checked_service_keeps_one_output (source : CheckedProcess)
    (id : NodeId) (descriptor : EffectDescriptor) (inputs outputs : List VariableMapping)
    (vertex : Vertex)
    (projected : checkedVertex? source (.serviceTask id descriptor inputs outputs none) = some vertex) :
    vertex.outputs.length = 1 := by
  simp only [checkedVertex?] at projected
  split at projected
  · contradiction
  · simp_all
    cases projected
    simp_all

end BpmnSemantics.SemanticProcess.MixedTaskControlFlow
