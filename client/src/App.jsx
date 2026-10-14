import React, { useEffect, useMemo, useState } from 'react';

import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';

import Calendar from 'react-calendar';

import {

  CalendarDays,

  Users,

  ClipboardCheck,

  LogOut,

  UserRound,

  ShieldCheck,

  Plus,

  RefreshCw,

} from 'lucide-react';



import api from './api';

import 'react-calendar/dist/Calendar.css';



const monthKey = (date) =>

  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;



const dateKey = (date) =>

  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;



const errMsg = (error) =>

  error.response?.data?.message ||

  error.message ||

  'Something went wrong. Please try again.';



function App() {

  const [adminPage, setAdminPage] = useState('attendance');

  const [auth, setAuth] = useState(() => {

    try {

      return JSON.parse(localStorage.getItem('attendance_user') || 'null');

    } catch {

      return null;

    }

  });



  const navigate = useNavigate();



  const signOut = () => {

    localStorage.removeItem('attendance_token');

    localStorage.removeItem('attendance_user');

    setAuth(null);

    navigate('/login');

  };



  const onAuth = (data) => {

    localStorage.setItem('attendance_token', data.token);

    localStorage.setItem(

      'attendance_user',

      JSON.stringify(data.user)

    );

    setAuth(data.user);

    navigate('/');

  };



  return (

    <Routes>

      <Route

        path="/login"

        element={

          auth ? (

            <Navigate to="/" replace />

          ) : (

            <AuthPage onAuth={onAuth} />

          )

        }

      />



      <Route

        path="/register-admin"

        element={

          auth ? (

            <Navigate to="/" replace />

          ) : (

            <AuthPage register onAuth={onAuth} />

          )

        }

      />



      <Route

        path="/"

        element={

          !auth ? (

            <Navigate to="/login" replace />

          ) : (

            <Shell user={auth} signOut={signOut} activePage={adminPage} setActivePage={setAdminPage}>

              {auth.role === 'admin' ? (

                <AdminDashboard activePage={adminPage} />

              ) : (

                <EmployeeDashboard user={auth} />

              )}

            </Shell>

          )

        }

      />



      <Route

        path="*"

        element={

          auth ? <Navigate to="/" replace /> : <Navigate to="/login" replace />

        }

      />

    </Routes>

  );

}



function AuthPage({ register = false, onAuth }) {

  const [form, setForm] = useState({

    name: '',

    email: '',

    password: '',

  });



  const [error, setError] = useState('');

  const [busy, setBusy] = useState(false);



  const change = (event) => {

    setForm({

      ...form,

      [event.target.name]: event.target.value,

    });

  };



  async function submit(event) {

    event.preventDefault();

    setError('');

    setBusy(true);



    try {

      const { data } = await api.post(

        register ? '/auth/register-admin' : '/auth/login',

        form

      );



      onAuth(data);

    } catch (error) {

      setError(errMsg(error));

    } finally {

      setBusy(false);

    }

  }



  return (

    <div className="auth-wrap">

      <div className="auth-card">

        <div className="brand-mark">

          <ClipboardCheck size={25} />

        </div>



        <p className="eyebrow">COMPANY WORKSPACE</p>



        <h1>

          {register ? 'Create admin account' : 'Welcome back'}

        </h1>



        <p className="muted">

          {register

            ? 'Set up your company attendance workspace.'

            : 'Sign in to manage or view attendance.'}

        </p>



        <form onSubmit={submit}>

          {register && (

            <label>

              Full name

              <input

                name="name"

                value={form.name}

                onChange={change}

                required

                placeholder="Your name"

              />

            </label>

          )}



          <label>

            Email address

            <input

              name="email"

              type="email"

              value={form.email}

              onChange={change}

              required

              placeholder="you@company.com"

            />

          </label>



          <label>

            Password

            <input

              name="password"

              type="password"

              minLength={8}

              value={form.password}

              onChange={change}

              required

              placeholder="At least 8 characters"

            />

          </label>



          {error && <p className="error">{error}</p>}



          <button className="primary full" disabled={busy}>

            {busy

              ? 'Please wait...'

              : register

                ? 'Register admin'

                : 'Sign in'}

          </button>

        </form>



        <p className="auth-foot">

          {register

            ? 'Already have an account?'

            : 'Need to set up an admin account?'}{' '}

          <Link to={register ? '/login' : '/register-admin'}>

            {register ? 'Sign in' : 'Admin register'}

          </Link>

        </p>

      </div>

    </div>

  );

}



