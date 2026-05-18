import type { Project } from "../domain/types";
import { normalizeProject } from "../domain/defaults";
import { downloadText } from "../report/csv";

const DB = "roombuilder";
const STORE = "projects";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "name" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(p: Project): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(JSON.parse(JSON.stringify(p)));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listProjects(): Promise<string[]> {
  const db = await openDb();
  const names = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return names;
}

export async function loadProject(name: string): Promise<Project | null> {
  const db = await openDb();
  const p = await new Promise<Project | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(name);
    req.onsuccess = () =>
      resolve(req.result ? normalizeProject(req.result as Project) : null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return p;
}

export function exportProjectJson(p: Project): void {
  downloadText(
    `${p.name.replace(/\s+/g, "-")}.roombuilder.json`,
    JSON.stringify(p, null, 2),
    "application/json",
  );
}

export async function importProjectJson(file: File): Promise<Project> {
  const text = await file.text();
  const p = JSON.parse(text) as Project;
  if (p.schemaVersion !== 1) throw new Error("Unsupported project version");
  return normalizeProject(p);
}

interface FsWindow {
  showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle>;
}

/** Direct-to-disk on Chromium; falls back to a download elsewhere. */
export async function saveProjectToDisk(p: Project): Promise<"disk" | "download"> {
  const w = window as unknown as FsWindow;
  const json = JSON.stringify(p, null, 2);
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: `${p.name.replace(/\s+/g, "-")}.roombuilder.json`,
        types: [
          { description: "RoomBuilder project", accept: { "application/json": [".json"] } },
        ],
      });
      const writable = await (handle as unknown as {
        createWritable: () => Promise<{
          write: (d: string) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }).createWritable();
      await writable.write(json);
      await writable.close();
      return "disk";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "disk";
    }
  }
  exportProjectJson(p);
  return "download";
}
