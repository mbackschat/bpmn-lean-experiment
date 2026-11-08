module

public import Kernel.IL.Types

/-! # IL queries

Read-only projections of a `Program` that every layer may use. They project; they never dispatch on what an element
means, so matching here does not compete with the dispatch owners.
-/

public section

namespace Kernel

def Element.header : Element → Header
  | .activity header _ => header
  | .scope header _ => header
  | .event header _ => header
  | .gateway header _ => header
  | .start header _ => header

/-- The envelope of an Activity or Scope; other elements have none. -/
def Element.envelope? : Element → Option Envelope
  | .activity _ payload => some payload.envelope
  | .scope _ payload => some payload.envelope
  | .event _ _ => none
  | .gateway _ _ => none
  | .start _ _ => none

namespace Program

def element? (program : Program) (id : ElementId) : Option Element :=
  program.elements.find? (fun element => element.header.id == id)

def target? (program : Program) (flow : FlowId) : Option ElementId :=
  (program.flows.find? (·.id == flow)).map (·.target)

def source? (program : Program) (flow : FlowId) : Option ElementId :=
  (program.flows.find? (·.id == flow)).map (·.source)

/-- The elements whose parent is `parent`; `none` is the process level. -/
def children (program : Program) (parent : Option ElementId) : List Element :=
  program.elements.filter (·.header.parent == parent)

/-- A boundary by its id, with the element it is attached to. -/
def boundary? (program : Program) (id : ElementId) : Option (Element × Boundary) :=
  program.elements.findSome? fun element =>
    (element.envelope?.bind fun envelope => envelope.boundaries.find? (·.id == id)).map (element, ·)

end Program

end Kernel
