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
  detectTokenReuse,
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
const INVALID_ORIGIN = "http://malicious-site.com";

describe("Authentication Routes", () => {
  const TEST_PRIVATE_KEY =
    "0123456789012345678901234567890123456789012345678901234567890123";
  const wallet = new ethers.Wallet(TEST_PRIVATE_KEY);
  let sessionCookie: string;
  const testWalletAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    users.length = 0;
  });

  describe("GET /api/auth/nonce/:walletAddress", () => {
    it("should return different nonce for same wallet address", async () => {
      const response1 = await request(app)
        .get(`/api/auth/nonce/${testWalletAddress}`)
        .expect(200);

      await new Promise((resolve) => setTimeout(resolve, 2));

      const response2 = await request(app)
        .get(`/api/auth/nonce/${testWalletAddress}`)
        .expect(200);

      expect(response1.body.nonce).not.toBe(response2.body.nonce);
    });

    it("should create a new user if wallet address does not exist", async () => {
      const response = await request(app)
        .get(`/api/auth/nonce/${testWalletAddress}`)
        .expect(200);

      expect(response.body.nonce).toBeDefined();
      const user = users.find((u) => u.walletAddress === testWalletAddress);
      expect(user).toBeDefined();
      expect(user?.nonce).toBe(response.body.nonce);
    });
  });

  describe("POST /api/auth/login", () => {
    it("should return 400 if nonce is not found", async () => {
      await request(app)
        .post("/api/auth/login")
        .send({
          walletAddress: testWalletAddress,
          signature: "invalid-signature",
        })
        .expect(400);
    });

    it("should return 401 if signature is invalid", async () => {
      // First get a nonce
      await request(app)
        .get(`/api/auth/nonce/${testWalletAddress}`)
        .expect(200);

      await request(app)
        .post("/api/auth/login")
        .send({
          walletAddress: testWalletAddress,
          signature: "invalid-signature",
        })
        .expect(401);
    });

    it("should return access token, device ID, and set refresh token as HTTP-only cookie on successful login", async () => {
      // First get a nonce
      const nonceResponse = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResponse.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", MOCK_USER_AGENT)
        .set("Origin", VALID_ORIGIN)
        .send({
          walletAddress: wallet.address,
          signature,
        })
        .expect(200);

      // Check that access token is in response body
      expect(loginResponse.body.accessToken).toBeDefined();
      expect(typeof loginResponse.body.accessToken).toBe("string");

      // Check that device ID is returned
      expect(loginResponse.body.deviceId).toBeDefined();
      expect(typeof loginResponse.body.deviceId).toBe("string");

      // Check that refresh token is NOT in response body
      expect(loginResponse.body.refreshToken).toBeUndefined();

      // Check that refresh token is set as a cookie
      expect(loginResponse.header["set-cookie"]).toBeDefined();
      expect(loginResponse.header["set-cookie"][0]).toContain(
        REFRESH_TOKEN_COOKIE_NAME
      );
      expect(loginResponse.header["set-cookie"][0]).toContain("HttpOnly");
    });

    it("should track device information in the refresh token", async () => {
      // First get a nonce
      const nonceResponse = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResponse.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      // Login with a specific device
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", MOCK_MOBILE_USER_AGENT)
        .set("Origin", VALID_ORIGIN)
        .send({
          walletAddress: wallet.address,
          signature,
          deviceId: "test-mobile-device",
        })
        .expect(200);

      // Extract the refresh token from the cookie
      const cookies = loginResponse.header["set-cookie"];
      const refreshTokenCookie = cookies[0];
      const tokenMatch = refreshTokenCookie.match(
        new RegExp(`${REFRESH_TOKEN_COOKIE_NAME}=([^;]+)`)
      );
      const token = tokenMatch ? tokenMatch[1] : null;

      // Check that deviceId is correctly returned in response
      expect(loginResponse.body.deviceId).toBe("test-mobile-device");

      // Verify device info is saved with the token
      if (token) {
        const storedToken = await findRefreshToken(token);
        expect(storedToken).not.toBeNull();
        expect(storedToken?.device).toBe("Mobile"); // Should detect mobile device
        expect(storedToken?.deviceId).toBe("test-mobile-device");
        expect(storedToken?.userAgent).toBe(MOCK_MOBILE_USER_AGENT);
      }
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("should return 401 when no refresh token cookie is provided", async () => {
      await request(app)
        .post("/api/auth/refresh")
        .set("Content-Type", "application/json")
        .set("Origin", VALID_ORIGIN)
        .expect(401);
    });

    it("should issue new tokens when valid refresh token cookie is provided", async () => {
      // First login to get a valid refresh token cookie
      const nonceResponse = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResponse.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .set("Origin", VALID_ORIGIN)
        .send({
          walletAddress: wallet.address,
          signature,
        })
        .expect(200);

      const cookies = loginResponse.header["set-cookie"];

      // Now try to refresh the token
      const refreshResponse = await request(app)
        .post("/api/auth/refresh")
        .set("Content-Type", "application/json")
        .set("Origin", VALID_ORIGIN)
        .set("Cookie", cookies)
        .expect(200);

      // Check that a new access token is returned
      expect(refreshResponse.body.accessToken).toBeDefined();
      expect(typeof refreshResponse.body.accessToken).toBe("string");

      // Check that a new refresh token cookie is set
      expect(refreshResponse.header["set-cookie"]).toBeDefined();
      expect(refreshResponse.header["set-cookie"][0]).toContain(
        REFRESH_TOKEN_COOKIE_NAME
      );
      expect(refreshResponse.header["set-cookie"][0]).toContain("HttpOnly");
    });

    it("should reject refresh requests from invalid origins", async () => {
      // Skip this test if there are no allowed origins defined
      if (!ALLOWED_REFRESH_ORIGINS.length) {
        return;
      }

      // First login from allowed origin
      const nonceResponse = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResponse.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .set("Origin", VALID_ORIGIN)
        .send({
          walletAddress: wallet.address,
          signature,
        })
        .expect(200);

      const cookies = loginResponse.header["set-cookie"];

      // Try to refresh from an invalid origin
      await request(app)
        .post("/api/auth/refresh")
        .set("Content-Type", "application/json")
        .set("Origin", INVALID_ORIGIN)
        .set("Cookie", cookies)
        .expect(403); // Should be forbidden due to origin mismatch
    });

    it("should reject refresh requests with invalid content type", async () => {
      // First login to get a valid token
      const nonceResponse = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResponse.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .set("Origin", VALID_ORIGIN)
        .send({
          walletAddress: wallet.address,
          signature,
        })
        .expect(200);

      const cookies = loginResponse.header["set-cookie"];

      // Try to refresh with invalid content type
      await request(app)
        .post("/api/auth/refresh")
        .set("Content-Type", "text/plain")
        .set("Origin", VALID_ORIGIN)
        .set("Cookie", cookies)
        .expect(400); // Should fail due to invalid content type
    });

    it("should implement token rotation by invalidating old tokens", async () => {
      // First login to get a valid refresh token cookie
      const nonceResponse = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResponse.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .set("Origin", VALID_ORIGIN)
        .send({
          walletAddress: wallet.address,
          signature,
        })
        .expect(200);

      // Extract the refresh token from the cookie
      const cookies = loginResponse.header["set-cookie"];
      const refreshTokenCookie = cookies[0];

      // Get the actual token value by parsing the cookie
      const tokenMatch = refreshTokenCookie.match(
        new RegExp(`${REFRESH_TOKEN_COOKIE_NAME}=([^;]+)`)
      );
      const originalToken = tokenMatch ? tokenMatch[1] : null;

      expect(originalToken).not.toBeNull();

      // Now try to refresh the token
      await request(app)
        .post("/api/auth/refresh")
        .set("Content-Type", "application/json")
        .set("Origin", VALID_ORIGIN)
        .set("Cookie", cookies)
        .expect(200);

      // Verify the original token has been marked as replaced
      if (originalToken) {
        const isReused = await detectTokenReuse(originalToken);
        expect(isReused).toBe(true);
      }
    });

    it("should detect and prevent refresh token reuse", async () => {
      // First login to get a valid refresh token cookie
      const nonceResponse = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResponse.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .set("Origin", VALID_ORIGIN)
        .send({
          walletAddress: wallet.address,
          signature,
        })
        .expect(200);

      const originalCookies = loginResponse.header["set-cookie"];

      // First refresh is valid
      const firstRefreshResponse = await request(app)
        .post("/api/auth/refresh")
        .set("Content-Type", "application/json")
        .set("Origin", VALID_ORIGIN)
        .set("Cookie", originalCookies)
        .expect(200);

      // Second attempt with the same token should be rejected (token reuse)
      const secondRefreshResponse = await request(app)
        .post("/api/auth/refresh")
        .set("Content-Type", "application/json")
        .set("Origin", VALID_ORIGIN)
        .set("Cookie", originalCookies)
        .expect(401);

      expect(secondRefreshResponse.body.error).toContain(
        "Token reuse detected"
      );
    });

    it("should preserve device information when refreshing tokens", async () => {
      // First login with a specific device
      const nonceResponse = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResponse.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", MOCK_USER_AGENT)
        .set("Origin", VALID_ORIGIN)
        .send({
          walletAddress: wallet.address,
          signature,
          deviceId: "test-desktop-device",
        })
        .expect(200);

      const cookies = loginResponse.header["set-cookie"];

      // Refresh the token
      const refreshResponse = await request(app)
        .post("/api/auth/refresh")
        .set("Content-Type", "application/json")
        .set("Cookie", cookies)
        .set("User-Agent", MOCK_USER_AGENT)
        .set("Origin", VALID_ORIGIN)
        .expect(200);

      // Extract the new token
      const newCookies = refreshResponse.header["set-cookie"];
      const newRefreshTokenCookie = newCookies[0];
      const tokenMatch = newRefreshTokenCookie.match(
        new RegExp(`${REFRESH_TOKEN_COOKIE_NAME}=([^;]+)`)
      );
      const newToken = tokenMatch ? tokenMatch[1] : null;

      // Verify device info is preserved
      if (newToken) {
        const storedToken = await findRefreshToken(newToken);
        expect(storedToken).not.toBeNull();
        expect(storedToken?.deviceId).toBe("test-desktop-device");
        expect(storedToken?.device).toBe("Desktop");
      }
    });
  });

  describe("GET /api/auth/devices", () => {
    it("should return a list of active devices for authenticated user", async () => {
      // Login with first device
      const nonceResponse = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResponse.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      const loginResponse1 = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", MOCK_USER_AGENT)
        .send({
          walletAddress: wallet.address,
          signature,
          deviceId: "device-1",
        })
        .expect(200);

      const cookies1 = loginResponse1.header["set-cookie"];

      // Login with second device
      const nonceResponse2 = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce2 = nonceResponse2.body.nonce;
      const message2 = `Sign this message to authenticate with TrustBridge: ${nonce2}`;
      const signature2 = await wallet.signMessage(message2);

      const loginResponse2 = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", MOCK_MOBILE_USER_AGENT)
        .send({
          walletAddress: wallet.address,
          signature: signature2,
          deviceId: "device-2",
        })
        .expect(200);

      // Get devices list using first device's cookies
      const devicesResponse = await request(app)
        .get("/api/auth/devices")
        .set("Cookie", cookies1)
        .expect(200);

      // Should find both devices
      expect(devicesResponse.body.devices).toBeDefined();
      expect(Array.isArray(devicesResponse.body.devices)).toBe(true);
      expect(devicesResponse.body.devices.length).toBe(2);

      // Verify device information is returned
      const deviceIds = devicesResponse.body.devices.map(
        (d: any) => d.deviceId
      );
      expect(deviceIds).toContain("device-1");
      expect(deviceIds).toContain("device-2");
    });
  });

  describe("POST /api/auth/logout/device/:deviceId", () => {
    it("should revoke tokens for a specific device", async () => {
      // Login with first device
      const nonceResponse = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResponse.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      const loginResponse1 = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", MOCK_USER_AGENT)
        .send({
          walletAddress: wallet.address,
          signature,
          deviceId: "device-to-keep",
        })
        .expect(200);

      const cookies1 = loginResponse1.header["set-cookie"];

      // Login with second device
      const nonceResponse2 = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce2 = nonceResponse2.body.nonce;
      const message2 = `Sign this message to authenticate with TrustBridge: ${nonce2}`;
      const signature2 = await wallet.signMessage(message2);

      const loginResponse2 = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", MOCK_MOBILE_USER_AGENT)
        .send({
          walletAddress: wallet.address,
          signature: signature2,
          deviceId: "device-to-logout",
        })
        .expect(200);

      const cookies2 = loginResponse2.header["set-cookie"];

      // Logout the second device using first device's cookies
      await request(app)
        .post("/api/auth/logout/device/device-to-logout")
        .set("Cookie", cookies1)
        .expect(200);

      // First device should still be able to access protected routes
      await request(app)
        .get("/api/auth/me")
        .set("Cookie", cookies1)
        .expect(200);

      // Second device should be logged out
      await request(app)
        .get("/api/auth/me")
        .set("Cookie", cookies2)
        .expect(401);
    });
  });

  describe("GET /api/auth/me", () => {
    it("should return 401 if not authenticated", async () => {
      await request(app).get("/api/auth/me").expect(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should return 401 if not authenticated", async () => {
      await request(app).post("/api/auth/logout").expect(401);
    });

    it("should successfully logout authenticated user and clear refresh token cookie", async () => {
      // First login
      const nonceResponse = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResponse.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          walletAddress: wallet.address,
          signature,
        })
        .expect(200);

      const cookies = loginResponse.header["set-cookie"];

      // Then logout
      const logoutResponse = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", cookies)
        .expect(200);

      // Verify refresh token cookie is cleared
      expect(logoutResponse.header["set-cookie"]).toBeDefined();
      expect(logoutResponse.header["set-cookie"][0]).toContain(
        `${REFRESH_TOKEN_COOKIE_NAME}=;`
      );

      // Verify session is invalidated
      await request(app).get("/api/auth/me").set("Cookie", cookies).expect(401);
    });
  });

  describe("Token Limit", () => {
    it(`should not exceed ${MAX_ACTIVE_TOKENS_PER_USER} active refresh tokens per user`, async () => {
      // Create a user first
      const nonceResponse = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResponse.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      // Create MAX_ACTIVE_TOKENS_PER_USER + 2 tokens to test limit enforcement
      const deviceIds: string[] = [];

      // Create tokens for different devices
      for (let i = 1; i <= MAX_ACTIVE_TOKENS_PER_USER + 2; i++) {
        const deviceId = `device-${i}`;
        deviceIds.push(deviceId);

        // Get a fresh nonce for each login
        const nonceResp = await request(app)
          .get(`/api/auth/nonce/${wallet.address}`)
          .expect(200);

        const nonceForLogin = nonceResp.body.nonce;
        const messageForLogin = `Sign this message to authenticate with TrustBridge: ${nonceForLogin}`;
        const signatureForLogin = await wallet.signMessage(messageForLogin);

        // Login with a new device
        const loginResponse = await request(app)
          .post("/api/auth/login")
          .set(
            "User-Agent",
            i % 2 === 0 ? MOCK_MOBILE_USER_AGENT : MOCK_USER_AGENT
          )
          .set("Origin", VALID_ORIGIN)
          .send({
            walletAddress: wallet.address,
            signature: signatureForLogin,
            deviceId,
          })
          .expect(200);

        // Save the session cookie from the last login for later use
        sessionCookie = loginResponse.header["set-cookie"][0];

        // Add a small delay to ensure different createdAt timestamps
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Verify we have exactly MAX_ACTIVE_TOKENS_PER_USER active tokens
      const activeTokenCount = await countActiveRefreshTokens(wallet.address);
      expect(activeTokenCount).toBe(MAX_ACTIVE_TOKENS_PER_USER);

      // Verify the oldest tokens were revoked
      // Get active devices
      const devicesResponse = await request(app)
        .get("/api/auth/devices")
        .set("Origin", VALID_ORIGIN)
        .set("Cookie", sessionCookie)
        .expect(200);

      const activeDeviceIds = devicesResponse.body.devices.map(
        (d: any) => d.deviceId
      );

      // Check that the oldest deviceIds are not in the active list
      expect(activeDeviceIds).not.toContain(deviceIds[0]); // First device should be revoked
      expect(activeDeviceIds).not.toContain(deviceIds[1]); // Second device should be revoked

      // But newest devices should be active
      expect(activeDeviceIds).toContain(deviceIds[deviceIds.length - 1]); // Last device should be active
    });

    it("should maintain the token limit even after refresh operations", async () => {
      // Create MAX_ACTIVE_TOKENS_PER_USER tokens
      const cookies: string[] = [];

      for (let i = 1; i <= MAX_ACTIVE_TOKENS_PER_USER; i++) {
        const nonceResp = await request(app)
          .get(`/api/auth/nonce/${wallet.address}`)
          .expect(200);

        const nonce = nonceResp.body.nonce;
        const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
        const signature = await wallet.signMessage(message);

        const loginResponse = await request(app)
          .post("/api/auth/login")
          .set("User-Agent", MOCK_USER_AGENT)
          .set("Origin", VALID_ORIGIN)
          .send({
            walletAddress: wallet.address,
            signature,
            deviceId: `device-${i}`,
          })
          .expect(200);

        cookies.push(loginResponse.header["set-cookie"][0]);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Refresh the first token
      await request(app)
        .post("/api/auth/refresh")
        .set("Content-Type", "application/json")
        .set("Origin", VALID_ORIGIN)
        .set("Cookie", cookies[0])
        .expect(200);

      // Verify we still have MAX_ACTIVE_TOKENS_PER_USER active tokens
      const activeTokenCount = await countActiveRefreshTokens(wallet.address);
      expect(activeTokenCount).toBe(MAX_ACTIVE_TOKENS_PER_USER);

      // Create one more login session - this should revoke the oldest active token
      const nonceResp = await request(app)
        .get(`/api/auth/nonce/${wallet.address}`)
        .expect(200);

      const nonce = nonceResp.body.nonce;
      const message = `Sign this message to authenticate with TrustBridge: ${nonce}`;
      const signature = await wallet.signMessage(message);

      await request(app)
        .post("/api/auth/login")
        .set("User-Agent", MOCK_USER_AGENT)
        .set("Origin", VALID_ORIGIN)
        .send({
          walletAddress: wallet.address,
          signature,
          deviceId: "new-device",
        })
        .expect(200);

      // Verify we still have MAX_ACTIVE_TOKENS_PER_USER active tokens
      const finalActiveTokenCount = await countActiveRefreshTokens(
        wallet.address
      );
      expect(finalActiveTokenCount).toBe(MAX_ACTIVE_TOKENS_PER_USER);
    });
  });
});
