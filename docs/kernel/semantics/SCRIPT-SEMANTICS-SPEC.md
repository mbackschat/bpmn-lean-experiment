# Script semantics

## Status

Interpretation for PC-AUTO-05, written 2026-11-10 for its cold interpretation review ([review rule](../ARCHITECTURE-SPEC.md#review)); no code exists for it. PC-AUTO-06 executes it once approved. The [owner decision](../ARCHITECTURE-SPEC.md#owner-decisions-on-the-path) of 2026-11-08 binds it: JavaScript Script Tasks run in the TypeScript host's built-in Node `vm` with a read-only context and no host objects, the result is recorded like an effect result so replay never reruns it, and other languages are refused. The kernel performs no I/O and runs no script.

What a Script Task does once its occurrence has begun, beside the [work semantics](WORK-SEMANTICS-SPEC.md), which own every other work kind. CIB Java paths are relative to `engine/src/main/java/org/cibseven/bpm/engine/impl/` of the pinned CIB Seven `2.2.0` checkout, `pom.xml` paths to its root ([SOURCES](../../SOURCES.md)).

## Normative basis

BPMN 2.0.2 §10.3.3 (Table 10.12) gives the Script Task a `scriptFormat`, a MIME type naming the language, and a `script`; §13.3.3 has it run the script when it is activated and complete when the script ends. BPMN defines no script language, no binding of Process data to script names and no result assignment: a Script Task's data move only through its Data Input and Output Associations (§10.4). Everything below beyond activation and completion is a profile selection.

## CIB Seven 2.2.0

| Fact | Source |
|---|---|
| The language is `scriptFormat`, lower-cased; an absent one is `juel` | `bpmn/parser/BpmnParse.java:2196-2201`, `scripting/engine/ScriptingEngines.java:54,100-104` |
| A script with no engine for its language fails when it runs: `Can't find scripting engine for 'javascript'`. The engine module has GraalJS in test scope only; the CIB Run distribution adds GraalJS `21.3.12` | `scripting/engine/ScriptingEngines.java:143`, `engine/pom.xml:332-342`, `distro/run/pom.xml:32`, `parent/pom.xml:32` |
| A script reads every variable visible from its execution by bare name, and the name `execution` is the execution itself, with its whole API | `scripting/engine/VariableScopeResolver.java`, `scripting/engine/ScriptBindings.java` |
| GraalJS gets host access and host class lookup by default, so `Java.type` reaches any class | `scripting/engine/CamundaScriptEngineManager.java:195-203`, `cfg/ProcessEngineConfigurationImpl.java:609` |
| An assignment to a script name is kept in the script's own bindings, never stored, unless `autoStoreScriptVariables` (default `false`) | `scripting/engine/ScriptBindings.java:126-134`, `cfg/ProcessEngineConfigurationImpl.java:603` |
| A non-null result is written with `execution.setVariable(resultVariable, result)`, to the nearest scope holding the name, else the Process instance; a null result writes nothing | `bpmn/behavior/ScriptTaskActivityBehavior.java:56-59` |
| A thrown exception goes through `executeWithErrorPropagation`: a `BpmnError` cause raises that Error; any other exception may be caught by an Error catch naming its Java class (CIB-EXT-0029), else it fails the command (rolled back) or, after `asyncBefore`, the job (retry, incident) | `bpmn/behavior/AbstractBpmnActivityBehavior.java:87-109` |

## Selected contract

1. **Admitted form.** A Script Task whose `scriptFormat` equals `javascript` ignoring ASCII case, whose script is inline (no `camunda:resource`) and whose `camunda:resultVariable` is absent or a name. No input or output mappings (`activity.inputMappings`, `activity.outputMappings` stay), no Multi-Instance body until a Multi-Instance row admits it. Any other language, `juel` and the absent format included, is refused.
2. **Effect.** The occurrence opens one effect item, exactly as a Service Task's ([work semantics](WORK-SEMANTICS-SPEC.md#service-tasks-and-effects)), with the neutral descriptor `(urn:bpmn-lean:effect-protocol:script-v1, javascript)` and, as arguments committed when it opens, the snapshot of every variable visible from the occurrence's scope occurrence, nearest owner first, one entry per name. The host reads the source from the program by the item's element. Only the effect's result closes it, so the kernel never runs the script and replay reuses the recorded result.
3. **Context.** The host evaluates the source as one classic (sloppy-mode) script in a fresh `vm` context whose global object holds the snapshot as non-writable, non-configurable properties and the JavaScript intrinsics, and nothing else: no `execution`, `require`, `process`, `console`, `Java`, timers or module loader. A value maps by kind: String to string, Boolean to boolean, Null to `null`, Integer within ±2^53−1 to number, `stringList` and List to a frozen array, Map to a frozen null-prototype object; a variable of any other kind or range is left out of the global object. An assignment to a global name or a top-level declaration stays in the context and is discarded, as CIB discards it without `autoStoreScriptVariables`.
4. **Result.** The completion value of the script. `undefined` and `null` write nothing. A string, boolean, or an integer-valued number within the Java `int` range (the values GraalJS hands CIB as `String`, `Boolean`, `Integer`) is reported as the success patch `[(resultVariable, value)]` when the task names a result variable, else the empty patch; the kernel writes it with the nearest-owner rule, the same place `execution.setVariable` writes. Any other completion value (a fraction, `NaN`, an object, an array, a function, a promise) is an evaluator failure.
5. **Failure.** A thrown value, a reference to a name the context lacks (which is how a host object access fails), a result outside the domain and a host deadline are one technical failure of the effect: `unsupported` (`effect-technical-failure`) unless the profile selects incidents, then an incident whose retry evaluates again. A script has no way to raise a BPMN Error, since it reaches no `BpmnError` class; a CIB Error catch by Java class name has no meaning here.
6. **Determinism.** `Math.random` and `Date` are intrinsics and stay available; the recorded result makes a nondeterministic script safe to replay. The host's evaluation deadline is host configuration, not semantics.

The kernel's effect result for a Script Task accepts only the empty patch or the one-entry patch on its result variable; any other patch is rejected (`undeclared-output`).

## Classification drafts

| Draft | Lane | Proposition |
|---|---|---|
| Script effect | extension | A JavaScript Script Task is an effect the host evaluates over a committed snapshot in a host-object-free context; its result is recorded and written to `resultVariable` by the nearest-owner rule. Boundary: the contract above; the CIB comparison holds for scripts that read only snapshot names and return a string, boolean or `int`. |
| Synchronous script | operational mapping | CIB evaluates a Script Task without `asyncBefore` inside the command that reaches it; the project commits the effect at activation and its result as the next input. The differential folds that result into the reaching command as it already does for synchronous delegates (`foldSynchronousEffects`, CIB-OP-0002); a failing synchronous script rolls CIB's whole reaching command back, which the fold cannot express, so those runs are compared only for the failure outcome class. |
| Host objects | limitation | CIB binds `execution` and, with host access, every Java class; the profile binds neither, so a script using them fails where CIB succeeds. |
| Oracle engine | configuration | CIB evaluates JavaScript only with GraalJS on its classpath (`21.3.12` in the Run distribution). |

## IL shape

`ScriptWork` lacks the external script reference CIB reads (`camunda:resource`); per the [forward-compatible rule](../../../CLAUDE.md#forward-compatible-restrictions) it needs a field that admission refuses. The `kernel-shape` commit of track M10 added it with its TypeScript, codec, schema and fixture pairs; the reader reads `camunda:resource` into it, and admission refuses it (`work.script.resource`) ahead of `work.script`:

```lean
structure ScriptWork where
  format : String
  source : Option String := none                   -- absent `script` element: none; CIB refuses it without a resource
  resultVariable : Option String := none           -- `camunda:resultVariable`, else `camunda:resultVariableName`
  resource : Option String := none                 -- PC-AUTO-05; refused (`work.script.resource`)
```

The reader reads `camunda:resultVariableName` only where `camunda:resultVariable` is absent, CIB's precedence (`BpmnParse.java:2221-2228`), and an absent `script` element as `none`, distinct from an empty one, since `ScriptUtil#getScript` refuses a Script Task with neither (`ScriptUtil.java:66-75`).

No state shape changes: the effect item reuses `EffectDetail`, and the source stays in the program.

## Refusal codes

| Code | Refused |
|---|---|
| `work.script.language` | a `scriptFormat` other than `javascript`, ignoring case, the absent one included |
| `work.script.resource` | a script referenced by `camunda:resource` |
| `activity.inputMappings`, `activity.outputMappings` | mappings on a Script Task (unchanged) |
| `activity.multiInstanceBody` | a Multi-Instance Script Task (unchanged) |
| dynamic: `effect-technical-failure` | an evaluator failure without the incident profile (unchanged) |

`work.script` retires once these replace it.

## Witness plan

- The retained [JavaScript Script Task witnesses](../../../scenarios/open-rows/script-task-javascript/README.md): `probe-arithmetic-total` and `probe-text-label` are the two transformations; `probe-host-mutation`, `probe-unknown-name` and `probe-thrown-error` the nearest forbidden accesses and failures; `probe-other-language-juel` the refused language; `probe-randomness` and `probe-wall-clock` recorded nondeterminism; `nested-scope-and-body` the nearest-owner write in a Sub-Process (its counted Multi-Instance body waits for `multiInstance.cardinality` and the Multi-Instance admission of Script work). Their selecting gateway needs M2's Core JUEL level.
- CIB evidence needs GraalJS in the CIB runner, a dependency the owner approves; recommended: `org.graalvm.js:js` and `org.graalvm.js:js-scriptengine` at `21.3.12`, the CIB Run distribution's pin, in `runners/cibseven` only, which keeps the TypeScript and Temporal solution JVM-free.
- The differential harness supplies a script's recorded result to both kernels as an `effectResult` input computed once by the host evaluator, the same recorded value replay uses; Lean never evaluates JavaScript.
- Kernel tests: the arguments snapshot (nearest owner, one entry per name), the result patch rule, and the refusal rows.

## Open questions for the review

1. Whether the snapshot should be every visible variable (selected: CIB reads any of them by name, and the kernel cannot know which names a script reads) or a declared subset, which BPMN's Data Inputs would supply but CIB does not read.
2. Whether an evaluator failure of a script without `asyncBefore` should instead be a dynamic `unsupported` code of its own, since CIB rolls back the reaching command (recommended: no; the incident profile already separates host failures, and the classification row bounds the claim).
