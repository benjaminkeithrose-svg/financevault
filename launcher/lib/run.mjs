import { spawn } from "node:child_process";
import { log } from "./log.mjs";

const WIN = process.platform === "win32";

/** Runs a command (npm, npx…) in a folder, showing its output. Rejects on failure. */
export function run(command, args, { cwd, env = process.env, quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    log(`> ${command} ${args.join(" ")}`);
    const child = spawn(WIN ? `${command}.cmd` : command, args, {
      cwd,
      env,
      stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: WIN,
      windowsHide: true,
    });
    let output = "";
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${command} ${args.join(" ")} failed (exit ${code})${output ? `\n${output.slice(-2000)}` : ""}`))
    );
  });
}
