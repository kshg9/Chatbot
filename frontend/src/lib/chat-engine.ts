import 'server-only';

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type { StoredMessage } from '@/lib/offline-types';

interface GenerateReplyParams {
  model: string;
  temperature: number;
  history: StoredMessage[];
}

interface InferenceResult {
  reply: string;
}

export async function generateReply({
  model,
  temperature,
  history,
}: GenerateReplyParams): Promise<string> {
  const payload = JSON.stringify({
    model,
    temperature,
    history: history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  });

  const scriptPath = path.join(process.cwd(), '..', 'backend', 'offline_inference.py');
  const backendDir = path.join(process.cwd(), '..', 'backend');
  const candidatePython = [
    path.join(backendDir, '.venv', 'bin', 'python'),
    path.join(backendDir, '.venv', 'Scripts', 'python.exe'),
  ].find((candidate) => existsSync(candidate));
  const pythonExecutable = candidatePython || 'python3';

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [scriptPath], {
      cwd: path.join(process.cwd(), '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Inference process exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as InferenceResult;
        resolve(parsed.reply.trim());
      } catch (error) {
        reject(new Error(`Failed to parse inference output: ${String(error)}\n${stdout}\n${stderr}`));
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}
