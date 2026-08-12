# Contract types

`@bpmn-lean/contract-types` is the neutral, type-only owner of shared immutable contract utilities. It contains no BPMN, engine, platform, transport, or runtime behavior.

## Owners

- [`src/index.ts`](src/index.ts) owns the tuple-preserving and union-distributive `DeepReadonly<T>` utility.
- [`test/deep-readonly.type-test.ts`](test/deep-readonly.type-test.ts) proves recursive immutability while retaining callable, tuple, and union types.
