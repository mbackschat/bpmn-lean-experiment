import BpmnSemantics.SemanticProcess.NestedScopeData
import BpmnSemantics.SemanticProcess.ScopeCompletion

/-! # Nested scope-data frame laws

Quantified read, write and initialization laws for the frame operations of `NestedScopeData`, with
the nearest checked non-law, per the
[nested scope data specification](../../docs/capsules/NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#lean-assurance-lane).
The laws hold for every Program, chain and frame population; they need no runtime well-formedness
because a definition with more than one live frame makes resolution refuse rather than choose.
-/

namespace BpmnSemantics.SemanticProcess.NestedScopeData

open BpmnSemantics

/-- Whether a frame of `scopeId` in the instance declares `name`, a present null included. -/
def declares (variables : ScopedVariables) (instanceId : SemanticId) (scopeId : DefinitionScopeId)
    (name : String) : Bool :=
  (framesOf variables.scopes instanceId scopeId).any fun frame => frame.bindings.any (·.name == name)

/-- NSD-READ-01, frame case: resolution selects the unique frame of the first chain scope that declares
the name, and no earlier chain scope declares it. -/
theorem resolveOwner?_frame_nearest (variables : ScopedVariables) (instanceId : SemanticId)
    (name : String) :
    ∀ (chain : List DefinitionScopeId) (owner : ScopeOccurrenceId),
      resolveOwner? variables.scopes instanceId chain name = some (.frame owner) →
      ∃ pre scopeId post frame, chain = pre ++ scopeId :: post ∧
        framesOf variables.scopes instanceId scopeId = [frame] ∧ frame.owner = owner ∧
        frame.bindings.any (·.name == name) = true ∧
        ∀ earlier ∈ pre, declares variables instanceId earlier name = false
  | [], owner, resolved => by simp [resolveOwner?] at resolved
  | scopeId :: rest, owner, resolved => by
      have later : ∀ owner, resolveOwner? variables.scopes instanceId rest name = some (.frame owner) →
          declares variables instanceId scopeId name = false →
          ∃ pre scopeId' post frame, scopeId :: rest = pre ++ scopeId' :: post ∧
            framesOf variables.scopes instanceId scopeId' = [frame] ∧ frame.owner = owner ∧
            frame.bindings.any (·.name == name) = true ∧
            ∀ earlier ∈ pre, declares variables instanceId earlier name = false := by
        intro owner resolved absent
        obtain ⟨pre, found, post, frame, chain, frames, owned, declared, earlier⟩ :=
          resolveOwner?_frame_nearest variables instanceId name rest owner resolved
        refine ⟨scopeId :: pre, found, post, frame, by simp [chain], frames, owned, declared, ?_⟩
        intro candidate member
        rcases List.mem_cons.mp member with same | member
        · exact same ▸ absent
        · exact earlier candidate member
      cases frames : framesOf variables.scopes instanceId scopeId with
      | nil =>
          simp only [resolveOwner?, frames] at resolved
          exact later owner resolved (by simp [declares, frames])
      | cons frame tail =>
          cases tail with
          | nil =>
              by_cases declared : frame.bindings.any (·.name == name) = true
              · simp only [resolveOwner?, frames, declared, ite_true, Option.some.injEq,
                  Owner.frame.injEq] at resolved
                exact ⟨[], scopeId, rest, frame, rfl, frames, resolved, declared, by simp⟩
              · simp only [resolveOwner?, frames, declared, Bool.false_eq_true, ite_false] at resolved
                exact later owner resolved (by simpa [declares, frames] using declared)
          | cons _ _ => simp [resolveOwner?, frames] at resolved

/-- NSD-READ-01, Process case: the Process decides only when no chain scope declares the name. -/
theorem resolveOwner?_process_undeclared (variables : ScopedVariables) (instanceId : SemanticId)
    (name : String) :
    ∀ (chain : List DefinitionScopeId),
      resolveOwner? variables.scopes instanceId chain name = some .process →
      ∀ scopeId ∈ chain, declares variables instanceId scopeId name = false
  | [], _ => by simp
  | scopeId :: rest, resolved => by
      cases frames : framesOf variables.scopes instanceId scopeId with
      | nil =>
          simp only [resolveOwner?, frames] at resolved
          intro candidate member
          rcases List.mem_cons.mp member with same | member
          · simp [same, declares, frames]
          · exact resolveOwner?_process_undeclared variables instanceId name rest resolved candidate member
      | cons frame tail =>
          cases tail with
          | nil =>
              by_cases declared : frame.bindings.any (·.name == name) = true
              · simp [resolveOwner?, frames, declared] at resolved
              · simp only [resolveOwner?, frames, declared, Bool.false_eq_true, ite_false] at resolved
                intro candidate member
                rcases List.mem_cons.mp member with same | member
                · simpa [same, declares, frames] using declared
                · exact resolveOwner?_process_undeclared variables instanceId name rest resolved candidate member
          | cons _ _ => simp [resolveOwner?, frames] at resolved

/-- NSD-WRITE-01, frame case: the write updates the resolved frame alone and leaves the Process, the
Activity scopes and every other frame unchanged. -/
theorem write?_frame (program : Program) (variables result : ScopedVariables) (instanceId : SemanticId)
    (scopeId : DefinitionScopeId) (binding : VariableBinding) (owner : ScopeOccurrenceId)
    (resolved : resolveOwner? variables.scopes instanceId (definitionChain program.definitionScopes scopeId) binding.name =
      some (.frame owner))
    (written : write? program variables instanceId scopeId binding = some result) :
    result = { variables with scopes := variables.scopes.map fun frame =>
      if frame.owner = owner then
        { frame with bindings := mergeProcessVariableBindings frame.bindings [binding] }
      else frame } := by
  simp only [write?, resolved, bind, Option.bind] at written
  cases selected : selectScopeVariables? variables owner <;> simp [selected] at written
  exact written.symm

/-- NSD-WRITE-01, Process case outside a called instance: the write creates or replaces the Process
binding and changes no frame. -/
theorem write?_process (program : Program) (variables : ScopedVariables) (instanceId : SemanticId)
    (scopeId : DefinitionScopeId) (binding : VariableBinding)
    (resolved : resolveOwner? variables.scopes instanceId (definitionChain program.definitionScopes scopeId) binding.name =
      some .process)
    (hosted : calledRootOf? program (definitionChain program.definitionScopes scopeId) = none) :
    write? program variables instanceId scopeId binding = some { variables with process :=
      { bindings := mergeProcessVariableBindings variables.process.bindings [binding] } } := by
  simp [write?, resolved, hosted]

/-- NSD-READ-01's frame case as an evaluator: once resolution selects a frame, the read is that
frame's binding outcome and never consults the Process binding. -/
theorem readOutcome?_frame (program : Program) (variables : ScopedVariables) (instanceId : SemanticId)
    (scopeId : DefinitionScopeId) (name : String) (owner : ScopeOccurrenceId)
    (resolved : resolveOwner? variables.scopes instanceId (definitionChain program.definitionScopes scopeId) name =
      some (.frame owner)) :
    readOutcome? program variables instanceId scopeId name =
      (selectScopeVariables? variables owner).bind fun frame => bindingOutcome? frame.bindings name := by
  simp only [readOutcome?, resolved, bind, Option.bind]

private theorem merge_mem_self (existing : List VariableBinding) (binding : VariableBinding) :
    binding ∈ mergeProcessVariableBindings existing [binding] :=
  (mergeProcessVariableBindings_perm existing [binding]).mem_iff.mpr (by simp)

private theorem merge_mem_kept (existing : List VariableBinding) (binding kept : VariableBinding)
    (member : kept ∈ existing) (different : kept.name ≠ binding.name) :
    kept ∈ mergeProcessVariableBindings existing [binding] :=
  (mergeProcessVariableBindings_perm existing [binding]).mem_iff.mpr
    (List.mem_append_right _ (List.mem_filter.mpr ⟨member, by simp [different]⟩))

/-- Replacing an already declared name leaves the declared name set unchanged. -/
private theorem merge_declares (existing : List VariableBinding) (binding : VariableBinding) (name : String)
    (present : existing.any (·.name == binding.name) = true) :
    (mergeProcessVariableBindings existing [binding]).any (·.name == name) = existing.any (·.name == name) := by
  apply Bool.eq_iff_iff.mpr
  simp only [List.any_eq_true, beq_iff_eq]
  constructor
  · rintro ⟨candidate, member, named⟩
    rcases List.mem_append.mp ((mergeProcessVariableBindings_perm existing [binding]).mem_iff.mp member) with
      same | kept
    · simp only [List.mem_singleton] at same
      subst candidate
      obtain ⟨declared, declaredMember, declaredName⟩ := List.any_eq_true.mp present
      exact ⟨declared, declaredMember, by simpa [named] using declaredName⟩
    · exact ⟨candidate, (List.mem_filter.mp kept).1, named⟩
  · rintro ⟨candidate, member, named⟩
    by_cases same : candidate.name = binding.name
    · exact ⟨binding, merge_mem_self existing binding, by rw [← same, named]⟩
    · exact ⟨candidate, merge_mem_kept existing binding candidate member same, named⟩

/-- Updating bindings inside frames without changing their owners or declared names leaves every
resolution unchanged. -/
private theorem resolveOwner?_map_declared (scopes : List ScopeVariableScope)
    (update : ScopeVariableScope → ScopeVariableScope) (owner : ∀ frame, (update frame).owner = frame.owner)
    (names : ∀ frame ∈ scopes, ∀ name,
      (update frame).bindings.any (·.name == name) = frame.bindings.any (·.name == name))
    (instanceId : SemanticId) (name : String) :
    ∀ chain, resolveOwner? (scopes.map update) instanceId chain name = resolveOwner? scopes instanceId chain name
  | [] => rfl
  | scopeId :: rest => by
      have frames : framesOf (scopes.map update) instanceId scopeId =
          (framesOf scopes instanceId scopeId).map update := by
        simp only [framesOf, List.filter_map, Function.comp_def, owner]
      have later := resolveOwner?_map_declared scopes update owner names instanceId name rest
      simp only [resolveOwner?, frames]
      cases selected : framesOf scopes instanceId scopeId with
      | nil => simpa using later
      | cons frame tail =>
          cases tail with
          | nil =>
              have member : frame ∈ scopes := by
                have : frame ∈ framesOf scopes instanceId scopeId := by rw [selected]; simp
                exact (List.mem_filter.mp this).1
              simp [names frame member, owner, later]
          | cons _ _ => simp

/-- One frame write keeps the Process binding and every resolution, adds the written binding to its
frame, and keeps every binding of another name in place. -/
private theorem write?_frame_step (program : Program) (variables result : ScopedVariables)
    (instanceId : SemanticId) (scopeId : DefinitionScopeId) (binding : VariableBinding) (owner : ScopeOccurrenceId)
    (resolved : resolveOwner? variables.scopes instanceId (definitionChain program.definitionScopes scopeId) binding.name =
      some (.frame owner))
    (written : write? program variables instanceId scopeId binding = some result) :
    result.process = variables.process ∧
      (∀ name, resolveOwner? result.scopes instanceId (definitionChain program.definitionScopes scopeId) name =
        resolveOwner? variables.scopes instanceId (definitionChain program.definitionScopes scopeId) name) ∧
      (∀ frame ∈ result.scopes, frame.owner = owner → binding ∈ frame.bindings) ∧
      (∀ (kept : VariableBinding) (keptOwner : ScopeOccurrenceId), kept.name ≠ binding.name →
        (∀ frame ∈ variables.scopes, frame.owner = keptOwner → kept ∈ frame.bindings) →
        ∀ frame ∈ result.scopes, frame.owner = keptOwner → kept ∈ frame.bindings) := by
  rw [write?_frame program variables result instanceId scopeId binding owner resolved written]
  obtain ⟨_, scope, _, declared, _, frames, owned, declares, _⟩ :=
    resolveOwner?_frame_nearest variables instanceId binding.name _ owner resolved
  have only : ∀ frame ∈ variables.scopes, frame.owner = owner → frame = declared := by
    intro frame member same
    have declaredMember : declared ∈ framesOf variables.scopes instanceId scope := by rw [frames]; simp
    have selected : frame ∈ framesOf variables.scopes instanceId scope := by
      simp only [framesOf, List.mem_filter] at declaredMember ⊢
      exact ⟨member, by rw [same, ← owned]; exact declaredMember.2⟩
    rw [frames] at selected
    simpa using selected
  refine ⟨rfl, fun name => ?_, ?_, ?_⟩
  · apply resolveOwner?_map_declared
    · intro frame; split <;> rfl
    · intro frame member name
      split
      · rename_i same
        rw [only frame member same]
        exact merge_declares declared.bindings binding name declares
      · rfl
  · intro frame member same
    obtain ⟨original, _, rfl⟩ := List.mem_map.mp member
    split at same
    · rename_i originalOwner
      simp only [originalOwner, ite_true]
      exact merge_mem_self _ binding
    · simp_all
  · intro kept keptOwner different before frame member same
    obtain ⟨original, originalMember, rfl⟩ := List.mem_map.mp member
    by_cases originalOwner : original.owner = owner
    · simp only [originalOwner, ite_true] at same ⊢
      exact merge_mem_kept _ binding kept (before original originalMember (originalOwner.trans same)) different
    · simp only [originalOwner, ite_false] at same ⊢
      exact before original originalMember same

/-- NSD-WRITE-01 over a whole binding list: when every name resolves to a frame and no name repeats,
the writes leave the Process binding unchanged and each binding lands in its resolved frame. -/
theorem writeAll?_frames (program : Program) (instanceId : SemanticId) (scopeId : DefinitionScopeId) :
    ∀ (values : List VariableBinding) (variables result : ScopedVariables),
      writeAll? program variables instanceId scopeId values = some result →
      (values.map (·.name)).Nodup →
      (∀ value ∈ values, ∃ owner, resolveOwner? variables.scopes instanceId
        (definitionChain program.definitionScopes scopeId) value.name = some (.frame owner)) →
      result.process = variables.process ∧
        (∀ value ∈ values, ∀ owner, resolveOwner? variables.scopes instanceId
          (definitionChain program.definitionScopes scopeId) value.name = some (.frame owner) →
          ∀ frame ∈ result.scopes, frame.owner = owner → value ∈ frame.bindings) ∧
        (∀ (kept : VariableBinding) (keptOwner : ScopeOccurrenceId), kept.name ∉ values.map (·.name) →
          (∀ frame ∈ variables.scopes, frame.owner = keptOwner → kept ∈ frame.bindings) →
          ∀ frame ∈ result.scopes, frame.owner = keptOwner → kept ∈ frame.bindings)
  | [], variables, result, written, _, _ => by
      simp only [writeAll?, Option.some.injEq] at written
      subst written
      exact ⟨rfl, by simp, fun _ _ _ kept => kept⟩
  | value :: rest, variables, result, written, distinct, resolvedAll => by
      simp only [writeAll?, bind, Option.bind] at written
      split at written
      · contradiction
      · rename_i middle wrote
        obtain ⟨owner, resolved⟩ := resolvedAll value List.mem_cons_self
        obtain ⟨process, same, landed, kept⟩ :=
          write?_frame_step program variables middle instanceId scopeId value owner resolved wrote
        simp only [List.map_cons, List.nodup_cons] at distinct
        obtain ⟨restProcess, restLanded, restKept⟩ := writeAll?_frames program instanceId scopeId rest middle result
          written distinct.2 (fun other member => by
            rw [same]; exact resolvedAll other (List.mem_cons_of_mem _ member))
        refine ⟨restProcess.trans process, ?_, ?_⟩
        · intro other member otherOwner otherResolved
          rcases List.mem_cons.mp member with rfl | member
          · rw [resolved] at otherResolved
            cases otherResolved
            exact restKept other owner distinct.1 landed
          · exact restLanded other member otherOwner (by rw [same]; exact otherResolved)
        · intro keptBinding keptOwner absent before
          simp only [List.map_cons, List.mem_cons, not_or] at absent
          exact restKept keptBinding keptOwner absent.2 (kept keptBinding keptOwner absent.1 before)

/-- NSD-INIT-01: a declared scope's frame holds exactly the inputs evaluated against the parent
occurrence's chain in the predecessor state, and entry initialization changes nothing else. -/
theorem initializeFrame?_reads_parent_chain (program : Program) (state result : RuntimeState)
    (childScopeId : DefinitionScopeId) (record : ScopeLocalData)
    (recorded : recordFor? program childScopeId = some record)
    (initialized : initializeFrame? program state childScopeId = some result) :
    ∃ child parent bindings,
      occurrenceWithParent? state childScopeId = some (child, parent) ∧
      evaluateInputMappingsUnder? .singletonBusinessItem
          (read? program state.variables parent.processInstanceId parent.definitionScopeId)
          record.localInputs = some bindings ∧
      result = { state with variables := { state.variables with
        scopes := canonicalInsertBy (fun left right => scopeOwnerBefore left.owner right.owner)
          { owner := child, bindings := mergeProcessVariableBindings [] bindings }
          state.variables.scopes } } := by
  simp only [initializeFrame?, recorded, bind, Option.bind] at initialized
  cases located : occurrenceWithParent? state childScopeId with
  | none => simp [located] at initialized
  | some pair =>
      obtain ⟨child, parent⟩ := pair
      simp only [located] at initialized
      cases evaluated : evaluateInputMappingsUnder? .singletonBusinessItem
          (read? program state.variables parent.processInstanceId parent.definitionScopeId)
          record.localInputs with
      | none => simp [evaluated] at initialized
      | some bindings =>
          refine ⟨child, parent, bindings, by first | rfl | exact located, by first | rfl | exact evaluated, ?_⟩
          simp only [evaluated] at initialized
          split at initialized
          · simp at initialized
          · exact (Option.some.inj initialized).symm

/-! ## Nearest checked non-law

Writing into the writer's innermost frame is not the nearest-owner write: credit review's frame exists
but does not declare `status`, which order approval's frame declares. -/

private def nonLawScope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩

private def nonLawProgram : Program :=
  { identity := { compiler := .bpmnSourceSemanticProcess, semanticProfile := nestedScopeDataProfileId
                  sourceId := ⟨"non-law"⟩, sourceSha256 := "" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"P"⟩
    definitionScopes :=
      [ { id := nonLawScope "C", parentScopeId := some (nonLawScope "O"), originElementId := ⟨"C"⟩ }
      , { id := nonLawScope "O", parentScopeId := some (nonLawScope "P"), originElementId := ⟨"O"⟩ }
      , { id := nonLawScope "P", parentScopeId := none, originElementId := ⟨"P"⟩ } ]
    operationScopes := [], controlPlaceScopes := [], controlPlaces := [], operations := [] }

private def nonLawOwner (name : String) : ScopeOccurrenceId :=
  { processInstanceId := ⟨"I"⟩, definitionScopeId := nonLawScope name, activation := 1 }

private def nonLawVariables : ScopedVariables :=
  { emptyScopedVariables with scopes :=
      [ { owner := nonLawOwner "C", bindings := [{ name := "limit", value := .string "0" }] }
      , { owner := nonLawOwner "O", bindings := [{ name := "status", value := .null }] } ] }

/-- The rejected alternative: update the writer's own frame whatever it declares. -/
def innermostWrite (variables : ScopedVariables) (writer : ScopeOccurrenceId)
    (binding : VariableBinding) : ScopedVariables :=
  { variables with scopes := variables.scopes.map fun frame =>
      if frame.owner = writer then
        { frame with bindings := mergeProcessVariableBindings frame.bindings [binding] }
      else frame }

/-- NSD-RETIRE-01: a child completion removes exactly the completing occurrence's frames and keeps
every other frame, the ancestors' included, unchanged and in order. -/
theorem completeScopeState?_retires_frame (state completed : RuntimeState) (scopeId : DefinitionScopeId)
    (output : ControlPlaceId) (occurrence : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId)
    (unique : state.scopeOccurrences.filter (fun candidate =>
      decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (child : occurrence.parent = some parent)
    (completion : completeScopeState? state scopeId (some output) = some completed) :
    completed.variables.scopes = state.variables.scopes.filter (fun frame => decide (frame.owner ≠ occurrence.id)) ∧
      completed.variables.process = state.variables.process := by
  obtain ⟨_, rewrite⟩ := completeScopeState_selected_update state completed scopeId (some output) occurrence
    unique completion
  rw [child] at rewrite
  cases control : state.control <;> simp only [control] at rewrite <;> try contradiction
  split at rewrite
  · cases rewrite; exact ⟨rfl, rfl⟩
  · contradiction

theorem innermost_write_is_not_the_nearest_owner_write :
    write? nonLawProgram nonLawVariables ⟨"I"⟩ (nonLawScope "C")
        { name := "status", value := .string "approved" } ≠
      some (innermostWrite nonLawVariables (nonLawOwner "C")
        { name := "status", value := .string "approved" }) := by
  decide +kernel

end BpmnSemantics.SemanticProcess.NestedScopeData
