import { spawn } from "node:child_process";
import { log } from "./log.mjs";

const WIN = process.platform === "win32";

/** Runs a command (npm, npx…) in a folder, showing its output. Rejects on failure. */
export function run(command, args, { cwd, env = process.env, quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    log(`> ${command} ${args.join(" ")}`);
    // Windows runs npm and npx through the command shell; they're given as
    // one line (the arguments are fixed words, never anything typed in).
    const child = WIN
      ? spawn([`${command}.cmd`, ...args].join(" "), { cwd, env, stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit", shell: true, windowsHide: true })
      : spawn(command, args, { cwd, env, stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit", windowsHide: true });
    let output = "";
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${command} ${args.join(" ")} failed (exit ${code})${output ? `\n${output.slice(-2000)}` : ""}`))
    );
  });
}
