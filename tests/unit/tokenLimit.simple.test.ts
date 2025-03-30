import {
  countActiveRefreshTokens,
  enforceTokenLimit,
  MAX_ACTIVE_TOKENS_PER_USER,
} from "../../src/models/tokenLimit";
import prisma from "../../src/config/prisma";

// Mock Prisma
jest.mock("../../src/config/prisma", () => ({
  refreshToken: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
}));

describe("Token Limit", () => {
  const userId = "test-user-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("countActiveRefreshTokens", () => {
    it("should count active tokens correctly", async () => {
      // Mock Prisma response
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
      const tokensToRevoke = [
        { id: "token1", createdAt: new Date(2023, 1, 1) },
        { id: "token2", createdAt: new Date(2023, 1, 2) },
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
});
