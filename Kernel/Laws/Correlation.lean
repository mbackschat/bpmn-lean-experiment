module

public import Kernel.Hooks
public import Kernel.State.Criteria
public import Kernel.Laws.State
import all Kernel.Feature.Correlation

/-! # Laws of API correlation criteria

The rules of [CIB-EXT-0025](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0025--message-correlation-by-api-criteria-and-delivered-variables)
and of the [subscriptions semantics](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#messages) for a
delivery's or publication's API criteria, independent of `Kernel.Feature.Correlation` and `Kernel.State.Criteria`: what
one criterion means for a waiting item, that the criteria form a conjunction, which criteria the command is refused for
before any waiting item or start is asked, which a start refuses, that a criterion reaching a start installs
nothing, and the verdict on a modeled key's value
([population semantics](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#message-key-correlation)). Nothing executable imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.Correlation

open Kernel
open Kernel.Laws.State (Within)

/-! ## What a criterion means -/

/-- A process instance's root: the process root, which has no parent, or a called instance's root. -/
def IsInstanceRoot (s : State) (scope : ScopeOccurrenceId) : Prop :=
  ∃ root ∈ s.scopes, root.id = scope ∧ (root.parent = none ∨ root.calledInstance.isSome = true)

/-- `root` is the root of the process instance `scope` belongs to: the nearest instance root at or above it, so a
called instance's own root, never its caller's. -/
def RootOf (s : State) (scope root : ScopeOccurrenceId) : Prop :=
  Within s scope root ∧ IsInstanceRoot s root ∧
    ∀ nearer, Within s scope nearer → Within s nearer root → IsInstanceRoot s nearer → nearer = root

/-- `owner`'s own variables bind `name` to `value`: a variable of an enclosing scope never counts, and an absent name
matches nothing. -/
def Binds (s : State) (owner : ScopeOccurrenceId) (name : String) (value : Value) : Prop :=
  ∃ locals ∈ s.variables, locals.scope = owner ∧ (name, value) ∈ locals.entries

/-- What one criterion means for an item waiting in `scope` of the instance rooted at `root`, whose public identifier is
`publicId`: a Process variable the root holds, a local variable `scope` holds itself, the instance's own business key,
or its public identifier, each with an equal value of the same kind, so `41` is not `"41"` and a null matches only a
present null. The values compared are primitive, since a command whose variable criterion is not is refused first. -/
def CriterionHolds (s : State) (scope root : ScopeOccurrenceId) (publicId : String) (criterion : CorrelationMatch) :
    Prop :=
  match criterion.target with
  | .processVariable name => Binds s root name criterion.expected
  | .localVariable name => Binds s scope name criterion.expected
  | .businessKey => ∃ data ∈ s.slots.instances, ∃ key, data.root = root ∧ data.businessKey = some key ∧
      criterion.expected = .string key
  | .processInstance => criterion.expected = .string publicId

/-- The criteria form a conjunction, the empty list matching every item. -/
def Accepts (s : State) (scope root : ScopeOccurrenceId) (publicId : String) (criteria : List CorrelationMatch)
    (accepted : Bool) : Prop :=
  accepted = true ↔ ∀ criterion ∈ criteria, CriterionHolds s scope root publicId criterion

/-! ## The command's refusal -/

/-- A criterion naming a variable, which CIB's variable query compares. -/
def NamesVariable (criterion : CorrelationMatch) : Prop :=
  match criterion.target with
  | .processVariable _ | .localVariable _ => True
  | .businessKey | .processInstance => False

/-- A Decimal, a String list, a list or a map, which CIB's variable query refuses as an Object value. -/
def ObjectValued : Value → Prop
  | .decimal _ _ | .stringList _ | .list _ | .map _ => True
  | .null | .bool _ | .int _ | .string _ => False

/-- Two criteria name one target: CIB's criteria are a map. -/
def Repeated (criteria : List CorrelationMatch) : Prop :=
  ¬ (criteria.map (·.target)).Nodup

/-- The refusal one profile reading gives criteria that name no target twice; `startOnly` is a publication reaching
only root Message starts. Under `apiCriteria` a start-only publication with a variable criterion is rejected, as CIB
fails it, and otherwise a variable criterion with an Object value is unsupported, as CIB rolls it back; under
`modeledKey`, which reads a criterion only as a modeled key, a target other than a Process variable is unsupported. -/
def ReadingRefuses : MessageCorrelation → Bool → List CorrelationMatch → Failure → Prop
  | .apiCriteria, startOnly, criteria, failure =>
    (startOnly = true ∧ (∃ criterion ∈ criteria, NamesVariable criterion) ∧ failure = .rejected "criteria-start-only") ∨
    (¬ (startOnly = true ∧ ∃ criterion ∈ criteria, NamesVariable criterion) ∧
      (∃ criterion ∈ criteria, NamesVariable criterion ∧ ObjectValued criterion.expected) ∧
      failure = .unsupported "correlation-criterion-not-primitive")
  | .modeledKey, _, criteria, failure =>
    (∃ criterion ∈ criteria, ∀ name, criterion.target ≠ .processVariable name) ∧
      failure = .unsupported "profile-message-correlation-api-criteria"

/-- The command's verdict on its criteria under the readings of the deployments it may reach, decided before any
waiting item or start is asked: `criteria-duplicate` under every reading, else the refusal of the first reading that
refuses, else none. It reads the criteria, the mode and the readings alone, so it is never read per item as no match. -/
def CommandVerdict (readings : List MessageCorrelation) (startOnly : Bool) (criteria : List CorrelationMatch) :
    Option Failure → Prop
  | some failure =>
    (Repeated criteria ∧ failure = .rejected "criteria-duplicate") ∨
    (¬ Repeated criteria ∧ ∃ earlier reading later, readings = earlier ++ reading :: later ∧
      (∀ admitted ∈ earlier, ∀ other, ¬ ReadingRefuses admitted startOnly criteria other) ∧
      ReadingRefuses reading startOnly criteria failure)
  | none => ¬ Repeated criteria ∧ ∀ reading ∈ readings, ∀ failure, ¬ ReadingRefuses reading startOnly criteria failure

/-- The verdict of criteria that reach a root Message start under `reading`: under `apiCriteria` a business-key or
process-instance criterion is unsupported, since CIB starts under the key or ignores the instance, which the kernel
reproduces neither; variable criteria pass; under `modeledKey` a start reads no criterion. -/
def StartVerdict : MessageCorrelation → List CorrelationMatch → Option Failure → Prop
  | .apiCriteria, criteria, some failure =>
    (∃ criterion ∈ criteria, ¬ NamesVariable criterion) ∧ failure = .unsupported "start-criterion-not-variable"
  | .apiCriteria, criteria, none => ∀ criterion ∈ criteria, NamesVariable criterion
  | .modeledKey, _, verdict => verdict = none

/-- A start a publication's criteria reached installs nothing of them: the started instance's root holds only what the
start writes, its delivered variables and its payload by the catch rule (`written`), since CIB uses a variable criterion
only to seek a waiting execution and starts with the delivered variables alone. -/
def StartInstallsOnly (written : List (String × Value)) (started : State) (root : ScopeOccurrenceId) : Prop :=
  ∀ locals ∈ started.variables, locals.scope = root → ∀ entry ∈ locals.entries, entry ∈ written

/-! ## A modeled key's value -/

/-- The verdict on a modeled key evaluated when a delivery is matched (`messageCorrelation = modeledKey`): a non-empty
String is the key; an empty String, another value and an unbound variable, BPMN's uninitialized key (§8.3.3), lie
outside the key domain and are `unsupported`, never a mismatch or a semantic failure; any other evaluation failure
rolls the command back, and an unsupported evaluation stays unsupported. -/
def KeyVerdict (evaluation : Evaluation) (verdict : Except Failure String) : Prop :=
  match evaluation with
  | .value (.string key) =>
    (key ≠ "" ∧ verdict = .ok key) ∨ (key = "" ∧ verdict = .error (.unsupported "correlation-key-empty"))
  | .value _ => verdict = .error (.unsupported "correlation-key-type")
  | .failure code =>
    (code = "unknown-variable" ∧ verdict = .error (.unsupported "correlation-key-unbound")) ∨
      (code ≠ "unknown-variable" ∧ verdict = .error (.rolledBack code))
  | .unsupported code => verdict = .error (.unsupported code)

/-! ## Non-vacuity

A root scope 0 whose instance has business key `k` and variable `order = 7`, and a waiting item's scope 1 below it
holding `step = "a"`. -/

def root : ScopeOccurrenceId := ⟨0⟩
def inner : ScopeOccurrenceId := ⟨1⟩

def rootScope : ScopeOccurrence := { id := root, element := none, parent := none }
def innerScope : ScopeOccurrence := { id := inner, element := some ⟨"Sub"⟩, parent := some root }
def rootLocals : ScopeVariables := { scope := root, entries := [("order", .int 7)] }
def innerLocals : ScopeVariables := { scope := inner, entries := [("step", .string "a")] }
def rootData : InstanceData := { root, businessKey := some "k" }

def waiting : State :=
  { instanceId := "p", scopes := [rootScope, innerScope], variables := [rootLocals, innerLocals]
    slots := { instances := [rootData] } }

def orderIs (value : Value) : CorrelationMatch := { target := .processVariable "order", expected := value }
def stepIs (value : Value) : CorrelationMatch := { target := .localVariable "step", expected := value }
def keyIs (key : String) : CorrelationMatch := { target := .businessKey, expected := .string key }

theorem root_of_inner : RootOf waiting inner root := by
  refine ⟨.parent innerScope root root (by simp [waiting]) rfl (.refl _), ⟨rootScope, by simp [waiting], rfl, .inl rfl⟩, ?_⟩
  intro nearer _ _ ⟨scope, member, same, kind⟩
  simp only [waiting, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl
  · exact same.symm
  · simp [innerScope] at kind

theorem conjunction_accepts : Accepts waiting inner root "p" [orderIs (.int 7), stepIs (.string "a"), keyIs "k"] true := by
  simp only [Accepts, true_iff, List.mem_cons, List.not_mem_nil, or_false, forall_eq_or_imp, forall_eq]
  refine ⟨⟨rootLocals, by simp [waiting], rfl, by simp [rootLocals, orderIs]⟩,
    ⟨innerLocals, by simp [waiting], rfl, by simp [innerLocals, stepIs]⟩, ⟨rootData, by simp [waiting], "k", rfl, rfl, rfl⟩⟩

theorem empty_accepts : Accepts waiting inner root "p" [] true := by
  simp [Accepts]

/-- `41` is not `"41"`: a value of another kind matches nothing. -/
theorem other_kind_rejected : ¬ CriterionHolds waiting inner root "p" (orderIs (.string "7")) := by
  rintro ⟨locals, member, scope, entry⟩
  simp only [waiting, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;> simp [rootLocals, innerLocals, orderIs, root, inner] at scope entry

/-- A local criterion reads the waiting item's own scope, never an enclosing one. -/
theorem enclosing_local_rejected : ¬ CriterionHolds waiting inner root "p" { target := .localVariable "order", expected := .int 7 } := by
  rintro ⟨locals, member, scope, entry⟩
  simp only [waiting, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;> simp [rootLocals, innerLocals, root, inner] at scope entry

theorem one_failing_rejects : ¬ Accepts waiting inner root "p" [orderIs (.int 7), stepIs (.string "b")] true := by
  intro accepts
  have := (accepts.mp rfl) (stepIs (.string "b")) (by simp)
  obtain ⟨locals, member, scope, entry⟩ := this
  simp only [waiting, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;> simp [rootLocals, innerLocals, stepIs, root, inner] at scope entry

theorem duplicate_first :
    CommandVerdict [.apiCriteria] true [orderIs (.int 1), orderIs (.int 2)] (some (.rejected "criteria-duplicate")) :=
  .inl ⟨by simp [Repeated, orderIs], rfl⟩

theorem start_only_rejected :
    CommandVerdict [.apiCriteria] true [orderIs (.int 1)] (some (.rejected "criteria-start-only")) :=
  .inr ⟨by simp [Repeated], [], .apiCriteria, [], rfl, by simp, .inl ⟨rfl, ⟨orderIs (.int 1), by simp, trivial⟩, rfl⟩⟩

theorem object_value_unsupported :
    CommandVerdict [.apiCriteria] false [orderIs (.list [])] (some (.unsupported "correlation-criterion-not-primitive")) :=
  .inr ⟨by simp [Repeated], [], .apiCriteria, [], rfl, by simp,
    .inr ⟨by simp, ⟨orderIs (.list []), by simp, trivial, trivial⟩, rfl⟩⟩

theorem modeled_key_reading :
    CommandVerdict [.modeledKey] false [keyIs "k"] (some (.unsupported "profile-message-correlation-api-criteria")) :=
  .inr ⟨by simp [Repeated], [], .modeledKey, [], rfl, by simp, ⟨⟨keyIs "k", by simp, fun _ => by simp [keyIs]⟩, rfl⟩⟩

theorem primitive_variables_pass : CommandVerdict [.apiCriteria] false [orderIs (.int 1), stepIs .null] none := by
  refine ⟨by simp [Repeated, orderIs, stepIs], ?_⟩
  intro reading member failure refuses
  simp only [List.mem_singleton] at member
  subst member
  rcases refuses with ⟨startOnly, _⟩ | ⟨_, ⟨criterion, inList, _, objectValued⟩, _⟩
  · simp at startOnly
  · simp only [List.mem_cons, List.not_mem_nil, or_false] at inList
    rcases inList with rfl | rfl <;> simp [ObjectValued, orderIs, stepIs] at objectValued

/-- A start-only publication's variable criterion is never passed through to the start. -/
theorem start_only_passing_rejected : ¬ CommandVerdict [.apiCriteria] true [orderIs (.int 1)] none := by
  rintro ⟨_, admitted⟩
  exact admitted .apiCriteria (by simp) _ (.inl ⟨rfl, ⟨orderIs (.int 1), by simp, trivial⟩, rfl⟩)

theorem start_takes_variables : StartVerdict .apiCriteria [orderIs (.int 1)] none := by
  simp [StartVerdict, NamesVariable, orderIs]

theorem start_key_unsupported : StartVerdict .apiCriteria [keyIs "k"] (some (.unsupported "start-criterion-not-variable")) :=
  ⟨⟨keyIs "k", by simp, by simp [NamesVariable, keyIs]⟩, rfl⟩

theorem start_key_passing_rejected : ¬ StartVerdict .apiCriteria [keyIs "k"] none := by
  simp [StartVerdict, NamesVariable, keyIs]

/-- The criterion `order = 1` reached the start; the instance holds only its delivered variable `amount`. -/
def started : State := { waiting with variables := [{ scope := root, entries := [("amount", .int 3)] }] }

theorem start_installs_delivered : StartInstallsOnly [("amount", .int 3)] started root := by
  simp [StartInstallsOnly, started]

theorem criterion_installed_rejected :
    ¬ StartInstallsOnly [("amount", .int 3)] { started with variables := [{ scope := root, entries := [("order", .int 1)] }] }
      root := fun only => by
  simpa using only { scope := root, entries := [("order", .int 1)] } (by simp) rfl ("order", .int 1) (by simp)

theorem unbound_key_unsupported :
    KeyVerdict (.failure "unknown-variable") (.error (.unsupported "correlation-key-unbound")) :=
  .inl ⟨rfl, rfl⟩

theorem bound_key_taken : KeyVerdict (.value (.string "o-7")) (.ok "o-7") :=
  .inl ⟨by decide +kernel, rfl⟩

/-- An unbound key read as a semantic failure, as the kernel once answered, is rejected. -/
theorem unbound_failure_rejected :
    ¬ KeyVerdict (.failure "unknown-variable") (.error (.semanticFailure "unknown-variable")) := by
  simp [KeyVerdict]

/-- An unbound key read as a mismatch, a key that matches nothing, is rejected. -/
theorem unbound_mismatch_rejected :
    ¬ KeyVerdict (.failure "unknown-variable") (.error (.rejected "message-correlation-mismatch")) := by
  simp [KeyVerdict]

end Kernel.Laws.Correlation
