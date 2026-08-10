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
  /** Ascending by size; the last entry is the largest rendition. */
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  /** The `callback_data` of the tapped button. */
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}
