import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import {
  DefinitionCorrelatedMessageResolutionKind,
  DefinitionCorrelatedMessageSemanticOutcomeKind,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionCorrelatedMessageCapabilities,
  DefinitionCorrelatedMessagePublication,
  DeployedDefinitionVersion,
  PublicCorrelatedMessageCapability,
} from "@bpmn-lean/platform-contracts";
import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";

import type { CorrelatedMessageApi } from "./correlated-message-api.ts";
import styles from "./correlated-message-panel.module.css";

export type CorrelatedMessagePanelProps = Readonly<{
  api: CorrelatedMessageApi;
  definition: DeployedDefinitionVersion;
}>;

/** Definition trigger for target-free Message correlation and exact retry identity. */
export function CorrelatedMessagePanel({
  api,
  definition,
}: CorrelatedMessagePanelProps) {
  const [capabilities, setCapabilities] =
    useState<DefinitionCorrelatedMessageCapabilities | null>(null);
  const [selectedCatchEventId, setSelectedCatchEventId] = useState("");
  const [commandId, setCommandId] = useState<string>(
    () => globalThis.crypto.randomUUID(),
  );
  const [messageValue, setMessageValue] = useState("");
  const [publication, setPublication] =
    useState<DefinitionCorrelatedMessagePublication | null>(null);
  const [busy, setBusy] = useState<"load" | "publish" | null>("load");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setCapabilities(null);
    setSelectedCatchEventId("");
    setPublication(null);
    setError(null);
    setBusy("load");
    void api.getCapabilities(definition).then((result) => {
      if (!current) return;
      setCapabilities(result);
      setSelectedCatchEventId(result.messages[0]?.catchEventId ?? "");
    }).catch((cause: unknown) => {
      if (current) setError(errorMessage(cause));
    }).finally(() => {
      if (current) setBusy(null);
    });
    return () => {
      current = false;
    };
  }, [api, definition]);

  const selected = capabilities?.messages.find(
    ({ catchEventId }) => catchEventId === selectedCatchEventId,
  );

  async function publish(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (capabilities === null || selected === undefined) return;
    setBusy("publish");
    setError(null);
    try {
      setPublication(await api.publish(
        commandId,
        capabilities,
        selected,
        { payload: { kind: "string", value: messageValue } },
      ));
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function refreshCapabilities(): Promise<void> {
    setBusy("load");
    setError(null);
    try {
      const result = await api.getCapabilities(definition);
      setCapabilities(result);
      setSelectedCatchEventId((current) =>
        result.messages.some(({ catchEventId }) => catchEventId === current)
          ? current
          : result.messages[0]?.catchEventId ?? ""
      );
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  function beginNewCommand(): void {
    setCommandId(globalThis.crypto.randomUUID());
    setPublication(null);
    setError(null);
  }

  return (
    <section className={styles.panel} aria-labelledby="correlated-message-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Exact-version Message correlation</p>
          <h2 id="correlated-message-heading">Correlated Message publication</h2>
          <p>
            The Message value supplies the correlation value. The engine selects a unique matching Process; this form supplies no Process locator.
          </p>
        </div>
        <Button
          variant={ButtonVariant.Secondary}
          isPending={busy !== null}
          onPress={() => { void refreshCapabilities(); }}
        >
          {busy === "load" ? "Loading…" : "Refresh capabilities"}
        </Button>
      </div>

      {capabilities === null ? (
        busy === "load" ? <p className={styles.notice} role="status">Loading correlated Message capabilities…</p> : null
      ) : capabilities.messages.length === 0 ? (
        <p className={styles.notice}>This exact definition version publishes no correlated Message capability.</p>
      ) : (
        <>
          <div className={styles.capabilities} aria-label="Published correlated Message capabilities">
            {capabilities.messages.map((capability) => (
              <CorrelatedMessageCapability
                key={capability.catchEventId}
                capability={capability}
                selected={capability.catchEventId === selectedCatchEventId}
              />
            ))}
          </div>
          <form className={styles.form} onSubmit={(event) => { void publish(event); }}>
            {capabilities.messages.length > 1 ? (
              <label>
                Catch Event
                <select
                  name="catchEventId"
                  value={selectedCatchEventId}
                  onChange={(event) => {
                    setSelectedCatchEventId(event.currentTarget.value);
                    setPublication(null);
                  }}
                >
                  {capabilities.messages.map((capability) => (
                    <option key={capability.catchEventId} value={capability.catchEventId}>
                      {capability.catchEventId}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              Command ID
              <input
                name="commandId"
                type="text"
                value={commandId}
                onChange={(event) => {
                  setCommandId(event.currentTarget.value);
                  setPublication(null);
                }}
                required
              />
              <small>Retry uses this unchanged ID and unchanged Message value.</small>
            </label>
            <label>
              Message value
              <input
                name="messageValue"
                type="text"
                value={messageValue}
                onChange={(event) => {
                  setMessageValue(event.currentTarget.value);
                  setPublication(null);
                }}
                required
              />
              <small>One non-empty string; no separate correlation-key field is accepted.</small>
            </label>
            <div className={styles.actions}>
              <Button type="submit" isPending={busy !== null}>
                {busy === "publish" ? "Publishing…" : "Publish correlated Message"}
              </Button>
              <Button
                variant={ButtonVariant.Secondary}
                isPending={busy !== null}
                onPress={beginNewCommand}
              >
                New command
              </Button>
            </div>
          </form>
        </>
      )}

      {error === null ? null : <p className={styles.error} role="alert">{error}</p>}
      {publication === null ? null : (
        <CorrelatedMessagePublicationResult publication={publication} />
      )}
    </section>
  );
}

function CorrelatedMessageCapability({
  capability,
  selected,
}: Readonly<{
  capability: PublicCorrelatedMessageCapability;
  selected: boolean;
}>) {
  return (
    <dl aria-current={selected ? "true" : undefined}>
      <div>
        <dt>Catch Event</dt>
        <dd><code>{capability.catchEventId}</code></dd>
      </div>
      <div>
        <dt>Interface Operation</dt>
        <dd><code>{capability.channel.interfaceId} / {capability.channel.interfaceOperationId}</code></dd>
      </div>
      <div>
        <dt>Message</dt>
        <dd><code>{capability.channel.messageId}</code></dd>
      </div>
      <div>
        <dt>Correlation key</dt>
        <dd><code>{capability.correlationKeyId}</code></dd>
      </div>
    </dl>
  );
}

/** Pure renderer for the closed user-visible resolution union. */
export function CorrelatedMessagePublicationResult({
  publication,
}: Readonly<{ publication: DefinitionCorrelatedMessagePublication }>) {
  const { resolution } = publication;
  switch (resolution.kind) {
    case DefinitionCorrelatedMessageResolutionKind.Semantic:
      switch (resolution.outcome.kind) {
        case DefinitionCorrelatedMessageSemanticOutcomeKind.Committed:
          return (
            <ResultFrame publication={publication} tone="accepted" title="Delivered to one matching Process">
              <p>The engine selected Process instance <code>{resolution.outcome.target.processInstanceId}</code>.</p>
            </ResultFrame>
          );
        case DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch:
          return (
            <ResultFrame publication={publication} tone="rejected" title="No matching subscription">
              <p>No Process changed. The current population contained no exact key match.</p>
            </ResultFrame>
          );
        case DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous:
          return (
            <ResultFrame publication={publication} tone="rejected" title="Multiple matching subscriptions">
              <p>No Process changed. Ambiguity is an explicit semantic refusal, never an arbitrary selection.</p>
            </ResultFrame>
          );
        default:
          return assertNever(resolution.outcome);
      }
    case DefinitionCorrelatedMessageResolutionKind.Capacity:
      return (
        <ResultFrame publication={publication} tone="indeterminate" title="Publication not accepted">
          <p>
            The {resolution.failure.kind} {resolution.failure.measure} bound of {resolution.failure.configuredBound} was exceeded by {resolution.failure.observedValue}.
          </p>
        </ResultFrame>
      );
    case DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate:
      return (
        <ResultFrame publication={publication} tone="indeterminate" title="Delivery indeterminate">
          <p>Retry the same command ID and Message value. No semantic outcome is claimed.</p>
        </ResultFrame>
      );
    default:
      return assertNever(resolution);
  }
}

function ResultFrame({
  publication,
  tone,
  title,
  children,
}: Readonly<{
  publication: DefinitionCorrelatedMessagePublication;
  tone: "accepted" | "rejected" | "indeterminate";
  title: string;
  children: ReactNode;
}>) {
  return (
    <div className={`${styles.result} ${styles[tone]}`} aria-live="polite">
      <strong>{title}</strong>
      {children}
      <dl>
        <div>
          <dt>Command</dt>
          <dd><code>{publication.resolution.commandId}</code></dd>
        </div>
        <div>
          <dt>Ingress ordinal</dt>
          <dd>{publication.resolution.ingressOrdinal ?? "Not assigned"}</dd>
        </div>
        <div>
          <dt>Catch Event</dt>
          <dd><code>{publication.correlatedMessage.catchEventId}</code></dd>
        </div>
      </dl>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown platform failure";
}

function assertNever(value: never): never {
  throw new Error(`unexpected correlated Message value: ${String(value)}`);
}
