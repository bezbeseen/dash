import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';

const port = process.env.PORT || '3000';
const host = os.hostname().replace(/\.local$/i, '');
const localUrl = `http://${host}.local:${port}`;
const printOnly = process.argv.includes('--print-only');

if (printOnly) {
  console.log(localUrl);
  process.exit(0);
}

console.log(`Starting Dash dev server with Bonjour on port ${port}...`);
console.log(`Try from another Mac: ${localUrl}`);
console.log('Note: macOS firewall must allow incoming connections to Node/Terminal.');

const dev = spawn('npm', ['run', 'dev:lan'], {
  stdio: 'inherit',
  env: process.env,
});

let bonjour = null;
const hasDnsSd = spawnSync('which', ['dns-sd'], { stdio: 'ignore' }).status === 0;
if (hasDnsSd) {
  bonjour = spawn('dns-sd', ['-R', 'Dash Dev', '_http._tcp', '.', port, 'path=/dashboard'], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: process.env,
  });
  bonjour.stderr.on('data', (buf) => {
    const line = String(buf).trim();
    if (line) {
      console.log(`[dns-sd] ${line}`);
    }
  });
} else {
  console.log('dns-sd not found; running LAN mode without Bonjour advertisement.');
}

function shutdown(signal) {
  if (bonjour && !bonjour.killed) bonjour.kill('SIGTERM');
  if (dev && !dev.killed) dev.kill('SIGTERM');
  process.exit(signal ? 0 : 1);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

dev.on('exit', (code) => {
  if (bonjour && !bonjour.killed) bonjour.kill('SIGTERM');
  process.exit(code ?? 0);
});
