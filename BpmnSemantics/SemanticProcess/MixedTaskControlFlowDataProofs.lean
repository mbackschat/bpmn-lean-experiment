module

public import BpmnSemantics.SemanticProcess.MixedTaskControlFlowAnalysisProjectionProofs
public import BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmissionLaws
public import BpmnSemantics.SemanticProcess.SerialBusinessTaskLifecycleProofs
public import BpmnSemantics.SemanticProcess.StructuredCompositionAdmissionProofs
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime

/-! MTCF-DATA-01 carries future writer-free read obligations through admitted graph edges and actual binding merges, avoiding a fixed topology or a caller-supplied successful input evaluation. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.MixedTaskControlFlow

/-- MTCF-DATA-01 tracks all reads before the next guaranteed writer, including paths through loops. -/
def InputsAvailable (vertices : List Vertex) (frontier : String)
    (bindings : List VariableBinding) : Prop :=
  ∀ reader ∈ vertices, ∀ name ∈ reader.reads,
    GraphReaches (writerBarrierEdges vertices name) frontier reader.id →
      SerialBusinessTask.BindingPresent bindings name

/-- The independently computed Start requirements establish every future writer-free read obligation. -/
theorem admitted_start_inputs_available (program : Program) (analysis : Analysis)
    (bindings : List VariableBinding) (analyzed : programAnalysis program = some analysis)
    (admitted : startBindingsAdmitted program bindings = true) :
    SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) bindings = true ∧
      InputsAvailable analysis.vertices analysis.startId bindings := by
  have admitted' : SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) bindings = true ∧
      analysis.required.all (fun name => bindings.any (·.name == name)) = true := by
    simpa [startBindingsAdmitted, analyzed] using admitted
  refine ⟨admitted'.1, ?_⟩
  intro reader member name reads path
  have required := required_of_writer_free_path analysis.vertices analysis
    (program_analysis_graph program analysis analyzed) reader name member reads path
  obtain ⟨binding, included, same⟩ := List.any_eq_true.mp
    (List.all_eq_true.mp admitted'.2 name required)
  exact ⟨binding, included, by simpa using same⟩

/-- Public committed Start establishes availability rather than accepting it as a premise. -/
theorem committed_start_inputs_available (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) bindings = true ∧
      InputsAvailable analysis.vertices analysis.startId bindings := by
  rcases profile with profile | profile
  all_goals
    apply admitted_start_inputs_available program analysis bindings analyzed
    obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
    cases admitted : startBindingsAdmitted program bindings with
    | true => rfl
    | false => simp [admitStimulus, snapshots, initialState, profile, admitted] at committed

/-- Missing required data refuses the actual command and preserves the complete initial state. -/
theorem missing_required_start_refused (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding) (name : String)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (analyzed : programAnalysis program = some analysis) (required : name ∈ analysis.required)
    (missing : ¬ SerialBusinessTask.BindingPresent bindings name) :
    admitStimulus program initialState (.startProcess commandId processId instanceId bindings) =
      { outcome := .rejected, state := initialState } := by
  rcases profile with profile | profile
  all_goals
    have refused : startBindingsAdmitted program bindings = false := by
      cases admitted : startBindingsAdmitted program bindings with
      | false => rfl
      | true =>
        have data : SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) bindings = true ∧
            analysis.required.all (fun key => bindings.any (·.name == key)) = true := by
          simpa [startBindingsAdmitted, analyzed] using admitted
        obtain ⟨binding, member, named⟩ := List.any_eq_true.mp
          (List.all_eq_true.mp data.2 name required)
        exact False.elim (missing ⟨binding, member, by simpa using named⟩)
    obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
    simp [admitStimulus, snapshots, initialState, profile, refused]

private theorem prepend_edge {α : Type} (edges : List (GraphEdge α)) (source middle target : α)
    (edge : { source, target := middle } ∈ edges) (path : GraphReaches edges middle target) :
    GraphReaches edges source target := by
  induction path with
  | refl => exact .step (.refl source) edge
  | step _ next ih => exact .step ih next

theorem writer_barrier_edge (vertices : List Vertex) (vertex : Vertex) (name target : String)
    (member : vertex ∈ vertices) (output : target ∈ vertex.outputs)
    (notWriter : ¬ (vertex.kind = .service ∧ name ∈ vertex.writes)) :
    { source := vertex.id, target } ∈ writerBarrierEdges vertices name := by
  simp only [writerBarrierEdges, edges, List.mem_flatMap, List.mem_filter, List.mem_map]
  refine ⟨vertex, ⟨member, ?_⟩, target, output, rfl⟩
  by_cases service : vertex.kind = .service
  · have absent : name ∉ vertex.writes := fun written => notWriter ⟨service, written⟩
    simp [service, absent]
  · simp [service]

/-- Reflexivity includes a writer's own input before its output can establish that name. -/
theorem available_current_read (vertices : List Vertex) (vertex : Vertex)
    (bindings : List VariableBinding) (member : vertex ∈ vertices)
    (available : InputsAvailable vertices vertex.id bindings) (name : String)
    (reads : name ∈ vertex.reads) : SerialBusinessTask.BindingPresent bindings name :=
  available vertex member name reads (.refl vertex.id)

theorem available_binding_frame (vertices : List Vertex) (frontier : String)
    (before after : List VariableBinding) (available : InputsAvailable vertices frontier before)
    (preserved : ∀ name, SerialBusinessTask.BindingPresent before name →
      SerialBusinessTask.BindingPresent after name) : InputsAvailable vertices frontier after := by
  intro reader member name reads path
  exact preserved name (available reader member name reads path)

