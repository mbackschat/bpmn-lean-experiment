import { FlowNodeMetricsResultKind } from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  FlowNodeMetricsSnapshot,
} from "@bpmn-lean/platform-contracts";

import type { FlowNodeMetricsApi } from "./flow-node-metrics-api.ts";
import { LatestRequest } from "./latest-request.ts";

export const FlowNodeMetricsLoadStateKind = {
  Available: "available",
  Unavailable: "unavailable",
} as const;

export type FlowNodeMetricsLoadState = Readonly<
  | {
      kind: typeof FlowNodeMetricsLoadStateKind.Available;
      snapshot: FlowNodeMetricsSnapshot;
    }
  | { kind: typeof FlowNodeMetricsLoadStateKind.Unavailable }
>;

/** Owns latest-only currentness across definition changes, Retry, and tab abandonment. */
export class FlowNodeMetricsLoader {
  readonly #api: FlowNodeMetricsApi;
  readonly #requests = new LatestRequest();

  constructor(api: FlowNodeMetricsApi) {
    this.#api = api;
  }

  async load(
    definition: DeployedDefinitionVersion,
  ): Promise<FlowNodeMetricsLoadState | null> {
    const generation = this.#requests.begin();
    try {
      const result = await this.#api.get(definition);
      if (!this.#requests.isCurrent(generation)) return null;
      switch (result.kind) {
        case FlowNodeMetricsResultKind.Available:
          return {
            kind: FlowNodeMetricsLoadStateKind.Available,
            snapshot: result.snapshot,
          };
        case FlowNodeMetricsResultKind.Unavailable:
          return { kind: FlowNodeMetricsLoadStateKind.Unavailable };
      }
    } catch {
      return this.#requests.isCurrent(generation)
        ? { kind: FlowNodeMetricsLoadStateKind.Unavailable }
        : null;
    }
  }

  invalidate(): void {
    this.#requests.invalidate();
  }
}
