import { spawn } from 'node:child_process';

const port = 18794;
const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), SKYCLIP_DATA_FILE: `${process.cwd()}\\.ready-check.json` }, stdio: 'ignore' });
try {
  for (let i = 0; i < 30; i += 1) { try { const response = await fetch(`http://127.0.0.1:${port}/api/ready`); if (response.ok) { console.log('PASS readiness endpoint'); break; } } catch {} await new Promise(r => setTimeout(r, 100)); if (i === 29) throw new Error('readiness timeout'); }
} finally { child.kill('SIGINT'); }
