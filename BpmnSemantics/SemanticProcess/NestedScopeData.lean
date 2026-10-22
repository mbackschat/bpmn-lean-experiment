import BpmnSemantics.SemanticProcess.ScopeVariableData
import BpmnSemantics.SemanticProcess.EffectDataMapping

/-! # Nested embedded scope data

Name resolution, frame initialization and output writes for `nestedScopeDataProfileId`, per the
[nested scope data specification](../../docs/capsules/NESTED-EMBEDDED-SCOPE-DATA-SPEC.md#stable-rules).
A frame is the existing occurrence-keyed `ScopeVariableScope`; a scope's declarations are the
Program's `scopeLocalData` record for its definition.

The chain is walked over definition scopes, selecting the live frame of each one in the reading
instance. Under the profile's admission every definition is activated at most once per instance, so
that frame is the frame of the actual ancestor occurrence. A definition with more than one live frame
refuses instead of choosing by storage order, so a later repeated-activation account must replace
this lookup rather than inherit an arbitrary choice. Every operation here depends only on the Program
and `ScopedVariables`, never on scope-occurrence bookkeeping.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def nestedScopeDataProgram (program : Program) : Bool :=
  program.identity.semanticProfile == nestedScopeDataProfileId

theorem nestedScopeDataProgram_of_profile_value {program : Program} {value : String}
    (selected : program.identity.semanticProfile.value = value)
    (distinct : value ≠ nestedScopeDataProfileId.value := by decide +kernel) : nestedScopeDataProgram program = false := by
  simp only [nestedScopeDataProgram, beq_eq_false_iff_ne]
  intro same
  apply distinct
  rw [← selected, same]

namespace NestedScopeData

/-- Only the nested scope-data profile consults its table, so a Program of any other profile behaves
identically whatever table it carries; admission separately refuses such a table. -/
def recordFor? (program : Program) (scopeId : DefinitionScopeId) : Option ScopeLocalData :=
  if nestedScopeDataProgram program then
    match program.scopeLocalData.filter (·.scopeId == scopeId) with
    | [record] => some record
    | _ => none
  else none

def parentScope? (scopes : List DefinitionScope) (scopeId : DefinitionScopeId) : Option DefinitionScopeId :=
  match scopes.filter (·.id == scopeId) with
  | [scope] => scope.parentScopeId
  | _ => none

/-- `scopeId` and its ancestors, innermost first; the fuel bound terminates a cyclic parent relation. -/
def chainWithin (scopes : List DefinitionScope) : Nat → DefinitionScopeId → List DefinitionScopeId
  | 0, _ => []
  | fuel + 1, scopeId => scopeId :: match parentScope? scopes scopeId with
      | some parent => chainWithin scopes fuel parent
      | none => []

/-- Takes only the scope table, not the Program, so a Program differing elsewhere (for example in
erased Compensation snapshots) yields a definitionally equal chain without unfolding the walk. -/
def definitionChain (scopes : List DefinitionScope) (scopeId : DefinitionScopeId) : List DefinitionScopeId :=
  chainWithin scopes scopes.length scopeId

def framesOf (scopes : List ScopeVariableScope) (instanceId : SemanticId) (scopeId : DefinitionScopeId) :
    List ScopeVariableScope :=
  scopes.filter fun frame =>
    frame.owner.processInstanceId == instanceId && frame.owner.definitionScopeId == scopeId

/-- The `camunda:in`/`camunda:out` copies of the unique invocation creating `scopeId`, when that
scope is a called root of this profile; the frame such an invocation installs stands in for the
called instance's Process data (CVM-RESOLVE-01). -/
def calledRootMappings? (program : Program) (scopeId : DefinitionScopeId) :
    Option (List VariableMapping × List VariableMapping) :=
  if nestedScopeDataProgram program then
    match program.operations.filter (fun
        | .invokeProcess _ _ _ _ calledRootScopeId .. => calledRootScopeId == scopeId
        | _ => false) with
    | [.invokeProcess _ _ _ _ _ _ _ (.variableMappings inputs outputs)] => some (inputs, outputs)
    | _ => none
  else none

/-- The called root a definition chain ends at, if any; resolution from it never reaches the hosting
instance's Process data. -/
def calledRootOf? (program : Program) (chain : List DefinitionScopeId) : Option DefinitionScopeId :=
  match chain.getLast? with
  | some scopeId => if (calledRootMappings? program scopeId).isSome then some scopeId else none
  | none => none

inductive Owner where
  | frame (owner : ScopeOccurrenceId)
  | process
  deriving Repr, DecidableEq

/-- NSD-READ-01 and NSD-WRITE-01: the nearest chain scope whose frame declares `name`, a present
null included, else the Process. Only the frames are an argument, so resolution is definitionally
unaffected by Activity-local or Process data. -/
def resolveOwner? (scopes : List ScopeVariableScope) (instanceId : SemanticId) :
    List DefinitionScopeId → String → Option Owner
  | [], _ => some .process
  | scopeId :: rest, name =>
      match framesOf scopes instanceId scopeId with
      | [] => resolveOwner? scopes instanceId rest name
      | [frame] =>
          if frame.bindings.any (·.name == name) then some (.frame frame.owner)
          else resolveOwner? scopes instanceId rest name
      | _ => none

/-- NSD-READ-01 from the scope `scopeId` of instance `instanceId`; every value is re-validated as a
`SingletonBusinessItem`, so a stored binding is never trusted for having been written earlier. -/
def read? (program : Program) (variables : ScopedVariables) (instanceId : SemanticId)
    (scopeId : DefinitionScopeId) (name : String) : Option VariableValue := do
  let chain := definitionChain program.definitionScopes scopeId
  match ← resolveOwner? variables.scopes instanceId chain name with
  | .process =>
      match calledRootOf? program chain with
      | none => enclosingVariableUnder? .singletonBusinessItem variables.process.bindings name
      | some _ => none
  | .frame owner =>
      let frame ← selectScopeVariables? variables owner
      enclosingVariableUnder? .singletonBusinessItem frame.bindings name

/-- A binding read that keeps absence apart from refusal: `some none` for no binding, `none` for a
repeated binding or a value outside the item domain. Call mappings copy an absent name as a present
null (CVM-IN-01, CVM-OUT-01) but never fabricate one for a refused read. -/
def bindingOutcome? (bindings : List VariableBinding) (name : String) : Option (Option VariableValue) :=
  match bindings.filter (·.name == name) with
  | [] => some none
  | [binding] =>
      if EffectMappingValuePolicy.singletonBusinessItem.admits true binding.value then some (some binding.value)
      else none
  | _ => none

/-- NSD-READ-01 with absence kept apart from refusal; an undeclared name at a called root is absent. -/
def readOutcome? (program : Program) (variables : ScopedVariables) (instanceId : SemanticId)
    (scopeId : DefinitionScopeId) (name : String) : Option (Option VariableValue) := do
  let chain := definitionChain program.definitionScopes scopeId
  match ← resolveOwner? variables.scopes instanceId chain name with
  | .process =>
      match calledRootOf? program chain with
      | none => bindingOutcome? variables.process.bindings name
      | some root =>
          let [_] := framesOf variables.scopes instanceId root | none
          some none
  | .frame owner =>
      let frame ← selectScopeVariables? variables owner
      bindingOutcome? frame.bindings name

/-- NSD-WRITE-01: update the nearest declaring frame, else create or replace the Process binding, or
the called-root frame's binding when the chain ends at a called root (CVM-RESOLVE-01, as CIB's
`setVariable` creates on the process instance); never create a local and never touch another frame. -/
def write? (program : Program) (variables : ScopedVariables) (instanceId : SemanticId)
    (scopeId : DefinitionScopeId) (binding : VariableBinding) : Option ScopedVariables := do
  let chain := definitionChain program.definitionScopes scopeId
  match ← resolveOwner? variables.scopes instanceId chain binding.name with
  | .process =>
      match calledRootOf? program chain with
      | none =>
          some { variables with process :=
            { bindings := mergeProcessVariableBindings variables.process.bindings [binding] } }
      | some root =>
          let [frame] := framesOf variables.scopes instanceId root | none
          some { variables with scopes := variables.scopes.map fun candidate =>
            if candidate.owner = frame.owner then
              { candidate with bindings := mergeProcessVariableBindings candidate.bindings [binding] }
            else candidate }
  | .frame owner =>
      let _ ← selectScopeVariables? variables owner
      some { variables with scopes := variables.scopes.map fun frame =>
        if frame.owner = owner then
          { frame with bindings := mergeProcessVariableBindings frame.bindings [binding] }
        else frame }

