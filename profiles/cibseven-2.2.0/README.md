# CIB Seven 2.2.0 cumulative profile

The [profile artifact](profile.json) is the CIB Seven 2.2.0 compatibility profile: the union of every retired per-variant profile's relationships plus `CIB-INT-0007`, without `CIB-EXT-0020`. The kernel's behaviour options derive from those relationship identifiers alone (`kernelProfileOptions` in the [kernel reader](../../packages/bpmn-source/src/kernel-reader/wire.ts)), so this profile selects the CIB reading wherever a [register](../../docs/CIB-BPMN-RELATION-REGISTER.md) relationship names a non-default option and the standards reading everywhere else.

| Kernel option | Value | Selected by |
|---|---|---|
| `submission` | `installsVariables` | `CIB-EXT-0005`, `CIB-EXT-0010` |
| `undeclaredWrite` | `atInstanceRoot` | `CIB-EXT-0005`, `CIB-EXT-0007`, `CIB-EXT-0009`, `CIB-EXT-0020` |
| `errorPathOutputs` | `mapped` | `CIB-EXT-0004`, `CIB-EXT-0009`, `CIB-EXT-0016` |
| `technicalFailure` | `incident` | `CIB-EXT-0013`, `CIB-OP-0008`, `CIB-CFG-0008` |
| `incidentProcessCancellation` | `true` | `CIB-OP-0009` |
| `abnormalScopeEnd` | `completesNormally` | `CIB-INT-0007` |
| `unhandledError` | `endsThrowingPath` | `CIB-INT-0013` |
| `errorCatchVariables` | `eventScope` | `CIB-EXT-0028` |
| `multiInstanceBinding` | `loopReferences` | `CIB-INT-0014` |
| `effectResultValues` | `activityLocals` | `CIB-EXT-0015` |

Every other option keeps the standards reading, including `scopeChainSubmissionBytes`, and the relationships the profile lists without an option row are provenance. A relationship whose option is mutually exclusive with one above is a decision point for a second cumulative profile, not a switch inside this one: the [scope-chain profile](../cibseven-2.2.0-scope-chain/README.md) is the first, because `CIB-EXT-0020` restricts User Task submissions that `CIB-EXT-0005` installs at the root.

Three CIB behaviours inside this profile's admitted surface are knowingly not imitated, so a run there differs from CIB's:

- **Unconsumed results outside Multi-Instance** (`CIB-EXT-0015`, owner `PC-DATA-06`). `effectResultValues = activityLocals` applies to the instances of a Multi-Instance Activity only. Elsewhere an effect result value no output mapping consumes is rejected as `undeclared-output`, while CIB discards it on a task with output parameters, which makes the task a scope, and keeps it as a Process variable on a task without them (`BpmnParse.java:4797-4814`).

- **Java exception-class codes** (`CIB-EXT-0029`, unselected). CIB lets an Error code name a Java exception class that a technical failure then matches; the kernel catches only business failures by code, so such a technical failure becomes an incident instead of taking the boundary.
- **Intermediate Sub-Processes on the error path** (`CIB-EXT-0016`). When an Error is caught by a boundary of an ancestor more than one level out, CIB runs the output parameters of every Sub-Process it destroys between the thrower and the catching host; the kernel writes only the thrower's and the interrupted host's.

[BPMN 2.0.2](../../docs/BPMN-CONFORMANCE-TARGET.md) stays the normative authority for the meaning the options do not change. The profile's clause and table references are the union of those every retired profile cited.

The oracle is the pinned CIB Seven 2.2.0 revision recorded in the profile, and its environment is the common base plus `createIncidentOnFailedJobEnabled`, which the incident scenarios need, and `enableExceptionsAfterUnhandledBpmnError = false`, pinned at CIB's default because `unhandledError` depends on it (`CIB-CFG-0010`). Retained CIB evidence binds the exact bytes of this file, so a change here regenerates it on the hosted lane. The scope-chain profile claims no oracle, since no retained evidence binds it.

The [BPMN 2.0.2 standards profile](../bpmn-2.0.2/README.md) takes the scenarios whose results need no CIB option. The two CIB Seven 2.0.0 profiles retired into this one, and their evidence is regenerated on 2.2.0.

The 52 per-variant profiles that preceded this one and the standards profile retired at the profile consolidation (#42); they remain in Git history at the parent of the consolidation commit.
