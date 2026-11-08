module

public import Kernel.IL.Types

/-! # IL queries

Read-only projections of a `Program` that every layer may use. They project; they never dispatch on what an element
means, so matching here does not compete with the dispatch owners. A feature that needs one kind of element uses
the projection for it instead of matching `Element` or `EventRole`, which only `Kernel.Step` dispatches on.
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

def Element.activity? : Element → Option (Header × ActivityPayload)
  | .activity header payload => some (header, payload)
  | .scope _ _ => none
  | .event _ _ => none
  | .gateway _ _ => none
  | .start _ _ => none

def Element.scope? : Element → Option (Header × ScopePayload)
  | .scope header payload => some (header, payload)
  | .activity _ _ => none
  | .event _ _ => none
  | .gateway _ _ => none
  | .start _ _ => none

def Element.event? : Element → Option (Header × EventPayload)
  | .event header payload => some (header, payload)
  | .activity _ _ => none
  | .scope _ _ => none
  | .gateway _ _ => none
  | .start _ _ => none

def Element.gateway? : Element → Option (Header × GatewayPayload)
  | .gateway header payload => some (header, payload)
  | .activity _ _ => none
  | .scope _ _ => none
  | .event _ _ => none
  | .start _ _ => none

def Element.start? : Element → Option (Header × StartPayload)
  | .start header payload => some (header, payload)
  | .activity _ _ => none
  | .scope _ _ => none
  | .event _ _ => none
  | .gateway _ _ => none

/-- The subscription of a catch Event. -/
def EventPayload.catch? (payload : EventPayload) : Option Subscription :=
  match payload.role with
  | .catch subscription => some subscription
  | .throw _ => none
  | .linkCatch _ => none
  | .linkThrow _ => none

/-- The Link name of a throwing Link Event. -/
def EventPayload.linkThrow? (payload : EventPayload) : Option String :=
  match payload.role with
  | .linkThrow name => some name
  | .catch _ => none
  | .throw _ => none
  | .linkCatch _ => none

/-- The Link name of a catching Link Event. -/
def EventPayload.linkCatch? (payload : EventPayload) : Option String :=
  match payload.role with
  | .linkCatch name => some name
  | .catch _ => none
  | .throw _ => none
  | .linkThrow _ => none

/-- The incoming flows of an element; a start Event has none. -/
def Element.incoming : Element → List FlowId
  | .activity _ payload => payload.envelope.incoming
  | .scope _ payload => payload.envelope.incoming
  | .event _ payload => payload.incoming
  | .gateway _ payload => payload.incoming
  | .start _ _ => []

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
