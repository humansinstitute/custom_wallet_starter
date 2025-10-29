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

async function findAvailablePort(startPort: number): Promise<number> {
  let port = Math.max(0, startPort);

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
    port += 1;
  }
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
    <blockquote>"We could have been anything that we wanted to be"</blockquote>
    <cite>— Bugsy Malone, on Cashu Wallets.</cite>
    <p>Vibe Hard</p>
  </main>
</body>
</html>`;
}

async function start() {
  const port = await findAvailablePort(4000);
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

  logger.info({ port: server.port }, `Custom Starter Wallet ready on port ${server.port}`);

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
