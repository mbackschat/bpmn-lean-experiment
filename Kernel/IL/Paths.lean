module

public import Kernel.IL.Types

/-! # Sequence Flow paths

Where a token goes on from an element, and whether a Sequence Flow path leads from one element to another through
nodes that are no Activity and leave no record. `Kernel.Feature.Compensation` orders handlers along such paths
(BPMN 2.0.2 §13.5.5, issue #96) and `Kernel.Admission.Scopes` refuses a model whose records could not show the path a
token took, so the order the kernel runs and the models admission accepts derive from this one relation.

The structural order (`structurallyBefore`) is the order of compensation records completed in one closure under
`BranchSchedule.orderInvariant` (DC15 (c), candidate (iii)): it reads the program only, so no schedule changes it. A
later causal order may refine it only where it leaves records unordered.
-/

public section

namespace Kernel

/-- The flows a token continues on after `element`: its outgoing flows and, for a throwing Link, the outgoing flows of
the catching Link of its name among its siblings (`Kernel.Admission.Flow.link` admits exactly one). -/
def onward (program : Program) (element : Element) : List FlowId :=
  let link := (element.event?.bind fun (header, payload) => payload.linkThrow?.map (header, ·)).map fun (header, name) =>
    (program.siblings header).flatMap fun other =>
      if (other.event?.bind (·.2.linkCatch?)) == some name then other.outgoing else []
  element.outgoing ++ link.getD []

/-- Whether a path runs through the element: a Gateway or an intermediate Event, which is no Activity and leaves no
record. An Activity ends a path, since its own record, if any, carries the order on. -/
def transits (program : Program) (id : ElementId) : Bool :=
  (program.element? id).any fun element =>
    element.gateway?.isSome || element.event?.any (·.2.placement == .intermediate)

/-- Whether a Sequence Flow path leads from one of `sources`, elements or boundary Events, to `target` through elements
that `transits` only. A Link pair continues the path like a flow. Each round visits only elements not visited before,
so the element count bounds the walk and a cycle of transit elements ends it. -/
def flowReaches (program : Program) (sources : List ElementId) (target : ElementId) : Bool :=
  let leaving (id : ElementId) : List FlowId :=
    match program.element? id with
    | some element => onward program element
    | none => ((program.boundary? id).map (·.2.outgoing)).getD []
  let rec go : Nat → List ElementId → List ElementId → Bool
    | 0, _, _ => false
    | fuel + 1, seen, frontier =>
      let next := (frontier.flatMap leaving).filterMap program.target?
      let fresh := (next.filter fun id => transits program id && !seen.contains id).eraseDups
      next.contains target || (!fresh.isEmpty && go fuel (seen ++ fresh) fresh)
  go (program.elements.length + 1) [] sources

/-- The children an occurrence of the Scope `id` begins on entry: its start Events, or, without one, the children
that begin implicitly (`Element.beginsImplicitly`), as `Kernel.Feature.Scopes.implicitStart` begins them. -/
def Program.enteredChildren (program : Program) (id : ElementId) : List Element :=
  let children := program.children (some id)
  if children.any (·.start?.isSome) then children.filter (·.start?.isSome) else children.filter (·.beginsImplicitly)

/-- A point of the structural order's walk: a token entering an element, or an element completing. -/
inductive StructuralNode where
  | enters (element : ElementId)
  | completes (element : ElementId)
  deriving DecidableEq

/-- Where the structural order's walk goes from `node`, within one closure as far as the program shows it: an element
that completes passes its token on along its onward flows, or, ending it there, completes its enclosing Scope once
idle; an element entered that waits for an input stops the walk, a Scope begins its entered children and completes
once they end, every other element completes, and the boundary Events of an element entered may fire. Signal,
Conditional and Error or Escalation Event Sub-Process paths are not followed: admission's exact closure reach covers
them and refuses where they could reverse this order. -/
def structuralNext (program : Program) : StructuralNode → List StructuralNode
  | .completes id =>
    match program.element? id with
    | some element =>
      let next := onward program element
      if next.isEmpty then (element.header.parent.map StructuralNode.completes).toList
      else (next.filterMap program.target?).map StructuralNode.enters
    | none => []
  | .enters id =>
    match program.element? id with
    | some element =>
      if element.waitsForInput then []
      else
        let boundaries := ((element.envelope?.map (·.boundaries)).getD []).flatMap (·.outgoing)
        let fired := (boundaries.filterMap program.target?).map StructuralNode.enters
        let entered := if element.scope?.isSome then program.enteredChildren id else []
        fired ++ (if entered.isEmpty then [StructuralNode.completes id] else entered.map (.enters ·.header.id))
    | none => []

/-- Every node of the program's elements, the walk's bound. -/
def Program.structuralNodes (program : Program) : List StructuralNode :=
  program.elements.flatMap fun element => [.enters element.header.id, .completes element.header.id]

/-- The search behind `structurallyFollows`: the nodes of `frontier` in order, each expanded once, `seen` holding
those expanded. It needs no fuel: an expansion marks one of the program's nodes seen, so fewer are unseen, and a node
already seen or of an element the program does not declare only shrinks the frontier. -/
def structuralSearch (program : Program) (target : StructuralNode) (seen frontier : List StructuralNode) : Bool :=
  match frontier with
  | [] => false
  | node :: rest =>
    if node == target then true
    else if _old : seen.contains node then structuralSearch program target seen rest
    else if _declared : program.structuralNodes.contains node then
      structuralSearch program target (node :: seen) (rest ++ structuralNext program node)
    else structuralSearch program target seen rest
termination_by (program.structuralNodes.countP (fun declared => !seen.contains declared), frontier.length)
decreasing_by
  · exact Prod.Lex.right _ (by simp)
  · apply Prod.Lex.left
    have declared : node ∈ program.structuralNodes := by simpa using _declared
    generalize program.structuralNodes = nodes at declared ⊢
    induction nodes with
    | nil => cases declared
    | cons head tail ih =>
      rw [List.countP_cons, List.countP_cons]
      by_cases same : head = node
      · subst same
        have le : tail.countP (fun declared => !(head :: seen).contains declared) ≤
            tail.countP (fun declared => !seen.contains declared) :=
          List.countP_mono_left fun x _ unseen => by simp_all
        simp only [List.contains_cons, beq_self_eq_true, Bool.true_or, Bool.not_true, _old] at le ⊢
        simp only [Bool.false_eq_true, ite_false, Bool.not_false, ite_true]
        omega
      · have inTail : node ∈ tail := by
          rcases List.mem_cons.mp declared with first | rest
          · exact absurd first.symm same
          · exact rest
        have step := ih inTail
        have unchanged : (!(node :: seen).contains head) = !seen.contains head := by simp [same]
        rw [unchanged]
        omega
  · exact Prod.Lex.right _ (by simp)

/-- Whether `later` may complete after `earlier` completes, in the closure `earlier` completed in, as far as the
program's structure shows (`structuralNext`): a path of at least one step leads from `earlier`'s completion to
`later`'s. -/
def structurallyFollows (program : Program) (earlier later : ElementId) : Bool :=
  structuralSearch program (.completes later) [] (structuralNext program (.completes earlier))

/-- The structural order of two compensation subjects whose records completed in one closure: `later` follows
`earlier` and not the other way round. A strict partial order (`Kernel.Laws.IL.structurallyBefore_trans`); two
subjects it leaves unordered have no dependency it can see. -/
def structurallyBefore (program : Program) (earlier later : ElementId) : Bool :=
  structurallyFollows program earlier later && !structurallyFollows program later earlier

end Kernel
