import { auditQuery, AuditQueryOptions } from '../../audit/AuditLog';

export async function audit_query(params: AuditQueryOptions): Promise<object> {
  const entries = auditQuery(params);
  return { count: entries.length, entries };
}
