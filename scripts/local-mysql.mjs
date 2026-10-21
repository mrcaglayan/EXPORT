// Optional local-only instance. Never attaches to an existing server for setup.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const mysql = require('mysql2/promise');
const local = path.join(root, '.local', 'mysql');
const data = path.join(local, 'data');
const adminPath = path.join(local, 'admin.json');
const envPath = path.join(root, 'backend', '.env');
const mysqld = process.env.MYSQLD_PATH || 'mysqld';
const command = process.argv[2];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalized = value => path.resolve(value).replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();

async function portIsBusy() {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: 3306 });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(true); });
  });
}

async function connectOwned(password) {
  const connection = await mysql.createConnection({
    host: '127.0.0.1', port: 3306, user: 'root', password, connectTimeout: 1000,
  });
  try {
    const [[row]] = await connection.query('SELECT @@datadir AS dataDir');
    if (normalized(realpathSync(row.dataDir)) !== normalized(realpathSync(data))) {
      throw new Error('Refusing to modify a server outside this repository’s .local/mysql/data.');
    }
    return connection;
  } catch (error) {
    await connection.end();
    throw error;
  }
}

async function launch(password) {
  if (await portIsBusy()) throw new Error('Port 3306 is in use. Existing servers will not be modified or stopped.');
  const child = spawn(mysqld, [
    '--no-defaults', `--datadir=${data}`, '--bind-address=127.0.0.1',
    '--port=3306', '--mysqlx=OFF',
    '--local-infile=OFF', '--secure-file-priv=NULL', `--log-error=${path.join(local, 'server.log')}`,
  ], { detached: true, stdio: 'ignore', windowsHide: true });
  let launchError;
  let connectionError;
  child.once('error', error => { launchError = error; });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (launchError || child.exitCode !== null) break;
    try {
      const connection = await connectOwned(password);
      child.unref();
      return connection;
    } catch (error) {
      connectionError = error;
      await pause(500);
    }
  }
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
  throw new Error(`Local MySQL did not become usable (${launchError?.code || connectionError?.code || connectionError?.message || 'server exited'}). Check MYSQLD_PATH and .local/mysql/server.log.`);
}

try {
  if (!['init', 'start', 'stop'].includes(command)) {
    throw new Error('Usage: node scripts/local-mysql.mjs init|start|stop');
  }
  if (command === 'init') {
    if (existsSync(local) || existsSync(envPath)) {
      throw new Error('Refusing to overwrite .local/mysql or backend/.env. Configure your existing local setup manually.');
    }
    if (await portIsBusy()) throw new Error('Port 3306 is already in use. No existing server has been changed.');
    const version = spawnSync(mysqld, ['--no-defaults', '--version'], { encoding: 'utf8', windowsHide: true });
    if (version.status !== 0 || !/Ver 8\./.test(version.stdout)) {
      throw new Error('MySQL Server 8 is required. Put mysqld on PATH or set MYSQLD_PATH to its executable.');
    }
    mkdirSync(local, { recursive: true });
    const initialized = spawnSync(mysqld, [
      '--no-defaults', '--initialize-insecure', `--datadir=${data}`, `--log-error=${path.join(local, 'initialize.log')}`,
    ], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (initialized.status !== 0) throw new Error('Initialization failed. Inspect .local/mysql/initialize.log; no existing instance was used.');
    // Empty root password exists only on our new loopback-only instance during setup.
    const connection = await launch('');
    try {
      const password = randomBytes(32).toString('hex');
      const appPassword = randomBytes(32).toString('hex');
      writeFileSync(adminPath, JSON.stringify({ password }), { flag: 'wx', mode: 0o600 });
      await connection.query('ALTER USER CURRENT_USER() IDENTIFIED BY ?', [password]);
      await connection.query('CREATE DATABASE export_accounting_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
      await connection.query("CREATE USER 'export_app'@'127.0.0.1' IDENTIFIED BY ?", [appPassword]);
      await connection.query("GRANT ALL PRIVILEGES ON export_accounting_dev.* TO 'export_app'@'127.0.0.1'");
      const example = readFileSync(path.join(root, 'backend', '.env.example'), 'utf8');
      writeFileSync(envPath, example.replace(/^DB_PASSWORD=$/m, `DB_PASSWORD=${appPassword}`), { flag: 'wx', mode: 0o600 });
      console.log('PASS: dedicated MySQL 8 instance running on 127.0.0.1:3306.');
      console.log('Created export_accounting_dev and export_app. Secrets are in ignored local files; no tables or business data were created.');
    } catch (error) {
      await connection.query('SHUTDOWN').catch(() => {});
      throw error;
    } finally {
      await connection.end();
    }
  } else {
    const { password } = JSON.parse(readFileSync(adminPath, 'utf8'));
    const connection = command === 'start' ? await launch(password) : await connectOwned(password);
    try {
      if (command === 'stop') await connection.query('SHUTDOWN');
      console.log(`PASS: repository-local MySQL ${command === 'start' ? 'started' : 'stopped'}.`);
    } finally {
      await connection.end();
    }
  }
} catch (error) {
  // Driver error messages may contain account identifiers; never print credentials or SQL.
  console.error(`BLOCKED: ${error.code ? `${error.code}; check local setup and server logs.` : error.message}`);
  process.exitCode = 1;
}
