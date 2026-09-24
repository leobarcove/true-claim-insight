# Telegram Terminal Controller

This local-development helper lets an authorised Telegram chat run a small,
fixed set of project maintenance commands. It is deliberately not a remote
shell.

## Setup

1. Create a **separate** bot with Telegram's `@BotFather`. Do not reuse the
   claimant-conversation bot because both use long polling.
2. Send a message to the new bot, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy your numeric
   `message.chat.id`.
3. Add these values to the root `.env`:

   ```dotenv
   TELEGRAM_TERMINAL_BOT_TOKEN=your-dedicated-bot-token
   TELEGRAM_TERMINAL_ALLOWED_CHAT_IDS=123456789
   ```

   Multiple chat IDs may be separated with commas. The controller accepts only
   private chats; group and channel messages are rejected.

4. Start the controller from the repository root:

   ```powershell
   pnpm telegram:terminal
   ```

## Commands

- `/status` - Git working-tree status
- `/diff [path ...]` - Git diff, optionally limited to project paths
- `/log` - Recent commits
- `/typecheck`, `/lint`, `/test`, `/build`, `/formatcheck` - project checks
- `/services` - Docker Compose status
- `/cancel` - terminate the active command
- `/help` - command list

Only one command runs at a time. Commands have a five-minute default timeout,
responses are capped at 20,000 characters, and activity is recorded in
`logs/telegram-terminal.audit.log` without storing command output.

## Security notes

- Run this only on a trusted development machine, not a production server.
- Never paste bot tokens into Telegram messages or commit them to Git.
- Rotate the token immediately through `@BotFather` if it is exposed.
- The bot never invokes a shell and cannot accept arbitrary executables or
  command-line options.
- Commands received while the controller is offline are discarded at startup.
