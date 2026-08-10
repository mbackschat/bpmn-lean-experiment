import type { Server } from "node:http";

export interface CloseableResource {
  close(): void | Promise<void>;
}

export interface PlatformServerRuntime {
  listen(): Promise<string>;
  close(): Promise<void>;
}

/** Owns the socket and composed resource lifecycle after wiring completes. */
export class NodePlatformServerRuntime implements PlatformServerRuntime {
  readonly #server: Server;
  readonly #resources: ReadonlyArray<CloseableResource>;
  readonly #host: string;
  readonly #port: number;
  readonly #publicOrigin: string;
  #listenPromise: Promise<string> | null = null;
  #closePromise: Promise<void> | null = null;

  constructor(
    server: Server,
    resources: ReadonlyArray<CloseableResource>,
    options: Readonly<{
      host: string;
      port: number;
      publicOrigin: string;
    }>,
  ) {
    this.#server = server;
    this.#resources = [...resources];
    this.#host = options.host;
    this.#port = options.port;
    this.#publicOrigin = options.publicOrigin;
  }

  listen(): Promise<string> {
    if (this.#closePromise !== null) {
      return Promise.reject(new Error("platform server runtime is closed"));
    }
    this.#listenPromise ??= listenOnce(
      this.#server,
      this.#host,
      this.#port,
      this.#publicOrigin,
    );
    return this.#listenPromise;
  }

  close(): Promise<void> {
    this.#closePromise ??= closeRuntime(this.#server, this.#resources);
    return this.#closePromise;
  }
}

async function listenOnce(
  server: Server,
  host: string,
  port: number,
  publicOrigin: string,
): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
  return publicOrigin;
}

async function closeRuntime(
  server: Server,
  resources: ReadonlyArray<CloseableResource>,
): Promise<void> {
  try {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
      });
    }
  } finally {
    await closeResources(resources);
  }
}

export async function closeResources(
  resources: ReadonlyArray<CloseableResource>,
): Promise<void> {
  let firstFailure: unknown;
  for (const resource of resources.toReversed()) {
    try {
      await resource.close();
    } catch (error: unknown) {
      firstFailure ??= error;
    }
  }
  if (firstFailure !== undefined) {
    throw firstFailure;
  }
}
