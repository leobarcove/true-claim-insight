#!/usr/bin/env node

/**
 * Guarded Telegram command runner for local development.
 *
 * This intentionally does not expose an arbitrary shell. Each supported command
 * maps to a fixed executable and a constrained set of arguments.
 */

const { spawn } = require('node:child_process');
const { appendFile, mkdir } = require('node:fs/promises');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const logDirectory = path.join(projectRoot, 'logs');
const auditFile = path.join(logDirectory, 'telegram-terminal.audit.log');
const token = process.env.TELEGRAM_TERMINAL_BOT_TOKEN?.trim();
const allowedChatIds = new Set(
  (process.env.TELEGRAM_TERMINAL_ALLOWED_CHAT_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
);
const commandTimeoutMs = positiveInteger(process.env.TELEGRAM_TERMINAL_TIMEOUT_MS, 5 * 60 * 1000);
const outputLimit = positiveInteger(process.env.TELEGRAM_TERMINAL_OUTPUT_LIMIT, 20_000);

if (!token) {
  fatal('TELEGRAM_TERMINAL_BOT_TOKEN is required.');
}
if (allowedChatIds.size === 0) {
  fatal('TELEGRAM_TERMINAL_ALLOWED_CHAT_IDS is required.');
}

const apiBase = `https://api.telegram.org/bot${token}`;
let updateOffset = 0;
let activeCommand = null;
let stopping = false;

const commandDefinitions = {
  status: {
    description: 'Show the Git working-tree status',
    executable: 'git',
    fixedArgs: ['status', '--short', '--branch'],
    acceptsArgs: false,
  },
  diff: {
    description: 'Show the current Git diff (optional paths)',
    executable: 'git',
    fixedArgs: ['diff', '--'],
    acceptsArgs: true,
    validateArgs: validateWorkspacePaths,
  },
  log: {
    description: 'Show recent commits',
    executable: 'git',
    fixedArgs: ['log', '--oneline', '--decorate', '-20'],
    acceptsArgs: false,
  },
  typecheck: pnpmScript('typecheck', 'Run TypeScript checks'),
  lint: pnpmScript('lint', 'Run lint checks'),
  test: pnpmScript('test', 'Run tests'),
  build: pnpmScript('build', 'Build all packages'),
  formatcheck: pnpmScript('format:check', 'Check formatting'),
  services: {
    description: 'Show Docker Compose service status',
    executable: 'docker',
    fixedArgs: ['compose', 'ps'],
    acceptsArgs: false,
  },
};

function pnpmScript(script, description) {
  return {
    description,
    executable: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    fixedArgs: [script],
    acceptsArgs: false,
  };
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function fatal(message) {
  console.error(message);
  process.exit(1);
}

function validateWorkspacePaths(args) {
  for (const argument of args) {
    if (argument.startsWith('-')) {
      throw new Error('Options are not accepted for /diff. Provide paths only.');
    }
    const resolved = path.resolve(projectRoot, argument);
    const relative = path.relative(projectRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path is outside the project: ${argument}`);
    }
    if (/^\.env(?:\.|$)/i.test(relative) || relative.includes(`${path.sep}.git${path.sep}`)) {
      throw new Error(`Sensitive path is not available: ${argument}`);
    }
  }
}

async function telegram(method, body) {
  const response = await fetch(`${apiBase}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram ${method} failed: ${payload.description || response.status}`);
  }
  return payload.result;
}

async function send(chatId, text) {
  const chunks = splitMessage(String(text || '(no output)'), 3900);
  for (const chunk of chunks) {
    await telegram('sendMessage', { chat_id: chatId, text: chunk });
  }
}

function splitMessage(text, size) {
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks.length ? chunks : ['(no output)'];
}

function helpText() {
  const commands = Object.entries(commandDefinitions)
    .map(([name, definition]) => `/${name} - ${definition.description}`)
    .join('\n');
  return [
    'True Claim Insight terminal controller',
    '',
    commands,
    '/cancel - Stop the active command',
    '/help - Show this message',
    '',
    'Only one command runs at a time. Commands execute inside the project directory.',
  ].join('\n');
}

async function audit(event, details = {}) {
  await mkdir(logDirectory, { recursive: true });
  const record = JSON.stringify({ timestamp: new Date().toISOString(), event, ...details });
  await appendFile(auditFile, `${record}\n`, 'utf8');
}

async function handleMessage(message) {
  const chatId = String(message.chat?.id ?? '');
  const senderId = String(message.from?.id ?? '');
  const text = message.text?.trim();

  if (message.chat?.type !== 'private' || !allowedChatIds.has(chatId)) {
    await audit('access_denied', {
      chatId,
      senderId,
      chatType: message.chat?.type,
    });
    return;
  }
  if (!text?.startsWith('/')) return;

  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.slice(1).split('@')[0].toLowerCase();

  if (command === 'start' || command === 'help') {
    await send(chatId, helpText());
    return;
  }
  if (command === 'cancel') {
    if (!activeCommand) {
      await send(chatId, 'No command is currently running.');
      return;
    }
    activeCommand.child.kill();
    await audit('command_cancelled', { chatId, senderId, command: activeCommand.name });
    await send(chatId, `Cancellation requested for /${activeCommand.name}.`);
    return;
  }

  const definition = commandDefinitions[command];
  if (!definition) {
    await send(chatId, 'Unknown command. Send /help for the allowlist.');
    return;
  }
  if (!definition.acceptsArgs && args.length) {
    await send(chatId, `/${command} does not accept arguments.`);
    return;
  }
  if (activeCommand) {
    await send(chatId, `Busy running /${activeCommand.name}. Use /cancel first.`);
    return;
  }

  try {
    definition.validateArgs?.(args);
  } catch (error) {
    await send(chatId, error.message);
    return;
  }

  await runCommand({ chatId, senderId, name: command, definition, args });
}

async function runCommand({ chatId, senderId, name, definition, args }) {
  const commandArgs = [...definition.fixedArgs, ...args];
  await audit('command_started', { chatId, senderId, command: name, args });
  await send(chatId, `Running /${name}...`);

  const child = spawn(definition.executable, commandArgs, {
    cwd: projectRoot,
    env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
    shell: false,
    windowsHide: true,
  });
  activeCommand = { name, child };

  let output = '';
  let truncated = false;
  const collect = data => {
    if (output.length >= outputLimit) {
      truncated = true;
      return;
    }
    output += data.toString().slice(0, outputLimit - output.length);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  const timeout = setTimeout(() => child.kill(), commandTimeoutMs);
  const result = await new Promise(resolve => {
    child.once('error', error => resolve({ code: null, error }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timeout);
  activeCommand = null;

  const suffix = truncated ? '\n\n[output truncated]' : '';
  const heading = result.error
    ? `/${name} failed to start: ${result.error.message}`
    : `/${name} finished (exit ${result.code ?? result.signal ?? 'unknown'})`;
  await audit('command_finished', {
    chatId,
    senderId,
    command: name,
    exitCode: result.code,
    signal: result.signal,
    truncated,
  });
  await send(chatId, `${heading}\n\n${output.trim() || '(no output)'}${suffix}`);
}

async function poll() {
  console.log(
    `Telegram terminal controller started for ${allowedChatIds.size} authorised chat(s).`
  );
  await audit('bot_started', { allowedChatCount: allowedChatIds.size });
  // Do not execute commands that accumulated while this controller was offline.
  await telegram('deleteWebhook', { drop_pending_updates: true });

  while (!stopping) {
    try {
      const updates = await telegram('getUpdates', {
        offset: updateOffset,
        timeout: 30,
        allowed_updates: ['message'],
      });
      for (const update of updates) {
        updateOffset = update.update_id + 1;
        if (update.message) await handleMessage(update.message);
      }
    } catch (error) {
      if (stopping) break;
      console.error(error.message);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

function shutdown(signal) {
  stopping = true;
  activeCommand?.child.kill();
  console.log(`Stopping after ${signal}...`);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

poll().catch(error => fatal(error.stack || error.message));
