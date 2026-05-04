import { google } from "googleapis";
import type { DriveFile } from "../types.ts";

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

auth.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({ version: "v3", auth });

export async function downloadFile(fileId: string): Promise<Buffer> {
  const res = await withDriveRetry(() =>
    drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    )
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function downloadFileAsText(fileId: string): Promise<string> {
  const buf = await downloadFile(fileId);
  return buf.toString("utf-8");
}

export async function downloadFileToDisk(fileId: string, destPath: string): Promise<void> {
  const buf = await downloadFile(fileId);
  await Bun.write(destPath, buf);
}

export async function listFolder(
  folderId: string,
  query?: string
): Promise<DriveFile[]> {
  const q = query
    ? `'${folderId}' in parents and ${query} and trashed = false`
    : `'${folderId}' in parents and trashed = false`;

  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await withDriveRetry(() =>
      drive.files.list({
        q,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
        pageSize: 1000,
        pageToken,
      })
    );
    for (const f of res.data.files ?? []) {
      if (f.id && f.name && f.mimeType) {
        files.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          modifiedTime: f.modifiedTime ?? undefined,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

export async function getFileMetadata(fileId: string): Promise<DriveFile> {
  const res = await withDriveRetry(() =>
    drive.files.get({
      fileId,
      fields: "id, name, mimeType, modifiedTime",
    })
  );
  const f = res.data;
  return {
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    modifiedTime: f.modifiedTime ?? undefined,
  };
}

async function withDriveRetry<T>(operation: () => Promise<T>): Promise<T> {
  const delays = [2000, 5000, 10000];
  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt === delays.length || !isRetryableDriveError(err)) {
        throw err;
      }

      const delayMs = delays[attempt];
      console.warn(`[drive] Temporary API error, retrying in ${delayMs}ms: ${(err as Error).message}`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function isRetryableDriveError(err: unknown): boolean {
  const status = getErrorStatus(err);
  if (status && [403, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const code = (err as { code?: string })?.code;
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND";
}

function getErrorStatus(err: unknown): number | undefined {
  const maybeError = err as {
    code?: number;
    response?: { status?: number };
    status?: number;
  };
  return maybeError.response?.status ?? maybeError.status ?? maybeError.code;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
