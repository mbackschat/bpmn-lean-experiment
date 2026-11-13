import { createServer, type Server } from "node:net";

const apiPortVariable = "BPMN_PLAYWRIGHT_API_PORT";
const webPortVariable = "BPMN_PLAYWRIGHT_WEB_PORT";

export interface PlaywrightLoopbackPorts {
  readonly apiOrigin: string;
  readonly apiPort: number;
  readonly webOrigin: string;
  readonly webPort: number;
}

/**
 * Run-local ports come from below every operating system's ephemeral range (Linux 32768-60999, macOS 49152-65535):
 * the ephemeral Temporal server a showcase host starts takes its own ports by binding port 0 (sdk-core
 * `ephemeral_server::get_free_port`), and a port of that range released here could be taken before the host binds it.
 */
const runLocalPorts = { from: 20_000, below: 32_768 } as const;
const reservationAttempts = 64;

/**
 * Obtains run-local loopback ports before Playwright starts its web servers.
 * Both reservations stay open until the pair is chosen, so the ports are distinct, and concurrent showcases cannot
 * inherit the repository's former fixed-port collisions. Playwright remains responsible for the subsequent server
 * lifecycle and strict-port binding.
 */
export async function allocatePlaywrightLoopbackPorts(): Promise<PlaywrightLoopbackPorts> {
  const inherited = inheritedPorts();
  if (inherited !== undefined) return inherited;

  const api = await reserveRunLocalPort();
  const web = await reserveRunLocalPort().catch(async (error: unknown) => {
    await release(api.server);
    throw error;
  });
  await Promise.all([release(api.server), release(web.server)]);
  process.env[apiPortVariable] = String(api.port);
  process.env[webPortVariable] = String(web.port);
  return portPair(api.port, web.port);
}

function inheritedPorts(): PlaywrightLoopbackPorts | undefined {
  const api = process.env[apiPortVariable];
  const web = process.env[webPortVariable];
  if (api === undefined && web === undefined) return undefined;
  if (api === undefined || web === undefined) {
    throw new Error("Playwright loopback port inheritance must provide both ports.");
  }
  const apiPort = parsePort(api, apiPortVariable);
  const webPort = parsePort(web, webPortVariable);
  if (apiPort === webPort) {
    throw new Error("Playwright API and web ports must be distinct.");
  }
  return portPair(apiPort, webPort);
}

function portPair(apiPort: number, webPort: number): PlaywrightLoopbackPorts {
  return {
    apiOrigin: loopbackOrigin(apiPort),
    apiPort,
    webOrigin: loopbackOrigin(webPort),
    webPort,
  };
}

function parsePort(value: string, variable: string): number {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${variable} must be a TCP port.`);
  }
  return port;
}

/** One released run-local loopback port, for a server the caller starts at once. */
export async function allocatePlaywrightLoopbackPort(): Promise<number> {
  const { port, server } = await reserveRunLocalPort();
  await release(server);
  return port;
}

/** One run-local loopback port, held open by the returned server until it is released. */
async function reserveRunLocalPort(): Promise<Readonly<{ port: number; server: Server }>> {
  for (let attempt = 0; attempt < reservationAttempts; attempt += 1) {
    const port = runLocalPorts.from + Math.floor(Math.random() * (runLocalPorts.below - runLocalPorts.from));
    const server = await bound(port);
    if (server !== null) return { port, server };
  }
  throw new Error(`No free loopback port in ${String(runLocalPorts.from)}-${String(runLocalPorts.below - 1)} after ${String(reservationAttempts)} attempts.`);
}

/** A server listening on `port`, or `null` when the port is taken. */
async function bound(port: number): Promise<Server | null> {
  return await new Promise<Server | null>((resolve, reject) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") resolve(null);
      else reject(error);
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function release(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

function loopbackOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}
