import { useState } from "react";
import type { FormEvent } from "react";

import { MessageStartPublicationStatus } from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  MessageStartPublication,
  PublicMessageStartCapability,
} from "@bpmn-lean/platform-contracts";

import type { MessageStartPublicationApiClient } from "./message-start-publication-api";
import styles from "./message-start-publication-panel.module.css";

export type MessageStartPublicationPanelProps = Readonly<{
  api: MessageStartPublicationApiClient;
  definition: DeployedDefinitionVersion;
}>;

export function MessageStartPublicationPanel({
  api,
  definition,
}: MessageStartPublicationPanelProps) {
  const messageStarts = definition.startCapabilities.messageStarts;
  const selectedCapability = messageStarts.length === 1 ? messageStarts[0] : undefined;
  const [publicationId, setPublicationId] = useState<string>(
    () => globalThis.crypto.randomUUID(),
  );
  const [publication, setPublication] = useState<MessageStartPublication | null>(null);
  const [busy, setBusy] = useState<"publish" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function publish(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (selectedCapability === undefined) {
      return;
    }
    setBusy("publish");
    setError(null);
    try {
      setPublication(await api.publish(
        publicationId,
        definition,
        selectedCapability,
      ));
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function refresh(): Promise<void> {
    if (publication === null || selectedCapability === undefined) {
      return;
    }
    setBusy("refresh");
    setError(null);
    try {
      setPublication(await api.get(
        publication.publicationId,
        definition,
        selectedCapability,
      ));
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="message-publication-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Exact-version Message Start</p>
          <h2 id="message-publication-heading">Message Start publication</h2>
          <p>
            One publication remains bound to {definition.processId}, version {definition.version}.
          </p>
        </div>
        {publication === null ? null : (
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={busy !== null}
            onClick={() => { void refresh(); }}
          >
            {busy === "refresh" ? "Refreshing…" : "Refresh publication"}
          </button>
        )}
      </div>

      <div className={styles.capabilities} aria-label="Published Message Start capabilities">
        {messageStarts.length === 0 ? (
          <p>This exact version publishes no Message Start capability.</p>
        ) : messageStarts.map((messageStart, index) => (
          <MessageStartCapability
            key={index}
            capability={messageStart}
          />
        ))}
      </div>

      {selectedCapability === undefined ? (
        messageStarts.length > 1 ? (
          <p className={styles.notice}>
            Publication is unavailable because this version publishes multiple Message Start capabilities.
          </p>
        ) : null
      ) : publication === null ? (
        <form
          className={styles.form}
          onSubmit={(event) => { void publish(event); }}
        >
          <label>
            Publication ID
            <input
              name="publicationId"
              type="text"
              value={publicationId}
              onChange={(event) => { setPublicationId(event.currentTarget.value); }}
              required
            />
            <small>This caller-owned ID makes an identical retry refer to the same publication.</small>
          </label>
          <button type="submit" disabled={busy !== null}>
            {busy === "publish" ? "Publishing…" : "Publish Message Start"}
          </button>
        </form>
      ) : null}

      {error === null ? null : <p className={styles.error} role="alert">{error}</p>}
      <PublicationResult publication={publication} />
    </section>
  );
}

function MessageStartCapability({
  capability,
}: Readonly<{ capability: PublicMessageStartCapability }>) {
  return (
    <dl>
      <div>
        <dt>Start Event</dt>
        <dd><code>{capability.startEventId}</code></dd>
      </div>
      <div>
        <dt>Channel</dt>
        <dd><code>{capability.channel.kind}</code></dd>
      </div>
      <div>
        <dt>Interface</dt>
        <dd><code>{capability.channel.interfaceId}</code></dd>
      </div>
      <div>
        <dt>Interface Operation</dt>
        <dd><code>{capability.channel.interfaceOperationId}</code></dd>
      </div>
      <div>
        <dt>Message</dt>
        <dd><code>{capability.channel.messageId}</code></dd>
      </div>
    </dl>
  );
}

function PublicationResult({
  publication,
}: Readonly<{ publication: MessageStartPublication | null }>) {
  if (publication === null) {
    return null;
  }
  switch (publication.status) {
    case MessageStartPublicationStatus.Pending:
      return (
        <div className={`${styles.result} ${styles.pending}`} aria-live="polite">
          <strong>Delivery pending</strong>
          <code>{publication.publicationId}</code>
          <p>The durable publication has not reached a terminal delivery classification.</p>
        </div>
      );
    case MessageStartPublicationStatus.Accepted:
      return (
        <div className={`${styles.result} ${styles.accepted}`} aria-live="polite">
          <strong>Publication accepted</strong>
          <code>{publication.publicationId}</code>
          <dl>
            <div>
              <dt>Process instance</dt>
              <dd><code>{publication.instance.processInstanceId}</code></dd>
            </div>
            <div>
              <dt>Definition</dt>
              <dd>
                {publication.instance.definition.processId}, version {publication.instance.definition.version}
              </dd>
            </div>
          </dl>
        </div>
      );
    case MessageStartPublicationStatus.Indeterminate:
      return (
        <div className={`${styles.result} ${styles.indeterminate}`} aria-live="polite">
          <strong>Delivery indeterminate</strong>
          <code>{publication.publicationId}</code>
          <p>No retained host execution establishes acceptance. No Process instance is published.</p>
        </div>
      );
    default:
      return assertNever(publication);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown platform failure";
}

function assertNever(value: never): never {
  throw new Error(`unexpected Message Start publication: ${String(value)}`);
}
