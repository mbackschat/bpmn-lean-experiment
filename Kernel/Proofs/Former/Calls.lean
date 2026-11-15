module

public import Kernel.Laws.Step.Signals
public import Kernel.Laws.State.Chain
public import Kernel.Laws.Population

/-! # Proofs: the former lanes, Calls (P7)

The former theorems (`Kernel.Proofs.Former`) of PC-SCOPE-04 and PC-SCOPE-05 that read a Call's own hooks or the
identities of the instances it calls: a Call installs its evaluated inputs as the called root's only variables, its
return continues exactly the Call occurrence that owns the root, and each derived instance identity names exactly one
called instance. Each statement is over a hooks parameter and closes when `Kernel.Proofs.Step` proves it of
`Registry.hooks`.

The model premise is that a process's authored identifiers are distinct (`PublicIdsApart`), which the codec does not
check. The identities are a lane invariant beside `Laws.State.WellFormed`, as P4's `RunsFormed` is (`CallsFormed`):
held at a start, in every instance of a population run and across a committed input. Nothing executable imports this
module.
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel
open Kernel.Laws.State (WellFormed Within Queues InstanceRoot)

/-- The program's authored identifiers (`Program.publicId`) are distinct within each process it carries, the root
process's included: two elements of one process with one `ElementOrigin.sourceId` are one element. Admission refuses a
repeated authored identifier in the root process (`element.origin.sourceId`); a carried copy of another deployment's
process is renamed uniformly by its deployment (`packages/bpmn-source/src/kernel-reader/assembly.ts`), which keeps a
process's distinct authored identifiers distinct. Two Calls of one process sharing an authored identifier would name
their instances alike at one activation, so `CalledIdentityUnique` is false of a program that breaks it. -/
def PublicIdsApart (program : Program) : Prop :=
  ∀ first ∈ program.elements, ∀ second ∈ program.elements,
    (program.processOf first.header).map (·.definition) = (program.processOf second.header).map (·.definition) →
    first.header.origin.sourceId = second.header.origin.sourceId → first.header.id = second.header.id

/-- PC-SCOPE-04 (`CVM-IN-01`): a Call's invocation installs a called root whose variable set is exactly its input
mappings (`CallWork.inputs`) evaluated against what the Call's scope occurrence sees. Stated of `Hooks.arriveActivity`,
which `Step` calls when the Call's occurrence begins; the failed-source half is `FailedSourcesRead`.

