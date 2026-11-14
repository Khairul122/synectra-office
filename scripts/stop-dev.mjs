import { execFileSync } from 'node:child_process';

for (const line of execFileSync('netstat', ['-ano'], { encoding: 'utf8' }).split(/\r?\n/)) {
  const match = line.match(/\sTCP\s+127\.0\.0\.1:(3000|3001|5173)\s+\S+\s+LISTENING\s+(\d+)/i);
  if (!match) continue;
  try { execFileSync('taskkill', ['/PID', match[2], '/T', '/F'], { stdio: 'ignore' }); } catch {}
}
