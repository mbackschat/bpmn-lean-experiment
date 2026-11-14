module

public import Kernel.Population

/-! # Laws of the population: Timer starts

The due instants of a root Timer start, the verdict on firing one of its occurrences and what a committed firing
starts and consumes ([population, Timer starts](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#timer-starts),
CIB-INT-0029). Which instants a Cron expression matches is the parameter `cronMatch`, a match strictly after the
origin or after the match before it, since stating it needs the Cron fields' calendar, which `Kernel.IL.Timer` owns.

Each law is followed by its non-vacuity witness; the witnesses read only the laws.
-/

@[expose] public section

namespace Kernel.Laws.Population

open Kernel Kernel.Population

/-- `dueMs` is an occurrence of a start resolved as `resolved` whose schedule counts from `originMs`, its deployment's
deploy time: a duration `originMs + d`; a date its own instant, also before the origin; the `k`-th period after the
origin for `1 ≤ k ≤ n`, every `k ≥ 1` when unbounded (CIB-INT-0008); a Cron match strictly after the origin. -/
def DueInstant (cronMatch : String → Nat → Nat → Prop) (originMs dueMs : Nat) : Timer.Resolved → Prop
  | .duration ms => dueMs = originMs + ms
  | .date instantMs => dueMs = instantMs
  | .cycle periodMs repetitions =>
    0 < periodMs ∧ ∃ k, 1 ≤ k ∧ (∀ count, repetitions = some count → k ≤ count) ∧ dueMs = originMs + k * periodMs
  | .cron text => originMs < dueMs ∧ cronMatch text originMs dueMs

/-- An occurrence fires at `atMs` exactly when it is a due instant not later than `atMs`; one the schedule does not name
is `timer-occurrence-unknown`, a firing before its instant `timer-not-due`. -/
def FiringVerdict (cronMatch : String → Nat → Nat → Prop) (originMs dueMs atMs : Nat) (resolved : Timer.Resolved) :
    Option String → Prop
  | none => DueInstant cronMatch originMs dueMs resolved ∧ dueMs ≤ atMs
  | some code =>
    (¬ DueInstant cronMatch originMs dueMs resolved ∧ code = "timer-occurrence-unknown") ∨
      (DueInstant cronMatch originMs dueMs resolved ∧ atMs < dueMs ∧ code = "timer-not-due")

/-- No later registered deployment shares `deployment`'s key: the current deployment of a key is its last registered
one, in registration order. -/
def Current (registry : List DeploymentSummary) (deployment : DeploymentSummary) : Prop :=
  ∃ earlier later, registry = earlier ++ deployment :: later ∧ ∀ other ∈ later, other.key ≠ deployment.key

/-- The occurrence `fired` names already started an instance. -/
def Spent (consumed : List TimerOccurrence) (fired : TimerStart) : Prop :=
  ∃ occurrence ∈ consumed, occurrence.deploymentId = fired.deploymentId ∧ occurrence.startEvent = fired.startEvent ∧
    occurrence.dueMs = fired.dueMs

/-- The registry is keyed by deployment and each deployment's Timer starts by start Event, so the deployment and start
a verdict reads are the only ones. -/
def SummariesKeyed (registry : List DeploymentSummary) : Prop :=
  (registry.map (·.deploymentId)).Nodup ∧ ∀ deployment ∈ registry, (deployment.timerStarts.map (·.1)).Nodup

/-- The verdict on a `timerStart` at `atMs`, the first refusal in this order: `definition-not-deployed` for a deployment
not registered; `no-start-event` for a start that is not one of its root Timer starts; the firing verdict;
`timer-start-superseded` once another deployment of its key is current, as CIB deletes every Timer-start job of a key it
redeploys; `timer-start-occurrence-consumed` for a spent occurrence; else none, and it fires. -/
def TimerStartVerdict (cronMatch : String → Nat → Nat → Prop) (registry : List DeploymentSummary) (fired : TimerStart)
    (atMs : Nat) (consumed : List TimerOccurrence) (verdict : Option String) : Prop :=
  ((∀ deployment ∈ registry, deployment.deploymentId ≠ fired.deploymentId) ∧ verdict = some "definition-not-deployed") ∨
  ∃ deployment ∈ registry, deployment.deploymentId = fired.deploymentId ∧
    (((∀ start ∈ deployment.timerStarts, start.1 ≠ fired.startEvent) ∧ verdict = some "no-start-event") ∨
    ∃ resolved, (fired.startEvent, resolved) ∈ deployment.timerStarts ∧
      let firing := FiringVerdict cronMatch deployment.deployedAtMs fired.dueMs atMs resolved
      (∃ code, firing (some code) ∧ verdict = some code) ∨
      (firing none ∧ ¬ Current registry deployment ∧ verdict = some "timer-start-superseded") ∨
      (firing none ∧ Current registry deployment ∧ Spent consumed fired ∧
        verdict = some "timer-start-occurrence-consumed") ∨
      (firing none ∧ Current registry deployment ∧ ¬ Spent consumed fired ∧ verdict = none))

/-- What a `timerStart` resolves to: a refusal changes nothing; a firing is one entry, and a started one carries the
identity of the occurrence, `timer:<len>:<deploymentId>:<len>:<startEvent>:<dueMs>`, whatever the firing time or the
command, and consumes exactly that occurrence; a start the start step refuses is the failed entry and consumes nothing. -/
def TimerResolves (fired : TimerStart) (verdict : Option String) (before after : List TimerOccurrence)
    (resolution : Resolution) : Prop :=
  match verdict with
  | some code => resolution = .rejected code ∧ after = before
  | none =>
    (∃ version, resolution = .fanOut [.started (timerInstanceId fired.deploymentId fired.startEvent fired.dueMs)
        fired.deploymentId version fired.startEvent] ∧
      after = before ++ [{ deploymentId := fired.deploymentId, startEvent := fired.startEvent, dueMs := fired.dueMs }]) ∨
    (∃ receiver failure, resolution = .fanOut [.failed receiver failure] ∧ after = before)

/-! ## Non-vacuity

A duration `PT0.5S` deployed at 1000, a cycle of period 100 with two repetitions deployed at 0, a Cron start whose
matches are a parameter, and two deployments 1 and 2 of the key `k`, each with the Timer start `T` (`PT1M`). -/

theorem duration_due (cronMatch : String → Nat → Nat → Prop) :
    FiringVerdict cronMatch 1000 1500 1600 (.duration 500) none :=
  ⟨rfl, by omega⟩

theorem duration_early (cronMatch : String → Nat → Nat → Prop) :
    FiringVerdict cronMatch 1000 1500 1400 (.duration 500) (some "timer-not-due") :=
  .inr ⟨rfl, by omega, rfl⟩

/-- An instant the schedule does not name never fires, however late. -/
theorem unnamed_instant_rejected (cronMatch : String → Nat → Nat → Prop) :
    ¬ FiringVerdict cronMatch 1000 1700 2000 (.duration 500) none := fun ⟨due, _⟩ => by
  simp [DueInstant] at due

theorem cycle_second_period (cronMatch : String → Nat → Nat → Prop) :
    DueInstant cronMatch 0 200 (.cycle 100 (some 2)) :=
  ⟨by omega, 2, by omega, fun count same => by cases same; omega, by omega⟩

/-- A third period of a cycle of two repetitions is no occurrence. -/
theorem cycle_third_rejected (cronMatch : String → Nat → Nat → Prop) :
    ¬ DueInstant cronMatch 0 300 (.cycle 100 (some 2)) := fun ⟨_, period⟩ => by
  obtain ⟨k, _, bounded, due⟩ := period
  have := bounded 2 rfl
  omega

/-- The origin is no occurrence of a cycle. -/
theorem cycle_origin_rejected (cronMatch : String → Nat → Nat → Prop) (repetitions : Option Nat) :
    ¬ DueInstant cronMatch 0 0 (.cycle 100 repetitions) := fun ⟨_, period⟩ => by
  obtain ⟨k, positive, _, due⟩ := period
  omega

theorem date_before_origin (cronMatch : String → Nat → Nat → Prop) : DueInstant cronMatch 5000 1000 (.date 1000) := rfl

/-- A Cron match at or before the origin is no occurrence. -/
theorem cron_at_origin_rejected (text : String) : ¬ DueInstant (fun _ _ _ => True) 1000 1000 (.cron text) :=
  fun ⟨after, _⟩ => by omega

def summaryOf (deploymentId : Nat) : DeploymentSummary :=
  { deploymentId, key := "k", keys := ["k"], namesAddress := false, messageCorrelation := .modeledKey
    messageStartNames := [], timerStarts := [("T", .duration 60000)] }

def redeployed : List DeploymentSummary := [summaryOf 1, summaryOf 2]

def firing (deploymentId dueMs : Nat) : TimerStart := { commandId := "c", deploymentId, startEvent := "T", dueMs }

def spentOnce : List TimerOccurrence := [{ deploymentId := 2, startEvent := "T", dueMs := 60000 }]

theorem redeployed_keyed : SummariesKeyed redeployed := by
  simp [SummariesKeyed, redeployed, summaryOf]

theorem current_fires (cronMatch : String → Nat → Nat → Prop) :
    TimerStartVerdict cronMatch redeployed (firing 2 60000) 60000 [] none :=
  .inr ⟨summaryOf 2, by simp [redeployed], rfl, .inr ⟨.duration 60000, by simp [summaryOf, firing],
    .inr (.inr (.inr ⟨⟨rfl, by simp [firing]⟩, ⟨[summaryOf 1], [], rfl, by simp⟩,
      fun ⟨_, member, _⟩ => by simp at member, rfl⟩))⟩⟩

theorem undeployed (cronMatch : String → Nat → Nat → Prop) :
    TimerStartVerdict cronMatch redeployed (firing 3 60000) 60000 [] (some "definition-not-deployed") :=
  .inl ⟨by simp [redeployed, summaryOf, firing], rfl⟩

theorem superseded (cronMatch : String → Nat → Nat → Prop) :
    TimerStartVerdict cronMatch redeployed (firing 1 60000) 60000 [] (some "timer-start-superseded") :=
  .inr ⟨summaryOf 1, by simp [redeployed], rfl, .inr ⟨.duration 60000, by simp [summaryOf, firing],
    .inr (.inl ⟨⟨rfl, by simp [firing]⟩, fun ⟨earlier, later, split, after⟩ => by
      rcases earlier with _ | ⟨first, _ | ⟨second, rest⟩⟩
      · simp only [redeployed, List.nil_append, List.cons.injEq] at split
        exact after (summaryOf 2) (by simp [← split.2]) rfl
      · simp [redeployed, summaryOf] at split
      · simp [redeployed] at split, rfl⟩)⟩⟩

theorem consumed_refused (cronMatch : String → Nat → Nat → Prop) :
    TimerStartVerdict cronMatch redeployed (firing 2 60000) 60000 spentOnce (some "timer-start-occurrence-consumed") :=
  .inr ⟨summaryOf 2, by simp [redeployed], rfl, .inr ⟨.duration 60000, by simp [summaryOf, firing],
    .inr (.inr (.inl ⟨⟨rfl, by simp [firing]⟩, ⟨[summaryOf 1], [], rfl, by simp⟩,
      ⟨spentOnce.head (by simp [spentOnce]), by simp [spentOnce], rfl, rfl, rfl⟩, rfl⟩))⟩⟩

/-- An instant the schedule does not name is refused as unknown before the deployment's supersession is read. -/
theorem unknown_before_superseded (cronMatch : String → Nat → Nat → Prop) :
    ¬ TimerStartVerdict cronMatch redeployed (firing 1 61000) 70000 [] (some "timer-start-superseded") := by
  rintro (⟨_, wrong⟩ | ⟨deployment, member, same, (⟨missing, wrong⟩ | ⟨resolved, start, verdict⟩)⟩)
  · simp at wrong
  · simp at wrong
  · simp only [redeployed, List.mem_cons, List.not_mem_nil, or_false] at member
    rcases member with rfl | rfl
    · simp only [summaryOf, firing, List.mem_singleton, Prod.mk.injEq, true_and] at start
      subst start
      rcases verdict with ⟨code, _, wrong⟩ | ⟨⟨due, _⟩, _⟩ | ⟨_, _, _, wrong⟩ | ⟨_, _, _, wrong⟩
      · cases wrong
        simp [FiringVerdict, DueInstant, firing, summaryOf] at *
      · simp [DueInstant, firing, summaryOf] at due
      · simp at wrong
      · simp at wrong
    · simp [summaryOf, firing] at same

theorem timer_started (version : Nat) :
    TimerResolves (firing 2 60000) none [] [{ deploymentId := 2, startEvent := "T", dueMs := 60000 }]
      (.fanOut [.started (timerInstanceId 2 "T" 60000) 2 version "T"]) :=
  .inl ⟨version, by simp [firing], by simp [firing]⟩

/-- An identity derived from the command, not the occurrence, is rejected. -/
theorem command_identity_rejected (version : Nat) (other : startedInstanceId "c" 2 "T" ≠ timerInstanceId 2 "T" 60000) :
    ¬ TimerResolves (firing 2 60000) none [] [{ deploymentId := 2, startEvent := "T", dueMs := 60000 }]
      (.fanOut [.started (startedInstanceId "c" 2 "T") 2 version "T"]) := by
  rintro (⟨_, same, _⟩ | ⟨_, _, wrong, _⟩)
  · simp only [firing, Resolution.fanOut.injEq, List.cons.injEq, FanOutEntry.started.injEq, and_true] at same
    exact other same.1
  · simp at wrong

/-- A refused start consumes nothing. -/
theorem refusal_consumes_rejected :
    ¬ TimerResolves (firing 2 60000) (some "timer-not-due") [] spentOnce (.rejected "timer-not-due") :=
  fun ⟨_, kept⟩ => by simp [spentOnce] at kept

end Kernel.Laws.Population
