import Database, { type Database as BetterSqliteDatabase } from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from '../../config.js';

const dbPath = resolve(config.SQLITE_DB_PATH);
mkdirSync(dirname(dbPath), { recursive: true });

export const db: BetterSqliteDatabase = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function toIsoNow(): string {
  return new Date().toISOString();
}

// SQLite-first MVP schema. Mirrors the Supabase tables closely enough that
// the service layer can later switch backends without changing business code.
db.exec(`
create table if not exists adel_businesses (
  id integer primary key autoincrement,
  name text not null,
  owner_user_id integer,
  created_at text not null default (datetime('now')),
  foreign key (owner_user_id) references adel_users(id) on delete set null
);

create table if not exists adel_users (
  id integer primary key autoincrement,
  telegram_id integer unique,
  whatsapp_phone text unique,
  display_name text,
  language text not null default 'he',
  timezone text not null default 'Asia/Jerusalem',
  is_admin integer not null default 0,
  role text not null default 'client' check (role in ('owner', 'client', 'employee')),
  business_id integer references adel_businesses(id) on delete set null,
  created_at text not null default (datetime('now')),
  last_seen_at text not null default (datetime('now'))
);

create index if not exists adel_users_telegram_idx on adel_users (telegram_id);
create index if not exists adel_users_business_role_idx on adel_users (business_id, role);

create table if not exists adel_causa_memory (
  id integer primary key autoincrement,
  user_id integer not null references adel_users(id) on delete cascade,
  w_type text not null check (w_type in ('what', 'where', 'when', 'who', 'why', 'how', 'how_much')),
  subject text not null,
  content text not null,
  raw_query text,
  created_at text not null default (datetime('now'))
);

create index if not exists adel_causa_user_subject_idx on adel_causa_memory (user_id, subject);
create index if not exists adel_causa_user_w_type_idx on adel_causa_memory (user_id, w_type);

create table if not exists adel_execution_log (
  id integer primary key autoincrement,
  user_id integer not null references adel_users(id) on delete cascade,
  channel text not null,
  query text not null,
  intent text,
  route text not null check (route in ('script', 'llm_fallback', 'llm_owner', 'rag_grounded', 'draft_for_owner', 'error')),
  handler text,
  latency_ms integer,
  success integer,
  response text,
  created_at text not null default (datetime('now'))
);

create index if not exists adel_execution_user_route_idx on adel_execution_log (user_id, route, created_at desc);

create table if not exists adel_pending_scripts (
  id integer primary key autoincrement,
  user_id integer not null references adel_users(id) on delete cascade,
  source_query text not null,
  intent text not null,
  llm_response text not null,
  status text not null default 'pending' check (status in ('pending', 'drafted', 'merged', 'rejected')),
  notes text,
  created_at text not null default (datetime('now'))
);

create index if not exists adel_pending_status_idx on adel_pending_scripts (status, created_at desc);

create table if not exists adel_drafts (
  id integer primary key autoincrement,
  business_id integer not null references adel_businesses(id) on delete cascade,
  client_user_id integer not null references adel_users(id) on delete cascade,
  client_query text not null,
  drafted_reply text not null,
  reasoning text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'sent', 'expired')),
  owner_message_id integer,
  approved_at text,
  sent_at text,
  created_at text not null default (datetime('now'))
);

create index if not exists adel_drafts_business_status_idx on adel_drafts (business_id, status, created_at desc);

create table if not exists adel_documents (
  id integer primary key autoincrement,
  business_id integer not null references adel_businesses(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  size_bytes integer not null,
  uploaded_by integer not null references adel_users(id) on delete set null,
  created_at text not null default (datetime('now'))
);

create table if not exists adel_document_chunks (
  id integer primary key autoincrement,
  document_id integer not null references adel_documents(id) on delete cascade,
  business_id integer not null references adel_businesses(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding text,
  created_at text not null default (datetime('now'))
);

create index if not exists adel_document_chunks_business_idx on adel_document_chunks (business_id);
`);
