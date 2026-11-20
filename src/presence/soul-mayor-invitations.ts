import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SoulMayorInvitationStore } from './soul-mayor.js';

/** Supply a private, writable directory on a filesystem supporting hard links. */
export function createSoulMayorInvitationFileStore(directory: string): SoulMayorInvitationStore {
  function receipt(key: string) {
    const digest = createHash('sha256').update(key).digest('hex');
    return join(directory, `soul-mayor-${digest}.receipt`);
  }

  return {
    received: key => key.length > 0 && existsSync(receipt(key)),
    grantOnce(key) {
      if (!key) return 'retry';
      const target = receipt(key);
      if (existsSync(target)) return 'already-received';
      const temporary = join(directory, `.soul-mayor-${randomUUID()}.tmp`);
      try {
        const fd = openSync(temporary, 'wx', 0o600);
        try {
          writeFileSync(fd, 'received\n');
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        // Publish a complete receipt without overwriting a concurrent grant.
        try {
          linkSync(temporary, target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') return 'already-received';
          throw error;
        }
        return 'received';
      } catch {
        return 'retry';
      } finally {
        try { rmSync(temporary, { force: true }); }
        catch { /* A leftover temporary file is never a receipt. */ }
      }
    },
  };
}
