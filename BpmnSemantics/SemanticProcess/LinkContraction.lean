module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.EffectMappingValuePolicy

/-! LNK-PAIR-01, LNK-CONT-01 and LNK-PROFILE-01 of the [Link Events proposal](../../docs/capsules/LINK-EVENTS-PROPOSAL.md#representation-and-runtime-ownership): a Link throw and catch of one name behave as the Sequence Flow they replace (Clause 10.5.5), so a Link definition is admitted and lowered as its explicit-flow twin. The contraction runs only at the boundaries that see a raw Link graph; `checkedWellFormed` and `lowerCheckedProcess` stay Link-free, so their laws and fixtures are unchanged. The TypeScript twin is `link-contraction.ts`. -/

public section

namespace BpmnSemantics.SemanticProcess

private def linkThrows (nodes : List CheckedNode) : List (NodeId × String) :=
  nodes.filterMap fun
    | .linkThrowEvent id linkName => some (id, linkName)
    | _ => none

private def linkCatches (nodes : List CheckedNode) : List (NodeId × String) :=
  nodes.filterMap fun
    | .linkCatchEvent id linkName => some (id, linkName)
    | _ => none

/-- The parentless scope above `scope`; `none` when fuel runs out, so a cyclic parent chain fails closed. -/
private def scopeRoot? (scopes : List DefinitionScope) : Nat → DefinitionScopeId → Option DefinitionScope
  | 0, _ => none
  | fuel + 1, scopeId => do
      let scope ← scopes.find? (·.id == scopeId)
      match scope.parentScopeId with
      | none => some scope
      | some parent => scopeRoot? scopes fuel parent

/-- Every rule that must see a pair before it is removed. The throw's incoming flow `F` and the catch's outgoing flow
`G` must exist alone; `G` carries no condition, because CIB evaluates it on leaving the catch and removing it would take
it unconditionally; the four elements share a scope of the executed root Process (CIB `BpmnParse.java:313` keeps one
name space per resource, and Links in a called Process are excluded); `G` enters no Link throw, which excludes chains. -/
private def pairValid (source : CheckedProcess) (throwIds : List NodeId) (throwEvent catchEvent : NodeId × String) : Bool :=
  let flows := source.sequenceFlows
  let throwScope := checkedNodeScopeId? source throwEvent.1
  let entryRoot := throwScope.bind fun scopeId =>
    scopeRoot? source.definitionScopes (source.definitionScopes.length + 1) scopeId
  nonempty throwEvent.2 &&
    (flows.filter (·.targetId == throwEvent.1)).length == 1 &&
    !flows.any (·.sourceId == throwEvent.1) &&
    !flows.any (·.targetId == catchEvent.1) &&
    (match flows.filter (·.sourceId == catchEvent.1) with
      | [catchFlow] => catchFlow.condition.isNone && !throwIds.contains catchFlow.targetId
      | _ => false) &&
    throwScope.isSome && throwScope == checkedNodeScopeId? source catchEvent.1 &&
    entryRoot.any (·.originElementId.value == source.processId.value)

/-- The raw identity rules the contracted graph can no longer show for its removed elements. -/
private def rawIdentityValid (source : CheckedProcess) : Bool :=
  let nodeIds := source.nodes.map (·.id.value)
  let flowIds := source.sequenceFlows.map (·.id.value)
  sourceOwnershipValid source &&
    strictlySortedStrings nodeIds && strictlySortedStrings flowIds &&
    nodeIds.all nonempty && flowIds.all nonempty &&
    !nodeIds.any flowIds.contains

/-- The explicit-flow twin: each throw's incoming flow is retargeted to its catch's successor, and the throw, the
catch, the catch's outgoing flow and their ownership entries are removed. The graph itself when it holds no Link arm;
`none` for any excluded pairing form or for a Link arm under another profile. -/
def contractLinks? (source : CheckedProcess) : Option CheckedProcess :=
  let throws := linkThrows source.nodes
  let catches := linkCatches source.nodes
  if throws.isEmpty && catches.isEmpty then some source
  else
    let throwIds := throws.map (·.1)
    let pairs := throws.filterMap fun throwEvent =>
      (catches.find? (·.2 == throwEvent.2)).map (throwEvent, ·)
    let names := throws.map (·.2)
    let catchNames := catches.map (·.2)
    let valid :=
      source.identity.semanticProfile == nestedScopeDataProfileId &&
        rawIdentityValid source &&
        names.Nodup && catchNames.Nodup &&
        pairs.length == throws.length && throws.length == catches.length &&
        pairs.all fun (throwEvent, catchEvent) => pairValid source throwIds throwEvent catchEvent
    if !valid then none
    else
      let catchIds := catches.map (·.1)
      let catchFlows := source.sequenceFlows.filter fun flow => catchIds.contains flow.sourceId
      let removedFlowIds := catchFlows.map (·.id)
      let successor? (throwId : NodeId) : Option NodeId := do
        let (_, catchEvent) ← pairs.find? (·.1.1 == throwId)
        let catchFlow ← catchFlows.find? (·.sourceId == catchEvent.1)
        pure catchFlow.targetId
      let removed (id : NodeId) := throwIds.contains id || catchIds.contains id
      some { source with
        nodes := source.nodes.filter fun node => !removed node.id
        nodeScopes := source.nodeScopes.filter fun ownership => !removed ownership.nodeId
        sequenceFlows := (source.sequenceFlows.filter fun flow => !removedFlowIds.contains flow.id).map fun flow =>
          match successor? flow.targetId with
          | some target => { flow with targetId := target }
          | none => flow
        sequenceFlowScopes := source.sequenceFlowScopes.filter fun ownership =>
          !removedFlowIds.contains ownership.sequenceFlowId }

/-- Well-formedness of a definition that may hold Link pairs: its contraction exists and is well formed. -/
def linkedCheckedWellFormed (source : CheckedProcess) : Bool :=
  match contractLinks? source with
  | some contracted => checkedWellFormed contracted
  | none => false

/-- The lowering of the contraction. Like `lowerCheckedProcess`, it claims meaning only under `linkedCheckedWellFormed`;
a refused contraction lowers the raw graph, whose Link arms lower to no operation. -/
def lowerLinkedCheckedProcess (source : CheckedProcess) : Program :=
  lowerCheckedProcess ((contractLinks? source).getD source)

/-- `definitionBindingValid` over the contraction. -/
def linkedDefinitionBindingValid (source : CheckedProcess) (program : Program) : Bool :=
  match contractLinks? source with
  | some contracted => definitionBindingValid contracted program
  | none => false

end BpmnSemantics.SemanticProcess
