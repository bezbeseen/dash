import { spawn, spawnSync } from 'node:child_process';

const port = process.env.PORT || '3000';
const usage = `
Dash tunnel mode:
  npm run dev:tunnel

Starts:
  - Next.js on port ${port} (LAN mode)
  - localhost.run HTTPS tunnel -> localhost:${port}

Prints:
  - Public app URL
  - QuickBooks callback URL
  - Gmail callback URL
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(usage.trim());
  process.exit(0);
}

const hasSsh = spawnSync('which', ['ssh'], { stdio: 'ignore' }).status === 0;
if (!hasSsh) {
  console.error('ssh is required for tunnel mode (localhost.run).');
  process.exit(1);
}

const inUse = spawnSync('sh', ['-lc', `lsof -ti :${port}`], { encoding: 'utf8' }).stdout.trim();
if (inUse) {
  console.error(`Port ${port} is already in use.`);
  console.error(`Stop it first: lsof -ti :${port} | xargs kill -9`);
  process.exit(1);
}

console.log(`Starting Dash dev server + HTTPS tunnel on port ${port}...`);
console.log('Press Ctrl+C to stop both processes.');

const dev = spawn('npm', ['run', 'dev:lan'], {
  stdio: 'inherit',
  env: process.env,
});

const tunnel = spawn(
  'ssh',
  ['-o', 'StrictHostKeyChecking=no', '-o', 'ServerAliveInterval=60', '-R', `80:localhost:${port}`, 'nokey@localhost.run'],
  { stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
);

let announced = false;
function extractTunnelUrl(line) {
  const lower = line.toLowerCase();
  if (!lower.includes('tunneled with tls termination')) {
    return null;
  }

  const matches = line.match(/https:\/\/[^\s)\]]+/gi);
  if (!matches) return null;

  for (const raw of matches) {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      const path = u.pathname || '/';
      const isTunnelHost = host.endsWith('.lhr.life') || host.endsWith('.localhost.run');
      const isRootPath = path === '/';
      if (isTunnelHost && isRootPath) {
        return `${u.protocol}//${u.host}`;
      }
    } catch {
      // Ignore non-URL-looking tokens from terminal noise.
    }
  }
  return null;
}

function maybeAnnounce(line) {
  if (announced) return;
  const base = extractTunnelUrl(line);
  if (!base) return;
  announced = true;
  console.log('');
  console.log(`Public URL: ${base}`);
  console.log(`QuickBooks redirect URI: ${base}/api/integrations/quickbooks/callback`);
  console.log(`Gmail redirect URI: ${base}/api/integrations/gmail/callback`);
  console.log('Open this URL to run the app from any machine:');
  console.log(`${base}/dashboard`);
  console.log('');
}

tunnel.stdout.on('data', (buf) => {
  const text = String(buf);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) maybeAnnounce(line);
  }
});

tunnel.stderr.on('data', (buf) => {
  const text = String(buf);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) maybeAnnounce(line);
  }
});

function shutdown() {
  if (tunnel && !tunnel.killed) tunnel.kill('SIGTERM');
  if (dev && !dev.killed) dev.kill('SIGTERM');
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

dev.on('exit', (code) => {
  if (tunnel && !tunnel.killed) tunnel.kill('SIGTERM');
  process.exit(code ?? 0);
});

tunnel.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Tunnel process exited (${code ?? 'unknown'}).`);
  }
});
