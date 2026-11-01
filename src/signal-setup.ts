import { mkdir, rm, writeFile } from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { exec, run } from "./exec.ts";
import { paths } from "./paths.ts";
import { signalCliArgs } from "./signal.ts";
import { which } from "./which.ts";

const contactsSchema = z.array(
  z.object({ number: z.string().nullish(), uuid: z.string().nullish() }),
);

async function signalCliVersion(binary: string) {
  const result = await exec(binary, ["--version"]);
  return result.ok ? result.stdout.trim() : undefined;
}

export async function findSignalCli(configured?: string) {
  for (const candidate of [configured, paths.signalCliBinary, which("signal-cli")]) {
    if (candidate && (await signalCliVersion(candidate)) !== undefined) return candidate;
  }
  return undefined;
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
  try {
    await writeFile(archive, download.body);
    await mkdir(dirname(paths.signalCliBinary), { recursive: true });
    await run("tar", ["xzf", archive, "-C", dirname(paths.signalCliBinary)]);
  } finally {
    await rm(archive, { force: true });
  }
  return { version: release.tag_name, binary: paths.signalCliBinary };
}

export function signalAccount(binary: string, account: string) {
  const signalCli = (...args: string[]) => run(binary, signalCliArgs(account, ...args));

  return {
    isRegistered: async () => {
      const result = await exec(binary, ["--data-dir", paths.signalData, "listAccounts"]);
      return result.ok && result.stdout.includes(account);
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
