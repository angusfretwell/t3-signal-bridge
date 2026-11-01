import { dirname, isAbsolute } from "node:path";
import * as p from "@clack/prompts";
import { readConfig, writeConfig } from "./config.ts";
import { tryRun } from "./exec.ts";
import { insideT3Home, paths } from "./paths.ts";
import { listProjects } from "./projects.ts";
import { canDownloadNative, downloadNative, findSignalCli, signalAccount } from "./signal-setup.ts";
import { deploy, hasSystemd, lingerEnabled, startService, stopService } from "./service.ts";
import { findT3 } from "./t3.ts";
import { errorMessage } from "./util.ts";
import { onPath } from "./which.ts";

const phoneNumber = /^\+[1-9]\d{6,14}$/;
const examplePhone = "+61400000000";
const defaultBotName = "T3 Code";

function fail(message: string): never {
  p.cancel(message);
  process.exit(1);
}

function answer<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) fail("Install cancelled.");
  return value as Exclude<T, symbol>;
}

async function step<T>(start: string, done: string, work: () => Promise<T>) {
  const spinner = p.spinner();
  spinner.start(start);

  try {
    const result = await work();
    spinner.stop(done);
    return result;
  } catch (error) {
    spinner.error(start);
    fail(errorMessage(error));
  }
}

const withoutWhitespace = (value: string) => value.replace(/\s/g, "");

async function askPhone(message: string, initialValue?: string) {
  return withoutWhitespace(
    answer(
      await p.text({
        message,
        placeholder: examplePhone,
        initialValue,
        validate: (value) =>
          value && phoneNumber.test(withoutWhitespace(value))
            ? undefined
            : `Use the international format, like ${examplePhone}`,
      }),
    ),
  );
}

async function askDefaultProject(existing?: string) {
  const { projects } = await listProjects().catch((error) => fail(errorMessage(error)));
  const choice = answer(
    await p.select({
      message: "Where should messages without a project prefix start threads?",
      initialValue: projects.some((project) => project.path === existing) ? existing : "",
      options: [
        { value: "", label: "No project", hint: "T3 Code's scratch space" },
        ...projects.map((project) => ({
          value: project.path,
          label: project.name,
          hint: project.path,
        })),
      ],
    }),
  );
  return choice || undefined;
}

async function askPin(): Promise<string> {
  const pin = answer(
    await p.password({
      message: "Choose a Signal PIN for the bot. It stops anyone else registering the number.",
      validate: (value) => (value && value.length >= 4 ? undefined : "Use at least 4 characters"),
    }),
  );
  const confirmation = answer(await p.password({ message: "Enter the PIN again" }));
  if (confirmation === pin) return pin;

  p.log.warn("The PINs don't match. Try again.");
  return askPin();
}

async function register(account: ReturnType<typeof signalAccount>) {
  p.note(
    [
      "Signal needs a captcha before it sends a code.",
      "1. Open https://signalcaptchas.org/registration/generate.html",
      "2. Solve the captcha.",
      "3. Copy the link it gives you. It starts with signalcaptcha://",
    ].join("\n"),
    "Register the bot's number",
  );

  const captcha = answer(
    await p.text({
      message: "Paste the signalcaptcha:// link",
      validate: (value) => (value?.trim() ? undefined : "Paste the link from the captcha page"),
    }),
  ).trim();
  const voice = answer(
    await p.select({
      message: "How should Signal send the code?",
      options: [
        { value: false, label: "SMS" },
        { value: true, label: "Voice call", hint: "works only after an SMS attempt" },
      ],
    }),
  );
  await step("Asking Signal for a code", "Signal sent a code", () =>
    account.register(captcha, voice),
  );

  const code = answer(await p.text({ message: "Verification code", placeholder: "123-456" }));
  await step("Verifying", "Number verified", () => account.verify(code));

  const pin = await askPin();
  await step("Setting the PIN", "Registration lock is on", () => account.setPin(pin));

  const name = answer(
    await p.text({ message: "Bot's Signal profile name", initialValue: defaultBotName }),
  );
  await step("Setting the profile name", "Profile name set", () => account.setName(name));

  return name;
}

async function requireT3(configured?: string) {
  const t3 = findT3(configured);
  const release = t3 && (await tryRun(t3, ["--version"]));
  if (!t3 || !release)
    fail("Couldn't run the T3 Code CLI. Install T3 Code, or put `t3` on your PATH.");

  p.log.success(`Found T3 Code ${release}`);
  return t3;
}

async function ensureSignalCli(configured?: string) {
  const found = await findSignalCli(configured);
  if (found) return found;

  const download =
    canDownloadNative &&
    answer(
      await p.confirm({
        message: "signal-cli isn't installed. Download its native Linux build (about 120 MB)?",
      }),
    );
  if (!download)
    fail(
      "Install signal-cli (https://github.com/AsamK/signal-cli#installation) and run this again.",
    );

  const version = await step("Downloading signal-cli", "Downloaded signal-cli", downloadNative);
  p.log.success(`Installed signal-cli ${version}`);
  return paths.signalCliBinary;
}

export async function install(appSource: string) {
  p.intro("t3-signal-bridge");

  const existing = readConfig();
  const t3 = await requireT3(existing?.t3Bin);
  const signalCli = await ensureSignalCli(existing?.signalCli);

  const botNumber = await askPhone("The bot's phone number", existing?.botNumber);
  const owner = await askPhone("Your Signal phone number", existing?.owner);
  const defaultProject = await askDefaultProject(existing?.defaultProject);

  await stopService();

  const account = signalAccount(signalCli, botNumber);
  let botName = existing?.botName ?? defaultBotName;
  if (await account.isRegistered()) p.log.success(`${botNumber} is already registered`);
  else botName = await register(account);

  await step("Sending you a test message", "Test message sent", () =>
    account.send(owner, `👋 ${botName} is connected.\n\nSend a message here to start a thread.`),
  );
  const ownerUuid = await account.uuidOf(owner).catch(() => undefined);

  const t3IsStable = isAbsolute(t3) && !insideT3Home(t3);
  const t3Bin = existing?.t3Bin ?? (t3IsStable ? t3 : undefined);
  writeConfig({
    botNumber,
    botName,
    owner,
    ownerUuid,
    signalCli,
    defaultProject,
    port: existing?.port,
    t3Bin,
  });

  deploy(appSource);
  const shimDir = dirname(paths.askShim);
  if (!onPath(shimDir)) p.log.warn(`Add ${shimDir} to your PATH so agents can run signal-ask.`);

  if (await hasSystemd()) {
    await step("Starting the bridge", "Bridge running as a systemd user service", startService);
    if (!(await lingerEnabled()))
      p.log.warn("Run `loginctl enable-linger` so the bridge keeps running after you log out.");
  } else {
    p.log.warn(
      `No systemd found. Keep \`${process.execPath} ${paths.app} run\` running with your own service manager.`,
    );
  }

  p.outro("Done");
  console.log(
    [
      "Save the bot as a contact so its messages notify you.",
      "",
      "To let agents ask you questions, add this to your AGENTS.md or task prompt:",
      "",
      "If you can't continue without the owner's decision, run `signal-ask \"<question>\"` and end your turn. Their reply arrives as your next message.",
      "",
    ].join("\n"),
  );
}
