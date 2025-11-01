import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..");
const TMP_DIR = path.join(PROJECT_ROOT, "tmp");
const PID_FILE = path.join(TMP_DIR, "server.pid");
const PORT_FILE = path.join(PROJECT_ROOT, ".port");
const PROCESS_EXIT_TIMEOUT_MS = 10000;
const PORT_RELEASE_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 50;

type Action = "start" | "stop" | "restart";

function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR, { recursive: true });
  }
}

function writePidFile(pid: number) {
  ensureTmpDir();
  writeFileSync(PID_FILE, `${pid}`, "utf8");
}

function readPidFile(): number | null {
  if (!existsSync(PID_FILE)) {
    return null;
  }

  const content = readFileSync(PID_FILE, "utf8").trim();
  const pid = Number.parseInt(content, 10);
  return Number.isFinite(pid) ? pid : null;
}

function removePidFile() {
  if (existsSync(PID_FILE)) {
    rmSync(PID_FILE);
  }
}

function readPersistedPort(): number | null {
  if (!existsSync(PORT_FILE)) {
    return null;
  }

  const content = readFileSync(PORT_FILE, "utf8").trim();
  const port = Number.parseInt(content, 10);
  return Number.isFinite(port) ? port : null;
}

function isProcessRunning(pid: number | null): pid is number {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(port);
    if (available) {
      return true;
    }

    // eslint-disable-next-line no-await-in-loop
    await delay(POLL_INTERVAL_MS);
  }

  return isPortAvailable(port);
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return true;
    }

    // eslint-disable-next-line no-await-in-loop
    await delay(POLL_INTERVAL_MS);
  }

  return !isProcessRunning(pid);
}

async function startServer() {
  const existingPid = readPidFile();
  if (isProcessRunning(existingPid)) {
    console.log(`Server already running with PID ${existingPid}`);
    return;
  }

  const persistedPort = readPersistedPort();
  if (persistedPort) {
    const released = await waitForPortRelease(persistedPort, PORT_RELEASE_TIMEOUT_MS);
    if (!released) {
      console.warn(`Port ${persistedPort} is still in use; restart may bind a new port`);
    }
  }

  const child = spawn("bun", ["src/index.ts"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });

  if (!child.pid) {
    console.error("Failed to start server process.");
    process.exit(1);
  }

  writePidFile(child.pid);
  console.log(`Started server on PID ${child.pid}`);

  const handleSignal = (signal: NodeJS.Signals) => {
    console.log(`Received ${signal}, stopping server...`);
    if (isProcessRunning(child.pid)) {
      process.kill(child.pid, "SIGTERM");
    }
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  try {
    const [code, signal] = await once(child, "exit") as [number | null, NodeJS.Signals | null];
    if (code !== null && code !== 0) {
      console.error(`Server process exited with code ${code}`);
      process.exitCode = code;
    } else if (signal) {
      console.log(`Server process terminated with signal ${signal}`);
    }
  } finally {
    removePidFile();
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
  }
}

async function stopServer() {
  const pid = readPidFile();
  const port = readPersistedPort();

  if (!isProcessRunning(pid)) {
    removePidFile();
    console.log("Server is not running");
    if (port) {
      const released = await waitForPortRelease(port, PORT_RELEASE_TIMEOUT_MS);
      if (!released) {
        console.warn(`Port ${port} did not become available after ${PORT_RELEASE_TIMEOUT_MS}ms`);
      }
    }
    return;
  }

  process.kill(pid, "SIGTERM");
  console.log(`Sent SIGTERM to PID ${pid}`);

  const exited = await waitForProcessExit(pid, PROCESS_EXIT_TIMEOUT_MS);
  if (!exited) {
    console.warn(`Process ${pid} did not exit within ${PROCESS_EXIT_TIMEOUT_MS}ms`);
  }

  if (port) {
    const released = await waitForPortRelease(port, PORT_RELEASE_TIMEOUT_MS);
    if (!released) {
      console.warn(`Port ${port} did not become available after ${PORT_RELEASE_TIMEOUT_MS}ms`);
    }
  }

  removePidFile();
}

async function restartServer() {
  await stopServer();
  // Small delay to give the OS time to release the port before restarting.
  await delay(500);
  await startServer();
}

function parseAction(): Action {
  const [, , maybeAction] = Bun.argv;
  const action = (maybeAction ?? "").toLowerCase();

  if (action === "start" || action === "stop" || action === "restart") {
    return action;
  }

  console.error("Usage: bun run scripts/manage.ts <start|stop|restart>");
  process.exit(1);
}

const action = parseAction();

async function main() {
  switch (action) {
    case "start":
      await startServer();
      break;
    case "stop":
      await stopServer();
      break;
    case "restart":
      await restartServer();
      break;
    default:
      process.exit(1);
  }
}

await main();
