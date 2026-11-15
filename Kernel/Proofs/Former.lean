module

public import Kernel.Laws.Step
public import Kernel.Laws.Data
public import Kernel.Laws.State.Chain

/-! # Proofs: the former lanes (P7)

The former theorems of the rows that stayed `done` on lanes of the deleted library
([status map](../../docs/kernel/KERNEL-STATUS-MAP.md#open-proof-lanes)), restated over `Laws.Data` against `Step`, as
P3's or P6's statements, or closed as not applicable with the reason ([PLAN, P7](../../docs/PLAN.md#proof-wave)).
Each statement is over a hooks parameter and closes when `Kernel.Proofs.Step` proves it of `Registry.hooks`; its state
premise is `Laws.State.WellFormed`.

The statements are split by what they read, and no module of them imports another: this module the frames a scope
occurrence reads and writes (`Laws.Data`); `Kernel.Proofs.Former.Values` the value domain and failed mapping sources
(`Laws.Data.Values`); `Kernel.Proofs.Former.Calls` a Call's own hooks and the identities of the instances it calls.
P6's corollary is `Kernel.Proofs.Concurrency.endBesideEntry`.

| Row | Former theorem | Here |
|---|---|---|
| PC-DATA-01 | encoding then decoding an admitted canonical value preserves it | not applicable: wire admission and the codecs have no counterpart in `Step`; guard 11's codec round trips cover them |
| PC-DATA-01 | cloning preserves value equality without aliasing | not applicable: Lean values are immutable, so no `Step` state aliases another |
| PC-DATA-01 | a rejected command preserves the committed state | not applicable: a rejected `Step.step` returns no state, so the host keeps the before-state by the outcome's type |
| PC-DATA-01 | bound checks reject before partial writes | restated: `ValuesRejectedWhole` (`Kernel.Proofs.Former.Values`) |
| PC-HUM-04 | pass-through lowering and its admission checks | not applicable: there is no lowering; a pass-through Task runs as an Activity through `Step`'s one pipeline |
| PC-HUM-04 | the closure burst bound (never proved) | not applicable: `Step.closureBound` and `Step.closureWorkBound` make an overlong closure `unsupported`, dynamic-only |
| PC-HUM-04 | `prepared_end_declared_entry_pair` (`DTB-COMMUTE-01`) | proved as a corollary of P6's `Proofs.Concurrency.SchedulesAgree` under `Laws.Flow.Apart`: `Proofs.Concurrency.endBesideEntry` |
| PC-SCOPE-04 | `invokeState?_installs_snapshot`, `copyValues?_absent_is_null` (`CVM-IN-01`) | restated: `CallInstallsSnapshot` (`Kernel.Proofs.Former.Calls`) and `FailedSourcesRead` (`Kernel.Proofs.Former.Values`) |
| PC-SCOPE-04 | the read, write and owner isolation lemmas (`CVM-ISOLATE-01`) | restated: `CalledReadsIsolated`, `CalledWritesIsolated` |
| PC-SCOPE-04 | `returnState?_writes_outputs_from_caller` (`CVM-OUT-01`) | restated: `OutputsAtNearestOwner` and, for a Scope's item, `OutputsAtDeclaringOccurrence` |
| PC-SCOPE-04 | `returnState?_retires_called_frames` (`CVM-RETIRE-01`) | restated as P3's `Proofs.Cancellation.SubtreeRemoved` of the called root |
| PC-SCOPE-05 | invocation keeps call associations valid and creates exactly the derived identity | restated: `CalledIdentityUnique` (`Kernel.Proofs.Former.Calls`) |
| PC-SCOPE-05 | return continues exactly its caller and keeps every other record, root, wait and token (`CALLN-RETURN-01`, `CALLN-OUTSIDE-01`) | restated: `ReturnContinuesCaller` (`Kernel.Proofs.Former.Calls`) |
| PC-SCOPE-05 | a called root with a live nested record is not quiescent (`CALLN-NEST-01`) | restated: `NestedCallKeepsRootBusy` |
| PC-SCOPE-05 | removing a returned called tree keeps everything outside it | restated as P3's `Proofs.Cancellation.SubtreeRemoved` of the called root; removing the Call's occurrence leaves the called root by `State.leaveScope`, which keeps what lies outside it (`Laws.State.leaveScope_left`) |
| PC-SCOPE-05 | the Stage B lift of the parentless-caller premise | not applicable: the kernel derives called identities from the caller's identity (`State.calledInstanceId`) and has no parentless-root premise |

Model premises cite their refusal codes where admission enforces one; that admission enforces them stays scenario
evidence. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel
open Kernel.Laws.State (WellFormed Within CalledRoot InstanceRoot)

/-- PC-SCOPE-04 (`CVM-ISOLATE-01`): a read from inside a called instance sees only frames inside it, never its caller's
(`Laws.Data.Reads` over the visible bindings). -/
def CalledReadsIsolated : Prop :=
  ∀ (program : Program) (state : State) (scope root : ScopeOccurrenceId) (binding : String × Value),
    WellFormed program state → CalledRoot state root → Within state scope root → binding ∈ state.visible program scope →
    ∃ frame ∈ state.variables, Within state scope frame.scope ∧ Within state frame.scope root ∧ binding ∈ frame.entries

/-- PC-SCOPE-04 (`CVM-ISOLATE-01`): a write from inside a called instance changes no frame outside it
(`Laws.Data.OthersKept`). Stated of `Hooks.writeOutputs`. -/
def CalledWritesIsolated (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (scope root : ScopeOccurrenceId) (writes : List (String × Value)) (rule : WriteRule) (state after : State),
    WellFormed ctx.program state → CalledRoot state root → Within state scope root →
    hooks.writeOutputs ctx scope writes rule state = .ok after →
    ∀ frame ∈ state.variables, ¬ Within state frame.scope root → frame ∈ after.variables

/-- PC-SCOPE-04 (`CVM-OUT-01`): an outward write of a name that no occurrence of an item's Scope on the way declares
lands at the nearest scope occurrence that declares the name, within the writer's instance (`Laws.Data.WritesNearest`).
Stated of `Hooks.writeOutputs` for one write, as a Call's return makes from the caller's position.

P0 stated it for any `root` and any name, which is false twice. A free `root`, the process root, makes it claim a
caller's frame from inside a called instance, while the search for the owner stops at the called root: a callee
writing `x = 99` while its caller binds `x = 1` writes its own root, and the caller keeps `1` (CVM-OUT-01, "within the
writer's instance"). And for an item a Scope declares it claims the nearest frame binding the name, while the write
lands in the item's declaring occurrence: a Sub-Process declaring `P` with no value yet, inside a root binding `P`,
receives the write and the root keeps its value (BPMN 2.0.2 §10.4.1; DATA-SEMANTICS-SPEC "Scope data"). So `root` is the
writer's instance root (`Laws.State.InstanceRoot`) and no occurrence of the item's Scope lies on the way; the item's
own clause is `OutputsAtDeclaringOccurrence`. -/
def OutputsAtNearestOwner (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (scope root owner : ScopeOccurrenceId) (name : String) (value : Value) (state after : State),
    WellFormed ctx.program state → InstanceRoot state scope root →
    (∀ element, ctx.program.itemScope? name = some element → ∀ target, Within state scope target →
      Within state target root → ¬ Laws.Data.OccurrenceOf state target element) →
    Laws.Data.NearestOwner state root scope name owner →
    hooks.writeOutputs ctx scope [(name, value)] .outward state = .ok after →
    Laws.Data.WritesNearest root scope name value owner state after

/-- PC-SCOPE-04 (`CVM-OUT-01`, BPMN 2.0.2 §10.4.1, DATA-SEMANTICS-SPEC "Scope data"): an outward write of an item a
Scope declares lands in the item's declaring occurrence within the writer's instance, whether that frame binds it yet
or not and whatever a nearer or outer frame binds (`Laws.Data.WritesItem`). Stated of `Hooks.writeOutputs` for one
write. The instance bound is needed: `Laws.Data.WritesItem` has none, and the search for the declaring occurrence stops
at a called root, so from inside a called instance an enclosing Scope of the caller is never written. -/
def OutputsAtDeclaringOccurrence (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (scope root target : ScopeOccurrenceId) (element : ElementId) (name : String) (value : Value)
    (state after : State),
    WellFormed ctx.program state → InstanceRoot state scope root → ctx.program.itemScope? name = some element →
    Laws.Data.DeclaringOccurrence state scope element target → Within state target root →
    hooks.writeOutputs ctx scope [(name, value)] .outward state = .ok after →
    Laws.Data.WritesItem scope element name value target state after

/-- PC-SCOPE-05 (`CALLN-NEST-01`): a scope occurrence with a live child, a nested Call's root among them, is never the
idle scope occurrence the closure completes (`Laws.Scopes.Idle`). -/
def NestedCallKeepsRootBusy : Prop :=
  ∀ (ctx : Ctx) (state : State) (scope child : ScopeOccurrence),
    Step.idleScope? ctx state = some scope → child ∈ state.scopes → child.parent ≠ some scope.id

end Kernel.Proofs.Former
