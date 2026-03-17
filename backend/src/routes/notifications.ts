import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ message: 'Get notifications endpoint - to be implemented' });
});

router.put('/:id/read', (req, res) => {
  res.json({ message: 'Mark notification as read endpoint - to be implemented' });
});

router.delete('/:id', (req, res) => {
  res.json({ message: 'Delete notification endpoint - to be implemented' });
});

export default router;