/-- An internal edge cannot discharge data obligations; every branch inherits them unchanged. -/
theorem nonwriter_edge_preserves_available (vertices : List Vertex) (vertex : Vertex)
    (target : String) (bindings : List VariableBinding) (member : vertex ∈ vertices)
    (output : target ∈ vertex.outputs) (notService : vertex.kind ≠ .service)
    (available : InputsAvailable vertices vertex.id bindings) :
    InputsAvailable vertices target bindings := by
  intro reader included name reads path
  exact available reader included name reads
    (prepend_edge _ vertex.id target reader.id
      (writer_barrier_edge vertices vertex name target member output (fun h => notService h.1)) path)

/-- An empty Human Task patch must preserve the same obligations as any supplied patch. -/
theorem human_patch_preserves_available (vertices : List Vertex) (vertex : Vertex)
    (target : String) (before patch : List VariableBinding) (member : vertex ∈ vertices)
    (output : target ∈ vertex.outputs) (human : vertex.kind = .human)
    (available : InputsAvailable vertices vertex.id before) :
    InputsAvailable vertices target (mergeProcessVariableBindings before patch) := by
  apply available_binding_frame vertices target before _
    (nonwriter_edge_preserves_available vertices vertex target before member output (by simp [human]) available)
  exact SerialBusinessTask.merge_preserves_binding_presence before patch

/-- MTCF-DATA-01 and MBERR-DATA-01 require the same barrier writes on every declared continuation. -/
theorem service_patch_preserves_available (vertices : List Vertex) (vertex : Vertex)
    (target : String) (handlers : List String) (outputs : List VariableMapping)
    (before patch after : List VariableBinding) (member : vertex ∈ vertices)
    (output : target ∈ vertex.outputs) (writes : vertex.writes = outputs.map (·.target))
    (available : InputsAvailable vertices vertex.id before)
    (completed : serialEffectPatch? handlers outputs before patch = some after) :
    InputsAvailable vertices target after := by
  intro reader included name reads path
  by_cases written : name ∈ vertex.writes
  · rw [writes] at written
    obtain ⟨mapping, declared, named⟩ := List.mem_map.mp written
    exact named ▸ SerialBusinessTask.completed_patch_supplies_target handlers outputs before patch after
      mapping declared completed
  · apply SerialBusinessTask.completed_patch_preserves_presence handlers outputs before patch after name _ completed
    exact available reader included name reads
      (prepend_edge _ vertex.id target reader.id
        (writer_barrier_edge vertices vertex name target member output (fun h => written h.2)) path)

/-- Exact local results establish the successor data; MBERR-DATA-01 does not assume successful mapping or available successor inputs. -/
theorem valid_service_patch_establishes_continuation_data
    (vertices : List Vertex) (vertex : Vertex) (target : String)
    (handlers sources : List String) (inputs outputs : List VariableMapping)
    (before patch : List VariableBinding) (member : vertex ∈ vertices)
    (output : target ∈ vertex.outputs) (writes : vertex.writes = outputs.map (·.target))
    (available : InputsAvailable vertices vertex.id before)
    (canonical : SerialBusinessTask.bindingsValid handlers before = true)
    (mappings : SerialBusinessTask.mappingsValid handlers inputs outputs = true)
    (collected : outputs.mapM (fun mapping => match mapping.expression with
      | .localVariable name => some name | _ => none) = some sources)
    (valid : SerialBusinessTask.bindingsValid handlers patch = true)
    (count : sources.eraseDups.length = patch.length)
    (covered : sources.all (fun name => patch.any (·.name == name)) = true) :
    ∃ after, serialEffectPatch? handlers outputs before patch = some after ∧
      InputsAvailable vertices target after ∧ SerialBusinessTask.bindingsValid handlers after = true := by
  obtain ⟨after, completed⟩ := SerialBusinessTask.serial_patch_exists
    handlers outputs before patch sources collected valid count covered
  refine ⟨after, completed, service_patch_preserves_available vertices vertex target handlers outputs
    before patch after member output writes available completed, ?_⟩
  exact SerialBusinessTask.serial_patch_preserves_domain handlers inputs outputs before patch after
    (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp canonical).1)
    (strictlySortedStrings_nodup _
      (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappings).1).1).2)
    canonical mappings completed

/-- Canonical available Process data makes actual immutable input evaluation total. -/
theorem available_inputs_evaluable (vertices : List Vertex) (vertex : Vertex)
    (handlers : List String) (bindings : List VariableBinding) (inputs outputs : List VariableMapping)
    (member : vertex ∈ vertices) (reads : vertex.reads = SerialBusinessTask.readNames inputs)
    (available : InputsAvailable vertices vertex.id bindings)
    (canonical : SerialBusinessTask.bindingsValid handlers bindings = true)
    (mappings : SerialBusinessTask.mappingsValid handlers inputs outputs = true) :
    ∃ arguments, evaluateEnclosingInputMappings bindings inputs = some arguments := by
  apply SerialBusinessTask.inputs_evaluable handlers bindings inputs
    (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappings).1).1).1)
    (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappings).1).2
  intro name read
  apply SerialBusinessTask.canonical_present_binding_evaluable handlers bindings name canonical
  exact available_current_read vertices vertex bindings member available name (by simpa [reads] using read)

