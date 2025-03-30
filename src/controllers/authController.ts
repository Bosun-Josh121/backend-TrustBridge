import { Request, Response } from 'express';
import prisma from '../../src/config/prisma';
import bcrypt from "bcryptjs";
import emailService from "../services/emailService";

// Create an endpoint to send a verification email
const sendVerificationEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ message: 'Email is required' });
      return;
    }

    // Find the user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Check if user is already verified
    if (user.isEmailVerified) {
      res.status(400).json({ message: 'Email is already verified' });
      return;
    }

    // Delete any existing verification tokens
    await prisma.refreshToken.deleteMany({
      where: {
        userId: user.id,
        type: 'REFRESH',
      },
    });

    // Generate a new verification token
    const token = await generateVerificationToken(user.id);

    // Send verification email
    await sendVerificationEmail(email, token);

   res.status(200).json({ message: 'Verification email sent successfully' });
   return ;
  } catch (error) {
    const err = error as Error; // Type assertion
    console.error('Error sending verification email:', err);
    res.status(500).json({ message: 'Internal server error' });
    return ;
  }
};

// Create an endpoint to verify the email
const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ message: 'Token is required' });
      return;
    }

    // Verify the token
    const userId = await verifyToken(token);

    // Update user's email verification status
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isEmailVerified: true },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return ;
    }

    // Delete the used token
    await prisma.refreshToken.deleteMany({
      where: {
        userId,
        token,
        type: 'REFRESH',
      },
    });


    res.status(200).json({ message: 'Email verified successfully' });
    return ;
  } catch (error) {
    const err = error as Error; // Type assertion
    console.error('Error verifying email:', err);

    if (err.message === 'Invalid or expired token' || err.message === 'Token has expired') {

      res.status(400).json({ message: err.message });
      return;
    }
    res.status(500).json({ message: 'Internal server error' });
    return;
  }
};

// User registration
const register = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {

      res.status(400).json({ message: 'User already exists' });
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        isEmailVerified: false,
        name: '',
        nonce: '',
        walletAddress: ''
      },
    });

    // Generate and send verification email
    const token = await generateVerificationToken(user.id);
    await sendVerificationEmail(email, token);

    res.status(201).json({
      message: 'User registered successfully. Please check your email to verify your account.',
      userId: user.id,
    });
    return ;
  } catch (error) {
    const err = error as Error; // Type assertion
    console.error('Error registering user:', err);
    res.status(500).json({ message: 'Internal server error' });
    return;
  }


  
};


// Export the functions
export { register, sendVerificationEmail, verifyEmail };
      


