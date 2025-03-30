import prisma from "../config/prisma";

// Maximum number of active refresh tokens allowed per user
export const MAX_ACTIVE_TOKENS_PER_USER = 5;

/**
 * Get the count of active refresh tokens for a user
 * @param userId The user ID
 * @returns Number of active tokens
 */
export const countActiveRefreshTokens = async (
  userId: string
): Promise<number> => {
  return await prisma.refreshToken.count({
    where: {
      userId,
      isRevoked: false,
      expiresAt: {
        gt: new Date(), // not expired
      },
    },
  });
};

/**
 * Enforce the token limit for a user by revoking the oldest tokens if necessary
 * @param userId The user ID
 * @returns Number of tokens revoked
 */
export const enforceTokenLimit = async (userId: string): Promise<number> => {
  const activeTokenCount = await countActiveRefreshTokens(userId);

  if (activeTokenCount <= MAX_ACTIVE_TOKENS_PER_USER) {
    return 0; // No need to revoke any tokens
  }

  // Find the oldest tokens that exceed the limit
  const tokensToRevoke = await prisma.refreshToken.findMany({
    where: {
      userId,
      isRevoked: false,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: "asc", // Oldest first
    },
    take: activeTokenCount - MAX_ACTIVE_TOKENS_PER_USER,
  });

  if (tokensToRevoke.length === 0) {
    return 0;
  }

  const tokenIds = tokensToRevoke.map((token: any) => token.id);

  // Revoke the oldest tokens
  await prisma.refreshToken.updateMany({
    where: {
      id: {
        in: tokenIds,
      },
    },
    data: {
      isRevoked: true,
    },
  });

  return tokenIds.length;
};
