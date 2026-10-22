import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backend = fileURLToPath(new URL('../', import.meta.url));
const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
// One fail-fast gate; each integration stage owns a disposable schema and user.
// The shared browser flow runs once and owns its API and Vite (port 5184).
const checks = [
  ['OpenAPI', backend, ['scripts/check-openapi.js']],
  ['Frontend lint', frontend, ['node_modules/eslint/bin/eslint.js', '.']],
  ['Frontend production build', frontend, ['node_modules/vite/bin/vite.js', 'build']],
  ['Journal editor regression', frontend, ['--test', 'scripts/journal-entry.test.mjs']],
  ...['foundation', 'auth', 'accounting', 'products', 'classification', 'browser'].map(mode =>
    [`${mode} integration`, backend, ['scripts/test-pr00.js', mode]]),
];

try {
  for (const [name, cwd, args] of checks) {
    console.log(`\nPR-01 release gate: ${name}`);
    const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', windowsHide: true });
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (status, signal) => resolve(signal ? 1 : status ?? 1));
    });
    if (code !== 0) throw new Error(`${name} failed (exit ${code}).`);
  }
  console.log('\nPASS: complete PR-01 release gate. No development business data was changed.');
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
