import nodemailer from 'nodemailer';

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

function mailFrom() {
  return process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '';
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

function resetMessage({ to, name, resetUrl }) {
  return {
    from: mailFrom(),
    to,
    subject: 'Reset your Attendwise password',
    text: [
      `Hi ${name || 'there'},`,
      '',
      'Someone requested a password reset for your Attendwise account.',
      'Open the link below to set a new password (it expires in 30 minutes):',
      resetUrl,
      '',
      'If you did not request this, you can safely ignore this email.'
    ].join('\n'),
    html: `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:460px;margin:auto;border:1px solid rgba(0,7,45,.12);border-radius:12px;overflow:hidden">
        <div style="background:#00072D;color:#fff;padding:16px 20px;font-weight:700">Attendwise</div>
        <div style="padding:22px 20px;color:#00072D">
          <p style="margin:0 0 14px">Hi ${name || 'there'},</p>
          <p style="margin:0 0 18px">Someone requested a password reset for your account. Click the button below to set a new password. The link expires in 30 minutes.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#00072D;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600">Reset password</a>
          <p style="margin:20px 0 0;color:rgba(0,7,45,.60);font-size:12px">If you did not request this, you can safely ignore this email.</p>
        </div>
      </div>`
  };
}

// HTTP email API (recommended on Render, whose free plan blocks outbound SMTP).
async function sendWithResend(message) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(message)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend ${response.status}: ${body.slice(0, 300)}`);
  }
}

// Sends a password-reset email. If no email provider is configured, the reset
// link is printed to the server console so the flow stays testable in local dev.
// Never throws: a delivery failure is reported, not raised.
export async function sendResetEmail({ to, name, resetUrl }) {
  const message = resetMessage({ to, name, resetUrl });

  if (process.env.RESEND_API_KEY) {
    if (!message.from) {
      console.error('[mailer] RESEND_API_KEY is set but MAIL_FROM is missing.');
      return { delivered: false, error: 'MAIL_FROM is missing' };
    }
    try {
      await sendWithResend(message);
      return { delivered: true, provider: 'resend' };
    } catch (error) {
      console.error('[mailer] Failed to send reset email via Resend:', error.message);
      return { delivered: false, error: error.message };
    }
  }

  if (smtpConfigured()) {
    try {
      const transport = buildTransport();
      await transport.sendMail(message);
      return { delivered: true, provider: 'smtp' };
    } catch (error) {
      console.error('[mailer] Failed to send reset email via SMTP:', error.message);
      return { delivered: false, error: error.message };
    }
  }

  console.log(`\n[mailer] Email is not configured. Password reset link for ${to}:\n         ${resetUrl}\n`);
  return { delivered: false, error: 'Email is not configured' };
}