/-- MBERR-DATA-01 attaches the same mapping facts to either continuation without assuming a normal-only Service declaration. -/
theorem service_projection_data (program : Program) (vertex : Vertex)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (projected : operationVertex? program (.awaitEffect id origin input output effect route) = some vertex) :
    vertex.kind = .service ∧
      SerialBusinessTask.mappingsValid (SerialBusinessTask.programHandlers program)
        effect.inputMappings effect.outputMappings = true ∧
      vertex.reads = SerialBusinessTask.readNames effect.inputMappings ∧
      vertex.writes = effect.outputMappings.map (·.target) := by
  cases route <;> simp_all [operationVertex?, Option.bind_eq_some_iff] <;> grind

theorem current_service_inputs_evaluable (program : Program) (state : RuntimeState)
    (vertices : List Vertex) (vertex : Vertex) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) {route : Option BpmnErrorRoute}
    (member : vertex ∈ vertices)
    (projected : operationVertex? program (.awaitEffect id origin input output effect route) = some vertex)
    (available : InputsAvailable vertices vertex.id state.variables.process.bindings)
    (canonical : SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program)
      state.variables.process.bindings = true) :
    ∃ arguments, evaluateEnclosingInputMappings state.variables.process.bindings effect.inputMappings = some arguments := by
  obtain ⟨_, mappings, reads, _⟩ := service_projection_data program vertex id origin input output effect route projected
  exact available_inputs_evaluable vertices vertex (SerialBusinessTask.programHandlers program)
    state.variables.process.bindings effect.inputMappings effect.outputMappings member reads available canonical mappings

def OperationAllowed : SemanticOperation → Prop
  | .initiate .. | .awaitUserTask .. | .awaitEffect ..
  | .choose .. | .mergeExclusive .. | .reachNoneEnd .. | .completeScope _ _ _ none => True
  | _ => False

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

theorem operation_has_vertex (program : Program) (analysis : Analysis) (operation : SemanticOperation)
    (analyzed : programAnalysis program = some analysis) (member : operation ∈ program.operations)
    (notCompletion : StructuredComposition.isScopeCompletion operation = false) :
    ∃ vertex ∈ analysis.vertices, operationVertex? program operation = some vertex := by
  obtain ⟨vertices, mapped, accepted⟩ := program_analysis_projection program analysis analyzed
  rw [(analyze_facts vertices analysis accepted).vertices_eq]
  exact mapM_member_some _ _ _ mapped operation (by simp [member, notCompletion])

theorem vertex_has_operation (program : Program) (analysis : Analysis) (vertex : Vertex)
    (analyzed : programAnalysis program = some analysis) (member : vertex ∈ analysis.vertices) :
    ∃ operation ∈ program.operations, operationVertex? program operation = some vertex := by
  obtain ⟨vertices, mapped, accepted⟩ := program_analysis_projection program analysis analyzed
  rw [(analyze_facts vertices analysis accepted).vertices_eq] at member
  obtain ⟨operation, included, projected⟩ := mapM_result_member _ _ _ mapped vertex member
  exact ⟨operation, (List.mem_filter.mp included).1, projected⟩

theorem operation_projection_identity (program : Program) (operation : SemanticOperation)
    (vertex : Vertex) (projected : operationVertex? program operation = some vertex) :
    vertex.id = operation.id.value := by
  cases operation <;> simp_all [operationVertex?, Option.bind_eq_some_iff]
  all_goals try grind
  all_goals split at projected <;> simp_all [Option.bind_eq_some_iff] <;> grind

private theorem projected_operation_allowed (program : Program) (operation : SemanticOperation)
    (vertex : Vertex) (projected : operationVertex? program operation = some vertex) :
    OperationAllowed operation := by
  cases operation <;> simp_all [OperationAllowed, operationVertex?]

