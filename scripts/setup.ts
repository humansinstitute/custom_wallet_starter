async function runSetup(): Promise<void> {
  console.log("[setup] Installing dependencies with bun install...");
  await Bun.$`bun install`;

  console.log("[setup] Running start script via bun run start...");
  await Bun.$`bun run start`;
}

runSetup().catch((error) => {
  console.error("[setup] Setup failed:", error);
  process.exit(1);
});
