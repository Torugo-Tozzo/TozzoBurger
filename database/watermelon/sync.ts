import {
  synchronize as watermelonSynchronize,
  type SyncPullArgs,
  type SyncPullResult,
  type SyncPushArgs,
} from '@nozbe/watermelondb/sync';
import { Q } from '@nozbe/watermelondb';

import * as api from '@/services/api';
import { markChanged } from '../tableWatermark';
import { database } from './database';

const SYNC_TABLES = [
  'products',
  'product_types',
  'orders',
  'order_items',
  'sales',
  'sale_items',
  'print_logs',
] as const;

type SyncTableName = typeof SYNC_TABLES[number];
type SyncTableChanges = {
  created: Record<string, unknown>[];
  updated: Record<string, unknown>[];
  deleted: string[];
};
type SyncChangeSet = Record<SyncTableName, SyncTableChanges>;
type EstablishmentId = string | number | null | undefined;
type OnPulledChanges = (changes: SyncChangeSet) => void;

const MAX_SYNC_ATTEMPTS = 3;

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEstablishmentId(value: EstablishmentId): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRecord(
  value: unknown,
  tableName: SyncTableName,
  establishmentId: string | null,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`[sync] invalid ${tableName} record`);
  }

  const id = value.id;
  if (id === null || id === undefined || String(id).trim().length === 0) {
    throw new Error(`[sync] invalid ${tableName} record id`);
  }

  const { _status: ignoredStatus, _changed: ignoredChanged, ...record } = value;
  void ignoredStatus;
  void ignoredChanged;

  if (
    establishmentId !== null
    && Object.prototype.hasOwnProperty.call(record, 'establishment_id')
    && normalizeEstablishmentId(record.establishment_id) !== establishmentId
  ) {
    throw new Error(`[sync] ${tableName} record belongs to another establishment`);
  }

  return { ...record, id: String(id) };
}

function normalizeDeletedIds(value: unknown, tableName: SyncTableName): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`[sync] invalid ${tableName}.deleted`);
  }

  return value.map((id) => {
    if (id === null || id === undefined || String(id).trim().length === 0) {
      throw new Error(`[sync] invalid ${tableName} deleted id`);
    }
    return String(id);
  });
}

function normalizeTableChanges(
  value: unknown,
  tableName: SyncTableName,
  establishmentId: string | null,
): SyncTableChanges {
  if (!isRecord(value)) {
    throw new Error(`[sync] invalid ${tableName} changes`);
  }

  const created = value.created === undefined ? [] : value.created;
  const updated = value.updated === undefined ? [] : value.updated;

  if (!Array.isArray(created) || !Array.isArray(updated)) {
    throw new Error(`[sync] invalid ${tableName} changes`);
  }

  return {
    created: created.map((record) => normalizeRecord(record, tableName, establishmentId)),
    updated: updated.map((record) => normalizeRecord(record, tableName, establishmentId)),
    deleted: normalizeDeletedIds(value.deleted ?? [], tableName),
  };
}

function normalizeChangeSet(value: unknown, establishmentId: EstablishmentId): SyncChangeSet {
  if (!isRecord(value)) {
    throw new Error('[sync] invalid changes envelope');
  }

  const normalizedEstablishmentId = normalizeEstablishmentId(establishmentId);
  return Object.fromEntries(
    SYNC_TABLES.map((tableName) => [
      tableName,
      normalizeTableChanges(value[tableName] ?? {}, tableName, normalizedEstablishmentId),
    ]),
  ) as SyncChangeSet;
}

function normalizeTimestamp(value: unknown): number {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error('[sync] pull response has an invalid timestamp');
  }
  return timestamp;
}

function rawRecords(changes: SyncChangeSet, tableName: SyncTableName): Record<string, unknown>[] {
  return [...changes[tableName].created, ...changes[tableName].updated];
}

async function recordsByIds(tableName: SyncTableName, ids: string[]): Promise<any[]> {
  if (ids.length === 0) return [];
  return await database
    .get(tableName as any)
    .query(Q.where('id', Q.oneOf(ids)))
    .fetch() as any[];
}

function modelEstablishmentId(record: any): string | null {
  return normalizeEstablishmentId(
    record?.establishmentId ?? record?.establishment_id ?? record?._raw?.establishment_id,
  );
}

function ensureRecordBelongsToEstablishment(
  tableName: SyncTableName,
  record: any,
  establishmentId: string,
): void {
  if (modelEstablishmentId(record) !== establishmentId) {
    throw new Error(`[sync] ${tableName} record belongs to another establishment`);
  }
}

async function ensureDeletedRootsBelongToEstablishment(
  tableName: 'products' | 'orders' | 'sales',
  ids: string[],
  establishmentId: string,
): Promise<void> {
  const records = await recordsByIds(tableName, ids);
  for (const record of records) {
    ensureRecordBelongsToEstablishment(tableName, record, establishmentId);
  }
}

