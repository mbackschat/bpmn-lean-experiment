# BPMN source ingestion

`@bpmn-lean/bpmn-source` is the deployment-time boundary between untrusted BPMN XML and the dependency-free [TypeScript semantic core](../semantic-core/README.md). It retains exact source bytes through a defensive-copy API, computes their SHA-256 identity before decoding, performs bounded security and encoding checks, imports a private metamodel-aware structural graph with `bpmn-moddle@10.0.0`, normalizes diagnostics, and compiles only admitted source into project-owned serializable executable IR. The parser deadline bounds Promise settlement but cannot preempt the library’s synchronous CPU work; production untrusted uploads still require Worker or process isolation.

The current compiler supports exactly one executable Process with `None Start Event → User Task → None End Event`. Every parser warning blocks admission, and unsupported BPMN elements or properties are rejected instead of being discarded. Raw moddle objects never cross the package boundary.

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

The bounded [CMOF-derived manifest](src/bpmn-2.0.2-m0-metamodel.json) records only the types, inheritance, references, multiplicities, containment, and default consumed by this compiler. The local checker compares those facts with the exact ignored normative `BPMN20.cmof` source when it is available. It does not claim a complete BPMN metamodel or operational semantics.

Run the focused gate from the repository root:

```sh
./scripts/pnpm.sh run test:bpmn-source
```

Run the optional pinned MIWG interchange observation gate:

```sh
./scripts/pnpm.sh run test:miwg
```

The MIWG files remain in their external CC-BY checkout. The gate captures exact bytes and classifies structural/profile admission; it does not copy fixtures or claim execution conformance.
