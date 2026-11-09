# BPMN 2.0.2 standards profile

The [profile artifact](profile.json) is the standards reading of the reviewed feature surface. The kernel's behaviour options derive from a profile's relationship identifiers alone (`kernelProfileOptions` in the [kernel reader](../../packages/bpmn-source/src/kernel-reader/wire.ts)), and none of this profile's relationships selects a non-default option, so every decision point keeps its BPMN 2.0.2 meaning.

[OMG BPMN 2.0.2](../../docs/BPMN-CONFORMANCE-TARGET.md) is the normative authority. The profile's clause and table references are the union of those its retired predecessors cited, and a scenario may cite only references inside that set.

The relationships are [CIB-BPMN register](../../docs/CIB-BPMN-RELATION-REGISTER.md) entries that calibrate or bound the standard reading against CIB Seven. They are the union of the retired standards profiles' relationships and select no option.

The profile also names the CIB Seven 2.2.0 oracle and its environment, because retained CIB evidence for a standards scenario is checked against them (`scripts/contract-artifacts.ts`).

A scenario binds this profile while its result needs no CIB option. The [cumulative CIB profile](../cibseven-2.2.0/README.md) and its [scope-chain extension](../cibseven-2.2.0-scope-chain/README.md) take the scenarios whose results need CIB-INT-0007 or any other CIB option.

The 52 per-variant profiles that preceded this one and [cibseven-2.2.0](../cibseven-2.2.0/README.md) retired at the profile consolidation (#42); they remain in Git history at the parent of the consolidation commit.
