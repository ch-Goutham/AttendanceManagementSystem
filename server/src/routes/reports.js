import { Router } from 'express';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { getAttendanceConfig, publicAttendanceConfig } from '../config/attendance.js';
import {
  attendancePercentage,
  monthKey,
  serializeAttendance,
  workingDaysInMonth,
} from '../utils/attendanceRules.js';

const router = Router();
router.use(protect, adminOnly);

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function todayMonth() {
  return monthKey(new Date());
}

function employeeShape(employee) {
  if (!employee) return null;
  return {
    id: String(employee._id),
    name: employee.name,
    email: employee.email,
    employeeCode: employee.employeeCode,
    department: employee.department,
    isActive: employee.isActive,
  };
}

function summarize(employee, records) {
  const presentRecords = records.filter((record) => record.status === 'Present');
  const halfDays = presentRecords.filter((record) => record.dayType === 'Half day').length;
  const fullDays = presentRecords.length - halfDays;
  const weightedPresent = presentRecords.reduce((sum, record) => sum + record.dayWeight, 0);
  const absent = records.filter((record) => record.status === 'Absent').length;

  return {
    employee: employeeShape(employee),
    recordedDays: records.length,
    presentDays: presentRecords.length,
    fullDays,
    halfDays,
    weightedPresent: Math.round(weightedPresent * 100) / 100,
    absent,
    leave: records.filter((record) => record.status === 'Leave').length,
    late: presentRecords.filter((record) => record.late).length,
    earlyCheckout: presentRecords.filter((record) => record.earlyCheckout).length,
    attendancePercentage: attendancePercentage(weightedPresent, absent),
  };
}

function addTotals(rows) {
  const totals = rows.reduce(
    (acc, row) => ({
      recordedDays: acc.recordedDays + row.recordedDays,
      presentDays: acc.presentDays + row.presentDays,
      fullDays: acc.fullDays + row.fullDays,
      halfDays: acc.halfDays + row.halfDays,
      weightedPresent: acc.weightedPresent + row.weightedPresent,
      absent: acc.absent + row.absent,
      leave: acc.leave + row.leave,
      late: acc.late + row.late,
      earlyCheckout: acc.earlyCheckout + row.earlyCheckout,
    }),
    {
      recordedDays: 0,
      presentDays: 0,
      fullDays: 0,
      halfDays: 0,
      weightedPresent: 0,
      absent: 0,
      leave: 0,
      late: 0,
      earlyCheckout: 0,
    }
  );
  totals.weightedPresent = Math.round(totals.weightedPresent * 100) / 100;
  totals.attendancePercentage = attendancePercentage(totals.weightedPresent, totals.absent);
  return totals;
}

async function buildReport({ month: requestedMonth, employeeId }) {
  const month = MONTH_PATTERN.test(requestedMonth || '') ? requestedMonth : todayMonth();
  const config = getAttendanceConfig();
  const start = `${month}-01`;
  const end = `${month}-31`;

  let employees;
  if (employeeId) {
    if (!mongoose.isValidObjectId(employeeId)) throw httpError(400, 'Invalid employeeId');
    const employee = await User.findOne({ _id: employeeId, role: 'employee' });
    if (!employee) throw httpError(404, 'Employee not found');
    employees = [employee];
  } else {
    employees = await User.find({ role: 'employee' }).sort({ name: 1 });
  }

  const records = employees.length
    ? await Attendance.find({
        employee: { $in: employees.map((employee) => employee._id) },
        date: { $gte: start, $lte: end },
      }).sort({ date: 1 })
    : [];

  const byEmployee = new Map(employees.map((employee) => [String(employee._id), []]));
  records.forEach((record) => {
    const bucket = byEmployee.get(String(record.employee));
    if (bucket) bucket.push(serializeAttendance(record, config));
  });

  const rows = employees.map((employee) =>
    summarize(employee, byEmployee.get(String(employee._id)) || [])
  );
  const totals = addTotals(rows);

  const days = employeeId
    ? (byEmployee.get(String(employees[0]._id)) || []).map((record) => ({
        date: record.date,
        status: record.status,
        checkIn: record.checkIn,
        checkOut: record.checkOut,
        hours: record.hours,
        hoursLabel: record.hoursLabel,
        dayType: record.dayType,
        late: record.late,
        earlyCheckout: record.earlyCheckout,
        note: record.note,
      }))
    : [];

  return {
    meta: {
      month,
      scope: employeeId ? 'individual' : 'team',
      employee: employeeId ? employeeShape(employees[0]) : null,
      workingDays: workingDaysInMonth(month, config),
      generatedAt: new Date().toISOString(),
      config: publicAttendanceConfig(),
    },
    rows,
    totals,
    days,
  };
}

