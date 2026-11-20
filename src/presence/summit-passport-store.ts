import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { SummitPassportStore } from './summit-passport-authority.js';

/** The server provisions this directory on durable storage before enabling the host. */
export function createSummitPassportFileStore(directory: string): SummitPassportStore {
  const root = resolve(directory);
  const pathFor = (key: string) => join(root, `${createHash('sha256').update(key).digest('hex')}.json`);

  return {
    async load(key) {
      let text: string;
      try {
        text = await readFile(pathFor(key), 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      const value: { version?: unknown; stage?: unknown } | null = JSON.parse(text);
      if (value?.version !== 1 || (value.stage !== 1 && value.stage !== 2 && value.stage !== 3)) {
        throw new Error('Invalid summit passport state.');
      }
      return value.stage;
    },
    async save(key, stage) {
      const destination = pathFor(key);
      const temporary = `${destination}.${randomUUID()}.tmp`;
      // Keep the previous file until the full replacement has been flushed.
      const directoryHandle = await open(root, 'r');
      let temporaryCreated = false;
      try {
        const file = await open(temporary, 'wx', 0o600);
        temporaryCreated = true;
        try {
          await file.writeFile(`${JSON.stringify({ version: 1, stage })}\n`, 'utf8');
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, destination);
        temporaryCreated = false;
        await directoryHandle.sync();
      } finally {
        if (temporaryCreated) await unlink(temporary).catch(() => {});
        await directoryHandle.close();
      }
    },
  };
}
