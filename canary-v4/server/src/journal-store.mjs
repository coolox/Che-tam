import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEVICE_LABEL_RE = /^[A-Za-z0-9._-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateDeviceLabel(deviceLabel) {
  return typeof deviceLabel === 'string' && DEVICE_LABEL_RE.test(deviceLabel);
}

export function validateRecordId(recordId) {
  return typeof recordId === 'string' && UUID_RE.test(recordId);
}

export function normalizeJournalPayload(payload) {
  const records = Array.isArray(payload) ? payload : payload?.records;
  const rootDeviceLabel = Array.isArray(payload) ? undefined : payload?.deviceLabel;
  if (!Array.isArray(records)) {
    throw Object.assign(new Error('records must be an array'), { statusCode: 400 });
  }

  return records.map((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw Object.assign(new Error('record must be an object'), { statusCode: 400 });
    }

    const deviceLabel = record.deviceLabel || rootDeviceLabel;
    if (!validateDeviceLabel(deviceLabel)) {
      throw Object.assign(new Error('invalid deviceLabel'), { statusCode: 400 });
    }
    if (!validateRecordId(record.recordId)) {
      throw Object.assign(new Error('invalid recordId'), { statusCode: 400 });
    }

    return { ...record, deviceLabel };
  });
}

export class MemoryJournalStore {
  #records = new Map();

  async append(records) {
    let accepted = 0;
    let duplicates = 0;

    for (const record of records) {
      if (this.#records.has(record.recordId)) {
        duplicates += 1;
        continue;
      }
      this.#records.set(record.recordId, record);
      accepted += 1;
    }

    return { accepted, duplicates };
  }

  records() {
    return Array.from(this.#records.values());
  }
}

export class FileJournalStore {
  #dataDir;
  #seen = new Set();

  constructor(dataDir) {
    if (!dataDir) {
      throw new Error('CANARY_DATA_DIR is required for file journal storage');
    }
    this.#dataDir = dataDir;
  }

  async append(records) {
    let accepted = 0;
    let duplicates = 0;

    for (const record of records) {
      if (this.#seen.has(record.recordId)) {
        duplicates += 1;
        continue;
      }

      this.#seen.add(record.recordId);
      const date = journalDate(record.timestampUtc);
      const deviceDir = join(this.#dataDir, 'journals', record.deviceLabel);
      await mkdir(deviceDir, { recursive: true });
      await appendFile(join(deviceDir, `${date}.jsonl`), `${JSON.stringify(record)}\n`, { mode: 0o600 });
      accepted += 1;
    }

    return { accepted, duplicates };
  }
}

function journalDate(timestampUtc) {
  const parsed = typeof timestampUtc === 'string' ? new Date(timestampUtc) : null;
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  return date.toISOString().slice(0, 10);
}
