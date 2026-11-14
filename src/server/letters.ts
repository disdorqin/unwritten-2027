import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

export type LetterDraft = { id: string; name: string; text: string };
type StoredLetter = LetterDraft & { createdAt: number };

/** One Node process, an append-only file, and acknowledgements after disk writes. */
export class LetterStore {
  private saved?: Map<string, StoredLetter>;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}
  save(draft: LetterDraft): Promise<{ id: string; createdAt: number }> {
    const result = this.queue.then(async () => {
      if (!this.saved) {
        let text = "";
        try { text = await readFile(this.file, "utf8"); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
        const records = text.split("\n").filter(Boolean).map(line => JSON.parse(line) as StoredLetter);
        this.saved = new Map(records.map(record => [record.id, record]));
      }
      const existing = this.saved.get(draft.id);
      if (existing) {
        if (existing.name !== draft.name || existing.text !== draft.text) throw Error("Letter id conflict");
        return { id: existing.id, createdAt: existing.createdAt };
      }
      const record = { ...draft, createdAt: Date.now() };
      await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
      await appendFile(this.file, JSON.stringify(record) + "\n", { encoding: "utf8", mode: 0o600 });
      this.saved.set(record.id, record);
      return { id: record.id, createdAt: record.createdAt };
    });
    this.queue = result.catch(() => {});
    return result;
  }
}
