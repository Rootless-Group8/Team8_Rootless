/**
 * run.js
 *
 * CLI entry point.
 *
 * Manual run (default):
 *   node run.js --pairs US:GB,BR:GB
 *
 * Scheduled run (re-runs on an interval, per acceptance criteria
 * "include a way to re-run the scraper on a schedule"):
 *   node run.js --pairs US:GB,BR:GB --schedule "0 0 * * *"
 *   (cron syntax -- this example runs once a day at midnight)
 */

const cron = require("node-cron");
const { runScrape, writeResults } = require("./scraper");
const { logger } = require("./logger");

function parseArgs(argv) {
  const args = { pairs: [], schedule: null };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pairs" && argv[i + 1]) {
      args.pairs = argv[i + 1].split(",").map((pairStr) => {
        const [origin, destination] = pairStr.split(":");
        return { origin, destination };
      });
      i++;
    } else if (argv[i] === "--schedule" && argv[i + 1]) {
      args.schedule = argv[i + 1];
      i++;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.pairs.length === 0) {
    logger.warn('No --pairs provided. Example: node run.js --pairs US:GB,BR:GB');
    return;
  }

  const job = async () => {
    logger.info("Starting scrape run", { pairs: args.pairs });
    const results = await runScrape(args.pairs);
    await writeResults(results);
    logger.info("Scrape run complete", {
      total: results.length,
      ok: results.filter((r) => r.status === "ok").length,
      missing: results.filter((r) => r.status === "missing").length,
      unclear: results.filter((r) => r.status === "unclear").length,
      error: results.filter((r) => r.status === "error").length,
    });
  };

  if (args.schedule) {
    if (!cron.validate(args.schedule)) {
      logger.error(`Invalid cron expression: "${args.schedule}"`);
      return;
    }
    logger.info(`Scheduling scrape with cron pattern "${args.schedule}"`);
    cron.schedule(args.schedule, job);
    await job(); // also run once immediately
  } else {
    await job();
  }
}

main();
