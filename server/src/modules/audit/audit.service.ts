import { AuditLog } from './audit.model';
import type { Actor } from '../../types/domain';
import { logger } from '../../utils/logger';
import { containsRegex, pageMeta } from '../../utils/http';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Records who did what. Auditing must never break the business operation it
 * describes, so failures are logged and swallowed.
 */
export async function recordAudit(actor: Partial<Actor> | null, entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      actorId: actor?.id,
      actorRole: actor?.role,
      ip: actor?.ip,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ? String(entry.entityId) : undefined,
      metadata: entry.metadata,
    });
  } catch (err) {
    logger.error('Failed to write audit log', { action: entry.action, reason: (err as Error).message });
  }
}

export async function listAuditLogs(q: { page: number; limit: number; search?: string; entityType?: string }) {
  const filter: Record<string, unknown> = {};
  if (q.entityType) filter.entityType = q.entityType;
  if (q.search) filter.action = containsRegex(q.search);
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('actorId', 'name email role')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.limit, total) };
}
