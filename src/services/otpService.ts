import { PrismaClient, User, NotificationType } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from 'crypto';
import emailService from "./emailService";

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;
const OTP_EXPIRY_MINUTES = 5;

class OtpService {

  // Helper to generate OTP and its hash
  private async generateAndHashOtp(): Promise<{ plainOtp: string; hashedOtp: string }> {
    const plainOtp = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = await bcrypt.hash(plainOtp, SALT_ROUNDS);
    return { plainOtp, hashedOtp };
  }

  // Method to create, store, and send OTP
  async createAndSendOtp(user: User): Promise<void> {
    if (!user.email) throw new Error("User email address is missing for OTP.");

    const { plainOtp, hashedOtp } = await this.generateAndHashOtp();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    // Delete previous OTPs for this user
    await prisma.otpCode.deleteMany({ where: { userId: user.id } });

    // Store the new hashed OTP
    await prisma.otpCode.create({
      data: { userId: user.id, code: hashedOtp, expiresAt },
    });

    // Send the plain OTP using EmailService
    try {
      await emailService.sendEmail(
        user.email,
        user.name,
        NotificationType.OTP_VERIFICATION,
        plainOtp
      );
    } catch (emailError: any) {
      console.error(`OtpService: Failed to send OTP email to ${user.email}:`, emailError);
      throw new Error("Failed to send OTP email.");
    }
  }

  // Method to verify the provided OTP
  async verifyOtp(userId: string, plainOtp: string): Promise<boolean> {
    const storedOtpRecord = await prisma.otpCode.findFirst({
      where: { userId, expiresAt: { gte: new Date() } }, // Find non-expired for user
      orderBy: { createdAt: 'desc' },
    });

    if (!storedOtpRecord) throw new Error("OTP expired or not found.");

    const isOtpValid = await bcrypt.compare(plainOtp, storedOtpRecord.code);

    if (!isOtpValid) {
      throw new Error("Invalid OTP code.");
    }

    await prisma.otpCode.delete({ where: { id: storedOtpRecord.id } });

    return true;
  }
}

export default new OtpService();