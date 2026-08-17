# Ludo Arena Backend API

Backend server for the **Ludo Arena** gaming platform.

## Tech Stack
- **Node.js** & **Express.js** with **TypeScript**
- **MySQL** database ORM via **Sequelize**
- **Socket.IO** real-time event server
- **JWT** (jsonwebtoken) & **bcryptjs** for authentication
- **Zod** schema validation
- **Helmet**, **CORS**, and **express-rate-limit** security middleware

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables in `.env`:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=ludo_arena
   DB_USER=root
   DB_PASSWORD=
   JWT_SECRET=super_secret_jwt_key_ludo_arena_2026
   JWT_REFRESH_SECRET=super_secret_refresh_jwt_key_ludo_arena_2026
   PORT=5000
   CLIENT_URL=http://localhost:5173
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

4. Build production distribution:
   ```bash
   npm run build
   ```

5. Run production server:
   ```bash
   npm run start
   ```

## Health Check
- `GET /api/health`
- Response:
  ```json
  {
    "success": true,
    "message": "Ludo Arena backend is running"
  }
  ```
