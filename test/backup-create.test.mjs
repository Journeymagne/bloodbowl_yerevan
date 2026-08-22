import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createBackup } from "../scripts/backup/create.mjs";

const makeDir = () => fs.mkdtemp(path.join(os.tmpdir(), "gata-backup-"));
const listing = async (dir) => (await fs.readdir(dir)).sort();

// A stand-in for pg_dump: writes the requested number of bytes where told.
const writes = (bytes) => async (target) => {
  await fs.writeFile(target, Buffer.alloc(bytes, 0x41));
};
const succeeds = async () => {};
const fails = (message) => async () => {
  throw new Error(message);
};

const now = new Date("2026-08-22T04:00:00Z");

test("a successful run leaves exactly one finished dump", async () => {
  const dir = await makeDir();
  const result = await createBackup({
    backupDir: dir,
    runDump: writes(4096),
    verifyDump: succeeds,
    now,
  });

  assert.deepEqual(await listing(dir), ["gata_league-20260822-040000.dump"]);
  assert.equal(result.path, path.join(dir, "gata_league-20260822-040000.dump"));
  assert.deepEqual(result.removed, []);
});

test("the finished dump is readable only by its owner", async () => {
  const dir = await makeDir();
  const result = await createBackup({ backupDir: dir, runDump: writes(4096), verifyDump: succeeds, now });
  const stat = await fs.stat(result.path);
  assert.equal(stat.mode & 0o777, 0o600);
});

test("a failing dump leaves nothing behind and reports the failure", async () => {
  const dir = await makeDir();
  await assert.rejects(
    () => createBackup({
      backupDir: dir,
      runDump: async (target) => {
        await fs.writeFile(target, Buffer.alloc(100));
        throw new Error("pg_dump exited with 1");
      },
      verifyDump: succeeds,
      now,
    }),
    /pg_dump exited with 1/,
  );

  assert.deepEqual(await listing(dir), []);
});

test("a dump that fails verification never gets its final name", async () => {
  const dir = await makeDir();
  await assert.rejects(
    () => createBackup({
      backupDir: dir,
      runDump: writes(4096),
      verifyDump: fails("pg_restore could not read the archive"),
      now,
    }),
    /could not read the archive/,
  );

  assert.deepEqual(await listing(dir), []);
});

test("a suspiciously small dump is treated as a failure", async () => {
  const dir = await makeDir();
  await assert.rejects(
    () => createBackup({ backupDir: dir, runDump: writes(10), verifyDump: succeeds, now }),
    /10 bytes/,
  );

  assert.deepEqual(await listing(dir), []);
});

test("an earlier failure does not block the next run", async () => {
  const dir = await makeDir();
  await assert.rejects(() => createBackup({
    backupDir: dir,
    runDump: writes(4096),
    verifyDump: fails("broken"),
    now,
  }));

  await createBackup({ backupDir: dir, runDump: writes(4096), verifyDump: succeeds, now });
  assert.deepEqual(await listing(dir), ["gata_league-20260822-040000.dump"]);
});

test("rotation runs after a successful backup and keeps seven files", async () => {
  const dir = await makeDir();
  for (const day of [14, 15, 16, 17, 18, 19, 20]) {
    await fs.writeFile(path.join(dir, `gata_league-202608${day}-040000.dump`), Buffer.alloc(4096));
  }

  const result = await createBackup({ backupDir: dir, runDump: writes(4096), verifyDump: succeeds, now });

  const files = await listing(dir);
  assert.equal(files.length, 7);
  assert.deepEqual(result.removed, ["gata_league-20260814-040000.dump"]);
  assert.ok(files.includes("gata_league-20260822-040000.dump"));
  assert.ok(!files.includes("gata_league-20260814-040000.dump"));
});

test("rotation leaves unrelated files in the directory alone", async () => {
  const dir = await makeDir();
  for (const day of [14, 15, 16, 17, 18, 19, 20]) {
    await fs.writeFile(path.join(dir, `gata_league-202608${day}-040000.dump`), Buffer.alloc(4096));
  }
  await fs.writeFile(path.join(dir, "restore-notes.txt"), "keep me");

  await createBackup({ backupDir: dir, runDump: writes(4096), verifyDump: succeeds, now });

  assert.ok((await listing(dir)).includes("restore-notes.txt"));
});

test("creates the backup directory when it is not there yet", async () => {
  const dir = path.join(await makeDir(), "nested");
  await createBackup({ backupDir: dir, runDump: writes(4096), verifyDump: succeeds, now });
  assert.deepEqual(await listing(dir), ["gata_league-20260822-040000.dump"]);

  // Only the newly created leaf directory ("nested") is expected to carry the
  // mode — its parent already existed from makeDir().
  const stat = await fs.stat(dir);
  assert.equal(stat.mode & 0o777, 0o700);
});

test("a successful run reports no rotation error", async () => {
  const dir = await makeDir();
  const result = await createBackup({ backupDir: dir, runDump: writes(4096), verifyDump: succeeds, now });
  assert.equal(result.rotationError, null);
});

test("a rotation failure still resolves, with the verified dump left on disk", async () => {
  const dir = await makeDir();
  const result = await createBackup({
    backupDir: dir,
    runDump: writes(4096),
    verifyDump: succeeds,
    now,
    keep: 0,
  });

  assert.deepEqual(await listing(dir), ["gata_league-20260822-040000.dump"]);
  assert.equal(result.path, path.join(dir, "gata_league-20260822-040000.dump"));
  assert.deepEqual(result.removed, []);
  assert.ok(result.rotationError instanceof Error);
  assert.match(result.rotationError.message, /keep must be an integer/);
});

test("a cleanup failure during the error path does not hide the original error", async () => {
  const dir = await makeDir();
  const finalPath = path.join(dir, "gata_league-20260822-040000.dump");
  const partialPath = `${finalPath}.partial`;
  // Pre-create the .partial path as a directory, so the catch block's
  // fs.rm(partialPath, { force: true }) fails with EISDIR instead of
  // removing it.
  await fs.mkdir(partialPath);

  await assert.rejects(
    () => createBackup({
      backupDir: dir,
      runDump: async () => {
        throw new Error("pg_dump could not connect to the database");
      },
      verifyDump: succeeds,
      now,
    }),
    /pg_dump could not connect to the database/,
  );
});