async function ensureRootChangesBelongToEstablishment(
  changes: SyncChangeSet,
  tableName: 'products' | 'orders' | 'sales',
  establishmentId: string,
): Promise<void> {
  const records = rawRecords(changes, tableName);
  if (records.length === 0) return;

  const localRecords = await recordsByIds(
    tableName,
    records.map((record) => String(record.id)),
  );
  const localRecordsById = new Map(localRecords.map((record) => [String(record.id), record]));

  // Check the local row even when the incoming payload has a scope. An ID
  // collision must not let a remote row replace another tenant's local row.
  for (const record of localRecords) {
    ensureRecordBelongsToEstablishment(tableName, record, establishmentId);
  }

  for (const record of records) {
    if (!Object.prototype.hasOwnProperty.call(record, 'establishment_id')
      && !localRecordsById.has(String(record.id))) {
      throw new Error(`[sync] ${tableName} record has no establishment_id`);
    }
  }
}

async function ensureChildReferencesBelongToEstablishment(
  changes: SyncChangeSet,
  childTable: 'order_items' | 'sale_items',
  childReferenceColumn: 'order_id' | 'sale_id',
  childReferenceProperty: 'orderId' | 'saleId',
  parentTable: 'orders' | 'sales',
  establishmentId: string,
): Promise<void> {
  const childChanges = changes[childTable];
  const referenceIds = new Set<string>();

  for (const record of rawRecords(changes, childTable)) {
    const referenceId = record[childReferenceColumn];
    if (referenceId !== null && referenceId !== undefined && String(referenceId).trim().length > 0) {
      referenceIds.add(String(referenceId));
    }
  }

  const deletedChildren = await recordsByIds(childTable, childChanges.deleted);
  for (const record of deletedChildren) {
    const referenceId = record?.[childReferenceProperty];
    if (referenceId !== null && referenceId !== undefined && String(referenceId).trim().length > 0) {
      referenceIds.add(String(referenceId));
    }
  }

  if (referenceIds.size === 0) return;

  const incomingParentIds = new Set(rawRecords(changes, parentTable).map((record) => String(record.id)));
  const localParentIds = [...referenceIds].filter((id) => !incomingParentIds.has(id));
  const localParents = await recordsByIds(parentTable, localParentIds);
  const foundLocalParentIds = new Set(localParents.map((record) => String(record.id)));

  for (const record of localParents) {
    ensureRecordBelongsToEstablishment(parentTable, record, establishmentId);
  }

  for (const id of localParentIds) {
    if (!foundLocalParentIds.has(id)) {
      throw new Error(`[sync] ${childTable} record references an unknown ${parentTable} record`);
    }
  }
}

async function ensureProductReferencesBelongToEstablishment(
  changes: SyncChangeSet,
  childTable: 'order_items' | 'sale_items',
  establishmentId: string,
): Promise<void> {
  const referenceIds = new Set<string>();
  for (const record of rawRecords(changes, childTable)) {
    const referenceId = record.product_id;
    if (referenceId !== null && referenceId !== undefined && String(referenceId).trim().length > 0) {
      referenceIds.add(String(referenceId));
    }
  }

  const deletedChildren = await recordsByIds(childTable, changes[childTable].deleted);
  for (const record of deletedChildren) {
    const referenceId = record?.productId;
    if (referenceId !== null && referenceId !== undefined && String(referenceId).trim().length > 0) {
      referenceIds.add(String(referenceId));
    }
  }

  if (referenceIds.size === 0) return;

  const incomingProductIds = new Set(rawRecords(changes, 'products').map((record) => String(record.id)));
  const localProductIds = [...referenceIds].filter((id) => !incomingProductIds.has(id));
  const localProducts = await recordsByIds('products', localProductIds);
  const foundLocalProductIds = new Set(localProducts.map((record) => String(record.id)));

  for (const record of localProducts) {
    ensureRecordBelongsToEstablishment('products', record, establishmentId);
  }

  for (const id of localProductIds) {
    if (!foundLocalProductIds.has(id)) {
      throw new Error(`[sync] ${childTable} record references an unknown products record`);
    }
  }
}

