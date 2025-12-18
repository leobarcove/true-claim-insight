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

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:4000',
  },

  // Rate limiting
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },

  // Microservices
  services: {
    caseService: process.env.CASE_SERVICE_URL || 'http://localhost:3001',
    videoService: process.env.VIDEO_SERVICE_URL || 'http://localhost:3002',
    identityService: process.env.IDENTITY_SERVICE_URL || 'http://localhost:3003',
    riskEngine: process.env.RISK_ENGINE_URL || 'http://localhost:3004',
    documentService: process.env.DOCUMENT_SERVICE_URL || 'http://localhost:3005',
  },

  // Bcrypt
  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  },
});
