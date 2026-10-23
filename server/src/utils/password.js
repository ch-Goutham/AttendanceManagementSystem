const encoder = new TextEncoder();

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_POLICY_MESSAGE =
  'Password must be 8–72 characters and include uppercase, lowercase, a number and a special character, with no spaces.';

export function passwordChecks(value) {
  const password = typeof value === 'string' ? value : '';
  return {
    required: password.length > 0,
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    maxLength: password.length > 0 && encoder.encode(password).length <= PASSWORD_MAX_BYTES,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9\s]/.test(password),
    noSpaces: password.length > 0 && !/\s/.test(password)
  };
}

export function isStrongPassword(value) {
  return Object.values(passwordChecks(value)).every(Boolean);
}

// Returns a user-facing error, or null when the password satisfies the policy.
export function passwordError(value) {
  return isStrongPassword(value) ? null : PASSWORD_POLICY_MESSAGE;
}