function fileName(report, extension) {
  const slug = report.meta.employee
    ? report.meta.employee.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    : 'team';
  const scope = report.meta.employee ? `employee-${slug || 'record'}` : 'team';
  return `attendance-${report.meta.month}-${scope}.${extension}`;
}

/* --------------------------------- Excel --------------------------------- */

const EXCEL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7EF' } };
const EXCEL_HEADER_FONT = { bold: true, color: { argb: 'FF177B48' }, size: 10 };
const EXCEL_BORDER = { style: 'thin', color: { argb: 'FFE8EDF4' } };

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = EXCEL_FILL;
    cell.font = EXCEL_HEADER_FONT;
    cell.border = { top: EXCEL_BORDER, left: EXCEL_BORDER, bottom: EXCEL_BORDER, right: EXCEL_BORDER };
    cell.alignment = { vertical: 'middle' };
  });
  row.height = 22;
}

function styleDataRow(row) {
  row.eachCell((cell) => {
    cell.border = { bottom: EXCEL_BORDER };
    cell.alignment = { vertical: 'middle' };
  });
}

async function buildExcel(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Attendwise';
  workbook.created = new Date();

  const individual = report.meta.scope === 'individual';
  const sheet = workbook.addWorksheet(individual ? 'Employee report' : `Attendance ${report.meta.month}`);
  const lastColumn = individual ? 'I' : 'K';

  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.getCell('A1').value = individual
    ? `Attendance report — ${report.meta.employee.name}`
    : `Attendance report — ${report.meta.month}`;
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1C2638' } };
  sheet.getCell('A1').alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.getCell('A2').value =
    `Working days: ${report.meta.workingDays}   ·   Shift: ${report.meta.config.shiftStart}–${report.meta.config.shiftEnd}` +
    `   ·   Grace: ${report.meta.config.graceMinutes} min   ·   Generated: ${new Date(
      report.meta.generatedAt
    ).toLocaleString()}`;
  sheet.getCell('A2').font = { size: 9, color: { argb: 'FF7C8799' } };

  if (individual) {
    const header = sheet.addRow([
      'Date',
      'Status',
      'Check in',
      'Check out',
      'Hours',
      'Day type',
      'Late',
      'Early out',
      'Note',
    ]);
    styleHeaderRow(header);

    report.days.forEach((day) => {
      const row = sheet.addRow([
        day.date,
        day.status,
        day.checkIn || '—',
        day.checkOut || '—',
        day.hoursLabel,
        day.status === 'Present' ? day.dayType : '—',
        day.late ? 'Yes' : 'No',
        day.earlyCheckout ? 'Yes' : 'No',
        day.note || '',
      ]);
      styleDataRow(row);
    });

    const totalRow = sheet.addRow([
      'Total',
      `${report.totals.presentDays} present`,
      '',
      '',
      '',
      `${report.totals.fullDays} full / ${report.totals.halfDays} half`,
      report.totals.late,
      report.totals.earlyCheckout,
      `${report.totals.absent} absent · ${report.totals.leave} leave · ${report.totals.attendancePercentage}%`,
    ]);
    totalRow.font = { bold: true };
    styleDataRow(totalRow);

    sheet.columns = [
      { width: 14 },
      { width: 13 },
      { width: 11 },
      { width: 11 },
      { width: 11 },
      { width: 17 },
      { width: 8 },
      { width: 10 },
      { width: 42 },
    ];
  } else {
    const header = sheet.addRow([
      'Employee',
      'Code',
      'Department',
      'Present days',
      'Full days',
      'Half days',
      'Absent',
      'Leave',
      'Late',
      'Early out',
      'Attendance %',
    ]);
    styleHeaderRow(header);

    report.rows.forEach((row) => {
      const dataRow = sheet.addRow([
        row.employee.name,
        row.employee.employeeCode || '—',
        row.employee.department || '—',
        row.weightedPresent,
        row.fullDays,
        row.halfDays,
        row.absent,
        row.leave,
        row.late,
        row.earlyCheckout,
        row.attendancePercentage,
      ]);
      styleDataRow(dataRow);
      dataRow.getCell(11).numFmt = '0.00"%"';
    });

    const totalsRow = sheet.addRow([
      'Team total',
      '',
      '',
      report.totals.weightedPresent,
      report.totals.fullDays,
      report.totals.halfDays,
      report.totals.absent,
      report.totals.leave,
      report.totals.late,
      report.totals.earlyCheckout,
      report.totals.attendancePercentage,
    ]);
    totalsRow.font = { bold: true };
    styleDataRow(totalsRow);
    totalsRow.getCell(11).numFmt = '0.00"%"';

    sheet.columns = [
      { width: 26 },
      { width: 12 },
      { width: 18 },
      { width: 14 },
      { width: 11 },
      { width: 11 },
      { width: 10 },
      { width: 10 },
      { width: 8 },
      { width: 10 },
      { width: 13 },
    ];
  }

  sheet.views = [{ state: 'frozen', ySplit: 3 }];
  return workbook.xlsx.writeBuffer();
}

