import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dbTestRoutes from './routes/dbTests.js';

dotenv.config();

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zon-terras-db';
mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB connected to:', mongoURI))
  .catch(err => console.error('MongoDB error:', err));

// Basic Routes
app.get('/', (req: Request, res: Response) => {
  res.render('index', { title: 'Zon-Terras-In-Gent API' });
});

// Example API endpoint
app.get('/api', (req: Request, res: Response) => {
  res.json({ 
    message: 'API is operational', 
    version: '1.0.0',
    links: [
      { rel: 'self', href: '/api' }
    ]
  });
});

// Database test routes
app.use(dbTestRoutes);

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
