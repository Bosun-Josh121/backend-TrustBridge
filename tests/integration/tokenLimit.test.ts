import request from "supertest";
import { ethers } from "ethers";
import app from "../../src/app";
import { users } from "../../src/models/user";
import {
  REFRESH_TOKEN_COOKIE_NAME,
  ALLOWED_REFRESH_ORIGINS,
} from "../../src/utils/jwt";
import {
  findRefreshToken,
  countActiveRefreshTokens,
  MAX_ACTIVE_TOKENS_PER_USER,
} from "../../src/models/refreshToken";

// Mock user agent for testing
const MOCK_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
const MOCK_MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1";

// Test origins
const VALID_ORIGIN = ALLOWED_REFRESH_ORIGINS[0] || "http://localhost:3000";

describe("Token Limit Integration Tests", () => {
  const TEST_PRIVATE_KEY =
    "0123456789012345678901234567890123456789012345678901234567890123";
  const wallet = new ethers.Wallet(TEST_PRIVATE_KEY);

  beforeEach(() => {
    users.length = 0;
  });

  it(`should limit to ${MAX_ACTIVE_TOKENS_PER_USER} active refresh tokens per user`, async () => {
    // Create a user
    const nonceResponse = await request(app)
      .get(`/api/auth/nonce/${wallet.address}`)
      .expect(200);

    const nonce = nonceResponse.body.nonce;
    const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
    const signature = await wallet.signMessage(message);

    // Create tokens for different devices - one more than the limit
    const deviceIds: string[] = [];
    const cookies: string[] = [];

    for (let i = 1; i <= MAX_ACTIVE_TOKENS_PER_USER + 1; i++) {
      const deviceId = `device-${i}`;
      deviceIds.push(deviceId);

      // Get a fresh nonce for each login
      const nonceResp = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const loginNonce = nonceResp.body.nonce;
      const loginMessage = `Sign this message to authenticate with TrustBridge: ${loginNonce}`;
      const loginSignature = await wallet.signMessage(loginMessage);

      // Login with a device
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .set(
          "User-Agent",
          i % 2 === 0 ? MOCK_MOBILE_USER_AGENT : MOCK_USER_AGENT
        )
        .set("Origin", VALID_ORIGIN)
        .send({
          walletAddress: wallet.address,
          signature: loginSignature,
          deviceId,
        })
        .expect(200);

      cookies.push(loginResponse.header["set-cookie"][0]);

      // Small delay to ensure different creation timestamps
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Verify token count is capped at the limit
    const tokenCount = await countActiveRefreshTokens(wallet.address);
    expect(tokenCount).toBe(MAX_ACTIVE_TOKENS_PER_USER);

    // The oldest token should have been revoked
    // Try to use the first refresh token - it should fail
    await request(app)
      .post("/api/auth/refresh")
      .set("Content-Type", "application/json")
      .set("Origin", VALID_ORIGIN)
      .set("Cookie", cookies[0])
      .expect(401); // Should fail with unauthorized
  });
});
