/**
 * Pure folder grouping for the FolderView mode.
 *
 * Takes a (pre-sorted or unsorted) list of FileNodes and buckets them by
 * their `folder` field. The bucket order is deterministic (folder path asc,
 * empty-string folder = root files first). Within a bucket, file order is
 * preserved from input — so composing with `sortFiles(files, edges, by, dir)`
 * yields a fully-sorted folder view.
 */
import type { FileNode } from "@/lib/graph/types";

export interface FolderBucket {
  folder: string;
  files: FileNode[];
}

export function groupByFolder(files: FileNode[]): FolderBucket[] {
  const byFolder = new Map<string, FileNode[]>();
  for (const f of files) {
    const key = f.folder ?? "";
    const arr = byFolder.get(key);
    if (arr) {
      arr.push(f);
    } else {
      byFolder.set(key, [f]);
    }
  }
  // Deterministic bucket order: empty-string (root) first, then ascending.
  const keys = Array.from(byFolder.keys()).sort((a, b) => {
    if (a === b) return 0;
    if (a === "") return -1;
    if (b === "") return 1;
    return a < b ? -1 : 1;
  });
  return keys.map((folder) => ({ folder, files: byFolder.get(folder)! }));
}
