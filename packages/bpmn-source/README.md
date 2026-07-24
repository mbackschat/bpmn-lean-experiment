# BPMN source ingestion

`@bpmn-lean/bpmn-source` is the deployment-time boundary between untrusted BPMN XML and the dependency-free [TypeScript semantic core](../semantic-core/README.md). It retains defensive copies of exact bytes, computes SHA-256 identity before decoding, performs bounded security and encoding checks, imports a private metamodel-aware graph with `bpmn-moddle@10.0.0`, normalizes diagnostics, and compiles admitted source into project-owned serializable executable IR.

The current `bpmn-source-sequential-user-task` compiler accepts exactly one executable `None Start Event → User Task → None End Event` Process. The IR preserves the User Task ID and optional BPMN name, representing an omitted name as `null`. Every parser warning blocks admission, and unsupported elements or properties are rejected instead of discarded. Raw moddle objects never cross the package boundary.

```ts
const compilation = await compileSequentialUserTaskBpmn({
  bytes,
  sourceId: scenario.bpmn.id,
  expectedSha256: scenario.bpmn.sha256,
  semanticProfile: scenario.profile,
  limits: {
    maxBytes: 1024 * 1024,
    parserDeadlineMs: 1_000,
  },
});

switch (compilation.status) {
  case BpmnCompilationStatus.Accepted:
    return runScenario(scenario, compilation.executableIr);
  case BpmnCompilationStatus.Rejected:
    throw new Error(JSON.stringify(compilation.diagnostics));
}
```

The parser deadline bounds Promise settlement but cannot preempt synchronous parser CPU. Production handling of untrusted uploads still requires Worker or process isolation.

The bounded [CMOF-derived manifest](src/bpmn-2.0.2-sequential-user-task-metamodel.json) records only the types, inheritance, references, multiplicities, containment, and defaults consumed by this compiler. The local checker compares those facts with the exact ignored normative `BPMN20.cmof` when available. It does not claim a complete BPMN metamodel or operational semantics.

Run the focused gate:

```sh
./scripts/pnpm.sh run test:bpmn-source
```

Run the optional pinned MIWG interchange observation gate:

```sh
./scripts/pnpm.sh run test:miwg
```

MIWG files remain in their external CC-BY checkout. The gate classifies structural/profile admission without copying fixtures or claiming execution conformance.
