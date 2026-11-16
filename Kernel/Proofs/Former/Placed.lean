module

public import Kernel.State
public import Kernel.Laws.MultiInstance.Rules

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
(`Admission.Flow.references`, `Admission.Scopes.membership`) or assembly guarantees, read in the process vocabulary of
`definitionAt`.

- A root-process element (`Program.children none`) belongs to the root process, and a called process's top level
  (`Program.processChildren`) to that process. This rests on the assembler, not on a refusal: membership checks only
  that a called process lists parentless elements (`parentOf child == some none`, `Kernel/Admission/Scopes.lean:109`),
  and the process child lists are disjoint because assembly renames each called process's identifiers by its
  deployment (`carriedId`, `packages/bpmn-source/src/kernel-reader/assembly.ts:27`, applied at `:235`).
- An element lies in its parent's process (membership: every parent is a Scope listing it), and the elements on one
  level (`Program.siblings`) in one process; at the process level, through the same disjoint child lists.
- A boundary lies in its host's process (`Admission.Flow.place`: a boundary sits where its host does), and no two
  envelopes declare one boundary identifier (`boundaryIds`).
- A flow joins two endpoints of one process (`flowReference`: one `place`), and every flow an element or boundary lists
  as outgoing, as its default or as a gateway's candidate or default, leaves it (`listReference`, `gatewayReference`).
- A compensation handler lies in its subject's process (`handlerReference`: in its subject's place, or its child).
- No two elements share an identifier (`ids`): admission refuses a repeated element or boundary identifier as
  `il.reference` (`Admission.Flow.references`, `distinct (elements ++ boundaries)`, `Kernel/Admission/Flow.lean:92`). It
  is the IL identifier contract `Laws.MultiInstance.IdsUnique` cites, read in place, so that `Program.element?` finds
  every element and the outgoing flows of a catching Link found among its siblings leave it
  (`Proofs.Former.shared_linkId_rejected`). -/
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
  /-- Boundary identifiers are pairwise distinct across all envelopes of `Program.elements`: two declarations of one
  identifier are one declaration, so `Program.boundary?`, which returns the first, finds every boundary an envelope
  declares under its host. Admission refuses a repeated boundary identifier as `il.reference`
  (`Admission.Flow.references`, `distinct (elements ++ boundaries)`, `Kernel/Admission/Flow.lean:92`). It is the
  identifier contract `Laws.MultiInstance.IdsUnique` cites, which compiled programs satisfy and the codec does not
  check: a boundary Event carries an `xsd:ID`, the reader refuses a document with a duplicate identifier by
  `parser.warning` (`packages/bpmn-source/src/kernel-reader/schema.ts:12-15`), and assembling a called process renames
  its element and boundary identifiers alike by their deployment (`carriedId`,
  `packages/bpmn-source/src/kernel-reader/assembly.ts:27`, applied at `:128`, `:139` and `:235`), which keeps distinct
  identifiers distinct. Without it a boundary declared in a second envelope lies where the first declaration's host does
  (`Proofs.Former.shared_boundaryId_rejected`). -/
  boundaryIds : ∀ first ∈ program.elements, ∀ second ∈ program.elements, ∀ envelope envelope',
    first.envelope? = some envelope → second.envelope? = some envelope' → ∀ boundary ∈ envelope.boundaries,
    ∀ boundary' ∈ envelope'.boundaries, boundary.id = boundary'.id → first = second ∧ boundary = boundary'
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
  ids : Laws.MultiInstance.IdsUnique program

end Kernel.Proofs.Former
