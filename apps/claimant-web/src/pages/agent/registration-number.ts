const AGENT_REGISTRATION_PATTERN = /^\d{6}-\d{2}$/;

export function checkAgentRegistrationNumber(value: string): string | null {
  if (!value.trim()) return 'Enter your agent registration number.';
  return AGENT_REGISTRATION_PATTERN.test(value.trim()) ? null : 'Use the format 999999-00.';
}
