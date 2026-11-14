module

public import Kernel.Laws.Step
public import Kernel.Laws.Data

/-! # Proofs: the former lanes (P7)

The former theorems of the rows that stayed `done` on lanes of the deleted library
([status map](../../docs/kernel/KERNEL-STATUS-MAP.md#open-proof-lanes)), restated over `Laws.Data` against `Step`, as
P3's or P6's statements, or closed as not applicable with the reason ([PLAN, P7](../../docs/PLAN.md#proof-wave)).
Each statement is over a hooks parameter and closes when `Kernel.Proofs.Step` proves it of `Registry.hooks`; its state
premise is `Laws.State.WellFormed`.

| Row | Former theorem | Here |
|---|---|---|
| PC-DATA-01 | encoding then decoding an admitted canonical value preserves it | not applicable: wire admission and the codecs have no counterpart in `Step`; guard 11's codec round trips cover them |
| PC-DATA-01 | cloning preserves value equality without aliasing | not applicable: Lean values are immutable, so no `Step` state aliases another |
| PC-DATA-01 | a rejected command preserves the committed state | not applicable: a rejected `Step.step` returns no state, so the host keeps the before-state by the outcome's type |
| PC-DATA-01 | bound checks reject before partial writes | restated: `ValuesRejectedWhole` |
| PC-HUM-04 | pass-through lowering and its admission checks | not applicable: there is no lowering; a pass-through Task runs as an Activity through `Step`'s one pipeline |
| PC-HUM-04 | the closure burst bound (never proved) | not applicable: `Step.closureBound` and `Step.closureWorkBound` make an overlong closure `unsupported`, dynamic-only |
| PC-HUM-04 | `prepared_end_declared_entry_pair` (`DTB-COMMUTE-01`) | restated as a corollary of P6's `Proofs.Concurrency.SchedulesAgree` under `apart`: the End and entry tokens' two orders are one `Reordered` pair of a closure state, so no statement of its own |
| PC-SCOPE-04 | `invokeState?_installs_snapshot`, `copyValues?_absent_is_null` (`CVM-IN-01`) | restated: `CallInstallsSnapshot` |
| PC-SCOPE-04 | the read, write and owner isolation lemmas (`CVM-ISOLATE-01`) | restated: `CalledReadsIsolated`, `CalledWritesIsolated` |
| PC-SCOPE-04 | `returnState?_writes_outputs_from_caller` (`CVM-OUT-01`) | restated: `OutputsAtNearestOwner` |
| PC-SCOPE-04 | `returnState?_retires_called_frames` (`CVM-RETIRE-01`) | restated as P3's `Proofs.Cancellation.SubtreeRemoved` of the called root |
| PC-SCOPE-05 | invocation keeps call associations valid and creates exactly the derived identity | restated: `CalledIdentityUnique` |
| PC-SCOPE-05 | return continues exactly its caller and keeps every other record, root, wait and token (`CALLN-RETURN-01`, `CALLN-OUTSIDE-01`) | restated: `ReturnContinuesCaller` |
| PC-SCOPE-05 | a called root with a live nested record is not quiescent (`CALLN-NEST-01`) | restated: `NestedCallKeepsRootBusy` |
| PC-SCOPE-05 | removing a returned called tree keeps everything outside it | restated as P3's `SubtreeRemoved` with `Laws.State.ClearsInside`'s outside clauses |
| PC-SCOPE-05 | the Stage B lift of the parentless-caller premise | not applicable: the kernel derives called identities from the caller's identity (`State.calledInstanceId`) and has no parentless-root premise |

Model premises cite their refusal codes where admission enforces one; that admission enforces them stays scenario
evidence. Nothing executable imports this module.
-/

public section

namespace Kernel.Proofs.Former

open Kernel
open Kernel.Laws.State (WellFormed Within Queues)

/-- PC-DATA-01: an input carrying a value outside the portable domain (`Laws.Data.InDomain`) is rejected whole, before
any write (DATA-SEMANTICS-SPEC "Values"): a start's variables or a variable command's values. -/
def ValuesRejectedWhole (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before : Option State) (input : Input) (values : List (String × Value)),
    ((∃ payload : StartInput, input = .start payload ∧ payload.variables = values) ∨
      ∃ payload : CommandInput, input = .command payload ∧ payload.action = .setVariables values) →
    (∀ formed, before = some formed → WellFormed formed) →
    (∃ binding ∈ values, ¬ Laws.Data.InDomain binding.2) →
    ∃ code, Step.step hooks program before input = .error (.rejected code)

/-- `root` is the root of a called process instance in `state`. -/
def CalledRoot (state : State) (root : ScopeOccurrenceId) : Prop :=
  ∃ occurrence ∈ state.scopes, occurrence.id = root ∧ occurrence.calledInstance.isSome

/-- PC-SCOPE-04 (`CVM-IN-01`): a Call's invocation installs a called root whose variable set is exactly the evaluated
input mappings, an absent `callVariable` source a present null (`Laws.Data.FailedSource`, CIB-EXT-0021). Stated of
`Hooks.arriveActivity`, which `Step` calls when the Call's occurrence begins. -/
def CallInstallsSnapshot (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (header : Header) (payload : ActivityPayload) (occurrence : Occurrence) (state after : State)
    (root : ScopeOccurrence),
    hooks.arriveActivity ctx header payload occurrence state = .ok after →
    root ∈ after.scopes → root.calledInstance.isSome → root.occurrence = some occurrence.id → root ∉ state.scopes →
    ∃ mappings installed, ctx.evaluateMappings (state.evalContext ctx.program occurrence.scope) mappings = .ok (some installed) ∧
      ∃ frame ∈ after.variables, frame.scope = root.id ∧ frame.entries = installed

/-- PC-SCOPE-04 (`CVM-ISOLATE-01`): a read from inside a called instance sees only frames inside it, never its caller's
(`Laws.Data.Reads` over the visible bindings). -/
def CalledReadsIsolated : Prop :=
  ∀ (program : Program) (state : State) (scope root : ScopeOccurrenceId) (binding : String × Value),
    WellFormed state → CalledRoot state root → Within state scope root → binding ∈ state.visible program scope →
    ∃ frame ∈ state.variables, Within state scope frame.scope ∧ Within state frame.scope root ∧ binding ∈ frame.entries

/-- PC-SCOPE-04 (`CVM-ISOLATE-01`): a write from inside a called instance changes no frame outside it
(`Laws.Data.OthersKept`). Stated of `Hooks.writeOutputs`. -/
def CalledWritesIsolated (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (scope root : ScopeOccurrenceId) (writes : List (String × Value)) (rule : WriteRule) (state after : State),
    WellFormed state → CalledRoot state root → Within state scope root →
    hooks.writeOutputs ctx scope writes rule state = .ok after →
    ∀ frame ∈ state.variables, ¬ Within state frame.scope root → frame ∈ after.variables

/-- PC-SCOPE-04 (`CVM-OUT-01`): an outward write lands at the nearest scope occurrence that declares its name, within
the writer's instance (`Laws.Data.WritesNearest`). Stated of `Hooks.writeOutputs` for one write, as a Call's return
makes from the caller's position. -/
def OutputsAtNearestOwner (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (scope root owner : ScopeOccurrenceId) (name : String) (value : Value) (state after : State),
    WellFormed state → Laws.Data.NearestOwner state root scope name owner →
    hooks.writeOutputs ctx scope [(name, value)] .outward state = .ok after →
    Laws.Data.WritesNearest root scope name value owner state after

/-- PC-SCOPE-05: an invocation creates exactly the derived identity, and keeps call associations valid. Every called
root an input creates belongs to a present Call occurrence and is named `State.calledInstanceId` of its caller's
instance, the Call's authored identifier and its activation; and two called roots of one state with the same instance
identifier are one scope occurrence, so each derived identity names exactly one instance. -/
def CalledIdentityUnique (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State),
    WellFormed before → Step.step hooks program (some before) input = .ok after →
    (∀ root ∈ after.scopes, root ∉ before.scopes → root.calledInstance.isSome →
      ∃ call ∈ after.occurrences, root.occurrence = some call.id ∧ root.calledInstance =
        some (State.calledInstanceId (after.instanceOf call.scope) (program.publicId call.element) call.activation)) ∧
    ∀ first ∈ after.scopes, ∀ second ∈ after.scopes, first.calledInstance.isSome →
      first.calledInstance = second.calledInstance → first.id = second.id

/-- PC-SCOPE-05 (`CALLN-RETURN-01`, `CALLN-OUTSIDE-01`): a called root that is idle continues exactly the Call
occurrence that owns it, found by its own `occurrence`, never by the called definition, and keeps every other scope
occurrence, wait and token. Stated of `Hooks.completeCall`, which `Step` calls with the root's owning occurrence, of
the signals it newly queues (`Laws.State.Queues`). -/
def ReturnContinuesCaller (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (header : Header) (payload : ActivityPayload) (root : ScopeOccurrence) (occurrence : Occurrence)
    (state after : State),
    root.occurrence = some occurrence.id → hooks.completeCall ctx header payload root occurrence state = .ok after →
    (∃ new, Queues state after new ∧ ∀ queued ∈ new, ∀ id leave writes rule, queued = .complete id leave writes rule →
      id = occurrence.id) ∧
    (∀ other ∈ state.scopes, other.id ≠ root.id → other ∈ after.scopes) ∧
    (∀ item ∈ state.openItems, ¬ Within state item.scope root.id → item ∈ after.openItems) ∧ after.tokens = state.tokens

/-- PC-SCOPE-05 (`CALLN-NEST-01`): a scope occurrence with a live child, a nested Call's root among them, is never the
idle scope occurrence the closure completes (`Laws.Scopes.Idle`). -/
def NestedCallKeepsRootBusy : Prop :=
  ∀ (ctx : Ctx) (state : State) (scope child : ScopeOccurrence),
    Step.idleScope? ctx state = some scope → child ∈ state.scopes → child.parent ≠ some scope.id

end Kernel.Proofs.Former
