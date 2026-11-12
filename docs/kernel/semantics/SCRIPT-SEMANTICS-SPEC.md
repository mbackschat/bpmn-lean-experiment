# Script semantics

## Status

Interpretation for PC-AUTO-05, written 2026-11-10 and revised 2026-11-12 after its cold interpretation review ([review rule](../ARCHITECTURE-SPEC.md#review)), which approved it with the changes applied here, and after the root's probe P1 on GraalJS; PC-AUTO-06 executes it. The [owner decision](../ARCHITECTURE-SPEC.md#owner-decisions-on-the-path) of 2026-11-08 binds it: JavaScript Script Tasks run in the TypeScript host's built-in Node `vm` with a read-only context and no host objects, the result is recorded like an effect result so replay never reruns it, and other languages are refused. "Read-only context" is read as "no write-back": a script may assign to its names, and no assignment reaches a variable. The kernel performs no I/O and runs no script. The owner approved GraalJS `21.3.12` in the CIB runner only (2026-11-12), never in the TypeScript and Temporal solution.

What a Script Task does once its occurrence has begun, beside the [work semantics](WORK-SEMANTICS-SPEC.md), which own every other work kind. CIB Java paths are relative to `engine/src/main/java/org/cibseven/bpm/engine/impl/` of the pinned CIB Seven `2.2.0` checkout, `pom.xml` paths to its root ([SOURCES](../../SOURCES.md)).

## Normative basis

BPMN 2.0.2 §10.3.3 (Table 10.12) gives the Script Task a `scriptFormat`, which "MUST be specified with a mime-type format", and a `script`; §13.3.3 has it run the script when it is activated and complete when the script ends. §10.4.1 "Script Task Mapping" gives a script access to "the Data Input, Data Output and the data aware elements available in the scope of the Script Task". BPMN defines no script language, no binding of those elements to script names and no result assignment. So reading every visible variable follows the standard, and discarding a script's writes is a restriction of this profile, never the general meaning of the construct. Everything else below is a profile selection.

CIB's language names (`javascript`, `ecmascript`, `js`) are not MIME types; the kernel reads them as CIB does and claims no MIME reading.

## CIB Seven 2.2.0

| Fact | Source |
|---|---|
| The language is `scriptFormat`, lower-cased; an absent one is `juel` | `bpmn/parser/BpmnParse.java:2196-2201`, `scripting/engine/ScriptingEngines.java:54,100-104` |
| `javascript` and `ecmascript`, ignoring case, resolve to the configured JavaScript engine, GraalJS by default; any other name is looked up by engine name and configured as GraalJS when that engine answers it, which `js` does | `scripting/engine/DefaultScriptEngineResolver.java:76-89,91-104,118-126`; P1 |
| A script with no engine for its language fails when it runs: `Can't find scripting engine for 'javascript'`. The engine module has GraalJS in test scope only; the CIB Run distribution and the project's CIB runner add GraalJS `21.3.12` | `scripting/engine/ScriptingEngines.java:143`, `engine/pom.xml:332-342`, `distro/run/pom.xml:32`, `parent/pom.xml:32` |
| A source whose text after Java's `trim` starts with `${` or `#{` under a non-JUEL language is evaluated as JUEL first and its value run as the script | `util/ScriptUtil.java:89-93,192-194`, `util/StringUtil.java:58-61` |
| A script reads every variable visible from its execution by bare name, and the name `execution` is the execution itself, with its whole API | `scripting/engine/VariableScopeResolver.java`, `scripting/engine/ScriptBindings.java` |
| GraalJS gets host access and host class lookup by default, so `Java.type` reaches any class | `scripting/engine/CamundaScriptEngineManager.java:195-203`, `cfg/ProcessEngineConfigurationImpl.java:609`; P1 |
| An assignment to a script name rebinds it in the script's own bindings, so later reads in the script see the new value, and is never stored unless `autoStoreScriptVariables` (default `false`) | `scripting/engine/ScriptBindings.java:108-134`, `cfg/ProcessEngineConfigurationImpl.java:603`; P1 |
| A non-null result is written with `execution.setVariable(resultVariable, result)`, to the nearest scope holding the name, else the Process instance; a null result writes nothing | `bpmn/behavior/ScriptTaskActivityBehavior.java:56-59`; P1 |
| A thrown exception goes through `executeWithErrorPropagation`: a `BpmnError` cause raises that Error; any other exception may be caught by an Error catch naming its Java class (CIB-EXT-0029), else it fails the command (rolled back) or, after `asyncBefore`, the job (retry, incident) | `bpmn/behavior/AbstractBpmnActivityBehavior.java:87-109`, `bpmn/parser/ErrorEventDefinition.java:75-97` |

### Probe P1 (2026-11-12)

The root ran one probe on CIB Seven `2.2.0` with GraalJS `21.3.12`, H2 and the runner's engine configuration; the probe stays outside the repository.

| Question | Observed |
|---|---|
| Number results | `2147483647` is a `java.lang.Integer`; `-2147483648`, `2147483648`, `Math.pow(2, 53)`, `0.5 * 4` and `1.5` are `Double`s: only an integer GraalJS keeps as an `int` arrives as `Integer`, and an integral value reached through negation or arithmetic may arrive as `Double` |
| `undefined`, `null` | no variable is written for either |
| A lone surrogate (`'a\uD800b'`) | committed as a String |
| A String over 4,000 characters | the command fails in persistence (H2 `TEXT_ VARCHAR(4000)`, `ProcessEnginePersistenceException`) and rolls back |
| A List or Map variable | a host object: an `ArrayList` reads with `Array.isArray` true, `length` and indices, and has a `size` function; a `LinkedHashMap` reads its entries as properties and exposes `get` and 35 host members to `Object.keys`; `push` on the list throws `TypeError` and the list keeps its elements |
| Write-back | `price = 'changed'; price` answers `'changed'`; the next script reads `'6'` |
| Edition | `String.prototype.replaceAll` exists; `Array.prototype.at`, `Object.hasOwn` and `Array.prototype.findLast` do not: an ECMAScript 2021 library |
| Formats | `ECMAScript` and `js` run |
| Host access | `Java.type('java.lang.Integer').MAX_VALUE`, `execution.getVariable('price')` and `eval('1 + 2')` all commit |

## Selected contract

1. **Profile.** One option, `ProfileOptions.scriptTask`: `refused` under the standards profile, which refuses every Script Task (`work.script`), since BPMN names no script language; `javascript` under both CIB profiles, which selects this contract.
2. **Admitted form.** A Script Task whose `scriptFormat` is `javascript`, `ecmascript` or `js` ignoring ASCII case, whose script is inline (no `camunda:resource`), present, and does not start with `${` or `#{` after Java's `trim`, which CIB would evaluate as JUEL first, and whose `camunda:resultVariable` is absent or a name. No input or output mappings (`activity.inputMappings`, `activity.outputMappings` stay) and no Multi-Instance body until a Multi-Instance row admits it. Any other language, `juel` and the absent format included, is refused.
3. **Effect.** The occurrence opens one effect item, exactly as a Service Task's ([work semantics](WORK-SEMANTICS-SPEC.md#service-tasks-and-effects)), with the neutral descriptor `(urn:bpmn-lean:effect-protocol:script-v1, javascript)` and, as arguments committed when it opens, the snapshot of every variable visible from the occurrence's scope occurrence, nearest owner first, one entry per name, whatever its kind. The host reads the source from the program by the item's element, identified by its author's identifier together with the called definition the wait runs in, never the identifier alone, which two carried versions of one called definition share. Only the effect's result closes it, so the kernel never runs the script and replay reuses the recorded result.
4. **Context.** The host evaluates the source as one classic (sloppy-mode) script in a fresh `vm` context whose global object holds the snapshot and the ECMAScript 2021 intrinsics, and nothing else: no `execution`, `require`, `process`, `console`, `Java`, timers or module loader. The host removes the built-ins of later editions that it lists (among them `Array.prototype.at`, `findLast` and `findLastIndex`, `Object.hasOwn`, `String.prototype.at`, the ECMAScript 2023 copying Array methods and `Object.groupBy`), so a script calling one fails as it does in CIB; later syntax stays outside the claim. Code generation from strings (`eval`, `Function`) stays available, as in CIB: it computes over the same frozen snapshot and reaches nothing else. A snapshot name is an ordinary writable global, as in CIB's bindings; an assignment to it, or a new global, stays in the context and is discarded with it, so nothing is written back. A value maps by kind: String to string, Boolean to boolean, Null to `null`, Integer to number, `stringList` and List to a frozen array, Map to a frozen null-prototype object; frozen, because a mutation would otherwise be invisible to the kernel. A variable of any other kind is left out, and a read of a left-out name answers `unsupported` (item 6), never a reference to a missing name.
5. **Result.** The completion value of the script. `undefined` and `null` write nothing. A boolean, an integer-valued number in 0..2^31−1 (Java's `int` range within the portable Integer domain 0..2^53−1, [data semantics](DATA-SEMANTICS-SPEC.md#values)), and a string that is well-formed UTF-16 (no lone surrogate) and at most 1,024 UTF-8 bytes, the portable String bound, are reported as the success patch `[(resultVariable, value)]`; the kernel writes it with the nearest-owner rule, the same place `execution.setVariable` writes. Without a result variable the completion value is discarded whatever it is and the patch is empty, since CIB then writes nothing. Any other completion value of a task that names a result variable (a negative number, a fraction, an integer above 2^31−1, `NaN`, a lone surrogate, a longer string, an object, an array, a function, a promise) answers `unsupported`, never a rejection of the value at ingress.
6. **Unsupported.** What the profile cannot represent is not a script failure: a result outside item 5's domain (`script-result-unrepresentable`), a read of a left-out variable (`script-value-unrepresentable`) and a reference to `execution` or `Java` (`script-host-object`) each answer the effect outcome `unsupported` with that code (`EffectOutcome.unsupported`), which the kernel ends as the semantic outcome `unsupported` with the state unchanged.
7. **Failure.** A thrown value, including a reference to a name neither visible nor a host binding and a call of a removed built-in, and the host's evaluation deadline are one technical failure of the effect: `unsupported` (`effect-technical-failure`) unless the profile selects incidents, then an incident whose retry evaluates the source again over the snapshot committed at activation. A script has no way to raise a BPMN Error, since it reaches no `BpmnError` class.
8. **Determinism.** `Math.random` and `Date` are intrinsics and stay available; the recorded result makes a nondeterministic script safe to replay. The host's evaluation deadline is host configuration, not semantics.

The kernel's effect result for a Script Task accepts only the empty patch or the one-entry patch on its result variable; any other patch is rejected (`undeclared-output`, or `duplicate-output` for a name given twice).

## Claim boundary

The CIB comparison holds for a Script Task that reads only String, Boolean, Null and Integer snapshot names, returns a value item 5 admits, and either runs behind `asyncBefore` or succeeds. Outside it:

- A number result whose Java type the source does not fix: P1 shows GraalJS hands CIB an `Integer` only for an integer it keeps as an `int`, and a `Double` for one reached through negation, division, fractional arithmetic or a `Math` function, which the host cannot tell from the value.
- A synchronous script that fails: CIB rolls the reaching command back (`AbstractBpmnActivityBehavior.java:87-109`), while the kernel committed the activation before the effect's result; no comparator mechanism expresses that, so those runs are outside the claim and owned by a limitation entry.
- Reads of a List, Map or `stringList` variable: CIB hands GraalJS host objects whose members and `Object.keys` differ from the kernel's frozen values (P1).
- A string result CIB cannot store: one over 4,000 characters fails CIB's command in persistence on H2 (P1), and the kernel answers `unsupported` for every string beyond its own bound.
- An incident retry after a variable changed: the kernel evaluates the activation's snapshot again, CIB's job re-reads the live variables; an operational mapping recorded with the behavior.
- A script that uses `execution` or `Java`, which CIB runs with host access (P1) and the kernel answers `unsupported`.
- A Script failure caught by an Error catch that names a Java exception class, CIB-EXT-0029's boundary.
- Syntax beyond ECMAScript 2021, which Node parses and GraalJS `21.3.12` may not, and results that depend on locale, `Intl`, time zone or the string form of a `Date`, which the JVM and Node format differently.

## Classification drafts

These land in the register with PC-AUTO-06's behavior, not before.

| Draft | Lane | Proposition |
|---|---|---|
| Script effect | extension | A JavaScript Script Task is an effect the host evaluates over a committed snapshot in a host-object-free context; its result is recorded and written to `resultVariable` by the nearest-owner rule. Boundary: the contract and claim boundary above. |
| Synchronous script | operational mapping | CIB evaluates a Script Task without `asyncBefore` inside the command that reaches it; the project commits the effect at activation and its result as the next input. The differential folds a successful result into the reaching command as it already does for synchronous delegates (`foldSynchronousEffects`, CIB-OP-0002). |
| Synchronous failure | limitation | A failing synchronous script rolls CIB's reaching command back, which the kernel's committed activation does not; such runs are compared for nothing beyond this entry. |
| Retry snapshot | operational mapping | An incident retry evaluates the activation's snapshot; CIB's retried job reads the variables live. |
| Host objects and number types | limitation | CIB binds `execution` and, with host access, every Java class, hands collections over as host objects, and types a number result by GraalJS's internal representation; the profile binds neither host object, freezes collections and types an integer-valued result as Integer. |
| Oracle engine | configuration | CIB evaluates JavaScript only with GraalJS on its classpath (`21.3.12`, the CIB Run distribution's pin and the runner's). |

## IL shape

The `kernel-shape` commit of track M10 carries what the contract needs, with its TypeScript, codec, schema and fixture pairs:

```lean
structure ScriptWork where
  format : String
  source : Option String := none                   -- absent `script` element: none; refused (`work.script.source`)
  resultVariable : Option String := none           -- `camunda:resultVariable`, else `camunda:resultVariableName`
  resource : Option String := none                 -- refused (`work.script.resource`)

inductive ScriptTask where | refused | javascript  -- `ProfileOptions.scriptTask`, default `refused`

inductive EffectOutcome where                      -- in `Kernel.State.Input`
  | success (outputs : List (String × Value))
  | businessFailure (code : String) (message : Option String) (outputs : List (String × Value))
  | technicalFailure
  | unsupported (code : String)                    -- a value or behavior the portable domain cannot represent
```

Per the [forward-compatible rule](../../../CLAUDE.md#forward-compatible-restrictions), the resource is carried and refused. The reader reads `camunda:resultVariableName` only where `camunda:resultVariable` is absent, CIB's precedence (`BpmnParse.java:2221-2228`), and an absent `script` element as `none`, distinct from an empty one, since `ScriptUtil#getScript` refuses a Script Task with neither (`ScriptUtil.java:66-75`). `EffectOutcome.unsupported` is a general effect outcome: a host reports it only for a value or behavior the portable domain cannot represent, never for a transport or infrastructure failure, and the kernel gives it the same meaning for every effect kind.

No state shape changes otherwise: the effect item reuses `EffectDetail`, and the source stays in the program.

## Refusal codes

| Code | Refused |
|---|---|
| `work.script` | any Script Task under `ScriptTask.refused` |
| `work.script.language` | a `scriptFormat` other than `javascript`, `ecmascript` or `js`, ignoring ASCII case, the absent one included |
| `work.script.source` | a Script Task with neither a `script` nor a `camunda:resource` |
| `work.script.sourceExpression` | a source that starts with `${` or `#{` after Java's `trim` |
| `work.script.resource` | a script referenced by `camunda:resource` |
| `activity.inputMappings`, `activity.outputMappings` | mappings on a Script Task (unchanged) |
| `activity.multiInstanceBody` | a Multi-Instance Script Task (unchanged) |
| dynamic: `script-result-unrepresentable`, `script-value-unrepresentable`, `script-host-object` | item 6 |
| dynamic: `effect-technical-failure` | a thrown value or the deadline without the incident profile (unchanged) |

## Witness plan

- The retained [JavaScript Script Task witnesses](../../../scenarios/open-rows/script-task-javascript/README.md): `probe-arithmetic-total` and `probe-text-label` are the two transformations; `probe-host-mutation` a host object (`unsupported` in the kernel, a success in CIB); `probe-unknown-name` and `probe-thrown-error` synchronous failures, outside the claim; `probe-other-language-juel` the refused language; `probe-randomness` and `probe-wall-clock` recorded nondeterminism. `nested-scope-write` and `multi-instance-body` put the Script Task in a Sub-Process and in a Multi-Instance body, one model each, since one Multi-Instance refusal would hide the nested write. Their selecting gateway needs M2's Core JUEL level.
- The differential harness supplies a script's recorded result to both kernels as an `effectResult` input computed once by the host evaluator, the same recorded value replay uses; Lean never evaluates JavaScript. The CIB runner reports a synchronous script's execution as it reports a synchronous delegate's, so the fold applies.
- Kernel tests: the arguments snapshot (nearest owner, one entry per name), the result patch rule, the refusal rows, and a stale script result after its scope was cancelled, which no schedule can author.

## Review answers

1. The snapshot is every visible variable: §10.4.1 gives the script the scope's data, CIB reads any of them by name, and the kernel cannot know which names a script reads.
2. A synchronous script's failure keeps the effect's technical-failure outcome and is outside the CIB claim, owned by a limitation entry, since no comparator mechanism expresses CIB's rollback of the reaching command.
