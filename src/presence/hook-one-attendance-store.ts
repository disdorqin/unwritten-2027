import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readHookOneAttendanceMark, type HookOneAttendanceStore } from './hook-one-attendance.js';

/** The server provisions this directory on durable storage before enabling the host. */
export function createHookOneAttendanceFileStore(directory: string): HookOneAttendanceStore {
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
      const value: { version?: unknown } | null = JSON.parse(text);
      const mark = value?.version === 1 ? readHookOneAttendanceMark(value) : undefined;
      if (!mark) throw new Error('Invalid Hook One attendance mark.');
      return mark;
    },
    async save(key, mark) {
      if (!readHookOneAttendanceMark(mark)) throw new Error('Invalid Hook One attendance mark.');
      const destination = pathFor(key);
      const temporary = `${destination}.${randomUUID()}.tmp`;
      const directory = await open(root, 'r');
      let temporaryCreated = false;
      try {
        const file = await open(temporary, 'wx', 0o600);
        temporaryCreated = true;
        try {
          await file.writeFile(`${JSON.stringify({ version: 1, ...mark })}\n`, 'utf8');
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, destination);
        temporaryCreated = false;
        await directory.sync();
      } finally {
        if (temporaryCreated) await unlink(temporary).catch(() => {});
        await directory.close();
      }
    },
  };
}
