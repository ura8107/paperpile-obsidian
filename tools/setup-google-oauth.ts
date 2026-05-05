#!/usr/bin/env bun
/**
 * One-time script to obtain a Google OAuth2 refresh token for Drive access.
 *
 * Prerequisites:
 *   1. Create a Google Cloud project at https://console.cloud.google.com
 *   2. Enable the Google Drive API
 *   3. Create OAuth2 credentials (Desktop app type)
 *   4. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
 *
 * Run: bun run oauth
 * Then copy the printed GOOGLE_REFRESH_TOKEN value into your .env file.
 */

import { google } from "googleapis";
import { createServer } from "node:http";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
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

      console.log("\nSuccess! Add this to your .env:\n");
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
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
