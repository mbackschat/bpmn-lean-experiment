# Contract types

`@bpmn-lean/contract-types` provides neutral, type-only utilities shared by engine and platform contracts. It contains no BPMN, transport, persistence, or runtime behavior.

## What you can do

Use `DeepReadonly<T>` to make nested contract values immutable while preserving callable, tuple, and union types.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/contract-types test
```

## Learn more

- [`src/index.ts`](src/index.ts) owns the public type utility.
- [`test/deep-readonly.type-test.ts`](test/deep-readonly.type-test.ts) owns its compile-time contract.
- [Shared wire contracts](../../contracts/README.md) explains the cross-language artifacts that use these utilities.
