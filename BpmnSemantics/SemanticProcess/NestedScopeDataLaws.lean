module

public import BpmnSemantics.SemanticProcess.NestedScopeData
public import BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.ScopeVariableData
meta import BpmnSemantics.PrivateEquationLemmas

/-! # Nested scope-data frame laws

Quantified read, write and initialization laws for the frame operations of `NestedScopeData`, with
the nearest checked non-law, per the
[nested scope data specification](../../docs/capsules/NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#lean-assurance-lane).
The laws hold for every Program, live occurrence chain and frame population; they need no runtime
well-formedness because an occurrence with more than one frame makes resolution refuse rather than
choose.
-/

run_meta privateEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`framesAt, `initializeFrame?,
  `readOutcome?, `resolveOwner?, `write?, `writeAll?]

public section

namespace BpmnSemantics.SemanticProcess.NestedScopeData

open BpmnSemantics

/-- Whether a frame of `occurrence` declares `name`, a present null included. -/
def declares (variables : ScopedVariables) (occurrence : ScopeOccurrenceId) (name : String) : Bool :=
  (framesAt variables.scopes occurrence).any fun frame => frame.bindings.any (·.name == name)

run_meta privateEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`declares]

/-- NSD-READ-01, frame case: resolution selects the unique frame of the first chain scope that declares
the name, and no earlier chain occurrence declares it. -/
theorem resolveOwner?_frame_nearest (variables : ScopedVariables) (name : String) :
    ∀ (chain : List ScopeOccurrenceId) (owner : ScopeOccurrenceId),
      resolveOwner? variables.scopes chain name = some (.frame owner) →
      ∃ pre occurrence post frame, chain = pre ++ occurrence :: post ∧
        framesAt variables.scopes occurrence = [frame] ∧ frame.owner = owner ∧
        frame.bindings.any (·.name == name) = true ∧
        ∀ earlier ∈ pre, declares variables earlier name = false
  | [], owner, resolved => by simp [resolveOwner?] at resolved
  | occurrence :: rest, owner, resolved => by
      have later : ∀ owner, resolveOwner? variables.scopes rest name = some (.frame owner) →
          declares variables occurrence name = false →
          ∃ pre occurrence' post frame, occurrence :: rest = pre ++ occurrence' :: post ∧
            framesAt variables.scopes occurrence' = [frame] ∧ frame.owner = owner ∧
            frame.bindings.any (·.name == name) = true ∧
            ∀ earlier ∈ pre, declares variables earlier name = false := by
        intro owner resolved absent
        obtain ⟨pre, found, post, frame, chain, frames, owned, declared, earlier⟩ :=
          resolveOwner?_frame_nearest variables name rest owner resolved
        refine ⟨occurrence :: pre, found, post, frame, by simp [chain], frames, owned, declared, ?_⟩
        intro candidate member
        rcases List.mem_cons.mp member with same | member
        · exact same ▸ absent
        · exact earlier candidate member
      cases frames : framesAt variables.scopes occurrence with
      | nil =>
          simp only [resolveOwner?, frames] at resolved
          exact later owner resolved (by simp [declares, frames])
      | cons frame tail =>
          cases tail with
          | nil =>
              by_cases declared : frame.bindings.any (·.name == name) = true
              · simp only [resolveOwner?, frames, declared, ite_true, Option.some.injEq,
                  Owner.frame.injEq] at resolved
                exact ⟨[], occurrence, rest, frame, rfl, frames, resolved, declared, by simp⟩
              · simp only [resolveOwner?, frames, declared, Bool.false_eq_true, ite_false] at resolved
                exact later owner resolved (by simpa [declares, frames] using declared)
          | cons _ _ => simp [resolveOwner?, frames] at resolved

/-- NSD-READ-01, Process case: the Process decides only when no chain occurrence declares the name. -/
theorem resolveOwner?_process_undeclared (variables : ScopedVariables) (name : String) :
    ∀ (chain : List ScopeOccurrenceId),
      resolveOwner? variables.scopes chain name = some .process →
      ∀ occurrence ∈ chain, declares variables occurrence name = false
  | [], _ => by simp
  | occurrence :: rest, resolved => by
      cases frames : framesAt variables.scopes occurrence with
      | nil =>
          simp only [resolveOwner?, frames] at resolved
          intro candidate member
          rcases List.mem_cons.mp member with same | member
          · simp [same, declares, frames]
          · exact resolveOwner?_process_undeclared variables name rest resolved candidate member
      | cons frame tail =>
          cases tail with
          | nil =>
              by_cases declared : frame.bindings.any (·.name == name) = true
              · simp [resolveOwner?, frames, declared] at resolved
              · simp only [resolveOwner?, frames, declared, Bool.false_eq_true, ite_false] at resolved
                intro candidate member
                rcases List.mem_cons.mp member with same | member
                · simpa [same, declares, frames] using declared
                · exact resolveOwner?_process_undeclared variables name rest resolved candidate member
          | cons _ _ => simp [resolveOwner?, frames] at resolved

/-- CVM-ISOLATE-01 and CSD-ISOLATE-01, frame side: resolution selects only the frame of an occurrence
on the resolving chain, so a called-owned read or write never selects a caller frame, and an
occurrence never selects a sibling occurrence's frame. -/
private theorem resolveOwner?_frame_on_chain (variables : ScopedVariables) (chain : List ScopeOccurrenceId)
    (name : String) (owner : ScopeOccurrenceId)
    (resolved : resolveOwner? variables.scopes chain name = some (.frame owner)) :
    owner ∈ chain := by
  obtain ⟨_, occurrence, _, frame, split, frames, same, _, _⟩ :=
    resolveOwner?_frame_nearest variables name chain owner resolved
  have member : frame ∈ framesAt variables.scopes occurrence := by simp [frames]
  simp only [framesAt, List.mem_filter, beq_iff_eq] at member
  rw [← same, member.2, split]
  simp

/-- Updating, in place, only the frames of one chain occurrence leaves every off-chain frame as it was. -/
private theorem off_chain_map (chain : List ScopeOccurrenceId) (owner : ScopeOccurrenceId) (onChain : owner ∈ chain)
    (update : ScopeVariableScope → List VariableBinding) :
    ∀ scopes : List ScopeVariableScope,
      (scopes.map fun frame => if frame.owner = owner then { frame with bindings := update frame } else frame).filter
          (fun frame => decide (frame.owner ∉ chain)) =
        scopes.filter fun frame => decide (frame.owner ∉ chain)
  | [] => rfl
  | frame :: rest => by
      have later := off_chain_map chain owner onChain update rest
      by_cases same : frame.owner = owner
      · simp only [List.map_cons, same, ite_true, List.filter_cons, onChain, not_true_eq_false,
          decide_false, Bool.false_eq_true, ite_false]
        exact later
      · simp only [List.map_cons, same, ite_false, List.filter_cons]
        split
        · rw [later]
        · exact later

private theorem calledRootOf?_on_chain (program : Program) (chain : List ScopeOccurrenceId)
    (root : ScopeOccurrenceId) (called : calledRootOf? program chain = some root) : root ∈ chain := by
  unfold calledRootOf? at called
  split at called
  · rename_i last found
    split at called
    · cases called; exact List.mem_of_getLast? found
    · contradiction
  · contradiction

/-- CSD-ISOLATE-01, write side: a write from `writer` leaves every frame whose owner is not on the
writer's live occurrence chain unchanged, so a sibling occurrence's frame never changes. -/
private theorem write?_off_chain_unchanged (program : Program) (occurrences : List RuntimeScopeOccurrence)
    (variables result : ScopedVariables) (writer : ScopeOccurrenceId) (chain : List ScopeOccurrenceId)
    (binding : VariableBinding) (chained : occurrenceChain occurrences writer = some chain)
    (written : write? program occurrences variables writer binding = some result) :
    result.scopes.filter (fun frame => decide (frame.owner ∉ chain)) =
      variables.scopes.filter fun frame => decide (frame.owner ∉ chain) := by
  unfold write? at written
  simp only [chained, bind, Option.bind] at written
  split at written
  · contradiction
  · rename_i owner resolved
    cases owner with
    | process =>
        split at written
        · cases written; rfl
        · rename_i root called
          split at written
          · rename_i frame frames
            cases written
            have member : frame ∈ framesAt variables.scopes root := by simp [frames]
            simp only [framesAt, List.mem_filter, beq_iff_eq] at member
            exact off_chain_map chain frame.owner (member.2 ▸ calledRootOf?_on_chain program chain root called) _ _
          · contradiction
    | frame owner =>
        cases selected : selectScopeVariables? variables owner <;> simp [selected] at written
        cases written
        exact off_chain_map chain owner (resolveOwner?_frame_on_chain variables chain binding.name owner resolved) _ _

/-- NSD-WRITE-01, frame case: the write updates the resolved frame alone and leaves the Process, the
Activity scopes and every other frame unchanged. -/
theorem write?_frame (program : Program) (occurrences : List RuntimeScopeOccurrence)
    (variables result : ScopedVariables) (writer : ScopeOccurrenceId) (chain : List ScopeOccurrenceId)
    (binding : VariableBinding) (owner : ScopeOccurrenceId)
    (chained : occurrenceChain occurrences writer = some chain)
    (resolved : resolveOwner? variables.scopes chain binding.name =
      some (.frame owner))
    (written : write? program occurrences variables writer binding = some result) :
    result = { variables with scopes := variables.scopes.map fun frame =>
      if frame.owner = owner then
        { frame with bindings := mergeProcessVariableBindings frame.bindings [binding] }
      else frame } := by
  simp only [write?, chained, resolved, bind, Option.bind] at written
  cases selected : selectScopeVariables? variables owner <;> simp [selected] at written
  exact written.symm

/-- NSD-WRITE-01, Process case outside a called instance: the write creates or replaces the Process
binding and changes no frame. -/
theorem write?_process (program : Program) (occurrences : List RuntimeScopeOccurrence)
    (variables : ScopedVariables) (writer : ScopeOccurrenceId) (chain : List ScopeOccurrenceId)
    (binding : VariableBinding) (chained : occurrenceChain occurrences writer = some chain)
    (resolved : resolveOwner? variables.scopes chain binding.name =
      some .process)
    (hosted : calledRootOf? program chain = none) :
    write? program occurrences variables writer binding = some { variables with process :=
      { bindings := mergeProcessVariableBindings variables.process.bindings [binding] } } := by
  simp [write?, chained, resolved, hosted]

/-- NSD-READ-01's frame case as an evaluator: once resolution selects a frame, the read is that
frame's binding outcome and never consults the Process binding. -/
theorem readOutcome?_frame (program : Program) (occurrences : List RuntimeScopeOccurrence)
    (variables : ScopedVariables) (reader : ScopeOccurrenceId) (chain : List ScopeOccurrenceId)
    (name : String) (owner : ScopeOccurrenceId) (chained : occurrenceChain occurrences reader = some chain)
    (resolved : resolveOwner? variables.scopes chain name =
      some (.frame owner)) :
    readOutcome? program occurrences variables reader name =
      (selectScopeVariables? variables owner).bind fun frame =>
        bindingOutcome? (programEffectMappingValuePolicy program) frame.bindings name := by
  simp only [readOutcome?, chained, resolved, bind, Option.bind]

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
    (name : String) :
    ∀ chain, resolveOwner? (scopes.map update) chain name = resolveOwner? scopes chain name
  | [] => rfl
  | occurrence :: rest => by
      have frames : framesAt (scopes.map update) occurrence = (framesAt scopes occurrence).map update := by
        simp only [framesAt, List.filter_map, Function.comp_def, owner]
      have later := resolveOwner?_map_declared scopes update owner names name rest
      simp only [resolveOwner?, frames]
      cases selected : framesAt scopes occurrence with
      | nil => simpa using later
      | cons frame tail =>
          cases tail with
          | nil =>
              have member : frame ∈ scopes := by
                have : frame ∈ framesAt scopes occurrence := by rw [selected]; simp
                exact (List.mem_filter.mp this).1
              simp [names frame member, owner, later]
          | cons _ _ => simp

/-- One frame write keeps the Process binding and every resolution, adds the written binding to its
frame, and keeps every binding of another name in place. -/
private theorem write?_frame_step (program : Program) (variables result : ScopedVariables)
    (occurrences : List RuntimeScopeOccurrence) (writer : ScopeOccurrenceId) (chain : List ScopeOccurrenceId)
    (binding : VariableBinding) (owner : ScopeOccurrenceId)
    (chained : occurrenceChain occurrences writer = some chain)
    (resolved : resolveOwner? variables.scopes chain binding.name =
      some (.frame owner))
    (written : write? program occurrences variables writer binding = some result) :
    result.process = variables.process ∧
      (∀ name, resolveOwner? result.scopes chain name =
        resolveOwner? variables.scopes chain name) ∧
      (∀ frame ∈ result.scopes, frame.owner = owner → binding ∈ frame.bindings) ∧
      (∀ (kept : VariableBinding) (keptOwner : ScopeOccurrenceId), kept.name ≠ binding.name →
        (∀ frame ∈ variables.scopes, frame.owner = keptOwner → kept ∈ frame.bindings) →
        ∀ frame ∈ result.scopes, frame.owner = keptOwner → kept ∈ frame.bindings) := by
  rw [write?_frame program occurrences variables result writer chain binding owner chained resolved written]
  obtain ⟨_, scope, _, declared, _, frames, owned, declares, _⟩ :=
    resolveOwner?_frame_nearest variables binding.name _ owner resolved
  have only : ∀ frame ∈ variables.scopes, frame.owner = owner → frame = declared := by
    intro frame member same
    have declaredMember : declared ∈ framesAt variables.scopes scope := by rw [frames]; simp
    have selected : frame ∈ framesAt variables.scopes scope := by
      simp only [framesAt, List.mem_filter] at declaredMember ⊢
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
theorem writeAll?_frames (program : Program) (occurrences : List RuntimeScopeOccurrence)
    (writer : ScopeOccurrenceId) (chain : List ScopeOccurrenceId)
    (chained : occurrenceChain occurrences writer = some chain) :
    ∀ (values : List VariableBinding) (variables result : ScopedVariables),
      writeAll? program occurrences variables writer values = some result →
      (values.map (·.name)).Nodup →
      (∀ value ∈ values, ∃ owner, resolveOwner? variables.scopes
        chain value.name = some (.frame owner)) →
      result.process = variables.process ∧
        (∀ value ∈ values, ∀ owner, resolveOwner? variables.scopes
          chain value.name = some (.frame owner) →
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
          write?_frame_step program variables middle occurrences writer chain value owner chained resolved wrote
        simp only [List.map_cons, List.nodup_cons] at distinct
        obtain ⟨restProcess, restLanded, restKept⟩ := writeAll?_frames program occurrences writer chain chained rest middle result
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
      evaluateInputMappingsUnder? (programEffectMappingValuePolicy program)
          (read? program state.scopeOccurrences state.variables parent)
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
      cases evaluated : evaluateInputMappingsUnder? (programEffectMappingValuePolicy program)
          (read? program state.scopeOccurrences state.variables parent)
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

def nonLawScope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩

def nonLawProgram : Program :=
  { identity := { compiler := .bpmnSourceSemanticProcess, semanticProfile := nestedScopeDataProfileId
                  sourceId := ⟨"non-law"⟩, sourceSha256 := "" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"P"⟩
    definitionScopes :=
      [ { id := nonLawScope "C", parentScopeId := some (nonLawScope "O"), originElementId := ⟨"C"⟩ }
      , { id := nonLawScope "O", parentScopeId := some (nonLawScope "P"), originElementId := ⟨"O"⟩ }
      , { id := nonLawScope "P", parentScopeId := none, originElementId := ⟨"P"⟩ } ]
    operationScopes := [], controlPlaceScopes := [], controlPlaces := [], operations := [] }

def nonLawOwner (name : String) : ScopeOccurrenceId :=
  { processInstanceId := ⟨"I"⟩, definitionScopeId := nonLawScope name, activation := 1 }

def nonLawOccurrences : List RuntimeScopeOccurrence :=
  [ { id := nonLawOwner "C", parent := some (nonLawOwner "O") }
  , { id := nonLawOwner "O", parent := some (nonLawOwner "P") }
  , { id := nonLawOwner "P", parent := none } ]

def nonLawVariables : ScopedVariables :=
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
    write? nonLawProgram nonLawOccurrences nonLawVariables (nonLawOwner "C")
        { name := "status", value := .string "approved" } ≠
      some (innermostWrite nonLawVariables (nonLawOwner "C")
        { name := "status", value := .string "approved" }) := by
  decide +kernel

/-! ## Sibling occurrences

CSD-CHAIN-01 and CSD-ISOLATE-01 on the smallest separating state: two live occurrences of the order
approval definition under one parent each hold a frame declaring `status`. The definition-chain account
refused this state because one definition had two live frames. -/

private def siblingOwner (activation : Nat) : ScopeOccurrenceId :=
  { processInstanceId := ⟨"I"⟩, definitionScopeId := nonLawScope "O", activation }

private def siblingOccurrences : List RuntimeScopeOccurrence :=
  [ { id := siblingOwner 1, parent := some (nonLawOwner "P") }
  , { id := siblingOwner 2, parent := some (nonLawOwner "P") }
  , { id := nonLawOwner "P", parent := none } ]

private def siblingVariables : ScopedVariables :=
  { emptyScopedVariables with scopes :=
      [ { owner := siblingOwner 1, bindings := [{ name := "status", value := .string "open" }] }
      , { owner := siblingOwner 2, bindings := [{ name := "status", value := .string "held" }] } ] }

private theorem sibling_occurrences_resolve_and_write_their_own_frames :
    (occurrenceChain siblingOccurrences (siblingOwner 1)).bind (resolveOwner? siblingVariables.scopes · "status") =
        some (.frame (siblingOwner 1)) ∧
      (occurrenceChain siblingOccurrences (siblingOwner 2)).bind (resolveOwner? siblingVariables.scopes · "status") =
        some (.frame (siblingOwner 2)) ∧
      (write? nonLawProgram siblingOccurrences siblingVariables (siblingOwner 2)
          { name := "status", value := .string "approved" }).map (·.scopes.head?) =
        some (siblingVariables.scopes.head?) := by
  decide +kernel

end BpmnSemantics.SemanticProcess.NestedScopeData
