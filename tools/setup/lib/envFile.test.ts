import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { maskSecret, parseEnvText, readEnvFile, updateEnvFile } from "./envFile.ts";

function tempEnv(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "paperpile-env-"));
  const path = join(dir, ".env");
  writeFileSync(path, contents);
  return path;
}

describe("parseEnvText", () => {
  test("reads plain, quoted, exported and spaced assignments", () => {
    const parsed = parseEnvText(
      [
        "PLAIN=value",
        'QUOTED="spaced value"',
        "SINGLE='single'",
        "export EXPORTED=exported",
        "SPACED = padded",
      ].join("\n")
    );

    expect(parsed).toEqual({
      PLAIN: "value",
      QUOTED: "spaced value",
      SINGLE: "single",
      EXPORTED: "exported",
      SPACED: "padded",
    });
  });

  test("ignores comments and blank lines, and strips trailing comments", () => {
    const parsed = parseEnvText("# comment\n\nKEY=value # trailing\n");
    expect(parsed).toEqual({ KEY: "value" });
  });

  test("keeps a '#' that is inside a quoted value", () => {
    expect(parseEnvText('KEY="a#b"')).toEqual({ KEY: "a#b" });
  });
});

describe("updateEnvFile", () => {
  test("edits an existing key in place and leaves comments alone", () => {
    const path = tempEnv("# header\nOBSIDIAN_VAULT_PATH=/old\nOTHER=keep\n");
    updateEnvFile({ OBSIDIAN_VAULT_PATH: "/new" }, path);

    expect(readFileSync(path, "utf-8")).toBe("# header\nOBSIDIAN_VAULT_PATH=/new\nOTHER=keep\n");
  });

  test("activates a commented-out key rather than appending a duplicate", () => {
    const path = tempEnv("# DRIVE_JSON_FILE_ID=1ghi...\n");
    updateEnvFile({ DRIVE_JSON_FILE_ID: "abc123" }, path);

    expect(readFileSync(path, "utf-8")).toBe("DRIVE_JSON_FILE_ID=abc123\n");
  });

  test("appends unknown keys under a marker", () => {
    const path = tempEnv("EXISTING=1\n");
    updateEnvFile({ NEW_KEY: "2" }, path);
    const written = readFileSync(path, "utf-8");

    expect(written).toContain("EXISTING=1");
    expect(written).toContain("# Added by tools/setup");
    expect(readEnvFile(path).NEW_KEY).toBe("2");
  });

  test("quotes values that need it and round-trips them", () => {
    const path = tempEnv("");
    updateEnvFile({ OBSIDIAN_VAULT_PATH: "/Users/me/My Vault" }, path);

    expect(readEnvFile(path).OBSIDIAN_VAULT_PATH).toBe("/Users/me/My Vault");
  });

  test("reports changes, skips no-ops, and backs up the previous file", () => {
    const path = tempEnv("A=1\n");
    const first = updateEnvFile({ A: "2", B: "3" }, path);

    expect(Object.keys(first.changed).sort()).toEqual(["A", "B"]);
    expect(first.backupPath).toBeDefined();
    expect(readFileSync(first.backupPath!, "utf-8")).toBe("A=1\n");

    const second = updateEnvFile({ A: "2" }, path);
    expect(second.changed).toEqual({});
    expect(second.unchanged).toEqual(["A"]);
  });

  test("ignores empty and undefined values", () => {
    const path = tempEnv("A=1\n");
    const result = updateEnvFile({ A: undefined, B: "" }, path);

    expect(result.changed).toEqual({});
    expect(readFileSync(path, "utf-8")).toBe("A=1\n");
  });
});

describe("maskSecret", () => {
  test("never reveals a full secret", () => {
    expect(maskSecret(undefined)).toBe("(unset)");
    expect(maskSecret("short")).toBe("********");
    expect(maskSecret("1234567890abcdef")).toBe("1234...cdef (16 chars)");
  });
});
