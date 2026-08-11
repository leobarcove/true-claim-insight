/**
 * The slice of the Telegram Bot API this adapter actually reads.
 *
 * Hand-written rather than pulled from a client library: the surface used here
 * is small and stable, and a dependency whose types drift is a worse trade than
 * forty lines that say exactly what is relied on. Anything absent is something
 * the adapter deliberately ignores.
 *
 * Reference: https://core.telegram.org/bots/api
 */

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name?: string;
  /** IETF tag from the account's own setting, e.g. `en`, `ms`, `zh-hans`. */
  language_code?: string;
}

export interface TelegramContact {
  phone_number: string;
  user_id?: number;
}

export interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
}

export interface TelegramDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  contact?: TelegramContact;
  /** Text sent *with* a photo or file. Dropped until 11 Aug 2026. */
  caption?: string;
  /** Ascending by size; the last entry is the largest rendition. */
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;

  // Kinds we cannot turn into an answer. Declared so they can be recognised
  // and refused out loud — undeclared, they were indistinguishable from an
  // empty update and vanished without a row, a reply or a trace.
  voice?: unknown;
  video?: unknown;
  video_note?: unknown;
  audio?: unknown;
  sticker?: unknown;
  animation?: unknown;
  location?: unknown;
  venue?: unknown;
  poll?: unknown;
  dice?: unknown;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  /** The `callback_data` of the tapped button. */
  data?: string;
}

export interface TelegramUpdate {
  /** A message the sender went back and changed. */
  edited_message?: TelegramMessage;
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}
