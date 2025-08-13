import express from 'express';
import { 
  getUsers, 
  getUser, 
  updateUser, 
  deleteUser 
} from '../controllers/userController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// Admin routes
router.get('/', protect, admin, getUsers);
router.get('/:id', protect, admin, getUser);
router.put('/:id', protect, admin, updateUser);
router.delete('/:id', protect, admin, deleteUser);

export default router;
