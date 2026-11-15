module

public import Kernel.State

/-! # Proofs: the former lanes, placement (P7)

Every occurrence runs an element of the process its instance runs: the process instance runs the root process, and a
called instance the process its Call bound, which its root's `FeatureSlots.instances` entry records (`Placed`). It is
the fact `Kernel.Proofs.Former.Calls` reads to keep two Calls of one instance with one authored identifier one element.

The model premise is that the program's references stay in one process (`ReferencesPlaced`), which admission's
reference checks establish. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel

/-- The definition of the process `id` belongs to, `none` for the root process: an element's by its own header, a
boundary's by its host's (`Program.boundary?`), as `Program.publicId` reads either. -/
def definitionAt (program : Program) (id : ElementId) : Option DefinitionRef :=
  ((((program.element? id).map (·.header)).orElse fun _ => (program.boundary? id).map (·.1.header)).bind
    program.processOf).map (·.definition)

/-- Every occurrence runs an element of the process its instance runs. Each instance root, `State.root` and every
called root, has a `FeatureSlots.instances` entry, and every occurrence's element or boundary belongs to the process
(`definitionAt`) each entry of its scope occurrence's instance root records: `none` on both sides for the root process,
whose entry `State.initial` makes without a definition, and the definition its Call bound for a called instance
(`State.enterCalled`). -/
structure Placed (program : Program) (s : State) : Prop where
  rooted : ∃ entry ∈ s.slots.instances, entry.root = State.root
  entered : ∀ root ∈ s.scopes, root.calledInstance.isSome → ∃ entry ∈ s.slots.instances, entry.root = root.id
  occurrences : ∀ occurrence ∈ s.occurrences, ∀ entry ∈ s.slots.instances, entry.root = s.instanceRoot occurrence.scope →
    definitionAt program occurrence.element = entry.definition

/-- The program's references stay in one process: what admission refuses as `il.reference` otherwise
(`Admission.Flow.references`, `Admission.Scopes.membership`), read in the process vocabulary of `definitionAt`.

- A root-process element (`Program.children none`) belongs to the root process, and a called process's top level
  (`Program.processChildren`) to that process: membership's called processes list parentless elements only, and
  `references` names each element once.
- An element lies in its parent's process (membership: every parent is a Scope listing it), and the elements on one
  level (`Program.siblings`) in one process.
- A boundary lies in its host's process (`Admission.Flow.place`: a boundary sits where its host does).
- A flow joins two endpoints of one process (`flowReference`: one `place`), and every flow an element or boundary lists
  as outgoing, as its default or as a gateway's candidate or default, leaves it (`listReference`, `gatewayReference`).
- A compensation handler lies in its subject's process (`handlerReference`: in its subject's place, or its child). -/
structure ReferencesPlaced (program : Program) : Prop where
  rootChildren : ∀ element ∈ program.children none, definitionAt program element.header.id = none
  processChildren : ∀ process ∈ program.processes, ∀ element ∈ program.processChildren process,
    definitionAt program element.header.id = some process.definition
  children : ∀ parent, ∀ element ∈ program.children (some parent),
    definitionAt program element.header.id = definitionAt program parent
  siblings : ∀ (header : Header), ∀ element ∈ program.siblings header,
    definitionAt program element.header.id = definitionAt program header.id
  boundaries : ∀ id host boundary, program.boundary? id = some (host, boundary) →
    definitionAt program id = definitionAt program host.header.id
  flows : ∀ flow ∈ program.flows, definitionAt program flow.target = definitionAt program flow.source
  outgoing : ∀ id element, program.element? id = some element → ∀ flow ∈ element.outgoing, program.source? flow = some id
  boundaryOutgoing : ∀ id host boundary, program.boundary? id = some (host, boundary) →
    ∀ flow ∈ boundary.outgoing, program.source? flow = some id
  defaults : ∀ id element envelope flow, program.element? id = some element → element.envelope? = some envelope →
    envelope.defaultFlow = some flow → flow ∈ element.outgoing
  candidates : ∀ id element header payload candidates default, program.element? id = some element →
    element.gateway? = some (header, payload) →
    (payload.kind = .exclusive candidates default ∨ payload.kind = .inclusive candidates default) →
    ∀ flow, (flow ∈ candidates ∨ default = some flow) → flow ∈ payload.outgoing
  handlers : ∀ element ∈ program.elements, ∀ envelope, element.envelope? = some envelope →
    ∀ handler ∈ envelope.compensationHandlers, definitionAt program handler = definitionAt program element.header.id

end Kernel.Proofs.Former
