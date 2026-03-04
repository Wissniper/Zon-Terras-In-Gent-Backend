import express from 'express';
import { getAllTerrasen, getTerrasById } from '../controllers/terrasController';

const router = express.Router();

router.get('/terrasen', getAllTerrasen);
router.get('/terrasen/:id', getTerrasById);

export default router;