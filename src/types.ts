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
}

export interface ProcessedRegistry {
  [citekey: string]: ProcessedEntry;
}

export interface AppConfig {
  vaultPath: string;
  drivePaperpileFolderId: string;
  driveBibFileId: string;
  pollIntervalMs: number;
  anthropicModel: string;
  obsidianPapersFolder: string;
  registryPath: string;
  pdfTempDir: string;
  maxBodyChars: number;
  concurrency: number;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}
