module

public import BpmnSemantics.SemanticProcess.SequentialScopeCheckedAdmission
public import BpmnSemantics.SemanticProcess.CheckedGraphValidation
public import BpmnSemantics.SemanticProcess.CallActivityAdmission
public import BpmnSemantics.SemanticProcess.CallDataAdmission
public import BpmnSemantics.SemanticProcess.RepeatableSubscriptionAdmission
public import BpmnSemantics.SemanticProcess.SequentialScopeProgramAdmission

/-! PMIS-ADMIT-01 checks the source graph independently of lowering; it grants no execution capability. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.ParallelScopeChecked

def nodeAllowed : CheckedNode → Bool
  | .noneStartEvent .. | .noneEndEvent .. | .parallelGateway .. | .parallelMultiInstanceSubProcess .. => true
  | .userTask _ _ none | .serviceTask _ _ _ _ none => true
  | _ => false

def admitted (source : CheckedProcess) : Bool := (analyze source).isSome
where
  analyze (source : CheckedProcess) : Option Unit := do
    let identities := source.processId.value :: source.nodes.map (·.id.value) ++ source.sequenceFlows.map (·.id.value)
    if source.identity.semanticProfile.value != "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" ||
        source.identity.sourceOverlay.isNone || source.definitionScopes.length != 2 ||
        source.compensation.isSome || source.transactionCancellation.isSome || !source.interruptingMessageEventSubProcesses.isEmpty ||
        identities.eraseDups.length != identities.length || !(source.sequenceFlows.all (·.condition.isNone)) ||
        !(source.nodes.all nodeAllowed) || source.nodes.length + 1 > 1024 then none
    else do
      let [entry] := source.nodes.filter (fun node => match node with | .parallelMultiInstanceSubProcess .. => true | _ => false) | none
      let .parallelMultiInstanceSubProcess entryId childScope collection item inputs condition := entry | none
      let [root] := source.definitionScopes.filter (·.parentScopeId.isNone) | none
      if root.originElementId.value != source.processId.value || root.id == childScope ||
          !(source.definitionScopes.any fun scope => scope.id == childScope && scope.parentScopeId == some root.id && scope.originElementId == entryId) ||
          source.nodeScopes.length != source.nodes.length || source.sequenceFlowScopes.length != source.sequenceFlows.length ||
          !(source.nodes.all fun node => match source.nodeScopes.filter (·.nodeId == node.id) with
            | [owner] => owner.scopeId == root.id || owner.scopeId == childScope
            | _ => false) ||
          !(source.sequenceFlows.all fun flow => match source.sequenceFlowScopes.filter (·.sequenceFlowId == flow.id),
              checkedNodeScopeId? source flow.sourceId, checkedNodeScopeId? source flow.targetId with
            | [owner], some sourceScope, some targetScope => owner.scopeId == sourceScope && sourceScope == targetScope
            | _, _, _ => false) ||
          !SequentialScopeChecked.dataValid source collection item inputs condition then none
      else do
        let owns := fun id scope => source.nodeScopes.any (fun owner => owner.nodeId == id && owner.scopeId == scope)
        if !owns entryId root.id then none
        else do
          -- Lowering emits operation:<node> and operation:complete-scope:<scope>; the child Start emits no operation.
          -- PMIS-ADMIT-01 requires uniqueness across source-backed and generated operations.
          let emitted := source.nodes.filterMap fun node => match node with
            | .noneStartEvent id => if owns id childScope then none else some id.value
            | _ => some node.id.value
          let operationSuffixes := emitted ++ source.definitionScopes.map (fun scope => "complete-scope:" ++ scope.id.value)
          if operationSuffixes.eraseDups.length != operationSuffixes.length then none else do
            let parent := source.nodes.filter (fun node => owns node.id root.id)
            let child := source.nodes.filter (fun node => owns node.id childScope)
            let [start] := parent.filter (fun node => match node with | .noneStartEvent _ => true | _ => false) | none
            if !(child.any fun node => match node with | .userTask _ _ none => true | _ => false) ||
                !(child.any fun node => match node with | .serviceTask _ _ _ _ none => true | _ => false) then none
            else do
              -- PMIS-ADMIT-01: complete path consumption and acyclic paired contraction certify
              -- every owned node, including disconnection and cycles; sequential burst limits do not apply.
              let _ ← SequentialScopeChecked.parentPath .parallel parent.length source parent start.id false 0 0
              let _ ← StructuredParallelBody.structureOrder (← child.mapM (SequentialScopeChecked.bodyVertex? source))
              some ()

end BpmnSemantics.SemanticProcess.ParallelScopeChecked