theorem program_analysis_completion (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    ∃ id origin scope, program.operations.filter StructuredComposition.isScopeCompletion =
      [.completeScope id origin scope none] := by
  unfold programAnalysis at analyzed
  obtain ⟨root, _, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
  split at analyzed
  · contradiction
  · obtain ⟨completion, selected, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
    cases completion <;> try simp only at analyzed
    all_goals try contradiction
    case completeScope id origin scope output =>
      cases output with
      | some output => contradiction
      | none => exact ⟨id, origin, scope, SerialBusinessTask.unique_some selected⟩

theorem program_analysis_operations_allowed (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    ∀ operation ∈ program.operations, OperationAllowed operation := by
  intro operation member
  cases completes : StructuredComposition.isScopeCompletion operation with
  | true =>
    obtain ⟨id, origin, scope, completion⟩ := program_analysis_completion program analysis analyzed
    have included : operation ∈ program.operations.filter StructuredComposition.isScopeCompletion :=
      List.mem_filter.mpr ⟨member, completes⟩
    rw [completion] at included
    rw [List.mem_singleton.mp included]
    trivial
  | false =>
    obtain ⟨vertex, _, projected⟩ := operation_has_vertex program analysis operation analyzed member completes
    exact projected_operation_allowed program operation vertex projected

/-- Both mixed-task profiles are scalar profiles: only the structured effect-data identity widens effect mapping. -/
theorem mixedProfile_effectMapping_scalar (program : Program)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId) :
    programEffectMappingValuePolicy program = .scalar := by
  rcases profile with same | same
  · exact programEffectMappingValuePolicy_eq_scalar_of_profile same (by decide +kernel)
  · exact programEffectMappingValuePolicy_eq_scalar_of_profile same (by decide +kernel)

theorem program_analysis_effect_inputs (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) (scalar : programEffectMappingValuePolicy program = .scalar)
    (state : RuntimeState) (owner : ScopeOccurrenceId) (mappings : List VariableMapping) :
    evaluateEffectInputs? program state owner mappings = evaluateEnclosingInputMappings state.variables.process.bindings mappings := by
  apply evaluateEffectInputs_without_repeated_scope _ _ _ _ scalar
  intro operation member
  have allowed := program_analysis_operations_allowed program analysis analyzed operation member
  cases operation <;> simp_all [OperationAllowed, sequentialScopeEntry?]

theorem output_has_vertex (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (vertex : Vertex) (member : vertex ∈ vertices)
    (target : String) (edge : target ∈ vertex.outputs) : ∃ next ∈ vertices, next.id = target := by
  have arities := (analyze_facts vertices analysis accepted).structural.2
  simp only [aritiesValid, List.all_eq_true] at arities
  have existsTarget := List.all_eq_true.mp (Bool.and_eq_true_iff.mp (arities vertex member)).1 target edge
  simpa only [List.any_eq_true, beq_iff_eq] using existsTarget

private theorem projection_maps_outputs (program : Program) (operation : SemanticOperation)
    (vertex : Vertex) (projected : operationVertex? program operation = some vertex) :
    (operationOutputs operation).mapM (consumer? program) = some vertex.outputs := by
  cases operation <;> simp_all [operationVertex?, operationOutputs, Option.bind_eq_some_iff]
  all_goals try grind
  all_goals split at projected <;> simp_all [Option.bind_eq_some_iff] <;> grind

theorem operation_output_consumer (program : Program) (operation : SemanticOperation)
    (vertex : Vertex) (place : ControlPlaceId)
    (projected : operationVertex? program operation = some vertex)
    (outputMember : place ∈ operationOutputs operation) :
    ∃ target ∈ vertex.outputs, consumer? program place = some target :=
  mapM_member_some _ _ _ (projection_maps_outputs program operation vertex projected) place outputMember

private theorem analyzed_vertex_ids_unique (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) : (vertices.map (·.id)).Nodup := by
  have valid := (analyze_facts vertices analysis accepted).structural.1
  simp only [uniqueNames, Bool.and_eq_true, beq_iff_eq] at valid
  exact StructuredComposition.equal_deduplicated_length_has_unique_names _ valid.2

theorem token_consumer_projects_current_vertex (program : Program) (analysis : Analysis)
    (operation : SemanticOperation) (vertex : Vertex) (place : ControlPlaceId)
    (analyzed : programAnalysis program = some analysis) (opMember : operation ∈ program.operations)
    (vertexMember : vertex ∈ analysis.vertices) (inputMember : place ∈ operationInputs operation)
    (consumer : consumer? program place = some vertex.id) :
    operationVertex? program operation = some vertex := by
  have notCompletion : StructuredComposition.isScopeCompletion operation = false := by
    cases operation <;> simp_all [StructuredComposition.isScopeCompletion, operationInputs]
  obtain ⟨projected, projectedMember, projection⟩ :=
    operation_has_vertex program analysis operation analyzed opMember notCompletion
  have named : operation.id.value = vertex.id := by
    simp only [consumer?, Option.bind_eq_bind, Option.bind_eq_some_iff] at consumer
    obtain ⟨selected, unique, named⟩ := consumer
    have exactFilter := SerialBusinessTask.unique_some unique
    have member : operation ∈ program.operations.filter (fun op => (operationInputs op).contains place) :=
      List.mem_filter.mpr ⟨opMember, by simpa using inputMember⟩
    rw [exactFilter] at member
    simpa [List.mem_singleton.mp member] using Option.some.inj named
  have identity := operation_projection_identity program operation projected projection
  have unique := analyzed_vertex_ids_unique analysis.vertices analysis (program_analysis_graph program analysis analyzed)
  have singleton := filter_key_eq_singleton_of_nodup analysis.vertices (·.id) vertex unique vertexMember
  have included : projected ∈ analysis.vertices.filter (fun v => decide (v.id = vertex.id)) :=
    List.mem_filter.mpr ⟨projectedMember, by simp [identity, named]⟩
  rw [singleton] at included
  simpa [List.mem_singleton.mp included] using projection

theorem program_places_unique_origins (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    (program.controlPlaces.map (·.origin.elementId.value)).Nodup := by
  unfold programAnalysis at analyzed
  obtain ⟨root, _, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
  split at analyzed
  · contradiction
  · obtain ⟨completion, selected, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
    clear selected
    cases completion <;> try simp only at analyzed
    all_goals try contradiction
    case completeScope id origin scope output =>
      cases output with
      | some output => contradiction
      | none =>
        dsimp only at analyzed
        split at analyzed
        · contradiction
        · obtain ⟨origins, _, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
          split at analyzed
          · contradiction
          · rename_i unique
            let names := program.processId.value :: origins.map (·.elementId.value) ++
              program.controlPlaces.map (·.origin.elementId.value) ++
              (programRoutes program).flatMap (fun route =>
                [route.origin.boundaryEventId.value, route.origin.errorDefinitionId.value]) ++
              ((programRoutes program).map (·.origin.errorElementId.value)).eraseDups
            have valid : uniqueNames names = true := by simpa [names] using unique
            have distinct := StructuredComposition.equal_deduplicated_length_has_unique_names names
              (by simpa only [beq_iff_eq] using (Bool.and_eq_true_iff.mp valid).2)
            simp only [names, List.nodup_cons, List.nodup_append] at distinct
            grind

theorem admitted_serial_guard_has_no_foreign_effects (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (guarded : serialBusinessCommandAdmitted program before stimulus = true) :
    before.effectIncidents = [] ∧ before.compensationHandlerEffectWaits = [] := by
  rcases profile with profile | profile
  all_goals
    unfold serialBusinessCommandAdmitted at guarded
    simp only [profile, bne_self_eq_false, Bool.and_false, Bool.false_and, Bool.false_eq_true, ↓reduceIte, Bool.and_eq_true] at guarded
    have joined := guarded.1.1.2
    dsimp only [serialRuntimeAssociationsValid] at joined
    simp only [Bool.and_eq_true] at joined
    exact ⟨List.isEmpty_iff.mp joined.1.1.1.1.1.1.1.1.1.1.2,
      List.isEmpty_iff.mp joined.1.1.1.1.2⟩

theorem guarded_program_admission (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (guarded : serialBusinessCommandAdmitted program state stimulus = true) : programWellFormed program = true ∧ programProfileCapabilitiesValid program = true := by
  rcases profile with profile | profile
  all_goals
    unfold serialBusinessCommandAdmitted at guarded
    simp only [profile, bne_self_eq_false, Bool.and_false, Bool.false_and, Bool.false_eq_true, ↓reduceIte, Bool.and_eq_true] at guarded
    exact guarded.1.1.1.1

theorem guarded_start_instance_nonempty (program : Program) (state : RuntimeState)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (guarded : serialBusinessCommandAdmitted program state
      (.startProcess commandId processId instanceId bindings) = true) : instanceId.value ≠ "" := by
  rcases profile with profile | profile
  all_goals
    unfold serialBusinessCommandAdmitted at guarded
    simp only [profile, bne_self_eq_false, Bool.and_false, Bool.false_and, Bool.false_eq_true, ↓reduceIte, Bool.and_eq_true] at guarded
    have nonempty : instanceId.value.isEmpty = false := by simpa using guarded.2
    intro empty
    simp [empty] at nonempty


private theorem allowed_filterMap_absent (program : Program) (project : SemanticOperation → Option α)
    (allowed : ∀ operation ∈ program.operations, OperationAllowed operation)
    (excluded : ∀ operation, OperationAllowed operation → project operation = none) :
    program.operations.filterMap project = [] := by
  apply List.filterMap_eq_nil_iff.mpr
  intro operation member
  exact excluded operation (allowed operation member)

private theorem allowed_filter_absent (program : Program) (select : SemanticOperation → Bool)
    (allowed : ∀ operation ∈ program.operations, OperationAllowed operation)
    (excluded : ∀ operation, OperationAllowed operation → select operation = false) :
    program.operations.filter select = [] := by
  apply List.filter_eq_nil_iff.mpr
  intro operation member
  simp [excluded operation (allowed operation member)]

theorem completion_foreign_families_absent (program : Program) (analysis : Analysis)
    (taskId : TaskDefinitionId) (analyzed : programAnalysis program = some analysis) :
    parallelMultiInstanceEntryForTask? program taskId = none ∧
      sequentialMultiInstanceOperationForTask? program taskId = none ∧
      isMessageMonitoredTaskDefinition program taskId = false ∧
      isMessageBoundedTaskDefinition program taskId = false ∧
      isBoundedTaskDefinition program taskId = false ∧
      dataInputTaskOperations program = [] ∧ dataOutputTaskOperations program = [] ∧
      isMonitoredTaskDefinition program taskId = false ∧
      isDataInputOutputTaskDefinition program taskId = false := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
  · unfold parallelMultiInstanceEntryForTask?
    rw [allowed_filter_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp only [OperationAllowed] at selected <;> first | contradiction | rfl)]
  · unfold sequentialMultiInstanceOperationForTask?
    rw [allowed_filter_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp only [OperationAllowed] at selected <;> first | contradiction | rfl)]
  · unfold isMessageMonitoredTaskDefinition messageMonitoredTaskDefinitions
    rw [allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp only [OperationAllowed] at selected <;> first | contradiction | rfl)]
    rfl
  · unfold isMessageBoundedTaskDefinition messageBoundedTaskOperations
    rw [allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp only [OperationAllowed] at selected <;> first | contradiction | rfl)]
    rfl
  · unfold isBoundedTaskDefinition boundedTaskOperations
    rw [allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp only [OperationAllowed] at selected <;> first | contradiction | rfl)]
    rfl
  · exact allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp only [OperationAllowed] at selected <;> first | contradiction | rfl)
  · exact allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp only [OperationAllowed] at selected <;> first | contradiction | rfl)
  · unfold isMonitoredTaskDefinition monitoredTaskOperations
    rw [allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp only [OperationAllowed] at selected <;> first | contradiction | rfl)]
    rfl
  · unfold isDataInputOutputTaskDefinition dataInputOutputTaskContracts
    rw [allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp only [OperationAllowed] at selected <;> first | contradiction | rfl)]
    rfl

