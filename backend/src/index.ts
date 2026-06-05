import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { logger } from './lib/logger';
import { sessionMiddleware } from './middleware/auth/session';
import authRouter from './routes/auth';
import transactionsRouter from './routes/transactions';
import forecastsRouter from './routes/forecasts';
import ordersRouter from './routes/orders';
import inventoryRouter from './routes/inventory';
import eventsRouter from './routes/events';
import eventsStreamRouter from './routes/events.stream';
import { rulesRouter as pricingRulesRouter, eventsRouter as pricingEventsRouter } from './routes/pricing';
import { startPricingTrigger } from './jobs/pricing-trigger';
import reportsRouter from './routes/reports';
import { startKpiAggregate } from './jobs/kpi-aggregate';
import { visionRouter, analyticsRouter } from './routes/vision';
import productsRouter from './routes/products';
import mappingsRouter from './routes/mappings';
import consentRouter from './routes/consent';
import docsRouter from './routes/docs';
import metricsRouter from './routes/metrics';
import insightsRouter from './routes/insights';
import dashboardRouter from './routes/dashboard';
import anomaliesRouter from './routes/anomalies';
import assistantRouter from './routes/assistant';
import analyticsExtRouter from './routes/analytics';
import devicesRouter from './routes/devices';
import schedulesRouter from './routes/schedules';
import { problemMiddleware } from './middleware/problem';
import { startAutoOrderScheduler } from './jobs/auto-order';
import { startSignalPoll } from './jobs/signal-poll';
import { startSignalDetect } from './jobs/signal-detect';
import { startActionVerify } from './jobs/action-verify';
import { startAnomalySim } from './jobs/anomaly-sim';
import { startDeviceMonitor } from './jobs/device-monitor';
import { startLocalBufferWorker, isOnline, bufferedCount } from './services/local-buffer';

export function createApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: '5mb' }));
  app.use(express.text({ type: 'text/csv', limit: '5mb' }));
  app.use(cookieParser());
  app.use(
    cors({
      origin:
        config.env === 'production'
          ? [`https://${config.publicDomain}`, `http://${config.publicDomain}`]
          : [
              'http://localhost:9512',
              'http://127.0.0.1:9512',
              `https://${config.publicDomain}`,
              `http://${config.publicDomain}`,
            ],
      credentials: true,
    }),
  );
  app.use(sessionMiddleware);

  app.get('/api/healthz', (_req, res) => {
    res.json({
      status: 'ok',
      env: config.env,
      ts: new Date().toISOString(),
      online: isOnline(),
      buffered: bufferedCount(),
    });
  });

  app.get('/api/readyz', (_req, res) => {
    res.json({ status: 'ready', online: isOnline() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/stores/:storeId/transactions', transactionsRouter);
  app.use('/api/stores/:storeId/forecasts', forecastsRouter);
  app.use('/api/stores/:storeId/orders', ordersRouter);
  app.use('/api/stores/:storeId/inventory', inventoryRouter);
  app.use('/api/stores/:storeId/events', eventsRouter);
  app.use('/api/stores/:storeId/events', eventsStreamRouter);
  app.use('/api/pricing', pricingRulesRouter);
  app.use('/api/stores/:storeId/pricing-events', pricingEventsRouter);
  app.use('/api/stores/:storeId/reports', reportsRouter);
  app.use('/api/stores/:storeId/vision', visionRouter);
  app.use('/api/stores/:storeId/analytics', analyticsRouter);
  app.use('/api/stores/:storeId/analytics', analyticsExtRouter);
  app.use('/api/stores/:storeId/products', productsRouter);
  app.use('/api/stores/:storeId/product-mappings', mappingsRouter);
  app.use('/api/stores/:storeId/insights', insightsRouter);
  app.use('/api/stores/:storeId/dashboard', dashboardRouter);
  app.use('/api/stores/:storeId/anomalies', anomaliesRouter);
  app.use('/api/stores/:storeId/assistant', assistantRouter);
  app.use('/api/stores/:storeId/devices', devicesRouter);
  app.use('/api/stores/:storeId/schedules', schedulesRouter);
  app.use('/api/pii', consentRouter);

  app.use('/api', metricsRouter);

  if (config.env !== 'production') {
    app.use('/api', docsRouter);
  }

  app.use(problemMiddleware);

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'backend listening');
    if (config.env !== 'test') {
      startSignalPoll();
      startAutoOrderScheduler();
      startLocalBufferWorker();
      startPricingTrigger();
      startKpiAggregate();
      startSignalDetect();
      startActionVerify();
      startAnomalySim();
      startDeviceMonitor();
    }
  });
}
