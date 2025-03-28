import express, { Router } from 'express';
import { isAuthenticated } from '../middleware/auth';
import * as userController from '../controllers/userController';

const router: Router = express.Router();

// PUT /users/profile - Update user profile
router.put('/profile', isAuthenticated, userController.updateProfile);
router.get('/verify-change-email', userController.verifyChangeEmail);

export default router;