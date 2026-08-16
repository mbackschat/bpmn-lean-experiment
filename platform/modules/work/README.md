# Work module

`@bpmn-lean/platform-work` owns Product 2 human-work registration, discovery, detail, claim, release, completion, and self-audit behavior. It observes engine-published tasks through private locators and never stores task rows or host history as semantic truth.

## What you can do

Register confirmed Process instances, assemble the current actor-visible task inbox, inspect legacy or exact-catalog-bound structured detail, claim or release work, validate and submit retry-safe completion, and read the actor's audit trail. Structured forms support Text, Boolean, Integer, Date, Single choice, Multiple choice, multiple resolution actions, and action-dependent input without moving form semantics into Product 1.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-work test
```

## Learn more

- [Human-work specification](../../../docs/BPM-PLATFORM-HUMAN-WORK-SPEC.md) owns lifecycle, authorization, retry, and audit behavior.
- [Structured Human Work proposal](../../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-PROPOSAL.md) owns catalog joining, Zod-backed validation, canonical patch computation, and bounded structured form behavior until closure graduation.
- [Human-work walkthrough](../../../docs/HUMAN-WORK-WALKTHROUGH.md) follows the maintained user journey through the public UI.
- [Architecture](../../../docs/ARCHITECTURE.md#modules) owns the module boundary and persistence direction.
- [Implementation map](../../../docs/IMPLEMENTATION-MAP.md) records current Work capability and evidence.
