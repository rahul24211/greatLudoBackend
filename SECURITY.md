# Security Policy & Deployment Guidelines

## Security Architecture Overview

This backend implements multi-layered security controls to protect user data, authentication tokens, and real-time game integrity.

### 1. Environment & Configuration Security
- **Strict Variable Validation**: All environment variables are validated at server startup (`validateEnv()`).
- **No Secret Leaks**: Secrets (JWT keys, database passwords, encryption keys) are loaded strictly from `.env` and excluded from Git version control.
- **Fail-Safe Startup**: Missing or default production secrets block server initialization in production mode.

### 2. Authentication & Data Privacy
- **Password Hashing**: User passwords are hashed using `bcrypt` (salt rounds >= 10). Passwords and password hashes are never stored in Redis, returned via API endpoints, or written to server logs.
- **JWT Protection**:
  - Access Token Expiry: 1 day (`1d`)
  - Refresh Token Expiry: 7 days (`7d`)
  - Secrets loaded strictly from environment (`JWT_SECRET`, `JWT_REFRESH_SECRET`).
- **Data Sanitization**: User model output explicitly removes `passwordHash`.

### 3. Field-Level Encryption (`src/utils/encryption.ts`)
- **AES-256-GCM**: Authenticated encryption used for sensitive reversible data fields.
- **Integrity Tag**: Decryption verifies the 128-bit authentication tag to prevent tampering.

### 4. Transport & HTTP Security
- **CORS Restriction**: Restricted strictly to configured frontend origins (`CLIENT_URL`).
- **Helmet Security Headers**:
  - Content Security Policy (CSP)
  - X-Content-Type-Options: `nosniff`
  - Referrer-Policy: `same-origin`
  - X-Frame-Options: `DENY`
- **Request Limits**: JSON and URL-encoded request payload body limits capped at `100kb`.

### 5. Production Infrastructure Requirements
- **Reverse Proxy**: Deploy behind an HTTPS / WSS load balancer (e.g. Nginx or Cloudflare) with TLS 1.3 enabled.
- **Express Trust Proxy**: `app.set('trust proxy', 1)` enabled for accurate rate limiting behind reverse proxies.
- **Redis Security**: Production Redis instances must mandate password authentication (`REDIS_PASSWORD`) and TLS (`rediss://` protocol).
- **MySQL Security**: Restrict MySQL access strictly to local database subnet with non-root user credentials.
