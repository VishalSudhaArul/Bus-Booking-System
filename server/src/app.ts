import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { pingDatabase, supportsTransactions } from './config/db';
import { env } from './config/env';
import { openApiDocument } from './config/openapi';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter, mongoSanitize, requestLogger } from './middleware/security';
import { auditRouter } from './modules/audit/audit.routes';
import { authRouter } from './modules/auth/auth.routes';
import { bookingRouter } from './modules/bookings/booking.routes';
import { busRouter } from './modules/buses/bus.routes';
import { cancellationRouter } from './modules/cancellations/cancellation.routes';
import { operatorRouter } from './modules/operators/operator.routes';
import { reportRouter } from './modules/reports/report.routes';
import { routeRouter } from './modules/routes/route.routes';
import { stopRouter } from './modules/stops/stop.routes';
import { tripRouter } from './modules/trips/trip.routes';
import { userRouter } from './modules/users/user.routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Render/Vercel terminate TLS in front of the app; trust one proxy hop for req.ip.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients (curl, server-to-server, tests) send no Origin.
        if (!origin || env.corsOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
      exposedHeaders: ['Idempotent-Replayed', 'X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(mongoSanitize);
  app.use(requestLogger);

  // Liveness + real database check (a ping round-trip, not just the connection flag).
  // Deliberately reports no host, database name or driver error text.
  app.get('/health', async (_req, res) => {
    const db = await pingDatabase();
    res.setHeader('Cache-Control', 'no-store');
    res.status(db.ok ? 200 : 503).json({
      success: db.ok,
      data: {
        status: db.ok ? 'ok' : 'database-unavailable',
        database: db.ok ? 'reachable' : 'unreachable',
        databaseLatencyMs: db.latencyMs,
        transactions: supportsTransactions(),
        uptime: Math.round(process.uptime()),
      },
    });
  });

  app.get('/api/v1/openapi.json', (_req, res) => res.json(openApiDocument));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'BusNest API' }));

  const api = express.Router();
  api.use(apiLimiter);
  api.use('/auth', authRouter);
  api.use('/users', userRouter);
  api.use('/operators', operatorRouter);
  api.use('/buses', busRouter);
  api.use('/routes', routeRouter);
  api.use('/stops', stopRouter);
  api.use('/trips', tripRouter);
  api.use('/bookings', bookingRouter);
  api.use('/cancellations', cancellationRouter);
  api.use('/reports', reportRouter);
  api.use('/audit', auditRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
