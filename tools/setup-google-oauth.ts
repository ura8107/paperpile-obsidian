#!/usr/bin/env bun
/**
 * One-time script to obtain a Google OAuth2 refresh token for Drive access.
 *
 * Prerequisites:
 *   1. Create a Google Cloud project at https://console.cloud.google.com
 *   2. Enable the Google Drive API
 *   3. Create OAuth2 credentials (Desktop app type)
 *   4. Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
 *      (`bun run setup:google-client` imports them from the downloaded JSON)
 *
 * Run: bun run oauth
 *
 * The refresh token is written straight into .env. Use `--print-only` to print
 * it instead, and `--no-open` to skip launching the browser automatically.
 */

import { google } from "googleapis";
import { createServer } from "node:http";
import { loadEnvIntoProcess, maskSecret, updateEnvFile } from "./setup/lib/envFile.ts";

loadEnvIntoProcess();

const args = process.argv.slice(2);
const printOnly = args.includes("--print-only");
const autoOpen = !args.includes("--no-open");

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first (try: bun run setup:google-client)."
  );
  process.exit(1);
}

const scopes = [
  "https://www.googleapis.com/auth/drive.readonly",
];

const server = createServer();

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    console.error("Could not start local OAuth callback server.");
    process.exit(1);
  }

  const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });

  console.log("\nOpen this URL in your browser:\n");
  console.log(authUrl);
  if (autoOpen) openInBrowser(authUrl);
  console.log("\nWaiting for Google OAuth callback...");

  server.on("request", async (req, res) => {
    if (!req.url) {
      res.writeHead(400).end("Missing request URL.");
      return;
    }

    const url = new URL(req.url, redirectUri);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end("Not found.");
      return;
    }

    const error = url.searchParams.get("error");
    if (error) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`Google OAuth failed: ${error}`);
      server.close();
      return;
    }

    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing OAuth code.");
      server.close();
      return;
    }

    try {
      const { tokens } = await oauth2Client.getToken(code);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OAuth setup succeeded. You can close this tab and return to the terminal.");

      const refreshToken = tokens.refresh_token;
      if (!refreshToken) {
        console.error(
          "\nGoogle did not return a refresh token. Revoke this app's access at https://myaccount.google.com/permissions and run `bun run oauth` again."
        );
        process.exitCode = 1;
        return;
      }

      if (printOnly) {
        console.log("\nSuccess! Add this to your .env:\n");
        console.log(`GOOGLE_REFRESH_TOKEN=${refreshToken}`);
      } else {
        const result = updateEnvFile({ GOOGLE_REFRESH_TOKEN: refreshToken });
        console.log(`\nSuccess! Wrote GOOGLE_REFRESH_TOKEN=${maskSecret(refreshToken)} to ${result.path}`);
        if (result.backupPath) console.log(`Backup written to ${result.backupPath}`);
        console.log("\nNext: bun run setup:drive-ids --write-env");
      }
      console.log("\nKeep this token secret; it grants read access to your Google Drive.");
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Failed to exchange OAuth code. Check the terminal output.");
      console.error(err);
      process.exitCode = 1;
    } finally {
      server.close();
    }
  });
});

function openInBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];

  try {
    Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // Printing the URL above is enough of a fallback.
  }
}
