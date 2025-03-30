# TrustBridge Backend

Backend API for the TrustBridge platform.

## Security Features

### Secure Token Storage

This application implements secure token storage following best practices:

- **Access Tokens**: Short-lived tokens (1 hour) sent to the client and stored in memory.
- **Refresh Tokens**: Securely stored as HTTP-only cookies with additional security measures.

#### Security Benefits

The refresh tokens are secured with the following:

- **HTTP-only cookies**: Prevents JavaScript access to the token, mitigating XSS attacks
- **Secure flag**: Ensures the cookie is only sent over HTTPS connections (in production)
- **SameSite=Strict**: Prevents the cookie from being sent in cross-site requests, mitigating CSRF attacks
- **Path restriction**: Cookie is only sent to authentication-related endpoints

### Secure Refresh Token Endpoint

The token refresh mechanism implements additional security measures:

- **POST-only Endpoint**: Refresh tokens can only be sent via POST requests, not GET
- **Origin Validation**: Requests are validated against a whitelist of allowed origins
- **Content-Type Validation**: Only specific content types are accepted (application/json, application/x-www-form-urlencoded)
- **Origin Binding**: Tokens are bound to the origin they were created from, preventing CSRF attacks
- **Cross-Origin Protection**: Refreshing from a different origin than the one used for login is prevented

#### CSRF Protection Strategy

1. Tokens store the origin they were issued from
2. When a refresh request is made, the request origin is compared to the stored origin
3. If there's a mismatch, the token is invalidated and the request is rejected
4. All tokens from the same family (session) are revoked to prevent further attacks

### Token Rotation & Reuse Detection

The application implements a token rotation system to enhance security:

- **Token Rotation**: Each time a refresh token is used, it is invalidated and a new refresh token is issued.
- **Token Family**: Refresh tokens are grouped into families to track related tokens.
- **Reuse Detection**: If a refresh token is used more than once (potential token theft), the system detects it.
- **Automatic Revocation**: If token reuse is detected, all tokens in the same family are automatically invalidated.

### Active Token Limiting

The system limits the number of active refresh tokens per user:

- **Maximum Active Sessions**: Only 5 concurrent active refresh tokens per user are allowed
- **Automatic Token Revocation**: When a new token is created and the limit is exceeded, the oldest tokens are automatically revoked
- **Session Management**: Ensures users cannot have an unlimited number of active sessions
- **Resource Protection**: Prevents token database bloat and potential DoS vectors

#### Benefits

- Prevents excessive token accumulation in the database
- Makes it easier to track and manage active sessions
- Reduces the attack surface by limiting the number of valid tokens at any given time
- Facilitates automatic cleanup of old sessions

#### Protection Against Refresh Token Theft

This system protects against refresh token theft by:

1. Making refresh tokens single-use only
2. If a token is stolen and used by an attacker, the legitimate user's next request will trigger reuse detection
3. The system automatically revokes all sessions from that family
4. The legitimate user must re-authenticate to establish a new session

### Device Tracking and Management

The application tracks and manages user sessions across different devices:

- **Device Association**: Each refresh token is associated with the device that requested it
- **Device Information**: System captures device type, user agent, and IP address information
- **Multiple Device Support**: Users can maintain active sessions on multiple devices
- **Per-Device Logout**: Users can remotely sign out from specific devices
- **Active Device Listing**: Users can view all devices where they're currently logged in

#### Benefits

- Enhanced security through device-specific session management
- Transparency for users about where their account is being accessed
- Ability to revoke access from lost or compromised devices without affecting other sessions
- Improved threat detection by monitoring unusual device access patterns

#### Authentication Flow

1. User logs in with wallet credentials
2. Server generates an access token and refresh token
3. Access token is returned in the response body for client storage in memory
4. Refresh token is set as an HTTP-only cookie
5. Device information and origin are associated with the refresh token
6. The system checks if the user exceeds the token limit and revokes oldest tokens if needed
7. When the access token expires, the client requests a new one using the /refresh endpoint
8. The refresh token is automatically included in the request via cookies
9. Server validates the refresh token, origin, and content type
10. Server issues a new access token and rotates the refresh token
11. The old refresh token is invalidated

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Testing

```bash
npm test
```

## API Documentation

See the [API documentation](docs/) for details on available endpoints.

### Authentication Endpoints

#### `/api/auth/login`

Authenticates a user and starts a new session.

#### `/api/auth/refresh`

Issues a new access token using a valid refresh token.

#### `/api/auth/logout`

Ends the current session and invalidates the refresh token.

#### `/api/auth/logout/device/:deviceId`

Logs out a specific device by its device ID.

#### `/api/auth/devices`

Lists all active devices for the currently authenticated user.
