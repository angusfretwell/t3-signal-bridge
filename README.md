# T3 Code Signal Bridge

Start, answer and follow [T3 Code](https://github.com/pingdotgg/t3code) threads from Signal:

- Message the bot to start a thread.
- Quote-reply to a bot message to answer its thread.
- Bot reacts 👀 when it gets your message and replies when its thread finishes.
- Let agents ask you questions and wait for your answer.

This is not an official T3 Code project.

## Installation

You need:

- T3 Code, on a Linux machine with systemd.
- Node.js 22.13 or later.
- A phone number for the bot. A cheap prepaid SIM or eSIM works; virtual numbers usually don't.

Run the installer on the machine where T3 Code runs:

```sh
npx t3-signal-bridge install
```

The installer asks for the bot's number, your Signal number and a default project (No project unless you pick one). It registers the bot with Signal, sends you a test message, and starts the bridge as a background service.

On your phone, save the bot as a contact so that its messages notify you.

To let agents ask you questions, add this line to your AGENTS.md or to a scheduled task's prompt:

```md
If you can't continue without the owner's decision, run `signal-ask "<question>"` and end your turn. Their reply arrives as your next message.
```

To change your settings, run `npx t3-signal-bridge install` again.

## Reference

| Command                              | What it does                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `npx t3-signal-bridge status`        | Shows whether the bridge's service is installed and running, and where its logs are.                                           |
| `npx t3-signal-bridge@latest update` | Installs the latest version and restarts the bridge.                                                                           |
| `signal-ask "<question>"`            | Sends a question from the T3 Code thread it runs in. Pipe longer questions on stdin.                                           |
| `npx t3-signal-bridge run`           | Runs the bridge in your terminal, for machines without systemd. Stop the service first if it's running.                        |
| `npx t3-signal-bridge uninstall`     | Stops the bridge and removes its service. Keeps your config and the bot's Signal keys, so `install` can set it up again later. |
