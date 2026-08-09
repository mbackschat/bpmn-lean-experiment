# Engine API

`@bpmn-lean/engine-api` is product 1's narrow entry point for product 2. It exposes compilation identity and admission diagnostics without exposing the checked BPMN graph or Semantic Process program.

The current increment implements compilation only. Start, committed-state observation, and command submission remain absent until their M1 consumers land. [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#product-2-dependency-direction) owns the cross-product boundary.