/-- The existing User Task dispatcher either refuses exactly or commits its actual raw completion and canonical Process merge. -/
theorem human_dispatch_cases (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (analyzed : programAnalysis program = some analysis) :
    let result := dispatchStimulus program before (.completeUserTaskInstance commandId taskId bindings)
    (result = { outcome := .rejected, state := before } ∧
      (before.control ≠ .running taskId.processInstanceId ∨ SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) bindings ≠ true ∨
        completeUserTask before taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation = none)) ∨
      ∃ after, SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) bindings = true ∧
      completeUserTask before taskId.processInstanceId ⟨taskId.elementId.value⟩
        taskId.activation = some after ∧
      result = { outcome := .committed, state :=
        { after with variables := { after.variables with process :=
          { bindings := mergeProcessVariableBindings after.variables.process.bindings bindings } } } } := by
  have noRepeated owner : hasSequentialScopeDefinition program owner = false := by
    simp only [hasSequentialScopeDefinition, List.any_eq_false, List.mem_filterMap]
    rintro entry ⟨operation, member, projected⟩; have allowed := program_analysis_operations_allowed program analysis analyzed operation member
    cases operation <;> simp_all [OperationAllowed, sequentialScopeEntry?]
  rcases profile with profile | profile
  all_goals
    dsimp only
    obtain ⟨noRetention, noSnapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
    obtain ⟨noParallel, noSequential, noMessageMonitored, noMessageBounded, noBounded,
      noInput, noOutput, noMonitored, noComposed⟩ := completion_foreign_families_absent program analysis
        ⟨taskId.elementId.value⟩ analyzed
    have ordinary : isCallActivityProgram program = false := by
      simp [isCallActivityProgram, profile, mixedTaskControlFlowProfileId, mixedTaskBusinessErrorProfileId]
    have noParallelScope : ParallelScopeStart.programSelected program = false := by
      apply ParallelScopeStart.programSelected_of_other_profile
      simp [profile, mixedTaskControlFlowProfileId, mixedTaskBusinessErrorProfileId]
    have notNested : nestedScopeDataProgram program = false :=
      nestedScopeDataProgram_of_profile_value (by rw [profile])
    have legacy : completeOrdinaryUserTaskWithCompensation? completeUserTask program before taskId =
        completeUserTask before taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation := by
      simp [completeOrdinaryUserTaskWithCompensation?, compensationTargetDeclaredForFamily, noRetention]
    have typed : SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) bindings = true →
        processDataBindingsAdmitted program.identity.semanticProfile .userTaskCompletion bindings = true := by
      intro valid
      apply List.all_eq_true.mpr
      intro binding member
      have scalarValue := (Bool.and_eq_true_iff.mp (List.all_eq_true.mp (Bool.and_eq_true_iff.mp valid).2 binding member)).2
      cases valueEq : binding.value <;> simp [valueEq, SerialBusinessTask.scalar] at scalarValue
      all_goals rw [profile]; rfl
    cases control : before.control <;>
      simp only [dispatchStimulus, noSnapshots] <;>
      simp [control, noParallelScope, noRepeated, noParallel, noSequential, noMessageMonitored, noMessageBounded,
        noBounded, noInput, noOutput, noMonitored, noComposed, ordinary, notNested, legacy]
    case running instanceId =>
      cases completed : completeUserTask before taskId.processInstanceId
          ⟨taskId.elementId.value⟩ taskId.activation with
      | none => simp
      | some after =>
          simp only
          split
          · rename_i accepted
            have patchValid : SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) bindings = true := by
              simpa [profile] using accepted.1.1.2
            exact Or.inr ⟨patchValid, after, rfl, rfl⟩
          · rename_i rejected
            refine Or.inl ⟨rfl, ?_⟩
            by_cases identity : taskId.processInstanceId = instanceId
            · by_cases valid : SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) bindings = true
              · rw [typed valid] at rejected
                simp [profile, identity, valid, structuredCompositionOrdinaryCompletionAdmitted,
                  mixedTaskControlFlowProfileId, mixedTaskBusinessErrorProfileId, structuredCompositionCheckpointProfileId] at rejected
              · exact Or.inr (Or.inl (by simpa using valid))
            · exact Or.inl (Ne.symm identity)


