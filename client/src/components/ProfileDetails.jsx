import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  IdCard,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { Status } from './Ui';
import { initials } from '../lib/format';

const joinedLabel = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

function Field({ icon, label, value }) {
  const text = value == null ? '' : String(value).trim();
  return (
    <div className="profile-field">
      <span className="profile-field-icon">{icon}</span>
      <div className="profile-field-body">
        <span>{label}</span>
        <b>{text || 'Not provided'}</b>
      </div>
    </div>
  );
}

/**
 * Read-only profile card shared by the admin and employee portals.
 * Everything an admin can enter for an employee is listed here; the password
 * and Google account id are deliberately never returned by the API.
 */
export default function ProfileDetails({ person, roleLabel, readOnlyNote }) {
  if (!person) return null;
  const isEmployee = person.role === 'employee';

  const fields = isEmployee
    ? [
        ['email', 'Email', <Mail size={16} />, person.email],
        ['phone', 'Phone', <Phone size={16} />, person.phone],
        ['employeeCode', 'Employee ID', <IdCard size={16} />, person.employeeCode],
        ['department', 'Department', <Building2 size={16} />, person.department],
        ['position', 'Position', <BriefcaseBusiness size={16} />, person.position],
        ['location', 'Default working location', <MapPin size={16} />, person.location],
        ['joined', 'Joined on', <CalendarDays size={16} />, joinedLabel(person.createdAt)],
      ]
    : [
        ['email', 'Email', <Mail size={16} />, person.email],
        ['role', 'Role', <ShieldCheck size={16} />, isEmployee ? 'Employee' : 'Administrator'],
        ['joined', 'Joined on', <CalendarDays size={16} />, joinedLabel(person.createdAt)],
      ];

  return (
    <div className="profile-details">
      <div className="profile-hero">
        <div className="profile-avatar">{initials(person.name)}</div>
        <div className="profile-identity">
          <h2>{person.name || 'Unnamed account'}</h2>
          <p>{person.email || 'No email on record'}</p>
          <div className="profile-badges">
            <span className={`profile-role ${isEmployee ? 'employee' : 'admin'}`}>
              {roleLabel || (isEmployee ? 'Employee' : 'Administrator')}
            </span>
            <Status status={person.isActive === false ? 'Inactive' : 'Active'} />
          </div>
        </div>
      </div>

      <div className="profile-grid">
        {fields.map(([key, label, icon, value]) => (
          <Field key={key} icon={icon} label={label} value={value} />
        ))}
      </div>

      <p className="profile-note">
        {readOnlyNote ||
          (isEmployee
            ? 'These details were entered by your administrator. Contact an admin if anything needs updating.'
            : 'Your administrator account details. Employee details are managed from the Employees page.')}
      </p>
    </div>
  );
}
