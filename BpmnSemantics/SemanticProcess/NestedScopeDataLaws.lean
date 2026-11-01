module

public import BpmnSemantics.SemanticProcess.NestedScopeData
public import BpmnSemantics.SemanticProcess.ScopeCompletion
import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.NestedScopeChainBridge
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.ScopeVariableData
meta import BpmnSemantics.PrivateEquationLemmas
import all BpmnSemantics.SemanticProcess.Data

/-! # Nested scope-data frame laws

Quantified read, write and initialization laws for the frame operations of `NestedScopeData`, with
the nearest checked non-law, per the
[nested scope data specification](../../docs/capsules/NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#lean-assurance-lane).
The laws hold for every Program, live occurrence chain and frame population; they need no runtime
well-formedness because an occurrence with more than one frame makes resolution refuse rather than
choose.
-/

run_meta privateEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`evaluateFrame?, `framesAt,
  `initializeFrame?, `initializeFrameAt?, `insertFrame, `read?, `readOutcome?, `readSet?, `resolveOwner?, `write?,
  `writeAll?]

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
theorem resolveOwner?_frame_on_chain (variables : ScopedVariables) (chain : List ScopeOccurrenceId)
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

theorem calledRootOf?_on_chain (program : Program) (chain : List ScopeOccurrenceId)
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

/-- NSD-INIT-01 by occurrence: the frame of `child` holds exactly the inputs evaluated against `parent`'s
chain in the predecessor state, and initialization changes nothing else. -/
private theorem initializeFrameAt?_reads_parent_chain (program : Program) (state result : RuntimeState)
    (record : ScopeLocalData) (child parent : ScopeOccurrenceId)
    (initialized : initializeFrameAt? program state record child parent = some result) :
    ∃ bindings,
      evaluateInputMappingsUnder? (programEffectMappingValuePolicy program)
          (read? program state.scopeOccurrences state.variables parent)
          record.localInputs = some bindings ∧
      result = { state with variables := { state.variables with
        scopes := canonicalInsertBy (fun left right => scopeOwnerBefore left.owner right.owner)
          { owner := child, bindings := mergeProcessVariableBindings [] bindings }
          state.variables.scopes } } := by
  simp only [initializeFrameAt?, evaluateFrame?, Option.bind_eq_bind, Option.bind_eq_some_iff] at initialized
  obtain ⟨frame, ⟨bindings, evaluated, framed⟩, installed⟩ := initialized
  split at framed
  · contradiction
  · cases framed; cases installed
    exact ⟨bindings, evaluated, rfl⟩

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
  simp only [initializeFrame?, recorded, Option.bind_eq_bind, Option.bind_eq_some_iff] at initialized
  obtain ⟨⟨child, parent⟩, located, initialized⟩ := initialized
  obtain ⟨bindings, evaluated, rfl⟩ :=
    initializeFrameAt?_reads_parent_chain program state result record child parent initialized
  exact ⟨child, parent, bindings, located, evaluated, rfl⟩

/-- NSD-INIT-01 by occurrence before insertion: an evaluated frame belongs to `child`, which held none,
and holds exactly the inputs evaluated against `parent`'s chain. -/
theorem evaluateFrame?_facts (program : Program) (state : RuntimeState) (record : ScopeLocalData)
    (child parent : ScopeOccurrenceId) (frame : ScopeVariableScope)
    (evaluated : evaluateFrame? program state record child parent = some frame) :
    frame.owner = child ∧ state.variables.scopes.any (·.owner == child) = false ∧
      ∃ bindings, evaluateInputMappingsUnder? (programEffectMappingValuePolicy program)
          (read? program state.scopeOccurrences state.variables parent) record.localInputs = some bindings ∧
        frame.bindings = mergeProcessVariableBindings [] bindings := by
  simp only [evaluateFrame?, Option.bind_eq_bind, Option.bind_eq_some_iff] at evaluated
  obtain ⟨bindings, evaluatedBindings, framed⟩ := evaluated
  split at framed
  · contradiction
  · next fresh =>
      cases framed
      simp only [Bool.or_eq_true, Bool.not_eq_true', not_or, Bool.not_eq_true] at fresh
      exact ⟨rfl, fresh.2, bindings, evaluatedBindings, rfl⟩

/-- NSD-INIT-01 on the entered state: the unique live occurrence of the definition and its parent select
the evaluated frame, which entry installs. -/
theorem initializeFrame?_of_evaluated (program : Program) (state : RuntimeState) (scope : DefinitionScopeId)
    (record : ScopeLocalData) (child parent : ScopeOccurrenceId) (frame : ScopeVariableScope)
    (recorded : recordFor? program scope = some record)
    (located : occurrenceWithParent? state scope = some (child, parent))
    (evaluated : evaluateFrame? program state record child parent = some frame) :
    initializeFrame? program state scope = some { state with variables := insertFrame state.variables frame } := by
  simp only [initializeFrame?, recorded, located, initializeFrameAt?, evaluated, bind, Option.bind]

/-- Inserting the frame of an occurrence that holds none keeps every selected frame, so a frame insertion
for a fresh child (CSD-PREPARE-01) changes no other occurrence's data. -/
theorem selectScopeVariables?_insertFrame (variables : ScopedVariables) (frame found : ScopeVariableScope)
    (owner : ScopeOccurrenceId) (absent : variables.scopes.any (·.owner == frame.owner) = false)
    (selected : selectScopeVariables? variables owner = some found) :
    selectScopeVariables? (insertFrame variables frame) owner = some found := by
  unfold selectScopeVariables? at selected ⊢
  have distinct : decide (frame.owner = owner) = false := by
    split at selected
    · next scope filtered =>
        have member : scope ∈ variables.scopes.filter (fun candidate => decide (candidate.owner = owner)) := by
          rw [filtered]; simp
        obtain ⟨present, sameOwner⟩ := List.mem_filter.mp member
        simp only [decide_eq_true_eq] at sameOwner
        apply decide_eq_false
        intro same
        have held : variables.scopes.any (·.owner == frame.owner) = true :=
          List.any_eq_true.mpr ⟨scope, present, by simp [sameOwner, same]⟩
        simp [held] at absent
    · contradiction
  rw [insertFrame_scopes]
  dsimp only
  rw [filter_canonicalInsertBy_rejected _ (fun scope => decide (scope.owner = owner)) frame variables.scopes distinct]
  exact selected

/-! ## Frame insertion off every chain

A frame inserted for an identity that no live occurrence carries lies on no resolving chain
(`occurrenceChain_live`), so every nested read, frame evaluation and read set stays as it was. Two
declared entries of one batch rely on this for each other's frames (CSD-PREPARE-01). -/

/-- A frame inserted for another owner leaves every owner's frames as they were. -/
theorem framesAt_insertFrame_other (variables : ScopedVariables) (frame : ScopeVariableScope)
    (owner : ScopeOccurrenceId) (distinct : owner ≠ frame.owner) :
    framesAt (insertFrame variables frame).scopes owner = framesAt variables.scopes owner := by
  rw [insertFrame_scopes]
  simp only [framesAt]
  exact filter_canonicalInsertBy_rejected _ _ frame variables.scopes
    (by simpa only [beq_eq_false_iff_ne] using Ne.symm distinct)

theorem resolveOwner?_insertFrame_off (variables : ScopedVariables) (frame : ScopeVariableScope)
    (name : String) :
    ∀ chain : List ScopeOccurrenceId, (∀ member ∈ chain, member ≠ frame.owner) →
      resolveOwner? (insertFrame variables frame).scopes chain name = resolveOwner? variables.scopes chain name
  | [], _ => by simp [resolveOwner?]
  | occurrence :: rest, off => by
      have later := resolveOwner?_insertFrame_off variables frame name rest
        (fun member inside => off member (List.mem_cons_of_mem _ inside))
      simp only [resolveOwner?, framesAt_insertFrame_other variables frame occurrence (off occurrence (by simp)), later]

theorem selectScopeVariables?_insertFrame_other (variables : ScopedVariables) (frame : ScopeVariableScope)
    (owner : ScopeOccurrenceId) (distinct : frame.owner ≠ owner) :
    selectScopeVariables? (insertFrame variables frame) owner = selectScopeVariables? variables owner := by
  unfold selectScopeVariables?
  rw [insertFrame_scopes]
  dsimp only
  rw [filter_canonicalInsertBy_rejected _ (fun scope => decide (scope.owner = owner)) frame variables.scopes
    (decide_eq_false distinct)]

private theorem read?_insertFrame_dead (program : Program) (occurrences : List RuntimeScopeOccurrence)
    (variables : ScopedVariables) (frame : ScopeVariableScope)
    (dead : ∀ occurrence ∈ occurrences, occurrence.id ≠ frame.owner) (reader : ScopeOccurrenceId) (name : String) :
    read? program occurrences (insertFrame variables frame) reader name = read? program occurrences variables reader name := by
  unfold read?
  cases chained : occurrenceChain occurrences reader with
  | none => rfl
  | some chain =>
      have off : ∀ member ∈ chain, member ≠ frame.owner := by
        intro member inside
        obtain ⟨occurrence, live, same⟩ := occurrenceChain_live occurrences reader chain chained member inside
        exact same ▸ dead occurrence live
      simp only [Option.bind_eq_bind, Option.bind_some, resolveOwner?_insertFrame_off variables frame name chain off]
      cases resolved : resolveOwner? variables.scopes chain name with
      | none => rfl
      | some owner =>
          cases owner with
          | process => simp [insertFrame_scopes]
          | frame owner =>
              have onChain := resolveOwner?_frame_on_chain variables chain name owner resolved
              simp [selectScopeVariables?_insertFrame_other variables frame owner (Ne.symm (off owner onChain))]

/-- CSD-PREPARE-01: inserting a frame for a dead identity other than `child` keeps `child`'s evaluated frame. -/
theorem evaluateFrame?_insertFrame_dead (program : Program) (state : RuntimeState) (frame : ScopeVariableScope)
    (dead : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ frame.owner)
    (record : ScopeLocalData) (child parent : ScopeOccurrenceId) (distinct : frame.owner ≠ child) :
    evaluateFrame? program { state with variables := insertFrame state.variables frame } record child parent =
      evaluateFrame? program state record child parent := by
  have reads : read? program state.scopeOccurrences (insertFrame state.variables frame) parent =
      read? program state.scopeOccurrences state.variables parent :=
    funext fun name => read?_insertFrame_dead program _ _ frame dead parent name
  have absent : (insertFrame state.variables frame).scopes.any (·.owner == child) =
      state.variables.scopes.any (·.owner == child) := by
    rw [insertFrame_scopes]
    apply Bool.eq_iff_iff.mpr
    simp only [List.any_eq_true, mem_canonicalInsertBy]
    constructor
    · rintro ⟨scope, inserted | member, same⟩
      · subst inserted
        exact absurd (by simpa only [beq_iff_eq] using same) distinct
      · exact ⟨scope, member, same⟩
    · rintro ⟨scope, member, same⟩
      exact ⟨scope, Or.inr member, same⟩
  unfold evaluateFrame?
  dsimp only
  rw [reads, absent]

/-- Only the nested scope-data profile has scope records. -/
theorem recordFor?_nested (program : Program) (scopeId : DefinitionScopeId) (record : ScopeLocalData)
    (found : recordFor? program scopeId = some record) : nestedScopeDataProgram program = true := by
  unfold recordFor? at found
  cases nested : nestedScopeDataProgram program with
  | false => simp [nested] at found
  | true => rfl

/-- CSD-PREPARE-01: inserting a frame for a dead identity keeps every read set. -/
theorem readSet?_insertFrame_dead (state : RuntimeState) (frame : ScopeVariableScope)
    (dead : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ frame.owner)
    (reader : ScopeOccurrenceId) (names : List String) :
    readSet? state.scopeOccurrences (insertFrame state.variables frame).scopes reader names =
      readSet? state.scopeOccurrences state.variables.scopes reader names := by
  unfold readSet?
  dsimp only
  cases chained : occurrenceChain state.scopeOccurrences reader with
  | none => rfl
  | some chain =>
      have off : ∀ member ∈ chain, member ≠ frame.owner := by
        intro member inside
        obtain ⟨occurrence, live, same⟩ := occurrenceChain_live _ reader chain chained member inside
        exact same ▸ dead occurrence live
      have owners : (fun name => resolveOwner? (insertFrame state.variables frame).scopes chain name) =
          fun name => resolveOwner? state.variables.scopes chain name :=
        funext fun name => resolveOwner?_insertFrame_off state.variables frame name chain off
      simp only [Option.bind_eq_bind, Option.bind_some, owners]

/-- Frame evaluation reads only the occurrences, the frames and the Process data. -/
theorem evaluateFrame?_frame (program : Program) (state after : RuntimeState)
    (occurrences : after.scopeOccurrences = state.scopeOccurrences)
    (scopes : after.variables.scopes = state.variables.scopes)
    (process : after.variables.process = state.variables.process)
    (record : ScopeLocalData) (child parent : ScopeOccurrenceId) :
    evaluateFrame? program after record child parent = evaluateFrame? program state record child parent := by
  have reads : read? program after.scopeOccurrences after.variables parent =
      read? program state.scopeOccurrences state.variables parent := funext fun name => by
    unfold read? selectScopeVariables?
    simp only [occurrences, scopes, process]
  unfold evaluateFrame?
  simp only [reads, scopes]

/-- A read set reads only the occurrences and the frames. -/
theorem readSet?_frame (state after : RuntimeState)
    (occurrences : after.scopeOccurrences = state.scopeOccurrences)
    (scopes : after.variables.scopes = state.variables.scopes) (reader : ScopeOccurrenceId) (names : List String) :
    readSet? after.scopeOccurrences after.variables.scopes reader names =
      readSet? state.scopeOccurrences state.variables.scopes reader names := by
  unfold readSet?
  rw [occurrences, scopes]

private theorem mapM_some_mem {α β : Type} (f : α → Option β) :
    ∀ (xs : List α) (ys : List β), xs.mapM f = some ys → ∀ x ∈ xs, ∃ y ∈ ys, f x = some y
  | [], _, _, _, inside => by simp at inside
  | x :: xs, ys, mapped, z, inside => by
      simp only [List.mapM_cons, bind, Option.bind_eq_some_iff, pure, Option.some.injEq] at mapped
      obtain ⟨y, found, rest, restMapped, rfl⟩ := mapped
      rcases List.mem_cons.mp inside with rfl | later
      · exact ⟨y, by simp, found⟩
      · obtain ⟨w, member, same⟩ := mapM_some_mem f xs rest restMapped z later
        exact ⟨w, List.mem_cons_of_mem _ member, same⟩

private theorem mapM_congr_mem {α β : Type} (f g : α → Option β) :
    ∀ (xs : List α), (∀ x ∈ xs, f x = g x) → xs.mapM f = xs.mapM g
  | [], _ => rfl
  | x :: xs, same => by
      simp only [List.mapM_cons, same x (by simp),
        mapM_congr_mem f g xs (fun y inside => same y (List.mem_cons_of_mem _ inside))]

private theorem resolveOwner?_congr (scopes scopes' : List ScopeVariableScope) (name : String) :
    ∀ chain : List ScopeOccurrenceId, (∀ member ∈ chain, framesAt scopes' member = framesAt scopes member) →
      resolveOwner? scopes' chain name = resolveOwner? scopes chain name
  | [], _ => rfl
  | member :: rest, same => by
      simp only [resolveOwner?, same member (by simp),
        resolveOwner?_congr scopes scopes' name rest (fun other inside => same other (List.mem_cons_of_mem _ inside))]

private theorem mapM_some_mem_right {α β : Type} (f : α → Option β) :
    ∀ (xs : List α) (ys : List β), xs.mapM f = some ys → ∀ y ∈ ys, ∃ x ∈ xs, f x = some y
  | [], ys, mapped, y, inside => by
      simp only [List.mapM_nil, pure, Option.some.injEq] at mapped
      simp [← mapped] at inside
  | x :: xs, ys, mapped, y, inside => by
      simp only [List.mapM_cons, bind, Option.bind_eq_some_iff, pure, Option.some.injEq] at mapped
      obtain ⟨z, found, rest, restMapped, rfl⟩ := mapped
      rcases List.mem_cons.mp inside with rfl | later
      · exact ⟨x, by simp, found⟩
      · obtain ⟨w, member, same⟩ := mapM_some_mem_right f xs rest restMapped y later
        exact ⟨w, List.mem_cons_of_mem _ member, same⟩

/-- A read set's links are live occurrences. -/
theorem readSet?_links_live (occurrences : List RuntimeScopeOccurrence) (scopes : List ScopeVariableScope)
    (reader : ScopeOccurrenceId) (names : List String) (reads : ReadSet)
    (read : readSet? occurrences scopes reader names = some reads) : ∀ link ∈ reads.links, link ∈ occurrences := by
  unfold readSet? at read
  cases chained : occurrenceChain occurrences reader with
  | none => simp [chained] at read
  | some chain =>
    cases resolved : names.mapM (resolveOwner? scopes chain) with
    | none => simp [chained, resolved] at read
    | some owners =>
      cases linked : chain.mapM (fun id => occurrences.find? (·.id == id)) with
      | none => simp [chained, resolved, linked] at read
      | some links =>
        simp only [chained, resolved, linked, bind, Option.bind, Option.some.injEq] at read
        subst read
        intro link inside
        obtain ⟨_, _, found⟩ := mapM_some_mem_right _ chain links linked link inside
        exact List.mem_of_find?_eq_some found

/-- What a state keeps of a read set: each link's occurrences and frames. -/
@[expose] def ReadSet.Kept (reads : ReadSet) (state after : RuntimeState) : Prop :=
  ∀ link ∈ reads.links,
    after.scopeOccurrences.filter (fun scope => decide (scope.id = link.id)) =
      state.scopeOccurrences.filter (fun scope => decide (scope.id = link.id)) ∧
    after.variables.scopes.filter (fun frame => decide (frame.owner = link.id)) =
      state.variables.scopes.filter (fun frame => decide (frame.owner = link.id))

private theorem readSet?_chain_kept (state after : RuntimeState) (reader : ScopeOccurrenceId)
    (names : List String) (reads : ReadSet) (read : readSet? state.scopeOccurrences state.variables.scopes reader names = some reads)
    (kept : reads.Kept state after) :
    ∃ chain, occurrenceChain state.scopeOccurrences reader = some chain ∧
      occurrenceChain after.scopeOccurrences reader = some chain ∧
      ∀ member ∈ chain, after.scopeOccurrences.filter (·.id == member) =
          state.scopeOccurrences.filter (·.id == member) ∧
        framesAt after.variables.scopes member = framesAt state.variables.scopes member := by
  unfold readSet? at read
  cases chained : occurrenceChain state.scopeOccurrences reader with
  | none => simp [chained] at read
  | some chain =>
    cases resolved : names.mapM (resolveOwner? state.variables.scopes chain) with
    | none => simp [chained, resolved] at read
    | some owners =>
      cases linked : chain.mapM (fun id => state.scopeOccurrences.find? (·.id == id)) with
      | none => simp [chained, resolved, linked] at read
      | some links =>
        simp only [chained, resolved, linked, bind, Option.bind, Option.some.injEq] at read
        subst read
        have members : ∀ member ∈ chain, after.scopeOccurrences.filter (·.id == member) =
            state.scopeOccurrences.filter (·.id == member) ∧
            framesAt after.variables.scopes member = framesAt state.variables.scopes member := by
          intro member inside
          obtain ⟨link, linkInside, found⟩ := mapM_some_mem _ chain links linked member inside
          have same : link.id = member := by simpa using List.find?_some found
          have both := kept link linkInside
          rw [same] at both
          exact both
        exact ⟨chain, rfl, occurrenceChain_transfer _ _ reader chain chained (fun member inside =>
          (members member inside).1), members⟩

/-- CSD-PREPARE-01 read frame: a state that keeps each link's occurrences and frames resolves the read set
as before, whatever it changes off the chain. -/
theorem readSet?_kept (state after : RuntimeState) (reader : ScopeOccurrenceId) (names : List String)
    (reads : ReadSet) (read : readSet? state.scopeOccurrences state.variables.scopes reader names = some reads) (kept : reads.Kept state after) :
    readSet? after.scopeOccurrences after.variables.scopes reader names = some reads := by
  obtain ⟨chain, before, moved, members⟩ := readSet?_chain_kept state after reader names reads read kept
  have owners : names.mapM (resolveOwner? after.variables.scopes chain) =
      names.mapM (resolveOwner? state.variables.scopes chain) := by
    congr 1
    funext name
    exact resolveOwner?_congr _ _ name chain fun member inside => (members member inside).2
  have links : chain.mapM (fun id => after.scopeOccurrences.find? (·.id == id)) =
      chain.mapM (fun id => state.scopeOccurrences.find? (·.id == id)) :=
    mapM_congr_mem _ _ chain fun id inside => by
      rw [← List.head?_filter, ← List.head?_filter, (members id inside).1]
  rw [← read]
  unfold readSet?
  simp only [moved, before, bind, Option.bind, owners, links]

/-- NSD-READ-01 under the same frame: each name reads as before when the Process data is also kept. -/
theorem read?_kept (program : Program) (state after : RuntimeState) (reader : ScopeOccurrenceId)
    (names : List String) (reads : ReadSet) (read : readSet? state.scopeOccurrences state.variables.scopes reader names = some reads)
    (kept : reads.Kept state after) (process : after.variables.process = state.variables.process)
    (name : String) :
    read? program after.scopeOccurrences after.variables reader name =
      read? program state.scopeOccurrences state.variables reader name := by
  obtain ⟨chain, before, moved, members⟩ := readSet?_chain_kept state after reader names reads read kept
  unfold read?
  simp only [moved, before, bind, Option.bind]
  rw [resolveOwner?_congr _ _ name chain fun member inside => (members member inside).2]
  cases resolved : resolveOwner? state.variables.scopes chain name with
  | none => rfl
  | some owner =>
    cases owner with
    | process => simp only [process]
    | frame owner =>
      have onChain := resolveOwner?_frame_on_chain state.variables chain name owner resolved
      have frames : after.variables.scopes.filter (fun scope => decide (scope.owner = owner)) =
          state.variables.scopes.filter (fun scope => decide (scope.owner = owner)) := (members owner onChain).2
      unfold selectScopeVariables?
      dsimp only
      rw [frames]

private theorem mapM_some_of_mem {α β : Type} (f : α → Option β) :
    ∀ xs : List α, (∀ x ∈ xs, (f x).isSome) → ∃ ys, xs.mapM f = some ys
  | [], _ => ⟨[], rfl⟩
  | x :: xs, found => by
      obtain ⟨y, here⟩ := Option.isSome_iff_exists.mp (found x (by simp))
      obtain ⟨ys, rest⟩ := mapM_some_of_mem f xs fun other inside => found other (List.mem_cons_of_mem _ inside)
      exact ⟨y :: ys, by simp [List.mapM_cons, here, rest]⟩

/-- Reading each of `names` resolves their read set: the reads walk the same chain and resolve each owner. -/
theorem readSet?_of_reads (program : Program) (state : RuntimeState) (reader : ScopeOccurrenceId)
    (names : List String) (nonempty : names ≠ [])
    (readable : ∀ name ∈ names, (read? program state.scopeOccurrences state.variables reader name).isSome) :
    ∃ reads, readSet? state.scopeOccurrences state.variables.scopes reader names = some reads := by
  obtain ⟨first, firstInside⟩ := List.exists_mem_of_ne_nil names nonempty
  have firstRead := readable first firstInside
  unfold read? at firstRead
  cases chained : occurrenceChain state.scopeOccurrences reader with
  | none => simp [chained] at firstRead
  | some chain =>
    obtain ⟨owners, resolved⟩ := mapM_some_of_mem (resolveOwner? state.variables.scopes chain) names
      fun name inside => by
        have named := readable name inside
        unfold read? at named
        cases owner : resolveOwner? state.variables.scopes chain name with
        | none => simp [chained, owner] at named
        | some _ => rfl
    obtain ⟨links, linked⟩ := mapM_some_of_mem (fun id => state.scopeOccurrences.find? (·.id == id)) chain
      fun member inside => by
        obtain ⟨occurrence, live, same⟩ := occurrenceChain_live _ reader chain chained member inside
        exact List.find?_isSome.mpr ⟨occurrence, live, by simp [same]⟩
    unfold readSet?
    simp only [chained, resolved, linked, bind, Option.bind]
    exact ⟨_, rfl⟩

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
