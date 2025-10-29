import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..");
const TMP_DIR = path.join(PROJECT_ROOT, "tmp");
const PID_FILE = path.join(TMP_DIR, "server.pid");

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

function startServer() {
  const existingPid = readPidFile();
  if (isProcessRunning(existingPid)) {
    console.log(`Server already running with PID ${existingPid}`);
    return;
  }

  const child = spawn("bun", ["run", "src/index.ts"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    detached: true,
  });

  if (!child.pid) {
    console.error("Failed to start server process.");
    process.exit(1);
  }

  child.on("exit", (code, signal) => {
    removePidFile();
    if (code !== null && code !== 0) {
      console.error(`Server process exited with code ${code}`);
    } else if (signal) {
      console.log(`Server process terminated with signal ${signal}`);
    }
  });

  writePidFile(child.pid);
  child.unref();
  console.log(`Started server on PID ${child.pid}`);
}

function stopServer() {
  const pid = readPidFile();

  if (!isProcessRunning(pid)) {
    removePidFile();
    console.log("Server is not running");
    return;
  }

  process.kill(pid, "SIGTERM");
  console.log(`Sent SIGTERM to PID ${pid}`);

  removePidFile();
}

function restartServer() {
  stopServer();
  // Small delay to give the OS time to release the port before restarting.
  setTimeout(() => {
    startServer();
  }, 500);
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

switch (action) {
  case "start":
    startServer();
    break;
  case "stop":
    stopServer();
    break;
  case "restart":
    restartServer();
    break;
  default:
    process.exit(1);
}
