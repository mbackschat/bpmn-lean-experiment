import { createServer } from "node:net";

const apiPortVariable = "BPMN_PLAYWRIGHT_API_PORT";
const webPortVariable = "BPMN_PLAYWRIGHT_WEB_PORT";

export interface PlaywrightLoopbackPorts {
  readonly apiOrigin: string;
  readonly apiPort: number;
  readonly webOrigin: string;
  readonly webPort: number;
}

/**
 * Obtains run-local loopback ports before Playwright starts its web servers.
 * The operating system chooses the ports while both reservations are open, so
 * concurrent showcases cannot inherit the repository's former fixed-port
 * collisions. Playwright remains responsible for the subsequent server
 * lifecycle and strict-port binding.
 */
export async function allocatePlaywrightLoopbackPorts(): Promise<PlaywrightLoopbackPorts> {
  const inherited = inheritedPorts();
  if (inherited !== undefined) return inherited;

  const [apiPort, webPort] = await Promise.all([
    allocatePlaywrightLoopbackPort(),
    allocatePlaywrightLoopbackPort(),
  ]);
  process.env[apiPortVariable] = String(apiPort);
  process.env[webPortVariable] = String(webPort);
  return portPair(apiPort, webPort);
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

export async function allocatePlaywrightLoopbackPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const reservation = createServer();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (address === null || typeof address === "string") {
        reservation.close();
        reject(new Error("Loopback port reservation returned no TCP address."));
        return;
      }
      reservation.close((error) => {
        if (error === undefined) resolve(address.port);
        else reject(error);
      });
    });
  });
}

function loopbackOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}
