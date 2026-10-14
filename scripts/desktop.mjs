import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, delimiter } from 'node:path';

const cliArgs = process.argv.slice(2);
const mode = cliArgs[0];
const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env };
// Use the user's D: tool location without changing their system environment.
if (process.platform === 'win32' && existsSync('D:\\Codex\\cargo\\bin\\cargo.exe')) {
  env.CARGO_HOME ??= 'D:\\Codex\\cargo';
  env.RUSTUP_HOME ??= 'D:\\Codex\\rustup';
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKey] = `${join(env.CARGO_HOME, 'bin')}${delimiter}${env[pathKey] ?? ''}`;
}
const command = mode === 'test' ? 'cargo' : process.execPath;
const args = mode === 'test' ? ['test', '--manifest-path', 'src-tauri/Cargo.toml']
  : [join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), ...cliArgs];
if (mode === 'dev') {
  try {
    const response = await fetch('http://127.0.0.1:1420/', { signal: AbortSignal.timeout(2000) });
    if (response.ok && (await response.text()).includes('<title>日点 · Daydrop</title>')) {
      args.push('--config', JSON.stringify({ build: { beforeDevCommand: null } }));
      console.log('Using the running Daydrop preview server.');
    }
  } catch { /* The Tauri beforeDevCommand starts Vite when it is not running. */ }
}
const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
