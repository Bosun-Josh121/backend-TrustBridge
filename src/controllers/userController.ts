import { Request, Response, NextFunction } from 'express';
import userService from '../services/userService';
import { z } from 'zod';

// Profile update input validation schema
const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  monthlyIncome: z.number().nonnegative().optional(),
});

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get the authenticated user's ID
    const userId = (req.user as any).id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated or ID not available' });
      return;
    }

    // Validate the request body
    const validationResult = updateProfileSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ 
        error: 'Invalid request data', 
        details: validationResult.error.issues 
      });
      return;
    }

    const { name, email, monthlyIncome } = validationResult.data;

    try {
      const result = await userService.updateUserProfile(userId, { 
        name, 
        email, 
        monthlyIncome 
      });
      
      res.json({
        message: 'Profile updated successfully',
        user: result.user
      });
    } catch (error: any) {
      if (error.code === 'NOT_FOUND') {
        res.status(404).json({ error: error.message });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    next(error);
  }
};

export const verifyChangeEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from query parameters instead of body
    const token = req.query.token as string;
    
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    await userService.verifyEmailChange(token);
    
    // Redirect to a success page or return a more user-friendly response
    // You can customize this based on your frontend implementation
    res.json({ message: 'Email updated successfully' });

  } catch (error: any) {
    console.error('Error verifying email change:', error);
    if (error.code === 'INVALID_TOKEN') {
      res.status(400).json({ error: error.message });
    } else {
      next(error);
    }
  }
};