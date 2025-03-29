import { UpdateUserProfileResponse } from '../models/user';
import prisma from '../config/prisma';
import emailService from '../services/emailService';
import { NotificationType } from '@prisma/client';
import { UpdateUserProfileDto } from '../models/user';

class UserService {
  async updateUserProfile(userId: string, data: UpdateUserProfileDto): Promise<UpdateUserProfileResponse>{
    // Get the current user data
    const currentUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!currentUser) {
      const error: any = new Error('User not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Check if email is being changed
    const isEmailChanged = data.email && data.email !== currentUser.email;

    // Prepare the update data
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.monthlyIncome !== undefined) updateData.monthlyIncome = data.monthlyIncome;

    // Send verification email if new email is provided
    if (data.email && isEmailChanged) {
      await this.sendEmailVerification(userId, data.email, updateData.name);
    }

    // Update the user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Return the updated user (excluding sensitive information)
    return {
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        monthlyIncome: updatedUser.monthlyIncome,
        emailVerified: updatedUser.emailVerified
      }
    };
  }

  private async sendEmailVerification(
      userId: string,
      email: string,
      userName: string
  ) {
    const verificationToken = Math.random().toString(36).substring(2, 15);
    const emailVerification = await prisma.emailVerification.upsert({
      where: { userId },
      create: {
        token: verificationToken,
        newEmail: email,
        userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      },
      update: {
        token: verificationToken,
        newEmail: email,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      }
    });

    const verificationMessage = `Please verify your new email address by clicking on this link: 
    ${process.env.APP_URL || 'http://localhost:3000'}/users/verify-change-email?token=${verificationToken}`;

    await emailService.sendEmail(
        email,
        userName,
        NotificationType.SYSTEM_ALERT,
        verificationMessage
    );
  }

  async verifyEmailChange(token: string) {
    const emailVerification = await prisma.emailVerification.findFirst({
      where: { token },
      include: { user: true }
    });

    if (!emailVerification || new Date() >= emailVerification.expiresAt ) {
      const error: any = new Error('Invalid or expired token');
      error.code = 'INVALID_TOKEN';
      throw error;
    }

    const result = await prisma.user.update({
      where: {
        id: emailVerification.user.id
      },
      data: {
        email: emailVerification.newEmail
      }
    });
    await prisma.emailVerification.delete({
      where: {
        id: emailVerification.id
      }
    });

    return result;
  }
}

export default new UserService();