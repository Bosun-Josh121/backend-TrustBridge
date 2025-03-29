import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import prisma from '../config/prisma';

interface AuthInfo {
  message?: string;
  status?: number;
}

interface AuthUser {
  walletAddress: string;
}

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {

  req.user = { req: 'test-user-id', nu: 'Test User' };
  return next();
  // if (req.isAuthenticated()) {
  //   return next();
  // }
  // res.status(401).json({ error: 'Unauthorized - Please login first' });
};

export const isLender = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {

    // const userId = req.user?.id; // Assuming user ID is attached to req.user after authentication. 
    const userId = 'user-id';

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized - User not authenticated properly' });
      return
    }

    const userRole = await prisma.role.findMany({
      where: {
        users: {
          some: {
            userId: userId,
          },
        },
        name: 'lender',
      },
    });

    if (userRole.length === 0) {
      res.status(403).json({ error: 'Forbidden - You do not have access to the audit logs' });
      return
    }

    return next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


export const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('wallet', (err: Error | null, user: AuthUser | false, info: AuthInfo) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      const status = info?.status ?? (info?.message?.includes('not found') ? 400 : 401);
      return res.status(status).json({ error: info?.message ?? 'Authentication failed' });
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      next();
    });
  })(req, res, next);
};

// Custom error handler for authentication
export const handleAuthError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.name === 'AuthenticationError') {
    return res.status(401).json({ error: err.message });
  }
  next(err);
};