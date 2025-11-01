import { once } from "node:events";
import net from "node:net";
type LogLevel = "info" | "error";

type LogFields = Record<string, unknown> | undefined;

function createLogger({ name }: { name: string }) {
  const prefix = `[${name}]`;

  function log(level: LogLevel, fields: LogFields, message: string) {
    const writer = level === "error" ? console.error : console.log;
    if (fields && Object.keys(fields).length > 0) {
      writer(`${prefix} ${message}`, fields);
    } else {
      writer(`${prefix} ${message}`);
    }
  }

  return {
    info(fields: LogFields, message: string) {
      log("info", fields, message);
    },
    error(fields: LogFields, message: string) {
      log("error", fields, message);
    },
  };
}

const logger = createLogger({ name: "custom-starter-web" });

const PORT_RANGE_START = 41000;
const PORT_RANGE_END = 41999;
const PORT_FILE = ".port";
const PORT_RELEASE_TIMEOUT_MS = 10000;
const PORT_POLL_INTERVAL_MS = 50;

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readPersistedPort(): Promise<number | null> {
  try {
    const file = Bun.file(PORT_FILE);
    if (!(await file.exists())) {
      return null;
    }

    const contents = await file.text();
    const parsed = Number.parseInt(contents.trim(), 10);

    if (
      Number.isNaN(parsed) ||
      parsed < PORT_RANGE_START ||
      parsed > PORT_RANGE_END
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    logger.error({ err: error }, "Failed to read persisted port");
    return null;
  }
}

async function persistPort(port: number): Promise<void> {
  try {
    const existing = await readPersistedPort();
    if (existing === port) {
      return;
    }

    await Bun.write(PORT_FILE, `${port}`);
  } catch (error) {
    logger.error({ err: error }, "Failed to persist port");
  }
}

async function findAvailablePort(): Promise<number> {
  const rangeSize = PORT_RANGE_END - PORT_RANGE_START + 1;
  let port = PORT_RANGE_START;
  let attempts = 0;

  while (attempts < rangeSize) {
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }

    port = port === PORT_RANGE_END ? PORT_RANGE_START : port + 1;
    attempts += 1;
  }

  throw new Error("No available ports in configured range");
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();

    tester.once("error", () => {
      resolve(false);
    });

    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, "0.0.0.0");
  });
}

async function waitForPortRelease(port: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(port);
    if (available) {
      return true;
    }

    // eslint-disable-next-line no-await-in-loop
    await delay(PORT_POLL_INTERVAL_MS);
  }

  return isPortAvailable(port);
}

function renderHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Custom Starter Wallet</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: linear-gradient(140deg, #050505, #1f1f1f);
      color: #f5f5f5;
      padding: 2rem;
    }
    main {
      max-width: 48rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    blockquote {
      margin: 0;
      font-size: clamp(1.5rem, 4vw, 2.5rem);
      font-style: italic;
      line-height: 1.5;
    }
    cite {
      display: block;
      margin-top: 1rem;
      font-size: 1rem;
      opacity: 0.7;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    p {
      margin: 0;
      font-size: 1.1rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }
  </style>
</head>
<body>
  <main>
    <p>Hello</p>
    <p>Hot reload check</p>
    <blockquote>"We could have been anything that we wanted to be"</blockquote>
    <cite>— Bugsy Malone, on Cashu Wallets.</cite>
    <p>Vibe Hard</p>
  </main>
</body>
</html>`;
}

async function start() {
  let port = await readPersistedPort();
  if (port !== null) {
    logger.info({ port }, "Attempting to reuse persisted port");
    const released = await waitForPortRelease(port, PORT_RELEASE_TIMEOUT_MS);
    if (!released) {
      logger.info(
        { port, timeoutMs: PORT_RELEASE_TIMEOUT_MS },
        "Persisted port still in use after timeout; selecting a new port",
      );
      port = null;
    }
  }

  if (port === null) {
    port = await findAvailablePort();
  }

  await persistPort(port);

  const server = Bun.serve({
    port,
    fetch: () =>
      new Response(renderHtml(), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      }),
    error(err) {
      logger.error({ err }, "server error");
      return new Response("Internal Server Error", { status: 500 });
    },
    reusePort: false,
  });

  console.log(`[WINGMANINFO] PORT=${server.port}`);
  console.log(`[WINGMAN21-URL]https://host.otherstuff.ai/${server.port}`);

  await once(process, "SIGTERM");
  logger.info("Received SIGTERM, shutting down.");
  server.stop();
  logger.info("Server closed.");
  process.exit(0);
}

start().catch((error) => {
  logger.error({ err: error }, "Failed to start server");
  process.exit(1);
});
