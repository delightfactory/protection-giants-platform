import { spawn, spawnSync } from "node:child_process";

const server = spawn(process.platform === "win32" ? "cmd.exe" : "npm", process.platform === "win32"
  ? ["/d", "/s", "/c", "npm run start -- -p 3100"]
  : ["run", "start", "--", "-p", "3100"], {
  stdio: "inherit",
  env: { ...process.env, PORT: "3100" },
});

try {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3100/");
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (Date.now() >= deadline) throw new Error("Next production server did not become ready within 30 seconds.");
  await import("./uat-01-d-navigation-browser.mjs");
} finally {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    server.kill();
  }
}
