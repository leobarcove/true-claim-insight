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

  /**
   * Outbound notifications (MASTER_PLAN §5 Phase 2).
   *
   * Off unless explicitly enabled. A default-on sender would mean any
   * developer machine or CI run with SMTP reachable could email a real
   * claimant from seeded data — and the addresses in the seed are the ones a
   * demo uses. When disabled, messages are recorded SUPPRESSED rather than
   * dropped, so the intent is still visible.
   */
  notifications: {
    enabled: process.env.NOTIFICATIONS_ENABLED === 'true',
    from: process.env.SMTP_FROM || 'noreply@trueclaiminsight.local',
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '1025', 10),
      // SES on 465 needs TLS; Mailhog on 1025 does not.
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
    },
    /** Where SLA breaches and other firm-facing alerts go. */
    opsRecipient: process.env.NOTIFICATIONS_OPS_RECIPIENT,
  },

  /**
   * FNOL email intake (MASTER_PLAN §5 Phase 2).
   *
   * No defaults for host/user/password on purpose: a default would let the
   * poller start against nothing and report success, and intake that silently
   * receives no mail is indistinguishable from a quiet week. `isConfigured()`
   * on the source checks these and the scheduler skips when absent.
   */
  fnolIntake: {
    enabled: process.env.FNOL_INTAKE_ENABLED === 'true',
    imap: {
      host: process.env.FNOL_IMAP_HOST,
      port: parseInt(process.env.FNOL_IMAP_PORT || '993', 10),
      secure: process.env.FNOL_IMAP_SECURE !== 'false',
      user: process.env.FNOL_IMAP_USER,
      password: process.env.FNOL_IMAP_PASSWORD,
      mailbox: process.env.FNOL_IMAP_MAILBOX || 'INBOX',
    },
    /** Messages fetched per poll. Keeps a backlog from monopolising a worker. */
    batchSize: parseInt(process.env.FNOL_INTAKE_BATCH_SIZE || '25', 10),
    /** Poll interval in milliseconds. */
    pollIntervalMs: parseInt(process.env.FNOL_INTAKE_POLL_MS || '300000', 10),
    /** Tenant that owns the mailbox, until per-tenant mailboxes exist. */
    tenantId: process.env.FNOL_INTAKE_TENANT_ID,
  },
});