function Shell({ user, signOut, children, activePage, setActivePage }) {

  return (

    <div className="app-shell">

      <aside className="sidebar">

        <div className="side-brand">

          <div className="brand-mark small">

            <ClipboardCheck size={20} />

          </div>



          <span>

            Attend<span className="brand-light">wise</span>

          </span>

        </div>



        <div className="side-label">WORKSPACE</div>





<button type="button" className={`nav-item ${activePage === 'attendance' ? 'active' : ''}`} onClick={() => { setActivePage('attendance'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ border: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
  <CalendarDays size={18} />
  <span>Attendance</span>
</button>



{user.role === 'admin' && (

  <button type="button" className={`nav-item ${activePage === 'employees' ? 'active' : ''}`} onClick={() => { setActivePage('employees'); document.getElementById('employee-directory')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} style={{ border: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
    <Users size={18} />
    <span>Employees</span>
  </button>

)}





        <div className="side-bottom">

          <div className="profile-chip">

            <div className="avatar">

              {user.name?.[0]?.toUpperCase() || 'U'}

            </div>



            <div className="profile-info">

              <b>{user.name}</b>

              <small>

                {user.role === 'admin'

                  ? 'Administrator'

                  : 'Employee'}

              </small>

            </div>

          </div>



          <button className="logout" onClick={signOut}>

            <LogOut size={17} />

            Sign out

          </button>

        </div>

      </aside>



      <main className="main-area">

        <header className="topbar">

          <div>

            <span className="breadcrumb">Workspace / </span>

            <b>{user.role === 'admin' && activePage === 'employees' ? 'Employee directory' : user.role === 'admin' ? 'Attendance overview' : 'My attendance'}</b>

          </div>



          <div className="top-user">

            <span className="online-dot" />

            {user.email}

          </div>

        </header>



        {children}

      </main>

    </div>

  );

}



// IMPORTANT: Icon is already a JSX element, such as <Users />.

// Render it directly; do not use <Icon />.

function statCard(label, value, icon, foot) {

  return (

    <div className="stat-card" key={label}>

      <div className="stat-top">

        <span>{label}</span>

        <span className="stat-icon">{icon}</span>

      </div>



      <div className="stat-value">{value}</div>

      <div className="stat-foot">{foot}</div>

    </div>

  );

}



function Status({ status }) {

  const value = status || 'Unmarked';

  const cls = String(value).toLowerCase();



  return (

    <span className={`status status-${cls}`}>

      {value}

    </span>

  );

}



function AdminDashboard({ activePage }) {

  const [employees, setEmployees] = useState([]);

  const [month, setMonth] = useState(monthKey(new Date()));

  const [employeeId, setEmployeeId] = useState('');

  const [records, setRecords] = useState([]);

  const [summary, setSummary] = useState(null);

  const [error, setError] = useState('');

  const [notice, setNotice] = useState('');

  const [showForm, setShowForm] = useState(false);




  const [newEmp, setNewEmp] = useState({

    name: '',

    email: '',

    password: '',

    employeeCode: '',

    department: '',

  });



  const [mark, setMark] = useState({

    employeeId: '',

    date: dateKey(new Date()),

    status: 'Present',

    note: '',

  });



  async function loadEmployees() {

    const { data } = await api.get('/employees');

    const list = data.employees || [];



    setEmployees(list);



    setMark((current) => ({

      ...current,

      employeeId:

        current.employeeId ||

        list.find((employee) => employee.isActive !== false)?.id ||

        '',

    }));

  }



  async function load() {

    try {

      const params = { month };



      if (employeeId) {

        params.employeeId = employeeId;

      }



      const [recordsResponse, summaryResponse] =

        await Promise.all([

          api.get('/attendance', { params }),

          api.get('/attendance/summary', { params }),

        ]);



      setRecords(recordsResponse.data.records || []);

      setSummary(summaryResponse.data);

      setError('');

    } catch (error) {

      setError(errMsg(error));

    }

  }



  useEffect(() => {

    loadEmployees().catch((error) => setError(errMsg(error)));

  }, []);



  useEffect(() => {

    load();

  }, [month, employeeId]);



  async function createEmployee(event) {

    event.preventDefault();

    setError('');

    setNotice('');



    try {

      await api.post('/employees', newEmp);



      setNewEmp({

        name: '',

        email: '',

        password: '',

        employeeCode: '',

        department: '',

      });



      setShowForm(false);

      setNotice('Employee account created successfully.');



      await loadEmployees();

    } catch (error) {

      setError(errMsg(error));

    }

  }



  async function markAttendance(event) {

    event.preventDefault();

    setError('');

    setNotice('');



    try {

      await api.post('/attendance', mark);



      setNotice('Attendance saved successfully.');

      await load();

    } catch (error) {

      setError(errMsg(error));

    }

  }



  const activeEmployees = employees.filter(

    (employee) => employee.isActive !== false

  );



  return (

    <div className="page-content">

      <div className="page-heading">

        <div>

          <p className="eyebrow">ADMIN CONSOLE</p>

          <h1>{activePage === 'employees' ? 'Employee directory' : 'Attendance overview'}</h1>

          <p className="muted">

            {activePage === 'employees' ? 'View employee accounts and manage your team.' : 'Manage your team and keep daily attendance up to date.'}

          </p>

        </div>



        <button

          className="primary"

          onClick={() => setShowForm((shown) => !shown)}

        >

          <Plus size={17} />

          Add employee

        </button>

      </div>



      {error && <div className="alert error">{error}</div>}

      {notice && <div className="alert success">{notice}</div>}



      {showForm && (

        <section className="panel">

          <div className="panel-heading">

            <h2>Create employee account</h2>

          </div>



          <form className="form-grid" onSubmit={createEmployee}>

            {[

              ['name', 'Full name'],

              ['email', 'Email'],

              ['password', 'Temporary password'],

              ['employeeCode', 'Employee ID'],

              ['department', 'Department'],

            ].map(([key, label]) => (

              <label key={key}>

                {label}

                <input

                  required={['name', 'email', 'password'].includes(key)}

                  type={

                    key === 'email'

                      ? 'email'

                      : key === 'password'

                        ? 'password'

                        : 'text'

                  }

                  minLength={key === 'password' ? 8 : undefined}

                  value={newEmp[key]}

                  onChange={(event) =>

                    setNewEmp({

                      ...newEmp,

                      [key]: event.target.value,

                    })

                  }

                  placeholder={label}

                />

              </label>

            ))}



            <div className="form-actions">

              <button className="primary">Create employee</button>

              <button

                type="button"

                className="secondary"

                onClick={() => setShowForm(false)}

              >

                Cancel

              </button>

            </div>

          </form>

        </section>

      )}



      <div className="stats-grid">

        {statCard(

          'Team members',

          employees.length,

          <Users size={19} />,

          'Total employee accounts'

        )}



        {statCard(

          'Present days',

          summary?.present ?? 0,

          <ClipboardCheck size={19} />,

          `${month} reporting period`

        )}



        {statCard(

          'Absent days',

          summary?.absent ?? 0,

          <CalendarDays size={19} />,

          'Recorded absences'

        )}



        {statCard(

          'Attendance rate',

          `${summary?.attendancePercentage ?? 0}%`,

          <ShieldCheck size={19} />,

          'Present ÷ (present + absent)'

        )}

      </div>



      <section className="panel">

        <div className="panel-heading">

          <div>

            <h2>Mark attendance</h2>

            <p className="muted small-text">

              Select an employee, date and status. Saving again

              updates that date.

            </p>

          </div>

        </div>



        <form className="mark-grid" onSubmit={markAttendance}>

          <label>

            Employee

            <select

              required

              value={mark.employeeId}

              onChange={(event) =>

                setMark({ ...mark, employeeId: event.target.value })

              }

            >

              <option value="">Select employee</option>

              {activeEmployees.map((employee) => (

                <option key={employee.id} value={employee.id}>

                  {employee.name}

                  {employee.employeeCode

                    ? ` (${employee.employeeCode})`

                    : ''}

                </option>

              ))}

            </select>

          </label>



          <label>

            Date

            <input

              type="date"

              required

              value={mark.date}

              onChange={(event) =>

                setMark({ ...mark, date: event.target.value })

              }

            />

          </label>



          <label>

            Status

            <select

              value={mark.status}

              onChange={(event) =>

                setMark({ ...mark, status: event.target.value })

              }

            >

              <option>Present</option>

              <option>Absent</option>

              <option>Leave</option>

            </select>

          </label>



          <label>

            Note (optional)

            <input

              value={mark.note}

              onChange={(event) =>

                setMark({ ...mark, note: event.target.value })

              }

              placeholder="Reason or note"

            />

          </label>



          <button

            className="primary"

            disabled={activeEmployees.length === 0}

          >

            Save attendance

          </button>

        </form>

      </section>



      <section className="panel">

        <div className="panel-heading responsive-heading">

          <div>

            <h2>Attendance records</h2>

            <p className="muted small-text">

              Review records for the selected month.

            </p>

          </div>



          <div className="filters">

            <input

              type="month"

              value={month}

              onChange={(event) => setMonth(event.target.value)}

            />



            <select

              value={employeeId}

              onChange={(event) => setEmployeeId(event.target.value)}

            >

              <option value="">All employees</option>

              {employees.map((employee) => (

                <option key={employee.id} value={employee.id}>

                  {employee.name}

                </option>

              ))}

            </select>



            <button

              className="icon-btn"

              onClick={load}

              title="Refresh"

              type="button"

            >

              <RefreshCw size={16} />

            </button>

          </div>

        </div>



        <div className="table-wrap">

          <table>

            <thead>

              <tr>

                <th>Employee</th>

                <th>Date</th>

                <th>Department</th>

                <th>Status</th>

                <th>Note</th>

              </tr>

            </thead>



            <tbody>

              {records.map((record) => (

                <tr key={record._id}>

                  <td>

                    <div className="employee-cell">

                      <div className="avatar tiny">

                        {record.employee?.name?.[0]?.toUpperCase() || 'E'}

                      </div>

                      <div>

                        <b>{record.employee?.name || 'Employee'}</b>

                        <small>{record.employee?.email}</small>

                      </div>

                    </div>

                  </td>



                  <td>{record.date}</td>

                  <td>{record.employee?.department || '—'}</td>

                  <td><Status status={record.status} /></td>

                  <td>{record.note || '—'}</td>

                </tr>

              ))}



              {!records.length && (

                <tr>

                  <td colSpan="5" className="empty">

                    No attendance records for this month yet.

                  </td>

                </tr>

              )}

            </tbody>

          </table>

        </div>

      </section>



      <section className="panel">

        <div className="panel-heading">

          <div>

            <h2 id="employee-directory">Employee directory</h2>

            <p className="muted small-text">

              Employee accounts and assigned departments.

            </p>

          </div>

        </div>



        <div className="table-wrap">

          <table>

            <thead>

              <tr>

                <th>Name</th>

                <th>Employee ID</th>

                <th>Email</th>

                <th>Department</th>

                <th>Account</th>

              </tr>

            </thead>



            <tbody>

              {employees.map((employee) => (

                <tr key={employee.id}>

                  <td><b>{employee.name}</b></td>

                  <td>{employee.employeeCode || '—'}</td>

                  <td>{employee.email}</td>

                  <td>{employee.department || '—'}</td>

                  <td>

                    <Status

                      status={

                        employee.isActive === false

                          ? 'Inactive'

                          : 'Active'

                      }

                    />

                  </td>

                </tr>

              ))}



              {!employees.length && (

                <tr>

                  <td colSpan="5" className="empty">

                    No employees yet. Add your first employee above.

                  </td>

                </tr>

              )}

            </tbody>

          </table>

        </div>

      </section>

    </div>

  );

}



function EmployeeDashboard({ user }) {

  const [month, setMonth] = useState(monthKey(new Date()));

  const [records, setRecords] = useState([]);

  const [summary, setSummary] = useState(null);

  const [error, setError] = useState('');

  const [activeDate, setActiveDate] = useState(new Date());



  async function load() {

    try {

      const [calendarResponse, summaryResponse] =

        await Promise.all([

          api.get('/attendance/calendar', {

            params: { month },

          }),

          api.get('/attendance/summary', {

            params: { month },

          }),

        ]);



      setRecords(calendarResponse.data.records || []);

      setSummary(summaryResponse.data);

      setError('');

    } catch (error) {

      setError(errMsg(error));

    }

  }



  useEffect(() => {

    load();

  }, [month]);



  const byDate = useMemo(

    () =>

      Object.fromEntries(

        records.map((record) => [record.date, record])

      ),

    [records]

  );



  const tileClassName = ({ date, view }) => {

    if (view !== 'month') return null;



    const record = byDate[dateKey(date)];



    return record

      ? `calendar-${record.status.toLowerCase()}`

      : null;

  };



  const tileContent = ({ date, view }) => {

    if (view !== 'month') return null;



    const record = byDate[dateKey(date)];



    return record ? (

      <span

        className={`calendar-dot dot-${record.status.toLowerCase()}`}

        title={record.status}

      />

    ) : null;

  };



  const selected = byDate[dateKey(activeDate)];



  return (

    <div className="page-content">

      <div className="page-heading">

        <div>

          <p className="eyebrow">EMPLOYEE WORKSPACE</p>

          <h1>My attendance</h1>

          <p className="muted">

            Hi {user.name}, here is your attendance summary.

          </p>

        </div>



        <div className="month-control">

          <CalendarDays size={17} />

          <input

            type="month"

            value={month}

            onChange={(event) => {

              const nextMonth = event.target.value;



              if (nextMonth) {

                setMonth(nextMonth);

                setActiveDate(

                  new Date(`${nextMonth}-01T12:00:00`)

                );

              }

            }}

          />

        </div>

      </div>



      {error && <div className="alert error">{error}</div>}



      <div className="stats-grid employee-stats">

        {statCard(

          'Present days',

          summary?.present ?? 0,

          <ClipboardCheck size={19} />,

          'Marked present'

        )}



        {statCard(

          'Absent days',

          summary?.absent ?? 0,

          <CalendarDays size={19} />,

          'Marked absent'

        )}



        {statCard(

          'Leave days',

          summary?.leave ?? 0,

          <UserRound size={19} />,

          'Approved/recorded leave'

        )}



        {statCard(

          'Attendance rate',

          `${summary?.attendancePercentage ?? 0}%`,

          <ShieldCheck size={19} />,

          'Present ÷ (present + absent)'

        )}

      </div>



      <div className="calendar-layout">

        <section className="panel calendar-panel">

          <div className="panel-heading">

            <div>

              <h2>Attendance calendar</h2>

              <p className="muted small-text">

                Choose a date to see its attendance status.

              </p>

            </div>

          </div>



          <Calendar

            value={activeDate}

            onActiveStartDateChange={({ activeStartDate }) => {

              if (activeStartDate) {

                const nextMonth = monthKey(activeStartDate);



                if (nextMonth !== month) {

                  setMonth(nextMonth);

                }

              }

            }}

            onChange={setActiveDate}

            tileClassName={tileClassName}

            tileContent={tileContent}

          />

        </section>



        <section className="panel calendar-details">

          <h2>Calendar legend</h2>



          <div className="legend-row">

            <span className="legend-swatch present" />

            <span>Present</span>

            <b>{summary?.present ?? 0}</b>

          </div>



          <div className="legend-row">

            <span className="legend-swatch absent" />

            <span>Absent</span>

            <b>{summary?.absent ?? 0}</b>

          </div>



          <div className="legend-row">

            <span className="legend-swatch leave" />

            <span>Leave</span>

            <b>{summary?.leave ?? 0}</b>

          </div>



          <div className="selected-date">

            <span className="eyebrow">SELECTED DATE</span>



            <h3>

              {activeDate.toLocaleDateString(undefined, {

                weekday: 'long',

                month: 'short',

                day: 'numeric',

                year: 'numeric',

              })}

            </h3>



            {selected ? (

              <Status status={selected.status} />

            ) : (

              <span className="status status-unmarked">

                Not marked

              </span>

            )}



            {selected?.note && (

              <p className="muted">{selected.note}</p>

            )}

          </div>



          <div className="percentage-box">

            <span>Monthly attendance</span>

            <strong>

              {summary?.attendancePercentage ?? 0}%

            </strong>



            <div className="progress">

              <span

                style={{

                  width: `${Math.min(

                    100,

                    summary?.attendancePercentage ?? 0

                  )}%`,

                }}

              />

            </div>



            <small>

              Based on days marked Present or Absent.

            </small>

          </div>

        </section>

      </div>



      <section className="panel">

        <div className="panel-heading">

          <div>

            <h2>Recent attendance</h2>

            <p className="muted small-text">

              Your latest marked days for this month.

            </p>

          </div>

        </div>



        <div className="table-wrap">

          <table>

            <thead>

              <tr>

                <th>Date</th>

                <th>Status</th>

                <th>Note</th>

              </tr>

            </thead>



            <tbody>

              {[...records]

                .sort((a, b) => b.date.localeCompare(a.date))

                .slice(0, 8)

                .map((record) => (

                  <tr key={record.date}>

                    <td>{record.date}</td>

                    <td><Status status={record.status} /></td>

                    <td>{record.note || '—'}</td>

                  </tr>

                ))}



              {!records.length && (

                <tr>

                  <td colSpan="3" className="empty">

                    No attendance has been recorded for this month.

                  </td>

                </tr>

              )}

            </tbody>

          </table>

        </div>

      </section>

    </div>

  );

}



export default App;