theorem serial_completion_admission_eq_dispatch (program : Program) (analysis : Analysis)
    (before : RuntimeState) (stimulus : Stimulus)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (analyzed : programAnalysis program = some analysis) (foreign : SerialBusinessTask.ForeignRuntimeEmpty before)
    (storage : committedStateCollectionAdmitted before = true)
    (guarded : serialBusinessCommandAdmitted program before stimulus = true)
    (completion : SerialBusinessTask.IsSerialCompletion stimulus) :
    admitStimulus program before stimulus = dispatchStimulus program before stimulus := by
  rcases profile with profile | profile
  all_goals
    obtain ⟨_, snapshots, _, messages⟩ := program_analysis_declarations_absent program analysis analyzed
    have dataValid : callDataRuntimeStateValid program before = true := by
      simp [callDataRuntimeStateValid, profile, mixedTaskControlFlowProfileId, mixedTaskBusinessErrorProfileId, callDataCheckpointProfileId]
    have messageValid : interruptingMessageEventSubProcessStateValid program before = true := by
      simp_all [interruptingMessageEventSubProcessStateValid, SerialBusinessTask.ForeignRuntimeEmpty,
        mixedTaskControlFlowProfileId, mixedTaskBusinessErrorProfileId, interruptingMessageEventSubProcessProfileId]
    have incidents : before.effectIncidents = [] := foreign.2.2.1
    cases stimulus <;> simp only [SerialBusinessTask.IsSerialCompletion] at completion <;> try contradiction
    all_goals simp [admitStimulus, storage, dispatchStimulus, snapshots, guarded, dataValid, messageValid, incidents,
      profile, mixedTaskControlFlowProfileId, mixedTaskBusinessErrorProfileId]