async function ensureTenantScope(changes: SyncChangeSet, establishmentId: EstablishmentId): Promise<void> {
  const normalizedEstablishmentId = normalizeEstablishmentId(establishmentId);
  if (normalizedEstablishmentId === null) return;

  await ensureRootChangesBelongToEstablishment(
    changes,
    'products',
    normalizedEstablishmentId,
  );
  await ensureRootChangesBelongToEstablishment(
    changes,
    'orders',
    normalizedEstablishmentId,
  );
  await ensureRootChangesBelongToEstablishment(
    changes,
    'sales',
    normalizedEstablishmentId,
  );
  await ensureDeletedRootsBelongToEstablishment(
    'products',
    changes.products.deleted,
    normalizedEstablishmentId,
  );
  await ensureDeletedRootsBelongToEstablishment(
    'orders',
    changes.orders.deleted,
    normalizedEstablishmentId,
  );
  await ensureDeletedRootsBelongToEstablishment(
    'sales',
    changes.sales.deleted,
    normalizedEstablishmentId,
  );
  await ensureChildReferencesBelongToEstablishment(
    changes,
    'order_items',
    'order_id',
    'orderId',
    'orders',
    normalizedEstablishmentId,
  );
  await ensureChildReferencesBelongToEstablishment(
    changes,
    'sale_items',
    'sale_id',
    'saleId',
    'sales',
    normalizedEstablishmentId,
  );
  await ensureProductReferencesBelongToEstablishment(changes, 'order_items', normalizedEstablishmentId);
  await ensureProductReferencesBelongToEstablishment(changes, 'sale_items', normalizedEstablishmentId);
}

function hasTableChanges(changes: SyncTableChanges): boolean {
  return changes.created.length > 0 || changes.updated.length > 0 || changes.deleted.length > 0;
}

function markPulledTables(changes: SyncChangeSet): void {
  if (hasTableChanges(changes.products) || hasTableChanges(changes.product_types)) {
    markChanged('products');
  }
  if (hasTableChanges(changes.orders) || hasTableChanges(changes.order_items)) {
    markChanged('orders');
  }
  if (hasTableChanges(changes.sales) || hasTableChanges(changes.sale_items)) {
    markChanged('sales');
  }
}

function reportIgnoredPushItems(response: api.SyncPushResponse | undefined): void {
  const ignored = Array.isArray(response?.ignored) ? response.ignored : [];
  const ignoredOrderDeletes = Array.isArray(response?.ignored_order_deletes)
    ? response.ignored_order_deletes
    : [];

  if (ignored.length > 0 || ignoredOrderDeletes.length > 0) {
    console.warn('[sync] server ignored push items', {
      ignored,
      ignored_order_deletes: ignoredOrderDeletes,
    });
  }
}

function isSyncConflictError(error: unknown): boolean {
  if (!isRecord(error)) return false;

  if (error.status === 409) return true;
  if (error.code === 'SYNC_CONFLICT' || error.error === 'SYNC_CONFLICT') return true;

  const body = isRecord(error.body) ? error.body : null;
  return body?.code === 'SYNC_CONFLICT' || body?.error === 'SYNC_CONFLICT';
}

/**
 * Creates the callback consumed by WatermelonDB's native synchronize().
 * The API already returns Watermelon raw records, so this boundary only
 * normalizes the fixed table set and rejects records from another tenant.
 */
export function pullChanges(
  token: string,
  establishmentId?: EstablishmentId,
  onPulledChanges?: OnPulledChanges,
): (args: SyncPullArgs) => Promise<SyncPullResult> {
  return async ({ lastPulledAt, schemaVersion }: SyncPullArgs) => {
    const response = await api.pullChanges(token, { lastPulledAt, schemaVersion });
    const changes = normalizeChangeSet(response?.changes, establishmentId);
    const timestamp = normalizeTimestamp(response?.timestamp);
    await ensureTenantScope(changes, establishmentId);
    onPulledChanges?.(changes);
    return { changes, timestamp };
  };
}

/**
 * Creates the callback consumed by WatermelonDB's native synchronize().
 * A 409 is intentionally allowed to reject this promise; the caller retries
 * the complete native synchronization cycle when it is a sync conflict.
 */
export function pushChanges(
  token: string,
  establishmentId?: EstablishmentId,
): (args: SyncPushArgs) => Promise<void> {
  return async ({ changes, lastPulledAt }: SyncPushArgs) => {
    const normalizedChanges = normalizeChangeSet(changes, establishmentId);
    await ensureTenantScope(normalizedChanges, establishmentId);
    const response = await api.pushChanges(token, {
      changes: normalizedChanges,
      lastPulledAt,
    });
    reportIgnoredPushItems(response);
  };
}

/**
 * Runs one complete Watermelon pull/apply/push cycle. Callers must invoke
 * this function through database/syncGuard.runWithLock.
 */
export async function synchronizeWithServer(
  token: string,
  establishmentId?: EstablishmentId,
): Promise<void> {
  let attempt = 0;

  while (true) {
    attempt += 1;
    let pulledChanges: SyncChangeSet | null = null;

    try {
      await watermelonSynchronize({
        database,
        pullChanges: pullChanges(token, establishmentId, (changes) => {
          pulledChanges = changes;
        }),
        pushChanges: pushChanges(token, establishmentId),
        migrationsEnabledAtVersion: 1,
        onDidPullChanges: async () => {
          if (pulledChanges) markPulledTables(pulledChanges);
        },
      });
      return;
    } catch (error) {
      if (!isSyncConflictError(error) || attempt >= MAX_SYNC_ATTEMPTS) {
        throw error;
      }
    }
  }
}

export default synchronizeWithServer;
