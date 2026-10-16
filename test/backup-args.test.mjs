import test from "node:test";
import assert from "node:assert/strict";

import { parseBackupArgs } from "../scripts/backup/args.mjs";

test("no arguments is the nightly run, with no label", () => {
  assert.deepEqual(parseBackupArgs([]), { label: "" });
});

test("--label takes its name as the next argument or after an equals sign", () => {
  assert.deepEqual(parseBackupArgs(["--label", "premigrate"]), { label: "premigrate" });
  assert.deepEqual(parseBackupArgs(["--label=premigrate"]), { label: "premigrate" });
});

test("--label without a usable value is refused", () => {
  for (const argv of [
    ["--label"],
    ["--label", "--foo"],
    ["--label", ""],
    ["--label="],
    ["--label=--foo"],
  ]) {
    assert.throws(() => parseBackupArgs(argv), { message: "backup: --label needs a value" }, JSON.stringify(argv));
  }
});

test("--label given twice is refused", () => {
  assert.throws(
    () => parseBackupArgs(["--label", "premigrate", "--label", "other"]),
    { message: "backup: --label given twice" },
  );
  assert.throws(
    () => parseBackupArgs(["--label=premigrate", "--label=other"]),
    { message: "backup: --label given twice" },
  );
});

test("an unknown argument is refused, including a mistyped --label", () => {
  const unexpected = (arg) => ({
    message: `backup: unexpected argument ${arg}; the only option is --label <name>`,
  });
  assert.throws(() => parseBackupArgs(["--lable", "premigrate"]), unexpected("--lable"));
  assert.throws(() => parseBackupArgs(["--labelx=premigrate"]), unexpected("--labelx=premigrate"));
  assert.throws(() => parseBackupArgs(["premigrate"]), unexpected("premigrate"));
  assert.throws(() => parseBackupArgs(["--label", "premigrate", "extra"]), unexpected("extra"));
});