def writeAll? (program : Program) (variables : ScopedVariables) (instanceId : SemanticId)
    (scopeId : DefinitionScopeId) : List VariableBinding → Option ScopedVariables
  | [] => some variables
  | binding :: rest => do
      writeAll? program (← write? program variables instanceId scopeId binding) instanceId scopeId rest

/-- The unique live occurrence of `scopeId` together with its live parent occurrence. -/
def occurrenceWithParent? (state : RuntimeState) (scopeId : DefinitionScopeId) :
    Option (ScopeOccurrenceId × ScopeOccurrenceId) := do
  let [occurrence] := state.scopeOccurrences.filter (·.id.definitionScopeId == scopeId) | none
  let parent ← occurrence.parent
  some (occurrence.id, parent)

/-- NSD-INIT-01 after the entry rewrite: inputs read the parent's whole chain before the new frame
exists, so neither declaration order nor a sibling input can influence a value. A scope without a
record installs no frame and leaves the state exactly as entry produced it. -/
def initializeFrame? (program : Program) (state : RuntimeState) (childScopeId : DefinitionScopeId) :
    Option RuntimeState :=
  match recordFor? program childScopeId with
  | none => some state
  | some record => do
      let (child, parent) ← occurrenceWithParent? state childScopeId
      let bindings ← evaluateInputMappingsUnder? .singletonBusinessItem
        (read? program state.variables parent.processInstanceId parent.definitionScopeId) record.localInputs
      if !scopeVariableNamesUnique bindings || state.variables.scopes.any (·.owner == child) then none
      else
        let frame : ScopeVariableScope :=
          { owner := child, bindings := mergeProcessVariableBindings [] bindings }
        let scopes := canonicalInsertBy (fun left right => scopeOwnerBefore left.owner right.owner)
          frame state.variables.scopes
        some { state with variables := { state.variables with scopes } }

