export default () => ({
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  database: {
    url: process.env.DATABASE_URL,
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'tci-jwt-secret-change-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Cookies
  cookie: {
    secret: process.env.COOKIE_SECRET || 'tci-cookie-secret',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    httpOnly: true,
  },

  // CORS is configured in main.ts from CORS_ORIGINS (plural). A `cors.origin`
  // key used to sit here reading CORS_ORIGIN (singular) — nothing consumed it,
  // and its 4000 default outlived the port it named.

  // Rate limiting
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },

  // Microservices. Defaults are the compose-network ports staging binds; local
  // hosts come from the root .env allocation block.
  //
  // identityService and documentService were removed: neither service exists
  // (CLAUDE.md "Not built"), nothing read either key, and documentService's
  // 3005 default now names risk-analyzer — so anything that started using it
  // would have reached the wrong service entirely.
  services: {
    caseService: process.env.CASE_SERVICE_URL || 'http://localhost:3001',
    videoService: process.env.VIDEO_SERVICE_URL || 'http://localhost:3002',
    riskEngine: process.env.RISK_ENGINE_URL || 'http://localhost:3004',
  },

  // Bcrypt
  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  },
});