theorem guarded_effect_dispatch_cases (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId)
    (analyzed : programAnalysis program = some analysis)
    (guarded : serialBusinessCommandAdmitted program before (.completeEffect commandId effectId result) = true) :
    dispatchStimulus program before (.completeEffect commandId effectId result) = { outcome := .rejected, state := before } ∨
      ∃ after, completeSerialEffect? program before effectId result = some after ∧
        dispatchStimulus program before (.completeEffect commandId effectId result) = { outcome := .committed, state := after } := by
  obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
  have noCompensation := (admitted_serial_guard_has_no_foreign_effects program before
    (.completeEffect commandId effectId result) (Or.inl profile) guarded).2
  cases control : before.control <;>
    simp [dispatchStimulus, snapshots, control, noCompensation, profile]
  split
  · contradiction
  · cases completed : completeSerialEffect? program before effectId result with
    | none => simp
    | some after =>
      simp only
      split
      · exact Or.inr ⟨after, rfl, rfl⟩
      · exact Or.inl rfl
  · exact Or.inl rfl

theorem declared_place_unique_origin (program : Program) (analysis : Analysis) (place : ControlPlace)
    (analyzed : programAnalysis program = some analysis) (member : place ∈ program.controlPlaces) :
    program.controlPlaces.filter (fun candidate => decide (candidate.origin = place.origin)) = [place] := by
  apply SerialBusinessTask.refined_unique_filter program.controlPlaces (fun candidate => decide (candidate.origin.elementId.value = place.origin.elementId.value))
    (fun candidate => decide (candidate.origin = place.origin)) place
  · exact filter_key_eq_singleton_of_nodup _ _ _ (program_places_unique_origins program analysis analyzed) member
  · intro candidate _ same
    simp only [decide_eq_true_eq] at same ⊢
    rw [same]
  · simp

/-- XML order is priority: once the prefix is false, the first true candidate wins independently of the suffix. -/
theorem choice_first_true (before after : List ConditionalCandidate) (candidate : ConditionalCandidate)
    (fallback : ControlPlaceId) (bindings : List VariableBinding)
    (prefixFalse : ∀ item ∈ before, evaluateSimpleBooleanExpression item.condition bindings = some false)
    (selected : evaluateSimpleBooleanExpression candidate.condition bindings = some true) :
    selectConditionalOutput (before ++ candidate :: after) fallback bindings = some candidate.output := by
  induction before with
  | nil => simp [selectConditionalOutput, selected]
  | cons first rest ih =>
      simp only [List.cons_append, selectConditionalOutput, prefixFalse first (by simp)]
      exact ih (fun item member => prefixFalse item (List.mem_cons_of_mem _ member))

theorem choice_default (candidates : List ConditionalCandidate) (fallback : ControlPlaceId)
    (bindings : List VariableBinding)
    (allFalse : ∀ item ∈ candidates, evaluateSimpleBooleanExpression item.condition bindings = some false) :
    selectConditionalOutput candidates fallback bindings = some fallback := by
  induction candidates with
  | nil => rfl
  | cons first rest ih =>
      simp only [selectConditionalOutput, allFalse first (by simp)]
      exact ih (fun item member => allFalse item (List.mem_cons_of_mem _ member))

theorem selected_completion_is_root (program : Program) (analysis : Analysis) (state : RuntimeState)
    (scope : DefinitionScopeId) (analyzed : programAnalysis program = some analysis) :
    completeSelectedScope? program state scope none = completeScopeState? state scope none := by
  have absent : boundedScopeOperations program = [] ∧ monitoredScopeDefinitions program = [] := by
    constructor <;> apply List.filterMap_eq_nil_iff.mpr <;> intro operation member
    all_goals
      have allowed := program_analysis_operations_allowed program analysis analyzed operation member
      cases operation <;> simp_all [OperationAllowed]
  simp only [completeSelectedScope?, isMonitoredScopeDefinition, absent.2, List.any_nil,
    Bool.false_eq_true, ↓reduceIte]
  exact completeBoundedScope_eq_completeScope_of_unbounded program state scope none
    (by simp [boundedScopeDefinitionForChild?, absent.1])

def CountersMonotone (before after : RuntimeState) : Prop :=
  (∀ task, activationCount before task ≤ activationCount after task) ∧
    (∀ element, effectActivationCount before element ≤ effectActivationCount after element)

theorem human_issuance_counters (state : RuntimeState) (instanceId : SemanticId) (owner : ScopeOccurrenceId)
    (input output : ControlPlaceId) (task : UserTaskDefinition) :
    CountersMonotone state (activateUserTask state instanceId owner input output task) ∧
      activationCount (activateUserTask state instanceId owner input output task) task.id = activationCount state task.id + 1 := by
  have self := activationCount_setActivationCount_self state task.id (activationCount state task.id + 1)
  refine ⟨⟨?_, fun _ => Nat.le_refl _⟩, self⟩
  intro query
  by_cases same : query = task.id
  · subst query
    change activationCount state task.id ≤ activationCount { state with activations := setActivationCount state.activations task.id (activationCount state task.id + 1) } task.id
    rw [self]
    omega
  · change activationCount state query ≤ activationCount { state with activations := setActivationCount state.activations task.id (activationCount state task.id + 1) } query
    rw [activationCount_setActivationCount_other state task.id query _ same]
    exact Nat.le_refl _

