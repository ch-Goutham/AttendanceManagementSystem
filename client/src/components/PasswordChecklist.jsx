import { Check, X } from 'lucide-react';
import { passwordChecks } from '../lib/password';

export default function PasswordChecklist({ value }) {
  return (
    <span className="password-checklist">
      {passwordChecks(value).map((check) => (
        <span key={check.key} className={check.met ? 'password-rule met' : 'password-rule'}>
          {check.met ? <Check size={11} /> : <X size={11} />}
          {check.label}
        </span>
      ))}
    </span>
  );
}
