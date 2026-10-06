import BpmnSemantics.SemanticProcess.SequentialScopeControlAdmission
import BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission

/-! SMIS-ADMIT-01 checks source nodes directly; lowering is not an admission oracle. Generic scoped graph validation remains a separate conjunct. -/

namespace BpmnSemantics.SemanticProcess.SequentialScopeChecked

def successors (source : CheckedProcess) (id : NodeId) : List NodeId :=
  (source.sequenceFlows.filter (·.sourceId == id)).map (·.targetId)

def bodyVertex? (source : CheckedProcess) (node : CheckedNode) : Option StructuredParallelBody.Vertex := do
  let kind ← match node with
    | .noneStartEvent _ => some .start
    | .noneEndEvent _ => some .finish
    | .userTask _ _ none | .serviceTask _ _ _ _ none => some .task
    | .parallelGateway _ .diverging => some .fork
    | .parallelGateway _ .converging => some .join
    | _ => none
  return ⟨node.id.value, kind, (successors source node.id).map (·.value)⟩

inductive RepetitionMode where
  | sequential
  | parallel
  deriving DecidableEq

def parentPath (mode : RepetitionMode) : Nat → CheckedProcess → List CheckedNode → NodeId → Bool → Nat → Nat → Option (Nat × Nat)
  | 0, _, _, _, _, _, _ => none
  | fuel + 1, source, nodes, current, entered, before, after => do
      let node ← nodes.find? (·.id == current)
      let rest := nodes.filter (·.id != current)
      match node with
      | .noneEndEvent _ =>
          if entered && rest.isEmpty && (successors source current).isEmpty then some (before, after) else none
      | _ => do
          let [next] := successors source current | none
          match node with
          | .noneStartEvent _ =>
              if entered || before != 0 then none else parentPath mode fuel source rest next false before after
          | .sequentialMultiInstanceSubProcess .. =>
              if entered || mode != .sequential then none else parentPath mode fuel source rest next true before after
          | .parallelMultiInstanceSubProcess .. =>
              if entered || mode != .parallel then none else parentPath mode fuel source rest next true before after
          | .userTask _ _ none | .serviceTask _ _ _ _ none =>
              parentPath mode fuel source rest next entered (before + if entered then 0 else 1) (after + if entered then 1 else 0)
          | _ => none

def dataValid (source : CheckedProcess) (collection item : String)
    (inputs : List VariableMapping) (condition : Option String) : Bool :=
  let handlers := SerialBusinessTask.checkedHandlers source
  let reserved := [collection, item] ++ condition.toList
  let scalarReads := fun names => names.all fun name => name != collection && condition != some name
  reserved.eraseDups.length == reserved.length && reserved.all (SerialBusinessTask.nameAllowed handlers) &&
    SequentialScopeData.bodyMappingsValid handlers inputs &&
    !(inputs.any fun mapping => reserved.contains mapping.target) &&
    scalarReads (SerialBusinessTask.readNames inputs) &&
    source.nodes.all fun node => match node with
      | .serviceTask _ descriptor inputs outputs none =>
          SerialBusinessTask.descriptorValid descriptor && SerialBusinessTask.mappingsValid handlers inputs outputs &&
          scalarReads (SerialBusinessTask.readNames inputs) && !(outputs.any fun mapping => reserved.contains mapping.target)
      | .serviceTask .. => false
      | _ => true

/-- The returned bound includes entry, body turnover and the parent continuation under the shared closure limit. -/
def analyze (source : CheckedProcess) : Option Nat := do
  let identities := source.processId.value :: source.nodes.map (·.id.value) ++ source.sequenceFlows.map (·.id.value)
  if source.identity.semanticProfile.value != "cibseven-2.2.0-sequential-multi-instance-subprocess-draft" ||
      source.identity.sourceOverlay.isNone || source.definitionScopes.length != 2 ||
      source.compensation.isSome || source.transactionCancellation.isSome || !source.interruptingMessageEventSubProcesses.isEmpty ||
      identities.eraseDups.length != identities.length || !(source.sequenceFlows.all (·.condition.isNone)) then none
  else do
    let [entry] := source.nodes.filter (fun node => match node with | .sequentialMultiInstanceSubProcess .. => true | _ => false) | none
    let .sequentialMultiInstanceSubProcess entryId childScope collection item inputs condition := entry | none
    let [root] := source.definitionScopes.filter (·.parentScopeId.isNone) | none
    if !(source.definitionScopes.any fun scope => scope.id == childScope && scope.parentScopeId == some root.id && scope.originElementId == entryId) ||
        source.nodeScopes.length != source.nodes.length ||
        !(source.nodes.all fun node => match source.nodeScopes.filter (·.nodeId == node.id) with
          | [owner] => owner.scopeId == root.id || owner.scopeId == childScope
          | _ => false) || !dataValid source collection item inputs condition then none
    else do
      let owns := fun id scope => source.nodeScopes.any (fun owner => owner.nodeId == id && owner.scopeId == scope)
      if !owns entryId root.id then none
      else do
        let parent := source.nodes.filter (fun node => owns node.id root.id)
        let child := source.nodes.filter (fun node => owns node.id childScope)
        let [start] := parent.filter (fun node => match node with | .noneStartEvent _ => true | _ => false) | none
        if !(child.any fun node => match node with | .userTask _ _ none => true | _ => false) ||
            !(child.any fun node => match node with | .serviceTask _ _ _ _ none => true | _ => false) then none
        else do
          let (before, after) ← parentPath .sequential parent.length source parent start.id false 0 0
          let bursts ← StructuredParallelBody.analyze (← child.mapM (bodyVertex? source))
          let maximum := SequentialScopeControl.maximumBurst bursts before after
          if maximum > scenarioClosureLimit then none else some maximum

end BpmnSemantics.SemanticProcess.SequentialScopeChecked
