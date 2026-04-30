import express from 'express';
import terrasRoutes from '../routes/terrasRoutes.js';
import restaurantRoutes from '../routes/restaurantRoutes.js';
import eventRoutes from '../routes/eventRoutes.js';
import searchRoutes from '../routes/searchRoutes.js';
import sunDataRoutes from '../routes/sunDataRoutes.js';
import weatherRoutes from '../routes/weatherRoutes.js';
import gent3dRoutes from '../routes/gent3dRoutes.js';

export function createTestApp() {
  const app = express();
  app.use(express.json());

  // Default to JSON responses in tests so res.format() picks application/json
  app.use((req, _res, next) => {
    if (!req.headers.accept || req.headers.accept === '*/*') {
      req.headers.accept = 'application/json';
    }
    next();
  });

  app.use('/api/terrasen', terrasRoutes);
  app.use('/api/restaurants', restaurantRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/sun', sunDataRoutes);
  app.use('/api/weather', weatherRoutes);
  app.use('/api/gent3d', gent3dRoutes);
  return app;
}
