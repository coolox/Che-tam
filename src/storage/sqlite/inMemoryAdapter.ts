import type { SqlDatabase, SqlExecutor, SqlResult, SqlValue } from './contracts';

type Row = Record<string, SqlValue>;
type State = { tables: Set<string>; indexes: Set<string>; rows: Map<string, Row[]> };

function cloneState(state: State): State {
  return { tables: new Set(state.tables), indexes: new Set(state.indexes), rows: new Map([...state.rows].map(([name, rows]) => [name, rows.map((row) => ({ ...row }))])) };
}

/** Deterministic SQL-shaped in-memory adapter used only by focused SQLite tests. */
export class InMemorySqliteDatabase implements SqlDatabase {
  private state: State = { tables: new Set(), indexes: new Set(), rows: new Map() };
  private failNextMatching: string | null = null;

  failNext(statementFragment: string): void { this.failNextMatching = statementFragment.toLowerCase(); }
  tableNames(): string[] { return [...this.state.tables].sort(); }
  indexNames(): string[] { return [...this.state.indexes].sort(); }
  seedV0User(id: string, value: string): void {
    this.addTable('schema_migrations');
    this.rows('schema_migrations').push({ version: 0, applied_at: '2026-10-02T00:00:00.000Z' });
    this.addTable('v0_user_data');
    this.rows('v0_user_data').push({ id, value });
  }
  v0Users(): Row[] { return this.rows('v0_user_data').map((row) => ({ ...row })); }

  async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
    const snapshot = cloneState(this.state);
    try { return await work(this); } catch (error) { this.state = snapshot; throw error; }
  }

  async execute(sql: string, params: readonly SqlValue[] = []): Promise<SqlResult> {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (this.failNextMatching !== null && normalized.includes(this.failNextMatching)) { this.failNextMatching = null; throw new Error(`Injected failure for ${normalized}`); }
    if (normalized.startsWith('pragma ')) return { changes: 0 };
    const table = /create table if not exists ([a-z_]+)/.exec(normalized)?.[1];
    if (table) { this.addTable(table); return { changes: 0 }; }
    const index = /create index if not exists ([a-z_]+)/.exec(normalized)?.[1];
    if (index) { this.state.indexes.add(index); return { changes: 0 }; }
    const inserted = /insert(?: or ignore)? into ([a-z_]+)/.exec(normalized)?.[1];
    if (inserted) return this.insert(inserted, normalized, params);
    const updated = /update ([a-z_]+) set/.exec(normalized)?.[1];
    if (updated === 'chats' && normalized.includes('unread_count = 0')) {
      const row = this.rows('chats').find((candidate) => candidate.id === params[1]);
      if (!row) return { changes: 0 };
      row.unread_count = 0;
      row.updated_at = params[0];
      return { changes: 1 };
    }
    throw new Error(`Unsupported fake SQL: ${sql}`);
  }

  async query<T extends Record<string, SqlValue>>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    const table = /from ([a-z_]+)/.exec(normalized)?.[1];
    if (!table) throw new Error(`Unsupported fake query: ${sql}`);
    let result = this.rows(table).map((row) => ({ ...row }));
    if (normalized.includes('where version = ?')) result = result.filter((row) => row.version === params[0]);
    if (normalized.includes('where scope = ?')) result = result.filter((row) => row.scope === params[0]);
    if (normalized.includes('where chat_id = ?')) result = result.filter((row) => row.chat_id === params[0]);
    if (normalized.includes('order by last_message_at')) result.sort((a, b) => (a.last_message_at === null ? 1 : b.last_message_at === null ? -1 : String(b.last_message_at).localeCompare(String(a.last_message_at))) || String(a.id).localeCompare(String(b.id)));
    if (normalized.includes('order by created_at asc, id asc')) result.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
    if (normalized.includes('order by created_at asc, client_message_id asc')) result.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.client_message_id).localeCompare(String(b.client_message_id)));
    if (normalized.startsWith('select cursor')) result = result.map((row) => ({ cursor: row.cursor }));
    return result as T[];
  }

  private insert(table: string, sql: string, params: readonly SqlValue[]): SqlResult {
    const columns = /\(([^)]+)\) values/.exec(sql)?.[1]?.split(',').map((value) => value.trim());
    if (!columns) throw new Error(`Unsupported fake insert: ${sql}`);
    const row = Object.fromEntries(columns.map((column, index) => [column, params[index]])) as Row;
    const rows = this.rows(table);
    const key = table === 'schema_migrations' ? 'version' : table === 'profiles' || table === 'chats' || table === 'messages' ? (table === 'messages' ? 'client_message_id' : 'id') : table === 'sync_cursors' ? 'scope' : table === 'endpoint_cache' ? 'endpoint_id' : table === 'outbox' ? 'client_message_id' : null;
    const existing = key === null ? undefined : rows.find((candidate) => candidate[key] === row[key]);
    if (existing) {
      if (sql.includes('do nothing') || sql.includes('or ignore')) return { changes: 0 };
      if (table === 'messages' && sql.includes('on conflict(client_message_id)')) {
        const mutableColumns = { ...row };
        delete mutableColumns.id;
        Object.assign(existing, mutableColumns);
        return { changes: 1 };
      }
      Object.assign(existing, row); return { changes: 1 };
    }
    if (table === 'messages' && rows.some((candidate) => candidate.client_message_id === row.client_message_id)) return { changes: 0 };
    if (table === 'outbox' && rows.some((candidate) => candidate.client_message_id === row.client_message_id)) return { changes: 0 };
    rows.push(row); return { changes: 1 };
  }

  private addTable(table: string): void { this.state.tables.add(table); if (!this.state.rows.has(table)) this.state.rows.set(table, []); }
  private rows(table: string): Row[] { this.addTable(table); return this.state.rows.get(table) as Row[]; }
}
