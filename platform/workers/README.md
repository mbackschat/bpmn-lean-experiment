# Platform Workers

This directory owns independently deployed product-2 Workers. Workers consume versioned request and result contracts, perform external computation, and do not import or enter the semantic core, mutate semantic state, or decide BPMN behavior.

The deferred [JUEL evaluator](juel-evaluator/README.md) has a reserved ownership location here. `runners/` remains exclusively for adapters to external executable oracles. See [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#repository-map).
