import { Request, Response, NextFunction } from 'express';
import expressAsyncHandler from 'express-async-handler';
import { PrismaClient } from '@prisma/client';
import OtpService from '../services/otpService';
import AuthService from '../services/authService';
import { verifySignature } from '../services/blockchainService';
import { generateNonce } from '../models/user';

const prisma = new PrismaClient();

export const initiateWallet2FA = expressAsyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { wallet_address, signed_message } = req.body;

  const user = await prisma.user.findUnique({ where: { walletAddress: wallet_address } });
  if (!user) throw new Error("User with this wallet address not found.");
  if (!user.email || !user.isEmailVerified) throw new Error("A verified email address is required for 2FA.");
  const isSignatureValid = await verifySignature(wallet_address, signed_message, user.nonce);
  if (!isSignatureValid) throw new Error("Invalid wallet signature or nonce mismatch.");

  const newNonce = await generateNonce();
  await prisma.user.update({
    where: { id: user.id },
    data: { nonce: newNonce },
  });

  await OtpService.createAndSendOtp(user);

  const OTP_EXPIRY_MINUTES = 5;
  res.status(200).json({ message: `OTP sent successfully to ${user.email}. It will expire in ${OTP_EXPIRY_MINUTES} minutes.` });
});


export const verifyWalletOTP = expressAsyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { wallet_address, otp_code } = req.body;

  const user = await prisma.user.findUnique({ where: { walletAddress: wallet_address } });
  if (!user) throw new Error("User with this wallet address not found.");
  await OtpService.verifyOtp(user.id, otp_code);

  const tokens = await AuthService.generateTokens(user.id);

  res.status(200).json(tokens);
});
