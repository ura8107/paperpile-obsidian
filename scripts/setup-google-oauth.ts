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
 * Run: bun run scripts/setup-google-oauth.ts
 * Then copy the printed GOOGLE_REFRESH_TOKEN value into your .env file.
 */

import { google } from "googleapis";
import * as readline from "readline";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  "urn:ietf:wg:oauth:2.0:oob"  // Out-of-band for desktop apps
);

const scopes = [
  "https://www.googleapis.com/auth/drive.readonly",
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: scopes,
  prompt: "consent",  // Force refresh token issuance
});

console.log("\nOpen this URL in your browser:\n");
console.log(authUrl);
console.log("\nAfter authorizing, paste the code here:");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("> ", async (code) => {
  rl.close();
  const { tokens } = await oauth2Client.getToken(code.trim());
  console.log("\n✓ Success! Add this to your .env:\n");
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("\nKeep this token secret — it grants read access to your Google Drive.");
});
