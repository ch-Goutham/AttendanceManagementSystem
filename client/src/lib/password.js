const encoder = new TextEncoder();

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_POLICY_MESSAGE =
  'Password must be 8–72 characters and include uppercase, lowercase, a number and a special character, with no spaces.';

export function passwordChecks(value) {
  const password = typeof value === 'string' ? value : '';
  return [
    {
      key: 'minLength',
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH
    },
    {
      key: 'maxLength',
      label: '72 characters or fewer',
      met: password.length > 0 && encoder.encode(password).length <= PASSWORD_MAX_BYTES
    },
    {
      key: 'uppercase',
      label: 'One uppercase letter',
      met: /[A-Z]/.test(password)
    },
    {
      key: 'lowercase',
      label: 'One lowercase letter',
      met: /[a-z]/.test(password)
    },
    {
      key: 'number',
      label: 'One number',
      met: /[0-9]/.test(password)
    },
    {
      key: 'special',
      label: 'One special character',
      met: /[^A-Za-z0-9\s]/.test(password)
    },
    {
      key: 'noSpaces',
      label: 'No spaces',
      met: password.length > 0 && !/\s/.test(password)
    }
  ];
}

export function isStrongPassword(value) {
  return passwordChecks(value).every((check) => check.met);
}

export function passwordError(value) {
  return isStrongPassword(value) ? '' : PASSWORD_POLICY_MESSAGE;
}
