// Runs the server and client dev servers together; Ctrl+C stops both.
import { spawn } from "node:child_process";

const procs = ["server", "client"].map((ws) => {
  const p = spawn(`npm run dev -w ${ws}`, { stdio: "inherit", shell: true });
  p.on("exit", (code) => {
    if (code) console.error(`dev: ${ws} exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return p;
});

let closing = false;
function shutdown(code) {
  if (closing) return;
  closing = true;
  for (const p of procs) p.kill();
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
