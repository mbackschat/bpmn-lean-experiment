module

public import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
public import BpmnSemantics.SemanticProcess.ParallelScopePopulationPreservation
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! # Admitted parallel Program capacity certificates

PMIS-ADMIT-01 retains exact declaration, graph and ordered-spine provenance in
this proof owner. Runtime admission and capacity selectors remain in Capacity,
so extending a certificate does not change their import dependencies.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.ParallelScopeStart

/-- PMIS-ADMIT-01 retains the original Program selection and conversion equations
behind its successful structured body admission, independently of capacity counts. -/
private theorem analyzeProgram_body_provenance (program : Program) (analysis : ProgramAnalysis)
    (success : analyzeProgram program = some analysis) :
    ∃ (root : DefinitionScope) (parent : List SemanticOperation) (waits : Nat × Nat)
      (child : List SemanticOperation) (completion : SemanticOperation)
      (origin : BpmnElementOrigin) (body : List SemanticOperation) (first : String)
      (converted ordered : List StructuredParallelBody.Vertex),
      program.definitionScopes.filter (·.parentScopeId.isNone) = [root] ∧
      parent = program.operations.filter (fun operation => program.operationScopes.any
        (fun owner => owner.operationId == operation.id && owner.scopeId == root.id)) ∧
      analysis.parentCount = parent.length ∧
      SequentialScopeControl.parentWaits? parent analysis.entry.id = some waits ∧
      program.operations.filterMap parallelScopeEntry? = [analysis.entry] ∧
      child = program.operations.filter (fun operation => program.operationScopes.any
        (fun owner => owner.operationId == operation.id && owner.scopeId == analysis.entry.childScopeId)) ∧
      child.filter (fun operation => match operation with
        | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion] ∧
      completion = .completeParallelMultiInstanceScope completion.id origin analysis.entry.id ∧
      origin.elementId = analysis.entry.elementId ∧
      body = child.filter (·.id != completion.id) ∧
      SequentialScopeControl.consumer? body analysis.entry.childEntry = some first ∧
      body.mapM (SequentialScopeControl.bodyVertex? body) = some converted ∧
      let vertices := ⟨analysis.entry.id.value, StructuredParallelBody.Kind.start, [first]⟩ :: converted
      StructuredParallelBody.structureOrder vertices = some ordered ∧ analysis.childCount = child.length := by
  unfold analyzeProgram at success
  split at success
  · contradiction
  · split at success
    · rename_i entries entry entryEq
      split at success
      · rename_i roots root rootEq
        split at success
        · split at success
          · split at success
            · contradiction
            · try dsimp only at success
              split at success
              · rename_i completions completion completionEq
                split at success
                · rename_i id origin paired
                  split at success
                  · contradiction
                  · rename_i pairedGuard
                    try dsimp only at success
                    split at success
                    · contradiction
                    · obtain ⟨parentWait, parentWaitEq, success⟩ := Option.bind_eq_some_iff.mp success
                      obtain ⟨first, firstEq, success⟩ := Option.bind_eq_some_iff.mp success
                      obtain ⟨converted, convertedEq, success⟩ := Option.bind_eq_some_iff.mp success
                      obtain ⟨ordered, orderEq, success⟩ := Option.bind_eq_some_iff.mp success
                      obtain ⟨requirements, requirementsEq, success⟩ := Option.bind_eq_some_iff.mp success
                      obtain ⟨width, widthEq, equal⟩ := Option.bind_eq_some_iff.mp success
                      cases requirements
                      have equal := Option.some.inj equal
                      subst analysis
                      let child := program.operations.filter (fun operation => program.operationScopes.any
                        (fun owner => owner.operationId == operation.id && owner.scopeId == entry.childScopeId))
                      let completion := SemanticOperation.completeParallelMultiInstanceScope id origin paired
                      let body := child.filter (·.id != completion.id)
                      let parent := program.operations.filter (fun operation => program.operationScopes.any
                        (fun owner => owner.operationId == operation.id && owner.scopeId == root.id))
                      refine ⟨root, parent, parentWait, child, completion, origin, body, first, converted, ordered,
                        rootEq, rfl, rfl, parentWaitEq, ?_⟩
                      refine ⟨entryEq, rfl, completionEq, ?_, ?_, rfl, firstEq, convertedEq, orderEq, rfl⟩
                      · change SemanticOperation.completeParallelMultiInstanceScope id origin paired =
                          SemanticOperation.completeParallelMultiInstanceScope id origin entry.id
                        congr 1
                        simp only [Bool.or_eq_true, bne_iff_ne, not_or] at pairedGuard
                        exact Classical.byContradiction pairedGuard.1.1.1
                      · change origin.elementId = entry.elementId
                        simp only [Bool.or_eq_true, bne_iff_ne, not_or] at pairedGuard
                        exact Classical.byContradiction pairedGuard.1.1.2
                · contradiction
              · contradiction
          · contradiction
        · contradiction
      · contradiction
    · contradiction

/-- PMIS-ADMIT-01 retains the original Program selection and conversion equations
behind its successful structured body admission, independently of capacity counts. -/
theorem analyzeProgram_body_certificate (program : Program) (analysis : ProgramAnalysis)
    (success : analyzeProgram program = some analysis) :
    ∃ (child : List SemanticOperation) (completion : SemanticOperation)
      (origin : BpmnElementOrigin) (body : List SemanticOperation) (first : String)
      (converted ordered : List StructuredParallelBody.Vertex),
      program.operations.filterMap parallelScopeEntry? = [analysis.entry] ∧
      child = program.operations.filter (fun operation => program.operationScopes.any
        (fun owner => owner.operationId == operation.id && owner.scopeId == analysis.entry.childScopeId)) ∧
      child.filter (fun operation => match operation with
        | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion] ∧
      completion = .completeParallelMultiInstanceScope completion.id origin analysis.entry.id ∧
      origin.elementId = analysis.entry.elementId ∧
      body = child.filter (·.id != completion.id) ∧
      SequentialScopeControl.consumer? body analysis.entry.childEntry = some first ∧
      body.mapM (SequentialScopeControl.bodyVertex? body) = some converted ∧
      let vertices := ⟨analysis.entry.id.value, StructuredParallelBody.Kind.start, [first]⟩ :: converted
      StructuredParallelBody.structureOrder vertices = some ordered ∧
      vertices.Perm ordered ∧ (ordered.map (·.id)).Nodup ∧
      ordered.Pairwise (fun earlier later => earlier.id ∉ later.outputs) ∧
      (∀ vertex ∈ ordered, vertex.id ∉ vertex.outputs) ∧
      (∀ vertex ∈ ordered, ∀ target ∈ vertex.outputs, ∃ next ∈ ordered, next.id = target) := by
  obtain ⟨root, parent, waits, child, completion, origin, body, first, converted, ordered, _, _, _, _, entryEq,
    childEq, completionEq, pairedEq, originEq, bodyEq, firstEq, convertedEq, orderedEq, _⟩ :=
    analyzeProgram_body_provenance program analysis success
  exact ⟨child, completion, origin, body, first, converted, ordered, entryEq,
    childEq, completionEq, pairedEq, originEq, bodyEq, firstEq, convertedEq, orderedEq,
    StructuredParallelBody.structureOrder_certificate _ _ orderedEq⟩

