import { promises as fs } from "node:fs";
import path from "node:path";
import { rootDir } from "../config/env.mjs";
import { expandCollections } from "../../src/data/reference.mjs";

let referencePromise;
export function matchReference() {
  referencePromise ||= fs.readFile(path.join(rootDir, "public/data.en.json"), "utf8")
    .then(source => expandCollections(JSON.parse(source)));
  return referencePromise;
}
