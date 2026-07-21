import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getNpmInvocation } from "./bootstrap.mjs";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "code-translate-lsp";

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve(stdout);
    });
  });
}

function getPackageMetadata(packOutput) {
  const parsed = JSON.parse(packOutput);
  if (Array.isArray(parsed)) {
    return parsed[0];
  }
  if (parsed.files) {
    return parsed;
  }
  return parsed[packageName] ?? Object.values(parsed)[0];
}

function assertPackage(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const npm = getNpmInvocation(["pack", "--dry-run", "--json"]);
const packOutput = await run(npm.command, npm.args, { cwd: packageRoot });
const metadata = getPackageMetadata(packOutput);
assertPackage(metadata?.files, "npm pack did not return a file manifest");
assertPackage(
  metadata.name === packageName,
  `npm pack returned package ${metadata.name}; expected ${packageName}`,
);

const files = metadata.files.map(({ path }) => path.replaceAll("\\", "/"));
const fileSet = new Set(files);
const dictionaryFiles = files.filter((path) =>
  /^dist\/dict\/[a-z]{2}\.json$/.test(path),
);

assertPackage(
  fileSet.has("package.json"),
  "npm package is missing package.json",
);
assertPackage(
  fileSet.has("dist/server.js"),
  "npm package is missing dist/server.js",
);
assertPackage(
  fileSet.has("dist/dictionary.js"),
  "npm package is missing dist/dictionary.js",
);
assertPackage(
  fileSet.has("dist/hover.js"),
  "npm package is missing dist/hover.js",
);
assertPackage(
  dictionaryFiles.length === 674,
  `npm package contains ${dictionaryFiles.length} dictionary files; expected 674`,
);
assertPackage(fileSet.has("LICENSE"), "npm package is missing LICENSE");
assertPackage(
  fileSet.has("THIRD_PARTY_LICENSES.md"),
  "npm package is missing THIRD_PARTY_LICENSES.md",
);
assertPackage(
  !files.some((path) => path.startsWith("src/")),
  "npm package must not include source files",
);
assertPackage(
  !files.some((path) => path.startsWith("test/")),
  "npm package must not include tests",
);
assertPackage(
  !files.some((path) => /^dict\/[a-z]{2}\.json$/.test(path)),
  "npm package must not include a duplicate root dictionary",
);

console.log(
  `Validated ${metadata.name}@${metadata.version}: dist/server.js and ${dictionaryFiles.length} dictionary files`,
);
