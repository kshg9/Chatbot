import 'server-only';

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import type {
  AppSettings,
  AppSnapshot,
  ConversationSummary,
  StoredConversation,
  StoredMessage,
} from '@/lib/offline-types';

const DATA_DIR = path.join(process.cwd(), '.data');
const DB_PATH = path.join(DATA_DIR, 'chatbot.db');

let database: DatabaseSync | null = null;

interface ConversationRow {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

interface ConversationSummaryRow extends ConversationRow {
  message_count: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

function getDb() {
  if (database) {
    return database;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");

  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at
      ON messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  seedSettings(database);
  return database;
}

function seedSettings(db: DatabaseSync) {
  const insertSetting = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `);

  insertSetting.run('model', 'nanochat');
  insertSetting.run('temperature', '0.6');
  insertSetting.run('theme', 'system');
}

function mapConversation(row: {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}): Omit<StoredConversation, 'messages'> {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}): StoredMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function getSettings(): AppSettings {
  const db = getDb();
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string }>;
  const settingsMap = new Map(rows.map((row) => [row.key, row.value]));

  return {
    model: settingsMap.get('model') || 'nanochat',
    temperature: Number(settingsMap.get('temperature') || '0.6'),
    theme: (settingsMap.get('theme') as AppSettings['theme']) || 'system',
  };
}

export function updateSettings(next: Partial<AppSettings>): AppSettings {
  const db = getDb();
  const statement = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  if (next.model) {
    statement.run('model', next.model);
  }
  if (typeof next.temperature === 'number') {
    statement.run('temperature', String(next.temperature));
  }
  if (next.theme) {
    statement.run('theme', next.theme);
  }

  return getSettings();
}

export function listConversationSummaries(): ConversationSummary[] {
  const db = getDb();
  return (db
    .prepare(`
      SELECT
        c.id,
        c.title,
        c.model,
        c.created_at,
        c.updated_at,
        COUNT(m.id) AS message_count
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `)
    .all() as ConversationSummaryRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      model: row.model,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: Number(row.message_count || 0),
    }));
}

export function getConversation(conversationId: string): StoredConversation | null {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT id, title, model, created_at, updated_at
      FROM conversations
      WHERE id = ?
    `)
    .get(conversationId) as ConversationRow | undefined;

  if (!row) {
    return null;
  }

  const messages = db
    .prepare(`
      SELECT id, conversation_id, role, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `)
    .all(conversationId) as MessageRow[];

  return {
    ...mapConversation(row),
    messages: messages.map((messageRow) => mapMessage(messageRow)),
  };
}

export function createConversation(model: string, firstMessage?: string) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  const title = firstMessage ? buildTitle(firstMessage) : 'New Offline Chat';

  db.prepare(`
    INSERT INTO conversations (id, title, model, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, title, model, now, now);

  return getConversation(id)!;
}

export function appendMessage(conversationId: string, role: 'user' | 'assistant', content: string) {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), conversationId, role, content, now);

  db.prepare(`
    UPDATE conversations
    SET updated_at = ?
    WHERE id = ?
  `).run(now, conversationId);
}

export function setConversationModel(conversationId: string, model: string) {
  const db = getDb();
  db.prepare(`
    UPDATE conversations
    SET model = ?, updated_at = ?
    WHERE id = ?
  `).run(model, new Date().toISOString(), conversationId);
}

export function renameConversation(conversationId: string, title: string) {
  const db = getDb();
  db.prepare(`
    UPDATE conversations
    SET title = ?, updated_at = ?
    WHERE id = ?
  `).run(title, new Date().toISOString(), conversationId);
}

export function deleteConversation(conversationId: string) {
  const db = getDb();
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(conversationId);
}

export function deleteAllConversations() {
  const db = getDb();
  db.prepare(`DELETE FROM conversations`).run();
}

export function buildSnapshot(selectedConversationId?: string | null): AppSnapshot {
  const conversations = listConversationSummaries();
  const selectedId = selectedConversationId || conversations[0]?.id || null;
  const selectedConversation = selectedId ? getConversation(selectedId) : null;

  return {
    conversations,
    selectedConversation,
    settings: getSettings(),
  };
}

function buildTitle(content: string) {
  const normalized = content.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return 'New Offline Chat';
  }
  return normalized.length > 48 ? `${normalized.slice(0, 48)}...` : normalized;
}
