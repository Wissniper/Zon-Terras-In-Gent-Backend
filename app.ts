import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Test MongoDB Route
app.get('/test-db', async (req: Request, res: Response) => {
  try {
    const TestSchema = new mongoose.Schema({ name: String });
    const TestModel = mongoose.models.Test || mongoose.model('Test', TestSchema);
    
    // Create a test record
    const testDoc = new TestModel({ name: 'Hello MongoDB!' });
    await testDoc.save();
    
    // Find it back
    const results = await TestModel.find();
    
    res.json({
      message: 'MongoDB Connection Success!',
      database: mongoose.connection.name,
      testData: results
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database test failed', details: err.message });
  }
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
