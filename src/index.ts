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

const logger = createLogger({ name: "90scashu-web" });

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
  <title>90s Cashu</title>
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
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(160deg, #101030, #2c1f4a);
      color: #f6f6fb;
    }
    main {
      width: min(90vw, 28rem);
      padding: 2.75rem 2.25rem;
      border-radius: 1.75rem;
      background: rgba(16, 16, 48, 0.85);
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
      display: flex;
      flex-direction: column;
      gap: 1.75rem;
    }
    h1 {
      margin: 0;
      font-size: clamp(2.25rem, 7vw, 3rem);
      line-height: 1.05;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #ffec99;
      text-shadow: 0 0 18px rgba(255, 236, 153, 0.5);
    }
    p {
      margin: 0;
      font-size: clamp(1rem, 3.5vw, 1.15rem);
      line-height: 1.6;
      opacity: 0.9;
    }
    .cta {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .cta button {
      padding: 0.85rem 1.25rem;
      border-radius: 999px;
      border: none;
      font-weight: 600;
      font-size: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #1c1535;
      background: linear-gradient(115deg, #ff71d4, #7ddcff);
      box-shadow: 0 14px 35px rgba(125, 220, 255, 0.4);
      transition: transform 0.25s ease, box-shadow 0.25s ease;
      cursor: pointer;
    }
    .cta button:active,
    .cta button:focus-visible,
    .cta button:hover {
      transform: translateY(-2px) scale(1.01);
      box-shadow: 0 18px 40px rgba(125, 220, 255, 0.55);
      outline: none;
    }
    footer {
      font-size: 0.85rem;
      opacity: 0.7;
      letter-spacing: 0.04em;
    }
    @media (min-width: 768px) {
      main {
        padding: 3rem 3rem;
        gap: 2rem;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>90s Cashu</h1>
    <p>A delightfully retro experience built with Bun + TypeScript. Fully responsive and tuned for mobile-first delight.</p>
    <div class="cta">
      <button type="button">Launch the vibe</button>
      <button type="button" style="background: rgba(255, 255, 255, 0.1); color: #f8f7ff; box-shadow: none;">
        Discover ContextVM
      </button>
    </div>
    <footer>Powered by ContextVM SDK ⚡️</footer>
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

  logger.info({ port: server.port }, `90s Cashu web UI ready on port ${server.port}`);

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
