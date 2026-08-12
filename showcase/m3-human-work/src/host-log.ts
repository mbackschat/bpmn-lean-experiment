export const m3HostFailureDiagnostic = "M3 Human Work showcase failed";

export type M3HostDiagnosticSink = (message: string) => void;

/** Emits a stable public diagnostic without forwarding untrusted host failure facts. */
export function reportM3HostFailure(
  _failure: unknown,
  sink: M3HostDiagnosticSink = (message) => console.error(message),
): void {
  sink(m3HostFailureDiagnostic);
}
