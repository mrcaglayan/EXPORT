import app from './app.js';
import { getServerConfig } from './config/env.js';
import { closePool } from './db/pool.js';

const { port } = getServerConfig();
const server = app.listen(port, '127.0.0.1');
server.on('listening', () => {
  console.log(`Export Accounting API: http://localhost:${port}`);
});

server.on('error', error => {
  console.error(`API could not start (${error.code || 'UNKNOWN'}). Check PORT and whether it is already in use.`);
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
