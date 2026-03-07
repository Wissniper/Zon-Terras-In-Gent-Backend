import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';

const router = Router();

// Test MongoDB Route
router.get('/test-db', async (req: Request, res: Response) => {
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

export default router;
