# Expense exception review scenarios

The three answer-free schedules use one content-addressed [expense exception review source](process.bpmn). The Process starts with no variables, opens `ReviewException` for literal candidate group `reviewers`, and completes it with one atomic patch before the existing Simple Boolean String-equality gateway selects Approved, Changes requested, or the default Aborted end.

The [Approve schedule](approve.scenario.json) carries a non-negative integer and a duplicate-preserving ordered String list as a direct Product 1 value-domain witness. The [Request changes schedule](request-changes.scenario.json) selects the second conditional route, and the [Abort schedule](abort.scenario.json) selects the default. The scenarios contain no expected answers and have no retained CIB terminal evidence. A separate CIB prefix probe may inspect the candidate group and absence of CIB form data before gateway evaluation.

The source also contains BPMN Documentation and an opaque Rendering extension that Product 2 projects into its definition-bound catalog. Rendering contents never enter semantic execution. The [structured Human Work specification](../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the exact value, metadata, routing, Product 2 form, and evidence boundaries.