/* ---------------------------------- PDF ---------------------------------- */

const PDF_MARGIN = 30;
const PDF_ROW = 19;

function pdfColumns(report) {
  if (report.meta.scope === 'individual') {
    return [
      { label: 'Date', width: 68, value: (row) => row.date },
      { label: 'Status', width: 64, value: (row) => row.status },
      { label: 'In', width: 52, value: (row) => row.checkIn || '—' },
      { label: 'Out', width: 52, value: (row) => row.checkOut || '—' },
      { label: 'Hours', width: 56, value: (row) => row.hoursLabel },
      { label: 'Day type', width: 64, value: (row) => (row.status === 'Present' ? row.dayType : '—') },
      { label: 'Late', width: 42, value: (row) => (row.late ? 'Yes' : 'No') },
      { label: 'Early', width: 44, value: (row) => (row.earlyCheckout ? 'Yes' : 'No') },
      { label: 'Note', width: 304, value: (row) => row.note || '' },
    ];
  }
  return [
    { label: 'Employee', width: 150, value: (row) => row.employee.name },
    { label: 'Code', width: 60, value: (row) => row.employee.employeeCode || '—' },
    { label: 'Department', width: 92, value: (row) => row.employee.department || '—' },
    { label: 'Present', width: 55, value: (row) => row.weightedPresent },
    { label: 'Half', width: 42, value: (row) => row.halfDays },
    { label: 'Absent', width: 50, value: (row) => row.absent },
    { label: 'Leave', width: 45, value: (row) => row.leave },
    { label: 'Late', width: 40, value: (row) => row.late },
    { label: 'Early', width: 42, value: (row) => row.earlyCheckout },
    { label: 'Attendance %', width: 78, value: (row) => `${row.attendancePercentage}%` },
    { label: 'Working days', width: 70, value: () => report.meta.workingDays },
  ];
}

