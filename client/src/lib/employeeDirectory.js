import api from '../api';

// The employee directory changes rarely, but four admin screens need it. A
// short-lived module cache keeps page switches from re-fetching it while
// still picking up edits after the TTL (or when a mutation clears it).
const TTL_MS = 5 * 60 * 1000;

let items = null;
let fetchedAt = 0;
let inFlight = null;

export function isEmployeeCacheFresh() {
  return Boolean(items) && Date.now() - fetchedAt < TTL_MS;
}

export async function getEmployees({ force = false } = {}) {
  if (!force && isEmployeeCacheFresh()) return items;
  if (!force && inFlight) return inFlight;

  inFlight = api
    .get('/employees')
    .then(({ data }) => {
      items = (data.employees || []).filter((employee) => employee.role === 'employee');
      fetchedAt = Date.now();
      return items;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function clearEmployeeCache() {
  items = null;
  fetchedAt = 0;
  inFlight = null;
}

/** Update the cached row after a successful inline edit. */
export function patchCachedEmployee(employee) {
  if (!items || !employee?.id) return;
  items = items.map((row) => (row.id === employee.id ? { ...row, ...employee } : row));
}
