module

public import Kernel.IL.Types

/-! # Sequence Flow paths

Where a token goes on from an element, and whether a Sequence Flow path leads from one element to another through
nodes that are no Activity and leave no record. `Kernel.Feature.Compensation` orders handlers along such paths
(BPMN 2.0.2 §13.5.5, issue #96) and `Kernel.Admission.Scopes` refuses a model whose records could not show the path a
token took, so the order the kernel runs and the models admission accepts derive from this one relation.
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

/-- Whether the element's occurrences are published: a Link Event, throw or catch, publishes none, since its token
passes on as if the Sequence Flow connected the elements around it (`onward`), the observation contract's Link exception
([publication](../../docs/kernel/semantics/PUBLICATION-AND-OBSERVATION-SEMANTICS-SPEC.md#flow-node-occurrences),
CIB-AGR-0018). -/
def Program.publishesOccurrences (program : Program) (id : ElementId) : Bool :=
  ((program.element? id).bind (·.event?)).all fun (_, payload) => payload.linkThrow?.isNone && payload.linkCatch?.isNone

end Kernel
