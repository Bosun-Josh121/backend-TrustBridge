import {
  generateTokenFamily,
  createRefreshToken,
  detectTokenReuse,
  findRefreshToken,
  handleTokenReuse,
} from "../../src/models/refreshToken";
import prisma from "../../src/config/prisma";
import * as tokenLimit from "../../src/models/tokenLimit";

// Mock Prisma
jest.mock("../../src/config/prisma", () => ({
  refreshToken: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
}));

// Mock tokenLimit module
jest.mock("../../src/models/tokenLimit", () => ({
  enforceTokenLimit: jest.fn().mockResolvedValue(0),
  countActiveRefreshTokens: jest.fn().mockResolvedValue(0),
  MAX_ACTIVE_TOKENS_PER_USER: 5,
}));

describe("RefreshToken Functions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("generateTokenFamily", () => {
    it("should generate a unique token family ID", () => {
      const family1 = generateTokenFamily();
      const family2 = generateTokenFamily();

      expect(family1).toEqual(expect.any(String));
      expect(family1.length).toBeGreaterThan(10);
      expect(family1).not.toEqual(family2);
    });
  });

  describe("createRefreshToken", () => {
    it("should create a new refresh token", async () => {
      const mockToken = {
        id: "token-id",
        token: "test-token",
        userId: "user123",
        expiresAt: expect.any(Date),
        createdAt: new Date(),
        isRevoked: false,
        family: "test-family",
      };
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue(mockToken);

      const user = { walletAddress: "user123" };
      const deviceInfo = {
        device: "Desktop",
        deviceId: "device123",
        userAgent: "test-agent",
        ipAddress: "127.0.0.1",
      };

      const result = await createRefreshToken(
        user as any,
        "test-token",
        deviceInfo
      );

      expect(result).toEqual(mockToken);
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          token: "test-token",
          userId: "user123",
          isRevoked: false,
        }),
      });
      expect(tokenLimit.enforceTokenLimit).toHaveBeenCalledWith("user123");
    });

    it("should update previous token when provided", async () => {
      const mockToken = {
        id: "token-id",
        token: "new-token",
        userId: "user123",
        expiresAt: expect.any(Date),
        createdAt: new Date(),
        isRevoked: false,
        family: "existing-family",
      };
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue(mockToken);

      const user = { walletAddress: "user123" };

      await createRefreshToken(
        user as any,
        "new-token",
        {
          device: "Desktop",
          deviceId: "device123",
          userAgent: "test-agent",
          ipAddress: "127.0.0.1",
        },
        "existing-family",
        "old-token"
      );

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { token: "old-token" },
        data: { replacedByToken: "new-token" },
      });
      expect(tokenLimit.enforceTokenLimit).not.toHaveBeenCalled();
    });
  });

  describe("detectTokenReuse", () => {
    it("should return false if token not found", async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);

      const isReused = await detectTokenReuse("non-existent-token");

      expect(isReused).toBe(false);
    });

    it("should return false if token is revoked", async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue({
        isRevoked: true,
        replacedByToken: "new-token",
      });

      const isReused = await detectTokenReuse("revoked-token");

      expect(isReused).toBe(false);
    });

    it("should return true if token has been replaced", async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue({
        isRevoked: false,
        replacedByToken: "new-token",
      });

      const isReused = await detectTokenReuse("replaced-token");

      expect(isReused).toBe(true);
    });

    it("should return false if token is still valid", async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue({
        isRevoked: false,
        replacedByToken: null,
      });

      const isReused = await detectTokenReuse("valid-token");

      expect(isReused).toBe(false);
    });
  });

  describe("handleTokenReuse", () => {
    it("should do nothing if token not found", async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);

      await handleTokenReuse("non-existent-token");

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it("should revoke all tokens in the same family", async () => {
      (prisma.refreshToken.findFirst as jest.Mock).mockResolvedValue({
        family: "compromised-family",
      });

      await handleTokenReuse("reused-token");

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { family: "compromised-family" },
        data: { isRevoked: true },
      });
    });
  });
});
