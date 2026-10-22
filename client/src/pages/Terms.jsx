import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';

export default function Terms() {
  return (
    <div className="auth-wrap legal-wrap">
      <div className="legal-card fade-in">
        <div className="brand-mark">
          <FileText size={24} />
        </div>
        <p className="eyebrow">LEGAL</p>
        <h1>Terms &amp; Conditions</h1>
        <p className="muted legal-updated">Last updated: 22 October 2026</p>

        <div className="legal-body">
          <h2>1. About these terms</h2>
          <p>
            These Terms &amp; Conditions govern your use of this attendance management
            application (the "Service"). By creating an account or using the Service, you agree
            to these terms. If you do not agree, do not use the Service.
          </p>

          <h2>2. Accounts and access</h2>
          <p>
            You are responsible for the accuracy of the information you provide and for keeping
            your login credentials confidential. You must not share your account, attempt to
            access another person's account, or use the Service for anything other than its
            intended workplace purpose.
          </p>
          <p>
            Administrators can create, deactivate, reset and delete accounts. Accounts may be
            suspended or removed if these terms are breached or if access is no longer required
            by your organisation.
          </p>

          <h2>3. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>submit false attendance, leave or profile information;</li>
            <li>attempt to bypass security controls or access data you are not authorised to see;</li>
            <li>upload malicious code or interfere with the operation of the Service; or</li>
            <li>use the Service to harass, discriminate against or harm another person.</li>
          </ul>

          <h2>4. Attendance and leave records</h2>
          <p>
            Check-in and check-out times, leave requests and corrections are recorded so your
            organisation can manage attendance. These records may be reviewed by administrators.
            You should report mistakes to your administrator rather than trying to alter records
            you are not permitted to change.
          </p>

          <h2>5. Google sign-in</h2>
          <p>
            If you choose "Continue with Google", Google authenticates you and shares your name,
            email address and profile identifier with the Service. Your use of Google is also
            governed by Google's own terms and privacy policy. The Service does not receive your
            Google password.
          </p>

          <h2>6. Availability and changes</h2>
          <p>
            The Service is provided on an "as is" and "as available" basis. Features may change,
            be suspended or be withdrawn without notice. We do not guarantee uninterrupted or
            error-free operation.
          </p>

          <h2>7. Privacy</h2>
          <p>
            Account details and attendance records are used to operate the Service and are
            available to the administrators of your workspace. Contact your administrator for
            questions about the data held about you.
          </p>

          <h2>8. Contact</h2>
          <p>
            Questions about these terms should be directed to your workspace administrator.
          </p>

          <p className="legal-note">
            This is a starter application. These terms are provided as a plain-language template
            and are not legal advice. Have them reviewed before relying on them in production.
          </p>
        </div>

        <p className="auth-foot">
          <Link to="/admin-signup">
            <ArrowLeft size={14} /> Back to sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
