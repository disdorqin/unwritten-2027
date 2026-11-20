import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { ZodiacStarStoneStore } from '../shared/zodiac-star-stones.js';

/** The caller owns the state path and provides its existing parent directory. */
export function createZodiacStarStoneFileStore(path: string): ZodiacStarStoneStore {
  return {
    load() {
      let contents: string;
      try {
        contents = readFileSync(path, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
      return JSON.parse(contents) as unknown;
    },
    save(snapshot) {
      const temporaryPath = `${path}.${randomUUID()}.tmp`;
      try {
        const fd = openSync(temporaryPath, 'wx', 0o600);
        try {
          writeFileSync(fd, JSON.stringify(snapshot));
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        renameSync(temporaryPath, path);
      } catch (error) {
        try { rmSync(temporaryPath, { force: true }); }
        catch { /* Preserve the original write error. */ }
        throw error;
      }
      return undefined;
    },
  };
}
