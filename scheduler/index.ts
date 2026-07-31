#!/usr/bin/env bun
// scheduler/index.ts
//
// Entrypoint do processo scheduler.
// Uso:
//   bun run scheduler/index.ts --company=acme-corp
//   bun run scheduler/index.ts --company=acme-corp --agent=dev-agent
//   bun run scheduler/index.ts --company=acme-corp --run-now

import { SchedulerService } from "../lib/scheduler/scheduler-service";

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      args[key] = val ?? true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const companySlug = args["company"] as string | undefined;

  if (!companySlug) {
    console.error("[Scheduler] --company=<slug> é obrigatório.");
    process.exit(1);
  }

  const scheduler = new SchedulerService();

  await scheduler.start({
    companySlug,
    agentId: args["agent"] as string | undefined,
    runOnce: args["run-now"] === true,
  });
}

main().catch((err) => {
  console.error("[Scheduler] Fatal:", err.message);
  process.exit(1);
});
