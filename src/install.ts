import { isAbsolute } from "node:path";
import * as p from "@clack/prompts";
import { readConfig, writeConfig } from "./config.ts";
import { paths } from "./paths.ts";
import { listProjects } from "./projects.ts";
import {
  canDownloadNative,
  downloadNative,
  findSignalCli,
  signalCliCommands,
} from "./signal-cli.ts";
import {
  copyApp,
  hasSystemd,
  installAskShim,
  installService,
  lingerEnabled,
  stopService,
} from "./service.ts";
import { createT3, resolveT3 } from "./t3.ts";

const phoneNumber = /^\+[1-9]\d{6,14}$/;
const examplePhone = "+61400000000";

function answer<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Install cancelled.");
    process.exit(1);
  }
  return value as Exclude<T, symbol>;
}

function fail(message: string): never {
  p.cancel(message);
  process.exit(1);
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
    fail(error instanceof Error ? error.message : String(error));
  }
}

async function askPhone(message: string, initialValue?: string) {
  return answer(
    await p.text({
      message,
      placeholder: examplePhone,
      initialValue,
      validate: (value) =>
        value && phoneNumber.test(value.replace(/\s/g, ""))
          ? undefined
          : `Use the international format, like ${examplePhone}`,
    }),
  ).replace(/\s/g, "");
}

async function askDefaultProject(existing?: string) {
  const { projects } = await listProjects().catch((error: Error) => fail(error.message));
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

async function register(commands: ReturnType<typeof signalCliCommands>) {
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
    commands.register(captcha, voice),
  );

  const code = answer(await p.text({ message: "Verification code", placeholder: "123-456" }));
  await step("Verifying", "Number verified", () => commands.verify(code));

  const pin = answer(
    await p.password({
      message: "Choose a Signal PIN for the bot. It stops anyone else registering the number.",
      validate: (value) => (value && value.length >= 4 ? undefined : "Use at least 4 characters"),
    }),
  );
  await step("Setting the PIN", "Registration lock is on", () => commands.setPin(pin));

  const name = answer(await p.text({ message: "Bot's Signal profile name", initialValue: "T3" }));
  await step("Setting the profile name", "Profile name set", () => commands.setName(name));
}

export async function install(appSource: string) {
  p.intro("t3-signal-bridge");

  const existing = readConfig();

  const t3Bin = resolveT3(existing?.t3Bin);
  const t3Version =
    t3Bin &&
    (await createT3(t3Bin)
      .version()
      .catch(() => undefined));
  if (!t3Bin || !t3Version)
    fail("Couldn't run the T3 Code CLI. Install T3 Code, or put `t3` on your PATH.");
  p.log.success(`Found T3 Code ${t3Version}`);

  let signalCli = findSignalCli(existing?.signalCli);
  if (!signalCli) {
    if (!canDownloadNative) {
      fail(
        "Install signal-cli (https://github.com/AsamK/signal-cli#installation) and run this again.",
      );
    }
    const download = answer(
      await p.confirm({
        message: "signal-cli isn't installed. Download its native Linux build (about 120 MB)?",
      }),
    );
    if (!download)
      fail(
        "Install signal-cli (https://github.com/AsamK/signal-cli#installation) and run this again.",
      );
    const { version, binary } = await step(
      "Downloading signal-cli",
      "Downloaded signal-cli",
      downloadNative,
    );
    p.log.success(`Installed signal-cli ${version}`);
    signalCli = binary;
  }

  const botNumber = await askPhone("The bot's phone number", existing?.botNumber);
  const owner = await askPhone("Your Signal phone number", existing?.owner);
  const defaultProject = await askDefaultProject(existing?.defaultProject);

  stopService();
  const commands = signalCliCommands(signalCli, botNumber);
  if (await commands.isRegistered()) p.log.success(`${botNumber} is already registered`);
  else await register(commands);

  await step("Sending you a test message", "Test message sent", () =>
    commands.send(
      owner,
      "t3-signal-bridge is connected. Send a message here to start a T3 Code thread.",
    ),
  );
  const ownerUuid = await commands.uuidOf(owner).catch(() => undefined);

  writeConfig({
    botNumber,
    owner,
    ownerUuid,
    signalCli,
    defaultProject,
    port: existing?.port,
    t3Bin:
      existing?.t3Bin ?? (isAbsolute(t3Bin) && !t3Bin.startsWith(paths.t3Home) ? t3Bin : undefined),
  });
  copyApp(appSource);

  const askOnPath = installAskShim(process.execPath);
  if (!askOnPath)
    p.log.warn(
      `Add ${paths.askShim.replace(/\/signal-ask$/, "")} to your PATH so agents can run signal-ask.`,
    );

  if (hasSystemd()) {
    await step("Starting the bridge", "Bridge running as a systemd user service", async () =>
      installService(process.execPath),
    );
    if (!lingerEnabled()) {
      p.log.warn("Run `loginctl enable-linger` so the bridge keeps running after you log out.");
    }
  } else {
    p.log.warn(
      `No systemd found. Keep \`${process.execPath} ${paths.app} run\` running with your own service manager.`,
    );
  }

  p.note(
    [
      "Save the bot as a contact so its messages notify you.",
      "To let agents ask you questions, add this to your AGENTS.md or task prompt:",
      "",
      "  If you can't continue without the owner's decision, run",
      '  `signal-ask "<question>"` and end your turn. Their reply',
      "  arrives as your next message.",
    ].join("\n"),
    "Next",
  );
  p.outro("Done");
}
