import type {
  CachedLocalEnvironmentOptions,
  CachedTimeSkippingEnvironmentOptions,
} from "@bpmn-lean/temporal-testkit";

const localOptions = {
  identity: "local-type-test",
  downloadDirectory: ".cache/temporal",
  cliVersion: "v1.8.1",
} as const satisfies CachedLocalEnvironmentOptions;

const timeSkippingOptions = {
  identity: "time-skipping-type-test",
  downloadDirectory: ".cache/temporal",
  // @ts-expect-error The time-skipping executable version is owned by the SDK.
  cliVersion: "v1.8.1",
} as const satisfies CachedTimeSkippingEnvironmentOptions;

void localOptions;
void timeSkippingOptions;
