import { reportM3HostFailure } from "./host-log.ts";
import { runShowcaseHost } from "./host-runtime.ts";
import { invoiceRecoveryEffects } from "./invoice-effects.ts";

await runShowcaseHost(invoiceRecoveryEffects).catch((error: unknown) => {
  reportM3HostFailure(error);
  process.exitCode = 1;
});