/-- NSD-OUTPUT-01 before the completion rewrite disposes the frame: every source is read from the
completing frame before any write, and the writes start at the parent, so no output can change
another output's source. -/
def writeOutputs? (program : Program) (state : RuntimeState) (scopeId : DefinitionScopeId) :
    Option RuntimeState :=
  match recordFor? program scopeId with
  | none => some state
  | some record => do
      let (child, parent) ← occurrenceWithParent? state scopeId
      let frame ← selectScopeVariables? state.variables child
      let values ← record.localOutputs.mapM fun mapping => match mapping.expression with
        | .localVariable source => do
            let value ← enclosingVariableUnder? .singletonBusinessItem frame.bindings source
            some ({ name := mapping.target, value } : VariableBinding)
        | _ => none
      let variables ←
        writeAll? program state.variables parent.processInstanceId parent.definitionScopeId values
      some { state with variables }

/-- Frame installation touches only data, so every control, wait and occurrence fact survives it. -/
theorem initializeFrame?_variables_only (program : Program) (state written : RuntimeState)
    (childScopeId : DefinitionScopeId) (installed : initializeFrame? program state childScopeId = some written) :
    written = { state with variables := written.variables } := by
  unfold initializeFrame? at installed
  split at installed
  · cases installed; rfl
  · simp only [Option.bind_eq_bind, Option.bind_eq_some_iff] at installed
    obtain ⟨_, _, _, _, installed⟩ := installed
    split at installed
    · contradiction
    · cases installed; rfl

/-- Output writes touch only data, so every control, wait and occurrence fact survives them. -/
theorem writeOutputs?_variables_only (program : Program) (state written : RuntimeState)
    (scopeId : DefinitionScopeId) (wrote : writeOutputs? program state scopeId = some written) :
    written = { state with variables := written.variables } := by
  unfold writeOutputs? at wrote
  split at wrote
  · cases wrote; rfl
  · simp only [Option.bind_eq_bind, Option.bind_eq_some_iff] at wrote
    obtain ⟨_, _, _, _, _, _, _, _, wrote⟩ := wrote
    cases wrote; rfl

end NestedScopeData
end BpmnSemantics.SemanticProcess
