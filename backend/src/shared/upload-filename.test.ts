/**
 * Run with: npx tsx backend/src/shared/upload-filename.test.ts
 */

import { decodeMultipartFileName, repairMojibakeFileName, contentDispositionAttachment } from "./upload-filename.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

const chinese = "保险单.pdf";
const latin1Mojibake = Buffer.from(chinese, "utf8").toString("latin1");

assert(decodeMultipartFileName("invoice.pdf") === "invoice.pdf", "ASCII filename unchanged");
assert(decodeMultipartFileName(latin1Mojibake) === chinese, "latin1 mojibake decoded to UTF-8");
assert(repairMojibakeFileName(latin1Mojibake) === chinese, "repairMojibakeFileName fixes legacy row");
assert(repairMojibakeFileName(chinese) === chinese, "correct UTF-8 name is not altered");
assert(repairMojibakeFileName("invoice.pdf") === "invoice.pdf", "ASCII name is not altered");

const cd = contentDispositionAttachment(chinese);
assert(cd.includes("filename*="), "Content-Disposition includes RFC 5987 UTF-8");
assert(cd.includes(encodeURIComponent(chinese)), "Content-Disposition encodes Unicode name");

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
