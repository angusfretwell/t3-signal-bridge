import { execFile, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { arch, platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { promisify } from "node:util";
import { z } from "zod";
import { paths } from "./paths.ts";
import { which } from "./which.ts";

const run = promisify(execFile);

const contactsSchema = z.array(
  z.object({ number: z.string().nullish(), uuid: z.string().nullish() }),
);

export function signalCliVersion(binary: string) {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

export function findSignalCli(configured?: string) {
  return [configured, paths.signalCliBinary, which("signal-cli")].find(
    (candidate): candidate is string => !!candidate && signalCliVersion(candidate) !== undefined,
  );
}

export const canDownloadNative = platform() === "linux" && arch() === "x64";

const releaseSchema = z.object({
  tag_name: z.string(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.url() })),
});

export async function downloadNative() {
  const response = await fetch("https://api.github.com/repos/AsamK/signal-cli/releases/latest");
  if (!response.ok)
    throw new Error(`GitHub returned ${response.status} for the latest signal-cli release`);
  const release = releaseSchema.parse(await response.json());
  const asset = release.assets.find((candidate) => candidate.name.endsWith("-Linux-native.tar.gz"));
  if (!asset) throw new Error(`signal-cli ${release.tag_name} has no Linux native build`);

  const archive = join(tmpdir(), asset.name);
  const download = await fetch(asset.browser_download_url);
  if (!download.ok || !download.body)
    throw new Error(`Downloading ${asset.name} failed: ${download.status}`);
  await pipeline(Readable.fromWeb(download.body as WebReadableStream), createWriteStream(archive));

  mkdirSync(dirname(paths.signalCliBinary), { recursive: true });
  await run("tar", ["xzf", archive, "-C", dirname(paths.signalCliBinary)]);
  rmSync(archive);
  return { version: release.tag_name, binary: paths.signalCliBinary };
}

export function signalCliCommands(binary: string, account: string) {
  const signalCli = async (...args: string[]) => {
    try {
      return (await run(binary, ["--data-dir", paths.signalData, "-a", account, ...args])).stdout;
    } catch (error) {
      const { stderr, message } = error as { stderr?: string; message: string };
      throw new Error(stderr?.trim() || message);
    }
  };

  return {
    isRegistered: async () => {
      try {
        return (
          await run(binary, ["--data-dir", paths.signalData, "listAccounts"])
        ).stdout.includes(account);
      } catch {
        return false;
      }
    },
    register: (captcha: string, voice: boolean) =>
      signalCli("register", "--captcha", captcha, ...(voice ? ["--voice"] : [])),
    verify: (code: string) => signalCli("verify", code.replace(/\D/g, "")),
    setPin: (pin: string) => signalCli("setPin", pin),
    setName: (name: string) => signalCli("updateProfile", "--given-name", name),
    send: (recipient: string, message: string) => signalCli("send", "-m", message, recipient),
    uuidOf: async (number: string) => {
      const contacts = contactsSchema.parse(
        JSON.parse(await signalCli("-o", "json", "listContacts")),
      );
      return contacts.find((contact) => contact.number === number)?.uuid ?? undefined;
    },
  };
}
