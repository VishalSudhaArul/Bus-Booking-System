import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { query, searchQuery, sendOk } from '../../utils/http';
import { listAuditLogs } from './audit.service';

const listQuery = searchQuery.extend({ entityType: z.string().trim().max(40).optional() });

export const auditRouter = Router();

auditRouter.get('/', authenticate, authorize('ADMIN'), validate({ query: listQuery }), async (req, res) => {
  const { items, meta } = await listAuditLogs(query<z.infer<typeof listQuery>>(req));
  sendOk(res, items, meta);
});