theorem effect_issuance_counters (state : RuntimeState) (instanceId : SemanticId) (owner : ScopeOccurrenceId)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute := none) :
    CountersMonotone state (activateEffect state instanceId owner input output effect route) ∧
      effectActivationCount (activateEffect state instanceId owner input output effect route) effect.elementId = effectActivationCount state effect.elementId + 1 := by
  have self := effectActivationCount_set_self state effect.elementId (effectActivationCount state effect.elementId + 1)
  refine ⟨⟨fun _ => Nat.le_refl _, ?_⟩, self⟩
  intro query
  by_cases same : query = effect.elementId
  · subst query
    change effectActivationCount state effect.elementId ≤ effectActivationCount { state with effectActivations := setEffectActivationCount state.effectActivations effect.elementId (effectActivationCount state effect.elementId + 1) } effect.elementId
    rw [self]
    omega
  · change effectActivationCount state query ≤ effectActivationCount { state with effectActivations := setEffectActivationCount state.effectActivations effect.elementId (effectActivationCount state effect.elementId + 1) } query
    rw [effectActivationCount_set_other state effect.elementId query _ same]
    exact Nat.le_refl _

theorem fire_counters_monotone (program : Program) (analysis : Analysis) (operation : SemanticOperation)
    (before after : RuntimeState) (analyzed : programAnalysis program = some analysis) (scalar : programEffectMappingValuePolicy program = .scalar)
    (member : operation ∈ program.operations) (fired : fire? program operation before = some after) :
    CountersMonotone before after := by
  have allowed := program_analysis_operations_allowed program analysis analyzed operation member
  have step := fire_sound program operation before after fired
  cases operation <;> simp only [OperationAllowed] at allowed
  all_goals try contradiction
  case initiate id origin output =>
    cases step with
    | initiate _ _ _ _ _ active =>
        obtain ⟨_, _, active⟩ := Option.bind_eq_some_iff.mp active
        split at active
        · cases Option.some.inj active
          exact ⟨fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩
        · contradiction
  case awaitUserTask id origin input output task =>
    cases step with
    | awaitUserTask _ _ _ _ _ _ _ active =>
        simp only [awaitUserTaskState?, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨owner, _, instanceId, _, active⟩ := active
        cases Option.some.inj active
        exact (human_issuance_counters before instanceId owner input output task).1
  case awaitEffect id origin input output effect route =>
    cases step with
    | awaitEffect _ _ _ _ _ _ _ _ active =>
        simp only [awaitEffectState?, program_analysis_effect_inputs program analysis analyzed scalar, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨owner, _, instanceId, _, arguments, _, active⟩ := active
        split at active
        · contradiction
        · cases Option.some.inj active
          exact (effect_issuance_counters before owner.processInstanceId owner input output effect route).1
  case choose id origin input candidates fallback defaultOrigin =>
    cases step with
    | choose _ _ _ _ _ _ _ _ active =>
        simp only [chooseState?, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨_, _, _, _, active⟩ := active
        cases Option.some.inj active
        exact ⟨fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩
  case mergeExclusive id origin inputs output =>
    cases step with
    | mergeExclusive _ _ _ _ _ _ active =>
        cases active
        exact ⟨fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩
  case reachNoneEnd id origin input =>
    cases step with
    | reachNoneEnd _ _ _ _ _ active =>
        simp only [reachNoneEndState?, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨_, _, _, _, active⟩ := active
        cases Option.some.inj active
        exact ⟨fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩
  case completeScope id origin scope output =>
    cases output with
    | some output => contradiction
    | none =>
      cases step with
      | completeScope _ _ _ _ _ _ completed =>
        change completeSelectedScope? program before scope none = some after at completed
        rw [selected_completion_is_root program analysis before scope analyzed] at completed
        unfold completeScopeState? completeQuiescentScope? at completed
        repeat' split at completed
        all_goals first
          | (simp at completed; done)
          | (cases Option.some.inj completed; exact ⟨fun _ => Nat.le_refl _, fun _ => Nat.le_refl _⟩)

theorem counters_trans {first middle last : RuntimeState}
    (earlier : CountersMonotone first middle) (suffix : CountersMonotone middle last) : CountersMonotone first last :=
  ⟨fun task => Nat.le_trans (earlier.1 task) (suffix.1 task), fun element => Nat.le_trans (earlier.2 element) (suffix.2 element)⟩

theorem counters_frame {first middle last : RuntimeState} (earlier : CountersMonotone first middle)
    (kept : last.activations = middle.activations ∧ last.effectActivations = middle.effectActivations) : CountersMonotone first last := by
  constructor
  · intro task; simpa only [activationCount, kept.1] using earlier.1 task
  · intro element; simpa only [effectActivationCount, kept.2] using earlier.2 element

theorem execution_reachable_trans (program : Program) (first middle last : RuntimeState)
    (earlier : SerialBusinessTask.ExecutionReachable program first middle)
    (suffix : SerialBusinessTask.ExecutionReachable program middle last) : SerialBusinessTask.ExecutionReachable program first last := by
  induction suffix with
  | initial => exact earlier
  | step choice reached executed ih => exact .step choice ih executed
  | human commandId taskId patch reached ih => exact .human commandId taskId patch ih
  | effect commandId effectId result reached ih => exact .effect commandId effectId result ih

/-- Missing, stale or duplicate local ownership cannot authorize an effect, even when its element and result mapping match. -/
theorem nonunique_effect_local_owner_refused (program : Program) (state : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (notUnique : (state.variables.activities.filter (activityScopeMatches effectId)).length ≠ 1) :
    completeSerialEffect? program state effectId result = none := by
  unfold completeSerialEffect?
  split
  · cases owned : state.variables.activities.filter (activityScopeMatches effectId) with
    | nil => simp [completeSerialActivityScope?, owned]
    | cons first rest =>
      cases rest with
      | nil => simp [owned] at notUnique
      | cons next more => simp [completeSerialActivityScope?, owned]
  · rfl

end BpmnSemantics.SemanticProcess.MixedTaskControlFlow
