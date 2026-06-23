import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function runFfprobeDuration(filePath, spawnFn = spawn) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawnFn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
      ]);
    } catch (err) {
      reject(err);
      return;
    }

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('Binário "ffprobe" não encontrado no PATH'));
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        if (!Number.isFinite(duration)) {
          reject(new Error(`ffprobe retornou duração inválida: "${stdout.trim()}"`));
          return;
        }
        resolve(duration);
      } else {
        reject(new Error(`ffprobe saiu com código ${code}: ${stderr.slice(-500)}`));
      }
    });
  });
}

export function runFfmpeg(args, spawnFn = spawn) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawnFn('ffmpeg', args);
    } catch (err) {
      reject(err);
      return;
    }

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('Binário "ffmpeg" não encontrado no PATH'));
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg saiu com código ${code}: ${stderr.slice(-500)}`));
      }
    });
  });
}

async function _exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve um caminho de saída sem sobrescrever arquivos existentes.
 * Se `baseName` terminar em `-v{n}`, incrementa esse sufixo; caso contrário,
 * apenas anexa `-v2`, `-v3`... ao nome base na primeira colisão.
 */
export async function resolveOutputPath(dir, baseName, ext, existsFn = _exists) {
  let candidate = path.join(dir, `${baseName}${ext}`);
  if (!(await existsFn(candidate))) {
    return candidate;
  }

  const versionMatch = baseName.match(/^(.*)-v(\d+)$/);
  const stem = versionMatch ? versionMatch[1] : baseName;
  let version = versionMatch ? parseInt(versionMatch[2], 10) + 1 : 2;

  while (true) {
    candidate = path.join(dir, `${stem}-v${version}${ext}`);
    if (!(await existsFn(candidate))) {
      return candidate;
    }
    version++;
  }
}
