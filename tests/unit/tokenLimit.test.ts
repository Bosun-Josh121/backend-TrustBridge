import {
  countActiveRefreshTokens,
  enforceTokenLimit,
  createRefreshToken,
  MAX_ACTIVE_TOKENS_PER_USER,
} from "../../src/models/refreshToken";
import prisma from "../../src/config/prisma";

// Mock tokens for testing
interface PrismaRefreshToken {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  isRevoked: boolean;
  family: string | null;
  replacedByToken: string | null;
  device: string | null;
  deviceId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
}

// Mock Prisma
jest.mock("../../src/config/prisma", () => ({
  refreshToken: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

describe("Token Limit Functions", () => {
  const userId = "test-user-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("countActiveRefreshTokens", () => {
    it("should count active tokens correctly", async () => {
      // Mock the Prisma count response
      (prisma.refreshToken.count as jest.Mock).mockResolvedValue(3);

      const count = await countActiveRefreshTokens(userId);

      expect(count).toBe(3);
      expect(prisma.refreshToken.count).toHaveBeenCalledWith({
        where: {
          userId,
          isRevoked: false,
          expiresAt: {
            gt: expect.any(Date),
          },
        },
      });
    });
  });

  describe("enforceTokenLimit", () => {
    it("should not revoke any tokens if under the limit", async () => {
      // Mock count to return under the limit
      (prisma.refreshToken.count as jest.Mock).mockResolvedValue(
        MAX_ACTIVE_TOKENS_PER_USER - 1
      );

      const tokensRevoked = await enforceTokenLimit(userId);

      expect(tokensRevoked).toBe(0);
      expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it("should revoke oldest tokens if over the limit", async () => {
      // Mock count to return over the limit
      (prisma.refreshToken.count as jest.Mock).mockResolvedValue(
        MAX_ACTIVE_TOKENS_PER_USER + 2
      );

      // Mock findMany to return tokens to revoke
      const tokensToRevoke: PrismaRefreshToken[] = [
        {
          id: "token1",
          token: "t1",
          userId: "user1",
          expiresAt: new Date(2023, 1, 1),
          createdAt: new Date(2023, 1, 1),
          isRevoked: false,
          family: "family1",
          replacedByToken: null,
          device: null,
          deviceId: null,
          userAgent: null,
          ipAddress: null,
        },
        {
          id: "token2",
          token: "t2",
          userId: "user1",
          expiresAt: new Date(2023, 1, 2),
          createdAt: new Date(2023, 1, 2),
          isRevoked: false,
          family: "family1",
          replacedByToken: null,
          device: null,
          deviceId: null,
          userAgent: null,
          ipAddress: null,
        },
      ];
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue(
        tokensToRevoke
      );

      // Mock updateMany to return success
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      const tokensRevoked = await enforceTokenLimit(userId);

      expect(tokensRevoked).toBe(2);
      expect(prisma.refreshToken.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          isRevoked: false,
          expiresAt: {
            gt: expect.any(Date),
          },
        },
        orderBy: {
          createdAt: "asc", // Oldest first
        },
        take: 2, // Should take the number of tokens over the limit
      });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ["token1", "token2"],
          },
        },
        data: {
          isRevoked: true,
        },
      });
    });
  });

  describe("createRefreshToken", () => {
    it("should create a token and enforce limits for new logins", async () => {
      // Mock the token creation
      const mockToken: PrismaRefreshToken = {
        id: "new-token-id",
        token: "test-token",
        userId,
        expiresAt: new Date(),
        createdAt: new Date(),
        isRevoked: false,
        family: "family1",
        replacedByToken: null,
        device: null,
        deviceId: null,
        userAgent: null,
        ipAddress: null,
      };
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue(mockToken);

      // Mock the count to trigger enforceTokenLimit
      (prisma.refreshToken.count as jest.Mock).mockResolvedValue(
        MAX_ACTIVE_TOKENS_PER_USER + 1
      );

      // Mock findMany for enforceTokenLimit
      (prisma.refreshToken.findMany as jest.Mock).mockResolvedValue([
        {
          id: "old-token",
          token: "old-t",
          userId: "user1",
          expiresAt: new Date(),
          createdAt: new Date(),
          isRevoked: false,
          family: "family1",
          replacedByToken: null,
          device: null,
          deviceId: null,
          userAgent: null,
          ipAddress: null,
        },
      ]);

      // Mock updateMany for enforceTokenLimit
      (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      const user = { walletAddress: userId };
      const deviceInfo = {
        deviceId: "test-device",
        device: "Desktop",
        userAgent: "test-user-agent",
        ipAddress: "127.0.0.1",
      };

      const result = await createRefreshToken(
        user as any,
        "test-token",
        deviceInfo
      );

      expect(result).toEqual(mockToken);

      // Should have created the token
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          token: "test-token",
          userId,
          isRevoked: false,
        }),
      });

      // Should have checked the token count
      expect(prisma.refreshToken.count).toHaveBeenCalled();

      // Should have revoked old tokens
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });
  });
});
