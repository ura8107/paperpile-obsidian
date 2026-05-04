export interface PaperEntry {
  citekey: string;
  title: string;
  authors: string[];
  year: string;
  journal?: string;
  booktitle?: string;
  doi?: string;
  abstract?: string;
  tags?: string[];
  url?: string;
  pdfDriveId?: string;   // Google Drive file ID for the PDF (resolved during processing)
  rawBibtex: string;
}

export interface ProcessedEntry {
  processedAt: string;   // ISO timestamp
  vaultPath: string;     // relative path within vault
  syncedAt?: string;     // ISO timestamp of last sync pass
  bibtexHash?: string;
  pdfDriveId?: string;
  pdfModifiedTime?: string;
  bodyStatus?: "converted" | "missing" | "failed";
}

export interface ProcessedRegistry {
  [citekey: string]: ProcessedEntry;
}

export interface AppConfig {
  vaultPath: string;
  drivePaperpileFolderId: string;
  driveBibFileId: string;
  pollIntervalMs: number;
  obsidianPapersFolder: string;
  registryPath: string;
  pdfTempDir: string;
  concurrency: number;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}
