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

Every other option keeps the standards reading, including `scopeChainSubmissionBytes`, and the relationships the profile lists without an option row are provenance. A relationship whose option is mutually exclusive with one above is a decision point for a second cumulative profile, not a switch inside this one: the [scope-chain profile](../cibseven-2.2.0-scope-chain/README.md) is the first, because `CIB-EXT-0020` restricts User Task submissions that `CIB-EXT-0005` installs at the root.

[BPMN 2.0.2](../../docs/BPMN-CONFORMANCE-TARGET.md) stays the normative authority for the meaning the options do not change. The profile's clause and table references are the union of those every retired profile cited.

The oracle is the pinned CIB Seven 2.2.0 revision recorded in the profile, and its environment is the common base plus `createIncidentOnFailedJobEnabled`, which the incident scenarios need. Retained CIB evidence binds the exact bytes of this file, so a change here regenerates it on the hosted lane. The scope-chain profile claims no oracle, since no retained evidence binds it.

The [BPMN 2.0.2 standards profile](../bpmn-2.0.2/README.md) takes the scenarios whose results need no CIB option. The two CIB Seven 2.0.0 profiles retired into this one, and their evidence is regenerated on 2.2.0.

The 52 per-variant profiles that preceded this one and the standards profile retired at the profile consolidation (#42); they remain in Git history at the parent of the consolidation commit.
