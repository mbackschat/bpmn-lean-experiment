import type {
  AwaitEventRaceOperation,
  RuntimeState,
} from "../src/index.js";

declare const operation: AwaitEventRaceOperation;
declare const state: RuntimeState;

// @ts-expect-error Event-race configuration is deeply immutable
operation.message.configurationOrigin.elementId = "Other_Flow";

// @ts-expect-error Event-race member identities are deeply immutable
state.eventRaces[0].messageSubscriptionId.activation = 2;

// @ts-expect-error Event-race collections are deeply immutable
state.eventRaces.push(state.eventRaces[0]);
