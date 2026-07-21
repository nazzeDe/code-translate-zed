import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const NPM_PACKAGE = "code-translate-lsp";
export const ZED_EXTENSION_ID = "code-translate";
export const WORK_DIR_ENV = "ZED_EXTENSION_WORK_DIR";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function pathForPlatform(platform) {
  return platform === "win32" ? win32 : { join };
}

export function getZedExtensionWorkDirectory({
  platform = process.platform,
  env = process.env,
  override = env[WORK_DIR_ENV],
} = {}) {
  if (override) {
    return override;
  }

  const path = pathForPlatform(platform);
  const home = env.HOME ?? env.USERPROFILE ?? homedir();

  if (platform === "darwin") {
    return path.join(
      home,
      "Library",
      "Application Support",
      "Zed",
      "extensions",
      "work",
      ZED_EXTENSION_ID,
    );
  }

  if (platform === "win32") {
    const localAppData =
      env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    return path.join(
      localAppData,
      "Zed",
      "extensions",
      "work",
      ZED_EXTENSION_ID,
    );
  }

  const dataHome = env.XDG_DATA_HOME ?? path.join(home, ".local", "share");
  return path.join(dataHome, "zed", "extensions", "work", ZED_EXTENSION_ID);
}

export function parseArguments(argv, env = process.env) {
  let override = env[WORK_DIR_ENV];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--work-dir") {
      override = argv[index + 1];
      if (!override) {
        throw new Error("--work-dir requires a directory path");
      }
      index += 1;
    } else if (argument.startsWith("--work-dir=")) {
      override = argument.slice("--work-dir=".length);
      if (!override) {
        throw new Error("--work-dir requires a directory path");
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { override };
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function readPackageVersion(packagePath) {
  try {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    return packageJson.version;
  } catch {
    return undefined;
  }
}

async function hasMatchingInstallation(workDirectory, version) {
  const installedPackageDirectory = join(
    workDirectory,
    "node_modules",
    NPM_PACKAGE,
  );
  const installedVersion = await readPackageVersion(
    join(installedPackageDirectory, "package.json"),
  );

  if (installedVersion !== version) {
    return false;
  }

  try {
    await readFile(join(installedPackageDirectory, "dist", "server.js"));
    return true;
  } catch {
    return false;
  }
}

async function packageTarball(destination) {
  const entriesBefore = new Set(await readdir(destination));
  await run(npmCommand(), ["pack", "--pack-destination", destination], {
    cwd: packageRoot,
  });
  const entriesAfter = await readdir(destination);
  const tarballs = entriesAfter.filter(
    (entry) => entry.endsWith(".tgz") && !entriesBefore.has(entry),
  );

  if (tarballs.length !== 1) {
    throw new Error(
      `Expected npm pack to create one tarball, found ${tarballs.length}`,
    );
  }

  return join(destination, tarballs[0]);
}

export async function bootstrap({
  platform = process.platform,
  env = process.env,
  override,
} = {}) {
  const workDirectory = getZedExtensionWorkDirectory({
    platform,
    env,
    override,
  });
  const packageMetadata = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  );
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "code-translate-lsp-"),
  );

  try {
    const tarball = await packageTarball(temporaryDirectory);
    await mkdir(workDirectory, { recursive: true });

    if (
      !(await hasMatchingInstallation(workDirectory, packageMetadata.version))
    ) {
      await run(
        npmCommand(),
        [
          "install",
          "--prefix",
          workDirectory,
          "--no-save",
          "--package-lock=false",
          tarball,
        ],
        { cwd: packageRoot },
      );
      console.log(
        `Installed ${NPM_PACKAGE}@${packageMetadata.version} in ${workDirectory}`,
      );
    } else {
      console.log(
        `Reused ${NPM_PACKAGE}@${packageMetadata.version} in ${workDirectory}`,
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  return workDirectory;
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  try {
    const { override } = parseArguments(process.argv.slice(2));
    await bootstrap({ override });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