theorem analyzeProgram_incidence_admission (program : Program) (analysis : ProgramAnalysis)
    (success : analyzeProgram program = some analysis) :
    programWellFormed program = true ∧ program.interruptingMessageEventSubProcesses = [] ∧
      program.operations.all programOperationAllowed = true := by
  unfold analyzeProgram at success
  split at success
  · contradiction
  · rename_i admitted
    refine ⟨?_, ?_, ?_⟩
    · cases checked : programWellFormed program with
      | false => simp [checked] at admitted
      | true => rfl
    · cases declarations : program.interruptingMessageEventSubProcesses with
      | nil => rfl
      | cons first rest => simp [declarations] at admitted
    · cases checked : program.operations.all programOperationAllowed with
      | false => simp [checked] at admitted
      | true => rfl

theorem analyzeProgram_operation_allowed (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (operation : SemanticOperation)
    (member : operation ∈ program.operations) :
    SequentialScopeProgram.operationAllowed operation = true ∨
      (match operation with | .enterParallelMultiInstanceScope .. | .completeParallelMultiInstanceScope .. => true | _ => false) = true := by
  have allowed := List.all_eq_true.mp (analyzeProgram_incidence_admission program analysis admitted).2.2 operation member
  cases operation <;> simp [programOperationAllowed] at allowed ⊢ <;> assumption

private theorem filterMap_eq_on {α β : Type} (values : List α) (left right : α → Option β)
    (same : ∀ value ∈ values, left value = right value) : values.filterMap left = values.filterMap right := by
  induction values with
  | nil => rfl
  | cons first rest ih =>
    have head := same first (by simp)
    have tail := ih (fun value member => same value (by simp [member]))
    simp only [List.filterMap_cons, head, tail]

/-- Actual PMIS admission gives every declared port exactly one producer and one consumer, with no hidden handler producer. -/
theorem analyzeProgram_place_incidence (program : Program) (analysis : ProgramAnalysis)
    (success : analyzeProgram program = some analysis) (place : ControlPlace)
    (declared : place ∈ program.controlPlaces) :
    (producers program.operations place.id).length = 1 ∧
      (program.operations.filterMap (fun operation =>
        if (SequentialScopeControl.inputs operation).contains place.id then some operation.id else none)).length = 1 := by
  obtain ⟨wellFormed, noHandlers, allowed⟩ := analyzeProgram_incidence_admission program analysis success
  have graph := programWellFormed_graph program wellFormed
  unfold programGraphWellFormedForProgram programGraphWellFormedWithScopeLifecycle at graph
  dsimp only at graph
  split at graph <;> try contradiction
  split at graph <;> try contradiction
  simp only [Bool.and_eq_true] at graph
  have counts := List.all_eq_true.mp graph.1.1.1.2 place declared
  simp only [Bool.and_eq_true] at counts
  have single := producerCensus_without_invocations program place.id (fun operation member => by
    have selected := List.all_eq_true.mp allowed operation member
    cases operation <;> first
      | rfl
      | simp [programOperationAllowed, SequentialScopeProgram.operationAllowed] at selected) counts.1
  simp only [noHandlers, List.filter_nil, List.length_nil, Nat.add_zero] at single
  have consumers := counts.2
  simp only [decide_eq_true_eq] at consumers
  refine ⟨single, ?_⟩
  rw [← consumers]
  apply congrArg List.length
  apply filterMap_eq_on
  intro operation member
  have selected := List.all_eq_true.mp allowed operation member
  cases operation <;> first
    | rfl
    | simp [programOperationAllowed, SequentialScopeProgram.operationAllowed] at selected

/-- Actual PMIS structural admission forbids repeated Fork output ports and Join input ports. -/
theorem analyzeProgram_fork_join_ports_nodup (program : Program) (analysis : ProgramAnalysis)
    (success : analyzeProgram program = some analysis) :
    (∀ id origin input outputs, SemanticOperation.duplicate id origin input outputs ∈ program.operations → outputs.Nodup) ∧
    (∀ id origin inputs output, SemanticOperation.synchronize id origin inputs output ∈ program.operations → inputs.Nodup) := by
  have valid := (analyzeProgram_incidence_admission program analysis success).1
  constructor
  · intro id origin input outputs member
    have operationValid := List.all_eq_true.mp (programWellFormed_operations program valid) _ member
    simp only [operationWellFormed, Bool.and_eq_true] at operationValid
    have sorted : strictlySortedStrings (outputs.map (·.value)) = true := operationValid.1.2
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
    · intro left right different same
      exact different (congrArg ControlPlaceId.value same)
    · exact strictlySortedStrings_nodup _ sorted
  · intro id origin inputs output member
    have operationValid := List.all_eq_true.mp (programWellFormed_operations program valid) _ member
    simp only [operationWellFormed, Bool.and_eq_true] at operationValid
    have sorted : strictlySortedStrings (inputs.map (·.value)) = true := operationValid.1.1.2
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
    · intro left right different same
      exact different (congrArg ControlPlaceId.value same)
    · exact strictlySortedStrings_nodup _ sorted


theorem mapped_member {α β : Type} (f : α → Option β) (xs : List α) (ys : List β)
    (mapped : xs.mapM f = some ys) (x : α) (member : x ∈ xs) :
    ∃ y ∈ ys, f x = some y := by
  induction xs generalizing ys with
  | nil => simp at member
  | cons head tail ih =>
    rw [List.mapM_cons] at mapped
    obtain ⟨y, headEq, rest⟩ := Option.bind_eq_some_iff.mp mapped
    obtain ⟨values, tailEq, equal⟩ := Option.bind_eq_some_iff.mp rest
    cases Option.some.inj equal
    rcases List.mem_cons.mp member with same | member
    · subst x; exact ⟨y, by simp, headEq⟩
    · obtain ⟨value, present, equation⟩ := ih values tailEq member
      exact ⟨value, by simp [present], equation⟩

private theorem consumer_of_member (body : List SemanticOperation) (operation : SemanticOperation)
    (place : ControlPlaceId) (member : operation ∈ body)
    (input : place ∈ SequentialScopeControl.inputs operation) (value : String)
    (success : SequentialScopeControl.consumer? body place = some value) : value = operation.id.value := by
  unfold SequentialScopeControl.consumer? at success
  split at success <;> try contradiction
  rename_i selected selectedEq
  have present : operation ∈ body.filter (fun op => (SequentialScopeControl.inputs op).contains place) := by
    simp [member, input]
  rw [selectedEq] at present
  have same : operation = selected := by simpa using present
  subst operation
  exact (Option.some.inj success).symm

private theorem body_vertex_ports (body : List SemanticOperation) (operation : SemanticOperation)
    (vertex : StructuredParallelBody.Vertex)
    (success : SequentialScopeControl.bodyVertex? body operation = some vertex) :
    vertex.id = operation.id.value ∧
      ∀ port ∈ operationOutputs operation, ∃ target ∈ vertex.outputs,
        SequentialScopeControl.consumer? body port = some target := by
  cases operation <;> simp only [SequentialScopeControl.bodyVertex?, bind, Option.bind_some,
    Option.bind_none] at success <;> try contradiction
  all_goals try (rename_i id origin input output effect route; cases route <;>
    dsimp only at success <;> try contradiction)
  all_goals
    obtain ⟨targets, mapped, equal⟩ := Option.bind_eq_some_iff.mp success
    cases Option.some.inj equal
    constructor
    · rfl
    · intro port member
      apply mapped_member _ _ _ mapped port
      simpa only [operationOutputs, Option.toList_none, List.map_nil, List.append_nil] using member

private theorem ordered_edge (ordered : List StructuredParallelBody.Vertex)
    (pairwise : ordered.Pairwise (fun earlier later => earlier.id ∉ later.outputs))
    (self : ∀ vertex ∈ ordered, vertex.id ∉ vertex.outputs)
    (producer consumer : StructuredParallelBody.Vertex) (produces : producer ∈ ordered)
    (consumes : consumer ∈ ordered) (edge : consumer.id ∈ producer.outputs) :
    producer.id ≠ consumer.id ∧ ∃ earlier middle suffix,
      ordered = earlier ++ producer :: middle ++ consumer :: suffix := by
  have different : producer.id ≠ consumer.id := by
    intro same; exact self producer produces (same ▸ edge)
  refine ⟨different, ?_⟩
  induction ordered with
  | nil => simp at produces
  | cons head tail ih =>
    obtain ⟨headFrame, tailFrame⟩ := List.pairwise_cons.mp pairwise
    rcases List.mem_cons.mp produces with same | produces
    · subst producer
      have consumes : consumer ∈ tail := by
        rcases List.mem_cons.mp consumes with same | member
        · subst consumer; exact False.elim (self head (by simp) edge)
        · exact member
      obtain ⟨middle, suffix, equal⟩ := List.mem_iff_append.mp consumes
      exact ⟨[], middle, suffix, by simp [equal]⟩
    · have consumes : consumer ∈ tail := by
        rcases List.mem_cons.mp consumes with same | member
        · subst consumer; exact False.elim (headFrame producer produces edge)
        · exact member
      obtain ⟨earlier, middle, suffix, equal⟩ := ih tailFrame
        (fun vertex member => self vertex (by simp [member])) produces consumes
      exact ⟨head :: earlier, middle, suffix, by simp [equal]⟩

/-- Actual PMIS conversion orders every produced-to-consumed port dependency strictly,
including distinct ports whose graph edges have the same target. -/
theorem analyzeProgram_port_dependency_order (program : Program) (analysis : ProgramAnalysis)
    (success : analyzeProgram program = some analysis) :
    ∃ child completion body first converted ordered,
      child = program.operations.filter (fun operation => program.operationScopes.any
        (fun owner => owner.operationId == operation.id && owner.scopeId == analysis.entry.childScopeId)) ∧
      child.filter (fun operation => match operation with
        | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion] ∧
      body = child.filter (·.id != completion.id) ∧
      SequentialScopeControl.consumer? body analysis.entry.childEntry = some first ∧
      body.mapM (SequentialScopeControl.bodyVertex? body) = some converted ∧
      StructuredParallelBody.structureOrder (⟨analysis.entry.id.value, .start, [first]⟩ :: converted) = some ordered ∧
      ∀ producer ∈ body, ∀ consumer ∈ body, ∀ port ∈ operationOutputs producer,
        port ∈ SequentialScopeControl.inputs consumer →
        producer.id ≠ consumer.id ∧ ∃ earlier middle suffix,
          ordered.map (·.id) = earlier ++ producer.id.value :: middle ++ consumer.id.value :: suffix := by
  obtain ⟨child, completion, origin, body, first, converted, ordered, _, childEq,
    completionEq, _, _, bodyEq, firstEq, convertedEq, orderEq,
    permutation, unique, pairwise, self, targets⟩ := analyzeProgram_body_certificate program analysis success
  refine ⟨child, completion, body, first, converted, ordered, childEq, completionEq,
    bodyEq, firstEq, convertedEq, orderEq, ?_⟩
  intro producer producerMember consumer consumerMember port output input
  obtain ⟨producerVertex, producerPresent, producerEq⟩ := mapped_member _ _ _ convertedEq producer producerMember
  obtain ⟨consumerVertex, consumerPresent, consumerEq⟩ := mapped_member _ _ _ convertedEq consumer consumerMember
  obtain ⟨producerId, producerPorts⟩ := body_vertex_ports _ _ _ producerEq
  have consumerId := (body_vertex_ports _ _ _ consumerEq).1
  obtain ⟨target, targetMember, targetEq⟩ := producerPorts port output
  have targetId := consumer_of_member body consumer port consumerMember input target targetEq
  have edge : consumerVertex.id ∈ producerVertex.outputs := by rw [consumerId, ← targetId]; exact targetMember
  obtain ⟨different, earlier, middle, suffix, equal⟩ := ordered_edge ordered pairwise self
    producerVertex consumerVertex (permutation.mem_iff.mp (by simp [producerPresent]))
    (permutation.mem_iff.mp (by simp [consumerPresent])) edge
  refine ⟨?_, earlier.map (·.id), middle.map (·.id), suffix.map (·.id), ?_⟩
  · intro same; apply different; rw [producerId, consumerId, same]
  · rw [equal]; simp [producerId, consumerId]


private theorem mapped_preimage {α β : Type} (f : α → Option β) (xs : List α) (ys : List β)
    (mapped : xs.mapM f = some ys) (y : β) (member : y ∈ ys) :
    ∃ x ∈ xs, f x = some y := by
  induction xs generalizing ys with
  | nil => simp at mapped; subst ys; simp at member
  | cons head tail ih =>
    rw [List.mapM_cons] at mapped
    obtain ⟨value, headEq, rest⟩ := Option.bind_eq_some_iff.mp mapped
    obtain ⟨values, tailEq, equal⟩ := Option.bind_eq_some_iff.mp rest
    cases Option.some.inj equal
    rcases List.mem_cons.mp member with same | member
    · subst y; exact ⟨head, by simp, headEq⟩
    · obtain ⟨x, present, equation⟩ := ih values tailEq member
      exact ⟨x, by simp [present], equation⟩

private theorem vertex_preimage (body : List SemanticOperation) (operation : SemanticOperation)
    (vertex : StructuredParallelBody.Vertex)
    (success : SequentialScopeControl.bodyVertex? body operation = some vertex) :
    vertex.kind ≠ .start ∧ vertex.id = operation.id.value ∧
      ∀ target ∈ vertex.outputs, ∃ port ∈ operationOutputs operation,
        SequentialScopeControl.consumer? body port = some target := by
  cases operation <;> simp only [SequentialScopeControl.bodyVertex?, bind, Option.bind_some,
    Option.bind_none] at success <;> try contradiction
  all_goals try (rename_i id origin input output effect route; cases route <;>
    dsimp only at success <;> try contradiction)
  all_goals
    obtain ⟨targets, mapped, equal⟩ := Option.bind_eq_some_iff.mp success
    cases Option.some.inj equal
    refine ⟨by simp, rfl, ?_⟩
    intro target member
    obtain ⟨port, present, equation⟩ := mapped_preimage _ _ _ mapped target member
    exact ⟨port, by simpa only [operationOutputs, Option.toList_none, List.map_nil, List.append_nil] using present, equation⟩

private theorem consumer_input_of_id (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (body : List SemanticOperation)
    (population : ∀ operation ∈ body, operation ∈ program.operations)
    (consumer : SemanticOperation) (member : consumer ∈ body) (port : ControlPlaceId)
    (success : SequentialScopeControl.consumer? body port = some consumer.id.value) :
    port ∈ SequentialScopeControl.inputs consumer := by
  unfold SequentialScopeControl.consumer? at success
  split at success <;> try contradiction
  rename_i selected selectedEq
  have selectedMember : selected ∈ body.filter (fun op => (SequentialScopeControl.inputs op).contains port) := by rw [selectedEq]; simp
  obtain ⟨selectedMember, input⟩ := List.mem_filter.mp selectedMember
  have key : selected.id.value = consumer.id.value := Option.some.inj success
  have sorted := programWellFormed_operationIdsSorted program (analyzeProgram_incidence_admission program analysis admitted).1
  have census := filter_key_eq_singleton_of_nodup program.operations (fun operation => operation.id.value)
    consumer (strictlySortedStrings_nodup _ sorted) (population consumer member)
  have present : selected ∈ program.operations.filter (fun operation => decide (operation.id.value = consumer.id.value)) := by
    simp [population selected selectedMember, key]
  rw [census] at present
  have same : selected = consumer := by simpa using present
  subst selected
  simpa using input

private theorem order_incoming (vertices ordered : List StructuredParallelBody.Vertex)
    (success : StructuredParallelBody.structureOrder vertices = some ordered)
    (vertex : StructuredParallelBody.Vertex) (member : vertex ∈ vertices) (nonstart : vertex.kind ≠ .start) :
    ∃ predecessor ∈ vertices, vertex.id ∈ predecessor.outputs := by
  have valid : StructuredParallelBody.aritiesValid vertices = true := by
    unfold StructuredParallelBody.structureOrder at success
    split at success
    · contradiction
    · rename_i admitted
      cases checked : StructuredParallelBody.aritiesValid vertices <;> simp [checked] at admitted ⊢
  have shape := (Bool.and_eq_true_iff.mp (List.all_eq_true.mp valid vertex member)).2
  have positive : 0 < StructuredParallelBody.incomingCount vertices vertex.id := by
    cases kind : vertex.kind <;> simp [kind, beq_iff_eq, decide_eq_true_eq] at shape nonstart <;> omega
  have edge : vertex.id ∈ vertices.flatMap (·.outputs) := by
    exact List.count_pos_iff.mp positive
  exact List.mem_flatMap.mp edge

/-- Actual body admission selects an incoming real port from the synthetic entry
or a strictly earlier body operation; repeated target edges remain admitted. -/
theorem analyzeProgram_chosen_input_predecessor (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) :
    ∃ child completion body first converted ordered,
      child = program.operations.filter (fun operation => program.operationScopes.any
        (fun owner => owner.operationId == operation.id && owner.scopeId == analysis.entry.childScopeId)) ∧
      child.filter (fun operation => match operation with
        | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion] ∧
      body = child.filter (·.id != completion.id) ∧
      body.mapM (SequentialScopeControl.bodyVertex? body) = some converted ∧
      StructuredParallelBody.structureOrder (⟨analysis.entry.id.value, .start, [first]⟩ :: converted) = some ordered ∧
      ∀ consumer ∈ body, ∃ port, port ∈ SequentialScopeControl.inputs consumer ∧
        ((port = analysis.entry.childEntry) ∨ ∃ producer ∈ body,
          port ∈ operationOutputs producer ∧ ∃ earlier middle suffix,
            ordered.map (·.id) = earlier ++ producer.id.value :: middle ++ consumer.id.value :: suffix) := by
  obtain ⟨child, completion, origin, body, first, converted, ordered, _, childEq,
    completionEq, _, _, bodyEq, firstEq, convertedEq, orderEq,
    permutation, unique, pairwise, self, targets⟩ := analyzeProgram_body_certificate program analysis admitted
  have bodyPopulation : ∀ operation ∈ body, operation ∈ program.operations := by
    intro operation member
    rw [bodyEq] at member
    have childMember := (List.mem_filter.mp member).1
    rw [childEq] at childMember
    exact (List.mem_filter.mp childMember).1
  refine ⟨child, completion, body, first, converted, ordered, childEq, completionEq, bodyEq, convertedEq, orderEq, ?_⟩
  intro consumer consumerMember
  obtain ⟨vertex, vertexMember, vertexEq⟩ := mapped_member _ _ _ convertedEq consumer consumerMember
  obtain ⟨nonstart, vertexId, reverse⟩ := vertex_preimage _ _ _ vertexEq
  obtain ⟨predecessor, predecessorMember, edge⟩ := order_incoming _ _ orderEq vertex (by simp [vertexMember]) nonstart
  rcases List.mem_cons.mp predecessorMember with startEq | predecessorMember
  · subst predecessor
    have firstId : first = consumer.id.value := by
      have equal : vertex.id = first := by simpa using edge
      exact (vertexId.symm.trans equal).symm
    have input := consumer_input_of_id program analysis admitted body bodyPopulation consumer consumerMember
      analysis.entry.childEntry (by simpa [firstId] using firstEq)
    exact ⟨analysis.entry.childEntry, input, Or.inl rfl⟩
  · obtain ⟨producer, producerMember, producerEq⟩ := mapped_preimage _ _ _ convertedEq predecessor predecessorMember
    obtain ⟨_, producerId, ports⟩ := vertex_preimage _ _ _ producerEq
    obtain ⟨port, output, inputEq⟩ := ports vertex.id edge
    have input := consumer_input_of_id program analysis admitted body bodyPopulation consumer consumerMember port
      (by simpa [vertexId] using inputEq)
    obtain ⟨_, earlier, middle, suffix, orderedEq⟩ := ordered_edge ordered pairwise self predecessor vertex
      (permutation.mem_iff.mp (by simp [predecessorMember]))
      (permutation.mem_iff.mp (by simp [vertexMember])) edge
    refine ⟨port, input, Or.inr ⟨producer, producerMember, output, earlier.map (·.id), middle.map (·.id), suffix.map (·.id), ?_⟩⟩
    rw [orderedEq]; simp [producerId, vertexId]

/-- Parent adjacency follows the admitted wait continuation or the single selected parallel entry. -/
def ParentSpineStep (entryId : OperationId) (entered : Bool) (operation : SemanticOperation)
    (output : ControlPlaceId) (nextEntered : Bool) : Prop :=
  match operation with
  | .awaitUserTask _ _ _ next _ | .awaitEffect _ _ _ next _ none => output = next ∧ nextEntered = entered
  | .enterParallelMultiInstanceScope id _ _ _ _ next .. =>
      entered = false ∧ id = entryId ∧ output = next ∧ nextEntered = true
  | _ => False

/-- The certificate retains actual singleton input selection and declaration removal at each parent-path step. -/
inductive ParentSpineTrace (entryId : OperationId) : List SemanticOperation → ControlPlaceId → Bool → List SemanticOperation → Prop where
  | finish (operations : List SemanticOperation) (next : ControlPlaceId) (id : OperationId)
      (origin : BpmnElementOrigin) (input : ControlPlaceId)
      (selected : operations.filter (fun operation => (SequentialScopeControl.inputs operation).contains next) =
        [.reachNoneEnd id origin input])
      (empty : operations.filter (·.id != id) = []) :
      ParentSpineTrace entryId operations next true [.reachNoneEnd id origin input]
  | step (operations : List SemanticOperation) (next output : ControlPlaceId) (entered nextEntered : Bool)
      (operation : SemanticOperation) (tail : List SemanticOperation)
      (selected : operations.filter (fun operation => (SequentialScopeControl.inputs operation).contains next) = [operation])
      (edge : ParentSpineStep entryId entered operation output nextEntered)
      (rest : ParentSpineTrace entryId (operations.filter (·.id != operation.id)) output nextEntered tail) :
      ParentSpineTrace entryId operations next entered (operation :: tail)

private theorem parentPath_trace (fuel : Nat) (operations : List SemanticOperation)
    (entryId : OperationId) (next : ControlPlaceId) (entered : Bool) (before after : Nat)
    (counts : Nat × Nat) (allowed : operations.all programOperationAllowed = true)
    (success : SequentialScopeControl.parentPath fuel operations entryId next entered before after = some counts) :
    ∃ path, ParentSpineTrace entryId operations next entered path := by
  induction fuel generalizing operations next entered before after with
  | zero => simp [SequentialScopeControl.parentPath] at success
  | succ fuel ih =>
    unfold SequentialScopeControl.parentPath at success
    split at success <;> try contradiction
    rename_i operation selected
    have member : operation ∈ operations := by
      have present : operation ∈ operations.filter (fun operation => (SequentialScopeControl.inputs operation).contains next) := by rw [selected]; simp
      exact (List.mem_filter.mp present).1
    have permitted := List.all_eq_true.mp allowed operation member
    have remaining : (operations.filter (·.id != operation.id)).all programOperationAllowed = true :=
      List.all_eq_true.mpr (fun operation member => List.all_eq_true.mp allowed operation (List.mem_filter.mp member).1)
    cases operation <;> simp only at success <;> try contradiction
    all_goals try { simp [programOperationAllowed] at permitted }
    case awaitUserTask id origin input output task =>
      obtain ⟨path, trace⟩ := ih _ output entered _ _ remaining success
      exact ⟨_ :: path, .step _ next output entered entered _ path selected ⟨rfl, rfl⟩ trace⟩
    case awaitEffect id origin input output effect route =>
      cases route <;> simp only at success <;> try contradiction
      obtain ⟨path, trace⟩ := ih _ output entered _ _ remaining success
      exact ⟨_ :: path, .step _ next output entered entered _ path selected ⟨rfl, rfl⟩ trace⟩
    case enterParallelMultiInstanceScope id origin input childScope childEntry output collection item mappings condition =>
      split at success <;> try contradiction
      rename_i guarded
      obtain ⟨path, trace⟩ := ih _ output true _ _ remaining success
      have flags : entered = false ∧ id = entryId := by
        cases entered <;> simp_all
      exact ⟨_ :: path, .step _ next output entered true _ path selected ⟨flags.1, flags.2, rfl, rfl⟩ trace⟩
    case reachNoneEnd id origin input =>
      split at success <;> try contradiction
      rename_i guarded
      have flags : entered = true ∧ operations.filter (fun operation => operation.id != id) = [] := by
        simpa [SemanticOperation.id] using guarded
      rw [flags.1]
      exact ⟨_, .finish operations next id origin input selected flags.2⟩

private theorem ParentSpineTrace.facts (entryId : OperationId) (operations : List SemanticOperation)
    (next : ControlPlaceId) (entered : Bool) (path : List SemanticOperation)
    (trace : ParentSpineTrace entryId operations next entered path) :
    (path.map (·.id)).Nodup ∧ ∀ operation ∈ path, operation ∈ operations := by
  induction trace with
  | finish operations next id origin input selected empty =>
    refine ⟨by simp, ?_⟩
    intro operation member
    have same : operation = .reachNoneEnd id origin input := by simpa using member
    subst operation
    have selectedMember : SemanticOperation.reachNoneEnd id origin input ∈ operations.filter
        (fun operation => (SequentialScopeControl.inputs operation).contains next) := by rw [selected]; simp
    exact (List.mem_filter.mp selectedMember).1
  | step operations next output entered nextEntered operation tail selected edge rest ih =>
    have selectedMember : operation ∈ operations.filter
        (fun operation => (SequentialScopeControl.inputs operation).contains next) := by rw [selected]; simp
    refine ⟨?_, ?_⟩
    · simp only [List.map_cons, List.nodup_cons]
      refine ⟨?_, ih.1⟩
      intro repeated
      obtain ⟨other, present, same⟩ := List.mem_map.mp repeated
      have excluded := (List.mem_filter.mp (ih.2 other present)).2
      simp [same] at excluded
    · intro other member
      rcases List.mem_cons.mp member with same | member
      · subst other; exact (List.mem_filter.mp selectedMember).1
      · exact (List.mem_filter.mp (ih.2 other member)).1

private theorem removeId_perm (operations : List SemanticOperation) (operation : SemanticOperation)
    (unique : (operations.map (·.id)).Nodup) (member : operation ∈ operations) :
    operations.Perm (operation :: operations.filter (·.id != operation.id)) := by
  induction operations with
  | nil => simp at member
  | cons head tail ih =>
    obtain ⟨different, unique⟩ := List.nodup_cons.mp unique
    rcases List.mem_cons.mp member with same | member
    · subst operation
      have kept : tail.filter (·.id != head.id) = tail := by
        apply List.filter_eq_self.mpr
        intro other member
        have unequal : other.id ≠ head.id := by
          intro same
          exact different (List.mem_map.mpr ⟨other, member, same⟩)
        simpa using unequal
      simp [kept]
    · have unequal : head.id ≠ operation.id := by
        intro same
        exact different (List.mem_map.mpr ⟨operation, member, same.symm⟩)
      have later := ih unique member
      simpa [unequal] using (later.cons head).trans (List.Perm.swap head operation (tail.filter (·.id != operation.id))).symm

/-- Unique declaration IDs make every actual recursive removal account for exactly one path declaration. -/
theorem ParentSpineTrace.permutation (entryId : OperationId) (operations : List SemanticOperation)
    (next : ControlPlaceId) (entered : Bool) (path : List SemanticOperation)
    (trace : ParentSpineTrace entryId operations next entered path)
    (unique : (operations.map (·.id)).Nodup) : path.Perm operations := by
  revert unique
  induction trace with
  | finish operations next id origin input selected empty =>
    intro unique
    have present : SemanticOperation.reachNoneEnd id origin input ∈ operations.filter
        (fun operation => (SequentialScopeControl.inputs operation).contains next) := by rw [selected]; simp
    have removed := removeId_perm operations (.reachNoneEnd id origin input) unique (List.mem_filter.mp present).1
    change operations.Perm (.reachNoneEnd id origin input :: operations.filter (·.id != id)) at removed
    rw [empty] at removed
    exact removed.symm
  | step operations next output entered nextEntered operation tail selected edge rest ih =>
    intro unique
    have present : operation ∈ operations.filter
        (fun operation => (SequentialScopeControl.inputs operation).contains next) := by rw [selected]; simp
    have residualUnique := unique.sublist ((List.filter_sublist (p := fun other => other.id != operation.id)
      (l := operations)).map (·.id))
    exact ((ih residualUnique).cons operation).trans
      (removeId_perm operations operation unique (List.mem_filter.mp present).1).symm

private theorem cons_to_end_perm (operation : SemanticOperation) (operations : List SemanticOperation) :
    (operation :: operations).Perm (operations ++ [operation]) := by
  induction operations with
  | nil => exact List.Perm.refl _
  | cons head tail ih => exact (List.Perm.swap operation head tail).symm.trans (ih.cons head)

/-- Actual PMIS admission retains the selected root parent population and its executable ordered spine certificate. -/
theorem analyzeProgram_parent_spine (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) :
    ∃ (root : DefinitionScope) (parent : List SemanticOperation) (counts : Nat × Nat)
      (start completion : SemanticOperation) (output : ControlPlaceId) (path : List SemanticOperation),
      program.definitionScopes.filter (·.parentScopeId.isNone) = [root] ∧
      parent = program.operations.filter (fun operation => program.operationScopes.any
        (fun owner => owner.operationId == operation.id && owner.scopeId == root.id)) ∧
      SequentialScopeControl.parentWaits? parent analysis.entry.id = some counts ∧
      parent.filter (fun operation => match operation with | .initiate .. => true | _ => false) = [start] ∧
      parent.filter (fun operation => match operation with | .completeScope .. => true | _ => false) = [completion] ∧
      start = .initiate start.id start.origin output ∧
      ParentSpineTrace analysis.entry.id (parent.filter (fun operation => operation.id != start.id && operation.id != completion.id)) output false path ∧
      (parent.map (·.id.value)).Nodup ∧ (path.map (·.id)).Nodup ∧
      (∀ operation ∈ path, operation ∈ parent) ∧ parent.Perm (start :: path ++ [completion]) ∧
      analysis.parentCount = parent.length := by
  obtain ⟨root, parent, counts, child, completion, origin, body, first, converted, ordered,
    rootEq, parentEq, parentCount, parentWaitEq, _⟩ := analyzeProgram_body_provenance program analysis admitted
  have waitEq := parentWaitEq
  unfold SequentialScopeControl.parentWaits? at waitEq
  split at waitEq <;> try contradiction
  rename_i start startEq
  split at waitEq <;> try contradiction
  rename_i finish finishEq
  split at waitEq <;> try contradiction
  rename_i startId startOrigin output
  split at waitEq <;> try contradiction
  rename_i finishId finishOrigin scopeId
  let finish := SemanticOperation.completeScope finishId finishOrigin scopeId none
  have allowed : (parent.filter (fun operation => operation.id != startId && operation.id != finish.id)).all programOperationAllowed = true := by
    apply List.all_eq_true.mpr
    intro operation member
    have present : operation ∈ program.operations :=
      (List.mem_filter.mp (parentEq ▸ (List.mem_filter.mp member).1)).1
    exact List.all_eq_true.mp (analyzeProgram_incidence_admission program analysis admitted).2.2 operation present
  obtain ⟨path, trace⟩ := parentPath_trace parent.length _ analysis.entry.id output false 0 0 counts allowed waitEq
  have facts := ParentSpineTrace.facts analysis.entry.id _ output false path trace
  have sorted := programWellFormed_operationIdsSorted program (analyzeProgram_incidence_admission program analysis admitted).1
  have unique := (strictlySortedStrings_nodup _ sorted).sublist
    ((List.filter_sublist (p := fun operation => program.operationScopes.any
      (fun owner => owner.operationId == operation.id && owner.scopeId == root.id))
      (l := program.operations)).map (fun operation => operation.id.value))
  have parentUnique : (parent.map (·.id.value)).Nodup := by simpa [parentEq] using unique
  have valuesUnique : ((parent.map (·.id)).map OperationId.value).Nodup := by
    simpa only [List.map_map, Function.comp_def] using parentUnique
  have ids : (parent.map (·.id)).Nodup := List.Pairwise.of_map (S := fun left right : String => left ≠ right)
    OperationId.value (fun _ _ different same => different (congrArg OperationId.value same)) valuesUnique
  let start := SemanticOperation.initiate startId startOrigin output
  have startMember : start ∈ parent := by
    have present : start ∈ parent.filter _ := startEq.symm ▸ (show start ∈ [SemanticOperation.initiate startId startOrigin output] from by simp [start])
    exact (List.mem_filter.mp present).1
  have finishMember : finish ∈ parent := by
    have present : finish ∈ parent.filter _ := finishEq.symm ▸ (show finish ∈ [SemanticOperation.completeScope finishId finishOrigin scopeId none] from by simp [finish])
    exact (List.mem_filter.mp present).1
  have different : finish.id ≠ start.id := by
    intro same
    have census := filter_key_eq_singleton_of_nodup parent (·.id) start ids startMember
    have present : finish ∈ parent.filter (fun operation => decide (operation.id = start.id)) := by simp [finishMember, same]
    rw [census] at present
    have impossible : finish = start := List.mem_singleton.mp present
    simp [finish, start] at impossible
  have residualFinish : finish ∈ parent.filter (·.id != start.id) := by simp [finishMember, different]
  have residualUnique := ids.sublist ((List.filter_sublist (p := fun operation => operation.id != start.id)
    (l := parent)).map (·.id))
  have removedStart := removeId_perm parent start ids startMember
  have removedFinish := removeId_perm _ finish residualUnique residualFinish
  have pathUnique := ids.sublist ((List.filter_sublist (p := fun operation => operation.id != start.id && operation.id != finish.id)
    (l := parent)).map (·.id))
  have pathPerm := trace.permutation analysis.entry.id _ output false path pathUnique
  have residualEq : (parent.filter (·.id != start.id)).filter (·.id != finish.id) =
      parent.filter (fun operation => operation.id != start.id && operation.id != finish.id) := by
    simp [List.filter_filter, Bool.and_comm]
  rw [residualEq] at removedFinish
  have coverage := removedStart.trans ((removedFinish.trans ((pathPerm.symm.cons finish).trans
    (cons_to_end_perm finish path))).cons start)
  refine ⟨root, parent, counts, .initiate startId startOrigin output, finish, output, path,
    rootEq, parentEq, parentWaitEq, startEq, finishEq, rfl, trace, parentUnique, facts.1, ?_, coverage, parentCount⟩
  · intro operation member
    exact (List.mem_filter.mp (facts.2 operation member)).1

/-- Actual admission counts the unique paired retirement declaration once beyond the selected body, using globally unique declaration IDs. -/
theorem analyzeProgram_child_count (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis)
    (child : List SemanticOperation) (completion : SemanticOperation) (body : List SemanticOperation)
    (childEq : child = program.operations.filter (fun operation => program.operationScopes.any
      (fun owner => owner.operationId == operation.id && owner.scopeId == analysis.entry.childScopeId)))
    (completionEq : child.filter (fun operation => match operation with
      | .completeParallelMultiInstanceScope .. => true | _ => false) = [completion])
    (bodyEq : body = child.filter (·.id != completion.id)) : analysis.childCount = body.length + 1 := by
  obtain ⟨root, parent, waits, selectedChild, selectedCompletion, origin, selectedBody, first, converted, ordered,
    _, _, _, _, _, selectedEq, _, _, _, _, _, _, _, counted⟩ := analyzeProgram_body_provenance program analysis admitted
  have same : selectedChild = child := selectedEq.trans childEq.symm
  rw [same] at counted
  have member : completion ∈ child :=
    (List.mem_filter.mp (completionEq.symm ▸ (show completion ∈ [completion] from by simp))).1
  have sorted := programWellFormed_operationIdsSorted program (analyzeProgram_incidence_admission program analysis admitted).1
  have valuesUnique : (child.map (fun operation => operation.id.value)).Nodup := by
    rw [childEq]
    exact (strictlySortedStrings_nodup _ sorted).sublist ((List.filter_sublist (p := fun operation =>
      program.operationScopes.any (fun owner => owner.operationId == operation.id && owner.scopeId == analysis.entry.childScopeId))
      (l := program.operations)).map (fun operation => operation.id.value))
  have mappedUnique : ((child.map (·.id)).map OperationId.value).Nodup := by
    simpa only [List.map_map, Function.comp_def] using valuesUnique
  have unique : (child.map (·.id)).Nodup := List.Pairwise.of_map (S := fun left right : String => left ≠ right)
    OperationId.value (fun _ _ different same => different (congrArg OperationId.value same)) mappedUnique
  have length := (removeId_perm child completion unique member).length_eq
  simp only [List.length_cons] at length
  rw [bodyEq]
  omega

/-- Successful actual Program Start admission retains its exact collection and derives the numeric closure bound and fixed ceiling. -/
theorem programStartCapacity_bound_certificate (program : Program) (bindings : List VariableBinding)
    (capacity : ProgramCapacity) (accepted : programStartCapacity program bindings = some capacity) :
    ∃ analysis binding items,
      analyzeProgram program = some analysis ∧
      SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName analysis.entry.completionBooleanName
        analysis.handlers analysis.required bindings = true ∧
      bindings.filter (·.name == analysis.entry.collectionName) = [binding] ∧
      binding.value = VariableValue.stringList items ∧
      capacity.closureBound = analysis.parentCount + items.length * analysis.childCount ∧
      items.length ≤ 16 ∧ capacity.closureBound ≤ 16400 := by
  unfold programStartCapacity at accepted
  obtain ⟨analysis, analyzed, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  split at accepted <;> try contradiction
  rename_i dataAdmitted
  split at accepted <;> try contradiction
  rename_i binding selected
  split at accepted <;> try contradiction
  rename_i items valueEq
  obtain ⟨frontier, frontierEq, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨bound, boundEq, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  cases Option.some.inj accepted
  have ceiling := boundedClosureBound_within_ceiling analysis.parentCount analysis.childCount items.length bound boundEq
  unfold boundedClosureBound at boundEq
  split at boundEq <;> try contradiction
  rename_i limits
  cases Option.some.inj boundEq
  refine ⟨analysis, binding, items, analyzed, ?_, selected, valueEq, rfl, limits.2, ceiling⟩
  cases valid : SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName analysis.entry.completionBooleanName
      analysis.handlers analysis.required bindings <;> simp_all

/-- Successful actual resumption capacity is the unchanged capacity of its captured Process collection. -/
theorem programStateCapacity_retains_start_capacity (program : Program) (state : RuntimeState)
    (capacity : ProgramCapacity) (accepted : programStateCapacity program state = some capacity) :
    programStartCapacity program state.variables.process.bindings = some capacity := by
  unfold programStateCapacity at accepted
  split at accepted <;> try contradiction
  simp only [pure, bind, Option.bind_some] at accepted
  obtain ⟨analysis, _, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨retained, startCapacity, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  repeat' (first | (split at accepted <;> try contradiction) | dsimp only at accepted)
  all_goals first
    | contradiction
    | (cases Option.some.inj accepted; exact startCapacity)
    | (obtain ⟨binding, _, accepted⟩ := Option.bind_eq_some_iff.mp accepted
       repeat' (first | (split at accepted <;> try contradiction) | dsimp only at accepted)
       all_goals first | contradiction | (cases Option.some.inj accepted; exact startCapacity))

/-- Every actual selected PMIS command-bound selector success lies beneath the same fixed ceiling. -/
theorem commandClosureLimit_within_ceiling (program : Program) (state : RuntimeState)
    (stimulus : Stimulus) (bound : Nat) (selected : programSelected program = true)
    (accepted : commandClosureLimit? program state stimulus = some bound) : bound ≤ 16400 := by
  unfold commandClosureLimit? at accepted
  simp only [selected, Bool.not_true, Bool.false_eq_true, ↓reduceIte] at accepted
  split at accepted <;> try contradiction
  cases control : state.control <;> cases stimulus <;> simp only [control] at accepted
  all_goals
    obtain ⟨capacity, capacityEq, boundEq⟩ := Option.map_eq_some_iff.mp accepted
    have startCapacity : ∃ bindings, programStartCapacity program bindings = some capacity := by
      first
        | exact ⟨_, capacityEq⟩
        | exact ⟨state.variables.process.bindings, programStateCapacity_retains_start_capacity program state capacity capacityEq⟩
    obtain ⟨bindings, startCapacity⟩ := startCapacity
    obtain ⟨analysis, binding, items, _, _, _, _, _, _, ceiling⟩ := programStartCapacity_bound_certificate program bindings capacity startCapacity
    simpa only [boundEq] using ceiling

/-- Successful resumption capacity covers every live body by one validated binding, rather than just the first iteration queried by admission. -/
theorem programStateCapacity_live_body_binding (program : Program) (analysis : ProgramAnalysis)
    (state : RuntimeState) (capacity : ProgramCapacity)
    (analyzed : analyzeProgram program = some analysis)
    (accepted : programStateCapacity program state = some capacity)
    (body : RuntimeScopeOccurrence) (present : body ∈ state.scopeOccurrences)
    (child : body.id.definitionScopeId = analysis.entry.childScopeId) :
    ∃ binding, parallelScopeBinding? analysis.entry state body.id = some binding := by
  unfold programStateCapacity at accepted
  split at accepted <;> try contradiction
  simp only [pure, bind, Option.bind_some, analyzed] at accepted
  obtain ⟨initialCapacity, _, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  split at accepted <;> try contradiction
  split at accepted <;> try contradiction
  split at accepted <;> try contradiction
  try dsimp only at accepted
  split at accepted
  · split at accepted <;> try contradiction
    rename_i empty
    have live : body ∈ state.scopeOccurrences.filter (·.id.definitionScopeId == analysis.entry.childScopeId) :=
      List.mem_filter.mpr ⟨present, by simp [child]⟩
    have nonempty : (state.scopeOccurrences.filter (·.id.definitionScopeId == analysis.entry.childScopeId)).isEmpty = false :=
      List.isEmpty_eq_false_iff_exists_mem.mpr ⟨body, live⟩
    simp [nonempty] at empty
  · split at accepted <;> try contradiction
    obtain ⟨binding, bound, accepted⟩ := Option.bind_eq_some_iff.mp accepted
    split at accepted <;> try contradiction
    split at accepted <;> try contradiction
    rename_i valid
    have count : (state.scopeOccurrences.filter (·.id.definitionScopeId == analysis.entry.childScopeId)).length =
        binding.iterations.length := by
      apply Classical.byContradiction
      intro different
      simp [different] at valid
    obtain ⟨iteration, member, identity⟩ := parallelScopeBinding_covers_bodies analysis.entry state _ binding
      bound count body present child
    refine ⟨binding, ?_⟩
    rw [← identity]
    exact parallelScopeBinding_retarget analysis.entry state _ binding bound iteration member
  · contradiction

end BpmnSemantics.SemanticProcess.ParallelScopeStart
