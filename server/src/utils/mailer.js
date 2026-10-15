import nodemailer from 'nodemailer';

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

// Sends a password-reset email. If SMTP is not configured, the reset link is
// printed to the server console so the flow stays testable in local dev.
// Never throws: a delivery failure is reported, not raised.
export async function sendResetEmail({ to, name, resetUrl }) {
  if (!smtpConfigured()) {
    console.log(`\n[mailer] SMTP not configured. Password reset link for ${to}:\n         ${resetUrl}\n`);
    return { delivered: false };
  }
  try {
    const transport = buildTransport();
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: 'Reset your Attendwise password',
      text: [
        `Hi ${name || 'there'},`,
        '',
        'Someone requested a password reset for your Attendwise account.',
        `Open the link below to set a new password (it expires in 30 minutes):`,
        resetUrl,
        '',
        'If you did not request this, you can safely ignore this email.'
      ].join('\n'),
      html: `
        <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:460px;margin:auto;border:1px solid #e8edf4;border-radius:12px;overflow:hidden">
          <div style="background:#178653;color:#fff;padding:16px 20px;font-weight:700">Attendwise</div>
          <div style="padding:22px 20px;color:#1c2638">
            <p style="margin:0 0 14px">Hi ${name || 'there'},</p>
            <p style="margin:0 0 18px">Someone requested a password reset for your account. Click the button below to set a new password. The link expires in 30 minutes.</p>
            <a href="${resetUrl}" style="display:inline-block;background:#198754;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600">Reset password</a>
            <p style="margin:20px 0 0;color:#7c8799;font-size:12px">If you did not request this, you can safely ignore this email.</p>
          </div>
        </div>`
    });
    return { delivered: true };
  } catch (error) {
    console.error('[mailer] Failed to send reset email:', error.message);
    return { delivered: false, error: error.message };
  }
}
