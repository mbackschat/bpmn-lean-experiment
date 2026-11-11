module

public import Kernel.Population.Signals

/-! # Population: Conditional start evaluations

An `evaluateConditions` command evaluates every Conditional root start in scope over the submitted variables and starts
an instance at each start that holds, each start its own unit of commitment (PC-CONDITION-02, CIB-EXT-0044,
[specification](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
-/

public section

namespace Kernel.Population

/-- The Conditional root starts of the deployments in scope, each with its public identifier: those of the selected
deployment, or of each key's current deployment (CIB-INT-0031); deployments in deploy order, starts in document order
(population contract §6). -/
def conditionalStarts (registry : List Deployment) (scope : Option Deployment) : List (Deployment × Header × String) :=
  (scope.map ([·])).getD (currentDeployments registry) |>.flatMap fun deployment =>
    ((deployment.program.children none).filterMap Element.start?).filterMap fun (header, start) =>
      (start.subscription.bind (·.trigger.condition?)).map fun _ =>
        (deployment, header, (deployment.program.publicId header.id).value)

/-- Evaluate one start for `evaluation` at `atMs`: a start whose predicate does not hold adds nothing, one whose
predicate fails adds its `failed` entry, and one that holds starts its instance with the business key and every
submitted variable, adding the start's entry, and the intents its step left cascade before the next start. The
predicate is asked first (`Hooks.startsFired`), so a false start is never read off a refused start step. -/
def evaluateStart (hooks : Hooks) (registry : List Deployment) (evaluation : ConditionEvaluation) (atMs : Nat)
    (fanning : Fanning) : Deployment × Header × String → Except String Fanning
  | (deployment, header, publicStart) => do
    let receiver : Receiver := .start deployment.deploymentId publicStart
    let (fanning, reachable) := fanning.spend receiver
    if !reachable then return fanning
    let input : StartInput :=
      { instanceId := startedInstanceId evaluation.commandId deployment.deploymentId publicStart
        startEvent := some header.id, variables := evaluation.variables, trigger := .condition
        businessKey := evaluation.businessKey, atMs := some atMs }
    match hooks.startsFired (Step.context hooks deployment.program) input with
    | .ok [] => pure fanning
    | .ok (_ :: _) =>
      let (started, entry) ← startInstance hooks deployment publicStart input
      let fanning := { fanning.add entry with instances := fanning.instances ++ started.toList }
      match started with
      | some member => cascade hooks registry evaluation.commandId atMs fanning member.state deployment.program
      | none => pure fanning
    | .error failure => pure (fanning.add (.failed receiver failure))

/-- Evaluate the Conditional root starts in scope at `atMs` (PC-CONDITION-02): each that holds starts one instance,
each start its own unit of commitment, so a failing start leaves every other start's instance in place (CIB starts all
or none, CIB-INT-0033). The answer is the fan-out of the starts that held or failed and of their cascades, in order,
and `fanOut []` when none held. A selector naming no registered deployment is `rejected definition-not-deployed`, a
scope without a Conditional start `rejected no-conditional-start` and an `order` naming other starts
`rejected discovery-order-mismatch`. -/
def evaluateConditions (hooks : Hooks) (registry : List Deployment) (instances : List Instance) (atMs : Nat)
    (evaluation : ConditionEvaluation) : Except String (List Instance × Resolution) := do
  let some scope := selected registry evaluation.definition | return (instances, .rejected "definition-not-deployed")
  let starts := conditionalStarts registry scope
  if starts.isEmpty then return (instances, .rejected "no-conditional-start")
  let some ordered := inOrder (fun (deployment, _, start) => .start deployment.deploymentId start) starts evaluation.order
    | return (instances, .rejected "discovery-order-mismatch")
  let fanning ← ordered.foldlM (evaluateStart hooks registry evaluation atMs) { instances }
  pure (fanning.instances, .fanOut fanning.entries)

end Kernel.Population
