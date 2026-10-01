const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { runBrowserJourney, browserFailureDiagnostic } = require('./browserRunner.cjs');
// These budgets are operator-owned; generated request fields cannot change them.
function runLocalBrowserJourney(request, { chromium, launchOptions }) {
  return runBrowserJourney(request, { chromium, launchOptions, containerized: false,
    interactionTimeout: 15000, navigationTimeout: 30000 });
}
module.exports = { runLocalBrowserJourney };
if (require.main === module) (async () => {
  const { chromium } = await import(pathToFileURL(process.env.XFACTOR_LOCAL_PLAYWRIGHT).href);
  const { localChromiumLaunchOptions } = await import('../scripts/local-worker-tools.mjs');
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const result = await runLocalBrowserJourney(request, { chromium, launchOptions: localChromiumLaunchOptions(process.env.XFACTOR_LOCAL_CHROMIUM) });
  process.stdout.write(JSON.stringify(result));
})().catch(error => { process.stderr.write(browserFailureDiagnostic(error)); process.exitCode = 1; });
