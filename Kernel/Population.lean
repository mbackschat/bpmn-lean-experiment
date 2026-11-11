module

public import Kernel.Population.Conditions
public import Kernel.Population.Signals
public import Kernel.Population.Deploy
public import Kernel.Population.Timers
public import Kernel.Step

/-! # Population

Mechanisms across process instances ([architecture](../docs/kernel/ARCHITECTURE-SPEC.md#population)). Every input
reaches an instance through `Step.step`; this layer only decides which instance an input goes to. A scenario is one
ordered list of stimuli mixing deployments, instance inputs and population commands, each at a logical time.
Implemented: deployments with versions per process key and the copies of other deployments' processes they may
carry (`deploy`), instances of possibly different deployments, each driven by its own inputs, and Message
publications routed with exact cardinality to a waiting subscription, else to a root Message start (`publish`,
[specification](../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)), Timer-start occurrences fired once each
while their deployment is current (`timerStart`), Conditional root starts evaluated over submitted variables, each
start that holds starting its own instance (`evaluateConditions`), and Signals broadcast to every receiver, each its
own unit of commitment, the intents every committed step leaves cascading depth-first after it (`broadcast`), an
instance input's into `inputCascades`. Every command is
answered once: the ledger keeps each command's result under the digest of its content, so the same command
again answers its recorded result and changes nothing, and the same command identifier with other content is
`rejected command-content-mismatch` (population contract §7).

A refused deployment, an instance input that does not commit and a delivery a target refuses are results, never
harness errors; a candidate whose key cannot be evaluated is no match.
-/

public section

namespace Kernel.Population

/-- What a run has done so far: deployments, instances, command results and their ledger, the consumed Timer-start
occurrences, input failures. -/
structure Progress where
  registry : List Deployment := []
  deployments : List DeploymentResult := []
  instances : List Instance := []
  steps : List StepResult := []
  ledger : List LedgerEntry := []
  occurrences : List TimerOccurrence := []
  inputFailures : List (String × Failure) := []
  inputCascades : List (String × List FanOutEntry) := []

/-- The deploy ordinals of the refused deployments, which no copy may come from. -/
def Progress.refused (progress : Progress) : List Nat :=
  progress.deployments.filterMap fun deployment =>
    match deployment.outcome with
    | .deployed => none
    | .refused _ => some deployment.deploymentId

/-- The deployment an instance input reaches: its instance's, or for a new instance its definition's latest. -/
def Progress.deploymentFor (progress : Progress) (instanceId definitionRef : String) : Option Deployment :=
  match progress.instances.find? (·.state.instanceId == instanceId) with
  | some member => some member.deployment
  | none => (progress.registry.filter (·.definitionRef == definitionRef)).getLast?

def route (hooks : Hooks) (progress : Progress) (atMs : Nat) :
    Command → Except String (List Instance × List TimerOccurrence × Resolution)
  | .publish publication => do
    let (instances, resolution, delivered) ← publish hooks progress.registry progress.instances atMs publication
    let (instances, resolution) ←
      cascadeCommitted hooks progress.registry publication.commandId atMs instances delivered resolution
    pure (instances, progress.occurrences, resolution)
  | .timerStart fired => do
    let (instances, occurrences, resolution) ←
      timerStart hooks progress.registry progress.instances progress.occurrences atMs fired
    let (instances, resolution) ← cascadeCommitted hooks progress.registry fired.commandId atMs instances none resolution
    pure (instances, occurrences, resolution)
  | .evaluateConditions evaluation => do
    let (instances, resolution) ← evaluateConditions hooks progress.registry progress.instances atMs evaluation
    pure (instances, progress.occurrences, resolution)
  | .broadcast sent => do
    let (instances, resolution) ← broadcast hooks progress.registry progress.instances atMs sent
    pure (instances, progress.occurrences, resolution)

/-- Apply one stimulus. A command sees the instances started so far. -/
def apply (hooks : Hooks) (admission : Program → Option String) (progress : Progress) :
    Stimulus → Except String Progress
  | .deploy definitionRef ref program atMs =>
    let (result, deployment) := deploy admission progress.registry progress.refused (progress.deployments.length + 1)
      definitionRef ref program atMs
    .ok { progress with registry := progress.registry ++ deployment.toList
                        deployments := progress.deployments ++ [result] }
  | .deployRefused definitionRef _ code _ =>
    .ok { progress with deployments := progress.deployments ++
      [{ deploymentId := progress.deployments.length + 1, definitionRef, versions := [], outcome := .refused code }] }
  | .input instanceId definitionRef commandId input =>
    let failed (failure : Failure) : Progress :=
      { progress with inputFailures := progress.inputFailures ++ [(commandId, failure)] }
    match progress.deploymentFor instanceId definitionRef with
    | none => .ok (failed (.rejected "definition-not-deployed"))
    | some deployment =>
      let before := (progress.instances.find? (·.state.instanceId == instanceId)).map (·.state)
      match Step.step hooks deployment.program before input with
      | .error failure => .ok (failed failure)
      | .ok state => do
        let others := progress.instances.filter (·.state.instanceId != instanceId)
        let fanning ← cascadeOf hooks progress.registry commandId state.logicalTimeMs cascadeBound
          (others ++ [{ deployment, state }]) instanceId
        let cascaded := if fanning.entries.isEmpty then [] else [(commandId, fanning.entries)]
        pure { progress with instances := fanning.instances, inputCascades := progress.inputCascades ++ cascaded }
  | .command issued atMs digest => do
    let commandId := issued.commandId
    let answered (resolution : Resolution) : StepResult :=
      { commandId, ordinal := progress.steps.length + 1, atMs, resolution }
    match progress.ledger.find? (·.commandId == commandId) with
    | some entry =>
      let resolution := if entry.digest == digest then entry.result.resolution
        else .rejected "command-content-mismatch"
      pure { progress with steps := progress.steps ++ [answered resolution] }
    | none =>
      let (instances, occurrences, resolution) ← route hooks progress atMs issued
      let result := answered resolution
      pure { progress with instances, occurrences, steps := progress.steps ++ [result]
                           ledger := progress.ledger ++ [{ commandId, digest, result }] }

/-- Fold the stimuli in order; `admission` is the admission registry a deployment runs. -/
def runStimuli (hooks : Hooks) (admission : Program → Option String) (stimuli : List Stimulus) :
    Except String Result := do
  let progress ← stimuli.foldlM (apply hooks admission) ({} : Progress)
  let ids := progress.instances.map (·.state.instanceId)
  unless ids.eraseDups.length == ids.length do throw "instance-id-duplicate"
  pure { deployments := progress.deployments
         steps := progress.steps
         inputFailures := progress.inputFailures
         inputCascades := progress.inputCascades
         instances := progress.instances.mergeSort fun left right =>
           decide (left.state.instanceId ≤ right.state.instanceId) }

end Kernel.Population
