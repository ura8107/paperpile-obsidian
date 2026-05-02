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
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
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
    const res = await drive.files.list({
      q,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
      pageSize: 1000,
      pageToken,
    });
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
  const res = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, modifiedTime",
  });
  const f = res.data;
  return {
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    modifiedTime: f.modifiedTime ?? undefined,
  };
}
