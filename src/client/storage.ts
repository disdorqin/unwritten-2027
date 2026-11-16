type Area = "localStorage" | "sessionStorage";

// Browser policies may throw even when accessing the Storage property itself.
export function getStored(area: Area, key: string): string | null {
  try { return globalThis[area].getItem(key); } catch { return null; }
}
export function setStored(area: Area, key: string, value: string): boolean {
  try { globalThis[area].setItem(key, value); return true; } catch { return false; }
}
export function removeStored(area: Area, key: string): boolean {
  try { globalThis[area].removeItem(key); return true; } catch { return false; }
}
export function readRoomSession(): { code: string; token: string } | undefined {
  try {
    const saved = JSON.parse(getStored("sessionStorage", "friendslop:session") ?? "null");
    if (typeof saved?.code === "string" && typeof saved?.token === "string") {
      return { code: saved.code, token: saved.token };
    }
  } catch { /* A broken old session must not prevent a new room connection. */ }
}