P0 stated it for some mappings, which any list of literal mappings rebuilding the installed frame witnesses, so it is
bound to the Call's own inputs; and it reads the before-state's context, which the occurrence's local scope occurrence,
entered before the Call evaluates its inputs, leaves unchanged only in a well-formed state. -/
def CallInstallsSnapshot (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (header : Header) (payload : ActivityPayload) (work : CallWork) (occurrence : Occurrence)
    (state after : State) (root : ScopeOccurrence),
    WellFormed ctx.program state → payload.work.call? = some work →
    hooks.arriveActivity ctx header payload occurrence state = .ok after →
    root ∈ after.scopes → root.calledInstance.isSome → root.occurrence = some occurrence.id → root ∉ state.scopes →
    ∃ installed, ctx.evaluateMappings (state.evalContext ctx.program occurrence.scope) work.inputs = .ok (some installed) ∧
      ∃ frame ∈ after.variables, frame.scope = root.id ∧ frame.entries = installed

/-- PC-SCOPE-05 (`CALLN-RETURN-01`, `CALLN-OUTSIDE-01`): a called root that is idle continues exactly the Call
occurrence that owns it, found by its own `occurrence`, never by the called definition, and keeps every other scope
occurrence, wait and token. Stated of `Hooks.completeCall`, of the signals it newly queues (`Laws.State.Queues`); that
`Step` calls it only for a called root, with the occurrence the root's own `occurrence` names, is
`Laws.Step.completeIdleScope_called`. -/
def ReturnContinuesCaller (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (header : Header) (payload : ActivityPayload) (root : ScopeOccurrence) (occurrence : Occurrence)
    (state after : State),
    root.occurrence = some occurrence.id → hooks.completeCall ctx header payload root occurrence state = .ok after →
    (∃ new, Queues state after new ∧ ∀ queued ∈ new, ∀ id leave writes rule, queued = .complete id leave writes rule →
      id = occurrence.id) ∧
    (∀ other ∈ state.scopes, other.id ≠ root.id → other ∈ after.scopes) ∧
    (∀ item ∈ state.openItems, ¬ Within state item.scope root.id → item ∈ after.openItems) ∧ after.tokens = state.tokens

/-! ## The identities of called instances -/

/-- Every called root belongs to a present Call occurrence and is named by it: `State.calledInstanceId` of its caller's
instance, the Call's authored identifier and its activation. -/
def Named (program : Program) (s : State) : Prop :=
  ∀ root ∈ s.scopes, root.calledInstance.isSome → ∃ call ∈ s.occurrences, root.occurrence = some call.id ∧
    root.calledInstance = some (State.calledInstanceId (s.instanceOf call.scope) (program.publicId call.element) call.activation)

/-- No occurrence owns two called roots. -/
def OwnersApart (s : State) : Prop :=
  ∀ first ∈ s.scopes, ∀ second ∈ s.scopes, first.calledInstance.isSome → second.calledInstance.isSome →
    first.occurrence = second.occurrence → first.id = second.id

/-- An occurrence that owns a called root is of an element of the process its own instance runs: the root process's
(no carried process) in the process instance, the bound process's in a called one (`FeatureSlots.instances`). -/
def Placed (program : Program) (s : State) : Prop :=
  ∀ root ∈ s.scopes, root.calledInstance.isSome → ∀ call ∈ s.occurrences, root.occurrence = some call.id →
    ∀ instanceRoot, InstanceRoot s call.scope instanceRoot → ∀ entry ∈ s.slots.instances, entry.root = instanceRoot →
      ((program.element? call.element).bind fun element => program.processOf element.header).map (·.definition) =
        entry.definition

/-- Each derived identity names exactly one called instance: two called roots with one instance identifier are one
scope occurrence. -/
def IdentitiesApart (s : State) : Prop :=
  ∀ first ∈ s.scopes, ∀ second ∈ s.scopes, first.calledInstance.isSome →
    first.calledInstance = second.calledInstance → first.id = second.id

/-- The lane invariant of called instances, beside `Laws.State.WellFormed`: every called root is named by its present
Call (`Named`), no Call owns two (`OwnersApart`), each Call lies in the process its instance runs (`Placed`), and the
identities are distinct (`IdentitiesApart`, the former theorem's second clause). The first three strengthen the fourth
so that an input keeps it (root decision D3, 2026-11-15). -/
structure CallsFormed (program : Program) (s : State) : Prop where
  named : Named program s
  ownersApart : OwnersApart s
  placed : Placed program s
  apart : IdentitiesApart s

/-- A committed start keeps the lane invariant, under a program whose authored identifiers are distinct per process. -/
def CallsFormedAtStart (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (after : State), PublicIdsApart program →
    Step.step hooks program none input = .ok after → CallsFormed program after

/-- Every instance a committed population run holds keeps the lane invariant under its deployment's program, where
that program's authored identifiers are distinct per process. -/
def CallsFormedInPopulation (hooks : Hooks) : Prop :=
  ∀ (admission : Program → Option String) (stimuli : List Population.Stimulus) (result : Population.Result),
    Population.runStimuli hooks admission stimuli = .ok result →
    ∀ instance_ ∈ result.instances, PublicIdsApart instance_.deployment.program →
      CallsFormed instance_.deployment.program instance_.state

/-- PC-SCOPE-05: an invocation creates exactly the derived identity, and keeps call associations valid. Every called
root an input creates belongs to a present Call occurrence and is named `State.calledInstanceId` of its caller's
instance, the Call's authored identifier and its activation; and the lane invariant holds after the input, so two
called roots with the same instance identifier are one scope occurrence and each derived identity names exactly one
instance.

P0 stated it of every well-formed before-state, which is false twice. A program whose process lists two Calls with
one authored identifier names both instances alike at one activation (`PublicIdsApart`). And a well-formed state
whose called roots are already named alike, or misnamed, is no state a run reaches: `WellFormed` does not speak of
called identities, so the before-state keeps the lane invariant (`CallsFormed`), which `CallsFormedAtStart` and
`CallsFormedInPopulation` establish. -/
def CalledIdentityUnique (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State),
    PublicIdsApart program → WellFormed program before → CallsFormed program before →
    Step.step hooks program (some before) input = .ok after →
    (∀ root ∈ after.scopes, root ∉ before.scopes → root.calledInstance.isSome →
      ∃ call ∈ after.occurrences, root.occurrence = some call.id ∧ root.calledInstance =
        some (State.calledInstanceId (after.instanceOf call.scope) (program.publicId call.element) call.activation)) ∧
    CallsFormed program after

end Kernel.Proofs.Former
