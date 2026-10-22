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
