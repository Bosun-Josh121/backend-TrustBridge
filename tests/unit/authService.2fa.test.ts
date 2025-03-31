import { Request, Response, NextFunction } from 'express';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient, User, OtpCode, NotificationType } from '@prisma/client';
import bcrypt from 'bcrypt';

import { initiateWallet2FA, verifyWalletOTP } from '../../src/controllers/walletAuthController';

import AuthService from '../../src/services/authService';
import emailService from '../../src/services/emailService';
import { verifySignature } from '../../src/services/blockchainService';
import { generateNonce } from '../../src/models/user';

const prismaMock = mockDeep<PrismaClient>();
jest.mock('../../src/config/prisma', () => ({ __esModule: true, default: prismaMock }));

jest.mock('bcrypt');
const bcryptCompareMock = bcrypt.compare as jest.Mock;
const bcryptHashMock = bcrypt.hash as jest.Mock;

jest.mock('../../src/services/emailService', () => ({
  __esModule: true,
  default: { sendEmail: jest.fn() },
}));
const emailServiceSendEmailMock = emailService.sendEmail as jest.Mock;

jest.mock('../../src/services/authService', () => ({
    __esModule: true,
    default: {
        generateTokens: jest.fn()
    }
}));
const generateTokensMock = AuthService.generateTokens as jest.Mock;

jest.mock('../../src/services/blockchainService');
const verifySignatureMock = verifySignature as jest.Mock;

jest.mock('../../src/models/user');
const generateNonceMock = generateNonce as jest.Mock;

const mockRequest = (body: any = {}, params: any = {}, query: any = {}): Request => ({
  body, params, query,
} as Request);

const mockResponse = (): Response => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res as Response);
  res.json = jest.fn().mockReturnValue(res as Response);
  return res as Response;
};

