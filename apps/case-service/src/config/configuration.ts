export default () => ({
  port: parseInt(process.env.CASE_SERVICE_PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'local-dev-secret',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '3600',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '604800',
  },

  aws: {
    region: process.env.AWS_REGION || 'ap-southeast-5',
    endpoint: process.env.AWS_ENDPOINT,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3: {
      documentsBucket: process.env.S3_BUCKET_DOCUMENTS || 'tci-documents',
      recordingsBucket: process.env.S3_BUCKET_RECORDINGS || 'tci-recordings',
    },
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucketName: process.env.SUPABASE_BUCKET_NAME,
  },
  cors: {
    origins: process.env.CORS_ORIGINS || '*',
  },
});
