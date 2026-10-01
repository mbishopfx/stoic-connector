export const PASSWORD_RECOVERY_COOKIE = "stoic_password_recovery";
export const PASSWORD_RECOVERY_COOKIE_MAX_AGE = 15 * 60;

export function recoveryRedirectOrigin(configuredOrigin: string | undefined, currentOrigin: string): string {
  const candidate = configuredOrigin?.trim() || currentOrigin;
  return new URL(candidate).origin;
}