function drawPdfTable(doc, columns, rows, startY, totalRow) {
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const headerFill = '#eaf7ef';
  const line = '#e8edf4';

  const drawHeader = () => {
    doc.rect(PDF_MARGIN, startY, tableWidth, PDF_ROW).fill(headerFill);
    doc.fillColor('#177b48').font('Helvetica-Bold').fontSize(8);
    let x = PDF_MARGIN;
    columns.forEach((column) => {
      doc.text(column.label, x + 4, startY + 5, {
        width: column.width - 8,
        height: PDF_ROW - 4,
        ellipsis: true,
        lineBreak: false,
      });
      x += column.width;
    });
    return startY + PDF_ROW;
  };

  let y = drawHeader();
  doc.font('Helvetica');

  const writeRow = (row, bold = false) => {
    if (y + PDF_ROW > doc.page.height - 36) {
      doc.addPage();
      startY = 30;
      y = drawHeader();
    }
    doc.fillColor('#334155').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    let x = PDF_MARGIN;
    columns.forEach((column) => {
      const raw = column.value(row);
      doc.text(String(raw ?? '—'), x + 4, y + 5, {
        width: column.width - 8,
        height: PDF_ROW - 4,
        ellipsis: true,
        lineBreak: false,
      });
      x += column.width;
    });
    doc.moveTo(PDF_MARGIN, y + PDF_ROW).lineTo(PDF_MARGIN + tableWidth, y + PDF_ROW)
      .strokeColor(line).lineWidth(0.5).stroke();
    y += PDF_ROW;
  };

  rows.forEach((row) => writeRow(row));
  if (totalRow) writeRow(totalRow, true);

  return y;
}

function renderPdf(doc, report) {
  const individual = report.meta.scope === 'individual';
  doc.fillColor('#1c2638').font('Helvetica-Bold').fontSize(18);
  doc.text(
    individual
      ? `Attendance report — ${report.meta.employee.name}`
      : `Attendance report — ${report.meta.month}`,
    PDF_MARGIN,
    26
  );

  doc.fillColor('#7c8799').font('Helvetica').fontSize(9);
  doc.text(
    `Working days: ${report.meta.workingDays}   ·   Shift: ${report.meta.config.shiftStart}–${report.meta.config.shiftEnd}` +
      `   ·   Grace: ${report.meta.config.graceMinutes} min   ·   Generated: ${new Date(
        report.meta.generatedAt
      ).toLocaleString()}`,
    PDF_MARGIN,
    50
  );

  const columns = pdfColumns(report);
  const rows = individual ? report.days : report.rows;
  const totalRow = individual
    ? {
        date: 'Total',
        status: `${report.totals.presentDays} present`,
        checkIn: '',
        checkOut: '',
        hoursLabel: '',
        dayType: `${report.totals.fullDays} full / ${report.totals.halfDays} half`,
        late: report.totals.late,
        earlyCheckout: report.totals.earlyCheckout,
        note: `${report.totals.absent} absent · ${report.totals.leave} leave · ${report.totals.attendancePercentage}% attendance`,
      }
    : {
        employee: { name: 'Team total', employeeCode: '', department: '' },
        weightedPresent: report.totals.weightedPresent,
        halfDays: report.totals.halfDays,
        absent: report.totals.absent,
        leave: report.totals.leave,
        late: report.totals.late,
        earlyCheckout: report.totals.earlyCheckout,
        attendancePercentage: report.totals.attendancePercentage,
      };

  const endY = drawPdfTable(doc, columns, rows, 72, totalRow);

  doc.fillColor('#98a2b2').font('Helvetica').fontSize(8);
  doc.text(
    'Half days count as 0.5 present days. Leave and non-working days are excluded from the attendance percentage.',
    PDF_MARGIN,
    Math.min(endY + 14, doc.page.height - 30),
    { width: columns.reduce((sum, column) => sum + column.width, 0) }
  );
}

/* --------------------------------- Routes -------------------------------- */

router.get('/attendance', async (req, res, next) => {
  try {
    res.json(await buildReport(req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/attendance.xlsx', async (req, res, next) => {
  try {
    const report = await buildReport(req.query);
    const buffer = await buildExcel(report);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName(report, 'xlsx')}"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
});

router.get('/attendance.pdf', async (req, res, next) => {
  try {
    const report = await buildReport(req.query);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName(report, 'pdf')}"`);

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: PDF_MARGIN,
      info: {
        Title: `Attendance report ${report.meta.month}`,
        Author: 'Attendwise',
      },
    });
    doc.pipe(res);
    renderPdf(doc, report);
    doc.end();
  } catch (error) {
    next(error);
  }
});

export default router;