describe('Wallet 2FA End-to-End Flow Simulation', () => {

  const walletAddress = 'wallet-address-123';
  const userId = 'user-id-456';
  const email = 'walletuser@example.com';
  const currentNonce = 'current-nonce-abc';
  const signedMessage = 'message-signed-with-wallet';
  const plainOtp = '123456';
  const hashedOtp = 'hashed-otp-string';
  const newNonce = 'new-nonce-xyz';
  const mockTokens = { accessToken: 'access-jwt-token', refreshToken: 'refresh-jwt-token' };
  const mockUser: User = {
    id: userId, walletAddress, email, isEmailVerified: true, nonce: currentNonce, name: 'Wallet Test',
    password: '', createdAt: new Date(), updatedAt: new Date(), resetToken: null, lastLogin: null, monthlyIncome: null,
  };
  const mockOtpRecord: OtpCode = {
      id: 'otp-id-1', userId, code: hashedOtp, expiresAt: new Date(Date.now() + 4 * 60 * 1000), createdAt: new Date()
  };

  let req: Request;
  let res: Response;
  const next: NextFunction = jest.fn(); 

  beforeEach(() => {
    jest.clearAllMocks();

    prismaMock.user.findUnique.mockReset();
    prismaMock.user.update.mockReset();
    prismaMock.otpCode.deleteMany.mockReset();
    prismaMock.otpCode.create.mockReset();
    prismaMock.otpCode.findFirst.mockReset();
    prismaMock.otpCode.delete.mockReset();
  });

  // Test case for the complete successful flow
  it('should authenticate user successfully with valid signature and OTP', async () => {
    // --- Setup Mocks for INITIATE step ---
    prismaMock.user.findUnique.mockResolvedValue(mockUser); // User found
    verifySignatureMock.mockResolvedValue(true); // Signature valid
    generateNonceMock.mockResolvedValue(newNonce); // Nonce generated
    bcryptHashMock.mockResolvedValue(hashedOtp); // OTP hashed
    emailServiceSendEmailMock.mockResolvedValue(true); // Email sent successfully
    prismaMock.otpCode.create.mockResolvedValue(mockOtpRecord); // OTP stored successfully

    // --- Execute INITIATE step ---
    req = mockRequest({ wallet_address: walletAddress, signed_message: signedMessage });
    res = mockResponse();
    await initiateWallet2FA(req, res, next);

    // --- Assertions for INITIATE step ---
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { walletAddress } });
    expect(verifySignatureMock).toHaveBeenCalledWith(walletAddress, signedMessage, currentNonce);
    expect(generateNonceMock).toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: userId }, data: { nonce: newNonce } });
    expect(bcryptHashMock).toHaveBeenCalledWith(expect.any(String), 12); // Ensure hashing happened
    expect(prismaMock.otpCode.deleteMany).toHaveBeenCalledWith({ where: { userId: userId } }); // Old OTPs deleted
    expect(prismaMock.otpCode.create).toHaveBeenCalledWith({
        data: { userId: userId, code: hashedOtp, expiresAt: expect.any(Date) }
    });
    expect(emailServiceSendEmailMock).toHaveBeenCalledWith(email, mockUser.name, NotificationType.OTP_VERIFICATION, expect.any(String));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: expect.stringContaining('OTP sent successfully') });
    expect(next).not.toHaveBeenCalled(); // No error

    // --- Setup Mocks for VERIFY step ---
    prismaMock.user.findUnique.mockResolvedValue(mockUser); // User found again
    prismaMock.otpCode.findFirst.mockResolvedValue(mockOtpRecord); // Valid OTP record found
    bcryptCompareMock.mockResolvedValue(true); // OTP code matches hash
    prismaMock.otpCode.delete.mockResolvedValue({} as any); // OTP deletion successful
    generateTokensMock.mockResolvedValue(mockTokens); // Token generation successful

    // --- Execute VERIFY step ---
    req = mockRequest({ wallet_address: walletAddress, otp_code: plainOtp });
    res = mockResponse(); // Use a fresh response mock
    await verifyWalletOTP(req, res, next);

    // --- Assertions for VERIFY step ---
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { walletAddress } }); // Called again
    expect(prismaMock.otpCode.findFirst).toHaveBeenCalledWith({
      where: { userId: userId, expiresAt: { gte: expect.any(Date) } },
      orderBy: { createdAt: 'desc' },
    });
    expect(bcryptCompareMock).toHaveBeenCalledWith(plainOtp, hashedOtp);
    expect(prismaMock.otpCode.delete).toHaveBeenCalledWith({ where: { id: mockOtpRecord.id } });
    expect(generateTokensMock).toHaveBeenCalledWith(userId);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockTokens);
    expect(next).not.toHaveBeenCalled(); // No error
  });

  // Added code: Test case: Failure during INITIATE - Invalid Signature
  it('should fail initiation if signature is invalid', async () => {
    // --- Setup Mocks ---
    prismaMock.user.findUnique.mockResolvedValue(mockUser);
    verifySignatureMock.mockResolvedValue(false); // <<< Signature fails

    // --- Execute INITIATE step ---
    req = mockRequest({ wallet_address: walletAddress, signed_message: signedMessage });
    res = mockResponse();
    // Expect the handler to throw, caught by expressAsyncHandler and passed to next()
    await initiateWallet2FA(req, res, next);

    // --- Assertions ---
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    expect(verifySignatureMock).toHaveBeenCalledWith(walletAddress, signedMessage, currentNonce);
    expect(generateNonceMock).not.toHaveBeenCalled(); // Should not generate nonce
    expect(prismaMock.user.update).not.toHaveBeenCalled(); // Should not update nonce
    expect(prismaMock.otpCode.create).not.toHaveBeenCalled(); // Should not create OTP
    expect(emailServiceSendEmailMock).not.toHaveBeenCalled(); // Should not send email
    expect(res.status).not.toHaveBeenCalled(); // Should not send success response
    expect(next).toHaveBeenCalledWith(expect.any(Error)); // Should call error handler
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Invalid wallet signature') }));
  });

  // Added code: Test case: Failure during VERIFY - Invalid OTP code
  it('should fail verification if OTP code is invalid', async () => {
    // --- Setup Mocks (Assume INITIATE was successful) ---
    prismaMock.user.findUnique.mockResolvedValue(mockUser); // User found
    prismaMock.otpCode.findFirst.mockResolvedValue(mockOtpRecord); // OTP record exists
    bcryptCompareMock.mockResolvedValue(false); // <<< OTP hash does not match

    // --- Execute VERIFY step ---
    req = mockRequest({ wallet_address: walletAddress, otp_code: 'wrong-otp' });
    res = mockResponse();
    await verifyWalletOTP(req, res, next);

    // --- Assertions ---
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.otpCode.findFirst).toHaveBeenCalled();
    expect(bcryptCompareMock).toHaveBeenCalledWith('wrong-otp', hashedOtp);
    expect(prismaMock.otpCode.delete).not.toHaveBeenCalled(); // Should not delete OTP record
    expect(generateTokensMock).not.toHaveBeenCalled(); // Should not generate tokens
    expect(res.status).not.toHaveBeenCalled(); // Should not send success response
    expect(next).toHaveBeenCalledWith(expect.any(Error)); // Should call error handler
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid OTP code.' }));
  });

  // Added code: Test case: Failure during VERIFY - OTP expired/not found
  it('should fail verification if OTP code is expired or not found', async () => {
    // --- Setup Mocks (Assume INITIATE was successful) ---
    prismaMock.user.findUnique.mockResolvedValue(mockUser); // User found
    prismaMock.otpCode.findFirst.mockResolvedValue(null); // <<< No valid OTP record found

    // --- Execute VERIFY step ---
    req = mockRequest({ wallet_address: walletAddress, otp_code: plainOtp });
    res = mockResponse();
    await verifyWalletOTP(req, res, next);

    // --- Assertions ---
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.otpCode.findFirst).toHaveBeenCalled();
    expect(bcryptCompareMock).not.toHaveBeenCalled(); // Compare should not be reached
    expect(prismaMock.otpCode.delete).not.toHaveBeenCalled();
    expect(generateTokensMock).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'OTP expired or not found.' }));
  });

});