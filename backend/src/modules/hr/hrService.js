// Module RH - hrService.js (ESM)
import { supabase } from '../../config/supabase.js';

// ==================== EMPLOYÉS ====================

export async function getEmployees(tenantId, filters = {}) {
  let query = supabase
    .from('hr_employees')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('last_name', { ascending: true });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.department) query = query.eq('department', filters.department);
  if (filters.contract_type) query = query.eq('contract_type', filters.contract_type);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getEmployeeById(tenantId, employeeId) {
  const { data, error } = await supabase
    .from('hr_employees')
    .select('*')
    .eq('id', employeeId)
    .eq('tenant_id', tenantId)
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function createEmployee(tenantId, data) {
  const { first_name, last_name, hire_date, contract_type, position, gross_salary } = data;
  if (!first_name || !last_name || !hire_date || !contract_type || !position || gross_salary === undefined) {
    return { success: false, error: 'Champs obligatoires manquants: first_name, last_name, hire_date, contract_type, position, gross_salary' };
  }

  const { data: employee, error } = await supabase
    .from('hr_employees')
    .insert({
      tenant_id: tenantId,
      first_name, last_name,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      birth_date: data.birth_date || null,
      hire_date,
      contract_type,
      contract_end_date: data.contract_end_date || null,
      position,
      department: data.department || null,
      manager_id: data.manager_id || null,
      gross_salary,
      salary_period: data.salary_period || 'monthly',
      weekly_hours: data.weekly_hours || 35,
      notes: data.notes || null,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };

  // Init leave balances for current year
  const year = new Date().getFullYear();
  const monthsWorked = Math.max(1, Math.ceil((new Date() - new Date(hire_date)) / (30 * 24 * 60 * 60 * 1000)));
  const earnedCP = Math.min(monthsWorked * 2.5, 30);

  await supabase.from('hr_leave_balances').insert([
    { tenant_id: tenantId, employee_id: employee.id, year, type: 'paid_leave', earned: earnedCP, taken: 0, balance: earnedCP },
    { tenant_id: tenantId, employee_id: employee.id, year, type: 'rtt', earned: 10, taken: 0, balance: 10 },
  ]);

  return { success: true, data: employee };
}

export async function updateEmployee(tenantId, employeeId, data) {
  const updates = {};
  const fields = ['first_name', 'last_name', 'email', 'phone', 'address', 'birth_date',
    'contract_type', 'contract_end_date', 'position', 'department', 'manager_id',
    'gross_salary', 'salary_period', 'weekly_hours', 'status', 'notes', 'photo_url'];
  for (const f of fields) {
    if (data[f] !== undefined) updates[f] = data[f];
  }
  updates.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from('hr_employees')
    .update(updates)
    .eq('id', employeeId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: updated };
}

export async function deleteEmployee(tenantId, employeeId) {
  const { error } = await supabase
    .from('hr_employees')
    .delete()
    .eq('id', employeeId)
    .eq('tenant_id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true, message: 'Employé supprimé' };
}

export async function terminateEmployee(tenantId, employeeId, reason) {
  const { data, error } = await supabase
    .from('hr_employees')
    .update({
      status: 'terminated',
      termination_date: new Date().toISOString().split('T')[0],
      termination_reason: reason || 'Non spécifié',
      updated_at: new Date().toISOString(),
    })
    .eq('id', employeeId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ==================== DOCUMENTS ====================

export async function getEmployeeDocuments(tenantId, employeeId) {
  const { data, error } = await supabase
    .from('hr_documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('employee_id', employeeId)
    .order('uploaded_at', { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function uploadDocument(tenantId, employeeId, data) {
  const { type, name } = data;
  if (!type || !name) return { success: false, error: 'type et name requis' };

  const file_url = data.file_url || `/documents/hr/${employeeId}/${Date.now()}_${name}`;

  const { data: doc, error } = await supabase
    .from('hr_documents')
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      type, name, file_url,
      notes: data.notes || null,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: doc };
}

export async function deleteDocument(tenantId, documentId) {
  const { error } = await supabase
    .from('hr_documents')
    .delete()
    .eq('id', documentId)
    .eq('tenant_id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true, message: 'Document supprimé' };
}

// ==================== PLANNING / SHIFTS ====================

export async function getShifts(tenantId, filters = {}) {
  let query = supabase
    .from('hr_shifts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('shift_date', { ascending: true });

  if (filters.employee_id) query = query.eq('employee_id', filters.employee_id);
  if (filters.start_date) query = query.gte('shift_date', filters.start_date);
  if (filters.end_date) query = query.lte('shift_date', filters.end_date);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function createShift(tenantId, data) {
  const { employee_id, shift_date, start_time, end_time } = data;
  if (!employee_id || !shift_date || !start_time || !end_time) {
    return { success: false, error: 'employee_id, shift_date, start_time, end_time requis' };
  }

  const { data: shift, error } = await supabase
    .from('hr_shifts')
    .insert({
      tenant_id: tenantId,
      employee_id, shift_date, start_time, end_time,
      break_minutes: data.break_minutes || 0,
      location: data.location || null,
      notes: data.notes || null,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: shift };
}

export async function updateShift(tenantId, shiftId, data) {
  const updates = {};
  const fields = ['shift_date', 'start_time', 'end_time', 'break_minutes', 'location', 'notes', 'status'];
  for (const f of fields) {
    if (data[f] !== undefined) updates[f] = data[f];
  }

  const { data: updated, error } = await supabase
    .from('hr_shifts')
    .update(updates)
    .eq('id', shiftId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: updated };
}

export async function deleteShift(tenantId, shiftId) {
  const { error } = await supabase
    .from('hr_shifts')
    .delete()
    .eq('id', shiftId)
    .eq('tenant_id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true, message: 'Shift supprimé' };
}

export async function getWeeklySchedule(tenantId, startDate) {
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const { data, error } = await supabase
    .from('hr_shifts')
    .select('*, hr_employees(first_name, last_name)')
    .eq('tenant_id', tenantId)
    .gte('shift_date', start.toISOString().split('T')[0])
    .lte('shift_date', end.toISOString().split('T')[0])
    .order('shift_date', { ascending: true });
  if (error) return { success: false, error: error.message };

  // Group by day
  const schedule = {};
  for (let d = 0; d < 7; d++) {
    const day = new Date(start);
    day.setDate(day.getDate() + d);
    const key = day.toISOString().split('T')[0];
    schedule[key] = (data || []).filter(s => s.shift_date === key);
  }

  return { success: true, data: { start_date: start.toISOString().split('T')[0], end_date: end.toISOString().split('T')[0], schedule } };
}

// ==================== POINTAGES ====================

export async function clockIn(tenantId, employeeId) {
  const { data, error } = await supabase
    .from('hr_timeclock')
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      clock_in: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function clockOut(tenantId, timeclockId) {
  const clockOut = new Date();

  // Get record
  const { data: record, error: fetchError } = await supabase
    .from('hr_timeclock')
    .select('*')
    .eq('id', timeclockId)
    .eq('tenant_id', tenantId)
    .single();
  if (fetchError) return { success: false, error: fetchError.message };
  if (record.clock_out) return { success: false, error: 'Déjà pointé en sortie' };

  const totalMs = clockOut - new Date(record.clock_in);
  const breakMs = record.break_end && record.break_start
    ? new Date(record.break_end) - new Date(record.break_start)
    : 0;
  const totalHours = ((totalMs - breakMs) / (1000 * 60 * 60)).toFixed(2);

  const { data, error } = await supabase
    .from('hr_timeclock')
    .update({ clock_out: clockOut.toISOString(), total_hours: parseFloat(totalHours) })
    .eq('id', timeclockId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function startBreak(tenantId, timeclockId) {
  const { data, error } = await supabase
    .from('hr_timeclock')
    .update({ break_start: new Date().toISOString() })
    .eq('id', timeclockId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function endBreak(tenantId, timeclockId) {
  const { data, error } = await supabase
    .from('hr_timeclock')
    .update({ break_end: new Date().toISOString() })
    .eq('id', timeclockId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getTimeclockRecords(tenantId, filters = {}) {
  let query = supabase
    .from('hr_timeclock')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('clock_in', { ascending: false });

  if (filters.employee_id) query = query.eq('employee_id', filters.employee_id);
  if (filters.start_date) query = query.gte('clock_in', filters.start_date);
  if (filters.end_date) query = query.lte('clock_in', filters.end_date);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function approveTimeclock(tenantId, timeclockId, approverId) {
  const { data, error } = await supabase
    .from('hr_timeclock')
    .update({ approved_by: approverId, approved_at: new Date().toISOString() })
    .eq('id', timeclockId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ==================== CONGÉS ====================

export async function getLeaves(tenantId, filters = {}) {
  let query = supabase
    .from('hr_leaves')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('requested_at', { ascending: false });

  if (filters.employee_id) query = query.eq('employee_id', filters.employee_id);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.type) query = query.eq('type', filters.type);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function requestLeave(tenantId, data) {
  const { employee_id, type, start_date, end_date, days_count } = data;
  if (!employee_id || !type || !start_date || !end_date || !days_count) {
    return { success: false, error: 'employee_id, type, start_date, end_date, days_count requis' };
  }

  const { data: leave, error } = await supabase
    .from('hr_leaves')
    .insert({
      tenant_id: tenantId,
      employee_id, type, start_date, end_date,
      days_count,
      reason: data.reason || null,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: leave };
}

export async function approveLeave(tenantId, leaveId, reviewerId) {
  // Get leave details
  const { data: leave, error: fetchError } = await supabase
    .from('hr_leaves')
    .select('*')
    .eq('id', leaveId)
    .eq('tenant_id', tenantId)
    .single();
  if (fetchError) return { success: false, error: fetchError.message };
  if (leave.status !== 'pending') return { success: false, error: 'Congé non en attente' };

  // Update leave status
  const { data: updated, error } = await supabase
    .from('hr_leaves')
    .update({ status: 'approved', reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq('id', leaveId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };

  // Update balance if paid_leave or rtt
  if (leave.type === 'paid_leave' || leave.type === 'rtt') {
    const year = new Date(leave.start_date).getFullYear();
    const { data: bal } = await supabase
      .from('hr_leave_balances')
      .select('*')
      .eq('employee_id', leave.employee_id)
      .eq('year', year)
      .eq('type', leave.type)
      .single();

    if (bal) {
      const newTaken = parseFloat(bal.taken) + parseFloat(leave.days_count);
      const newBalance = parseFloat(bal.earned) - newTaken;
      await supabase
        .from('hr_leave_balances')
        .update({ taken: newTaken, balance: newBalance, updated_at: new Date().toISOString() })
        .eq('id', bal.id);
    }
  }

  return { success: true, data: updated };
}

export async function rejectLeave(tenantId, leaveId, reviewerId, notes) {
  const { data, error } = await supabase
    .from('hr_leaves')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
    })
    .eq('id', leaveId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function cancelLeave(tenantId, leaveId) {
  // Get leave
  const { data: leave } = await supabase
    .from('hr_leaves')
    .select('*')
    .eq('id', leaveId)
    .eq('tenant_id', tenantId)
    .single();

  const { data, error } = await supabase
    .from('hr_leaves')
    .update({ status: 'cancelled' })
    .eq('id', leaveId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };

  // Restore balance if was approved
  if (leave && leave.status === 'approved' && (leave.type === 'paid_leave' || leave.type === 'rtt')) {
    const year = new Date(leave.start_date).getFullYear();
    const { data: bal } = await supabase
      .from('hr_leave_balances')
      .select('*')
      .eq('employee_id', leave.employee_id)
      .eq('year', year)
      .eq('type', leave.type)
      .single();
    if (bal) {
      const newTaken = Math.max(0, parseFloat(bal.taken) - parseFloat(leave.days_count));
      const newBalance = parseFloat(bal.earned) - newTaken;
      await supabase.from('hr_leave_balances').update({ taken: newTaken, balance: newBalance }).eq('id', bal.id);
    }
  }

  return { success: true, data };
}

export async function getLeaveBalance(tenantId, employeeId, year) {
  const y = year || new Date().getFullYear();
  const { data, error } = await supabase
    .from('hr_leave_balances')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('year', y);
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function updateLeaveBalance(tenantId, employeeId, year, type, days) {
  const { data: existing } = await supabase
    .from('hr_leave_balances')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('year', year)
    .eq('type', type)
    .single();

  if (existing) {
    const newEarned = parseFloat(days);
    const newBalance = newEarned - parseFloat(existing.taken);
    const { data, error } = await supabase
      .from('hr_leave_balances')
      .update({ earned: newEarned, balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } else {
    const { data, error } = await supabase
      .from('hr_leave_balances')
      .insert({ tenant_id: tenantId, employee_id: employeeId, year, type, earned: days, taken: 0, balance: days })
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }
}

// ==================== PAIE ====================

export async function getPayslips(tenantId, filters = {}) {
  let query = supabase
    .from('hr_payslips')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });

  if (filters.employee_id) query = query.eq('employee_id', filters.employee_id);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.month) query = query.eq('period_month', filters.month);
  if (filters.year) query = query.eq('period_year', filters.year);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function generatePayslip(tenantId, employeeId, month, year) {
  // Get employee
  const { data: emp, error: empError } = await supabase
    .from('hr_employees')
    .select('*')
    .eq('id', employeeId)
    .eq('tenant_id', tenantId)
    .single();
  if (empError) return { success: false, error: empError.message };

  const grossSalary = parseFloat(emp.gross_salary);
  const socialCharges = Math.round(grossSalary * 0.22 * 100) / 100;
  const incomeTax = Math.round((grossSalary - socialCharges) * 0.075 * 100) / 100;
  const netSalary = Math.round((grossSalary - socialCharges - incomeTax) * 100) / 100;

  // Get hours from timeclock for this month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  const { data: timeRecords } = await supabase
    .from('hr_timeclock')
    .select('total_hours')
    .eq('employee_id', employeeId)
    .gte('clock_in', startDate)
    .lt('clock_in', endDate);

  const hoursWorked = (timeRecords || []).reduce((sum, r) => sum + (parseFloat(r.total_hours) || 0), 0);
  const weeklyHours = parseFloat(emp.weekly_hours) || 35;
  const monthlyExpected = weeklyHours * 4.33;
  const hoursOvertime = Math.max(0, hoursWorked - monthlyExpected);

  const fileUrl = `/payslips/${employeeId}_${year}_${String(month).padStart(2, '0')}.pdf`;

  const { data: payslip, error } = await supabase
    .from('hr_payslips')
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      period_month: month,
      period_year: year,
      gross_salary: grossSalary,
      social_charges: socialCharges,
      income_tax: incomeTax,
      net_salary: netSalary,
      hours_worked: hoursWorked || null,
      hours_overtime: hoursOvertime,
      status: 'generated',
      generated_at: new Date().toISOString(),
      file_url: fileUrl,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: payslip };
}

export async function sendPayslip(tenantId, payslipId) {
  const { data, error } = await supabase
    .from('hr_payslips')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', payslipId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function markPayslipPaid(tenantId, payslipId) {
  const { data, error } = await supabase
    .from('hr_payslips')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', payslipId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ==================== ONBOARDING ====================

export async function getOnboardingTasks(tenantId, employeeId) {
  const { data, error } = await supabase
    .from('hr_onboarding')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('employee_id', employeeId)
    .order('order_index', { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function createOnboardingTask(tenantId, employeeId, data) {
  const { task } = data;
  if (!task) return { success: false, error: 'task requis' };

  const { data: created, error } = await supabase
    .from('hr_onboarding')
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      task,
      description: data.description || null,
      due_date: data.due_date || null,
      order_index: data.order_index || 0,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: created };
}

export async function completeOnboardingTask(tenantId, taskId, completerId) {
  const { data, error } = await supabase
    .from('hr_onboarding')
    .update({
      completed: true,
      completed_at: new Date().toISOString(),
      completed_by: completerId || null,
    })
    .eq('id', taskId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function initializeOnboarding(tenantId, employeeId) {
  const defaultTasks = [
    { task: 'Signature contrat', order_index: 1 },
    { task: 'Création compte email', order_index: 2 },
    { task: 'Attribution équipement', order_index: 3 },
    { task: 'Formation sécurité', order_index: 4 },
    { task: 'Présentation équipe', order_index: 5 },
    { task: 'Formation logiciels', order_index: 6 },
  ];

  const inserts = defaultTasks.map(t => ({
    tenant_id: tenantId,
    employee_id: employeeId,
    task: t.task,
    order_index: t.order_index,
  }));

  const { data, error } = await supabase
    .from('hr_onboarding')
    .insert(inserts)
    .select();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ==================== STATS ====================

export async function getHROverview(tenantId) {
  const [empRes, leavesRes, payslipsRes] = await Promise.all([
    supabase.from('hr_employees').select('id, status, gross_salary, department').eq('tenant_id', tenantId),
    supabase.from('hr_leaves').select('id, status, type, days_count').eq('tenant_id', tenantId).eq('status', 'pending'),
    supabase.from('hr_payslips').select('id, status, net_salary, period_month, period_year').eq('tenant_id', tenantId),
  ]);

  const employees = empRes.data || [];
  const pendingLeaves = leavesRes.data || [];
  const payslips = payslipsRes.data || [];

  const active = employees.filter(e => e.status === 'active').length;
  const onLeave = employees.filter(e => e.status === 'on_leave').length;
  const totalMass = employees.filter(e => e.status === 'active').reduce((s, e) => s + parseFloat(e.gross_salary || 0), 0);

  const departments = {};
  for (const e of employees) {
    const dept = e.department || 'Non assigné';
    departments[dept] = (departments[dept] || 0) + 1;
  }

  return {
    success: true,
    data: {
      total_employees: employees.length,
      active,
      on_leave: onLeave,
      terminated: employees.filter(e => e.status === 'terminated').length,
      pending_leave_requests: pendingLeaves.length,
      monthly_payroll: totalMass,
      departments,
      total_payslips: payslips.length,
    },
  };
}

export async function getAbsenteeismRate(tenantId, startDate, endDate) {
  const { data: leaves } = await supabase
    .from('hr_leaves')
    .select('days_count')
    .eq('tenant_id', tenantId)
    .eq('status', 'approved')
    .gte('start_date', startDate)
    .lte('end_date', endDate);

  const { data: employees } = await supabase
    .from('hr_employees')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  const totalAbsenceDays = (leaves || []).reduce((s, l) => s + parseFloat(l.days_count), 0);
  const start = new Date(startDate);
  const end = new Date(endDate);
  const workingDays = Math.ceil((end - start) / (24 * 60 * 60 * 1000));
  const theoreticalDays = (employees || []).length * workingDays;
  const rate = theoreticalDays > 0 ? ((totalAbsenceDays / theoreticalDays) * 100).toFixed(1) : 0;

  return {
    success: true,
    data: {
      period: { start: startDate, end: endDate },
      total_absence_days: totalAbsenceDays,
      employees_count: (employees || []).length,
      working_days: workingDays,
      rate: parseFloat(rate),
    },
  };
}

export async function getTurnoverRate(tenantId, year) {
  const y = year || new Date().getFullYear();

  const { data: employees } = await supabase
    .from('hr_employees')
    .select('id, status, hire_date, termination_date')
    .eq('tenant_id', tenantId);

  const all = employees || [];
  const startOfYear = new Date(`${y}-01-01`);
  const endOfYear = new Date(`${y}-12-31`);

  const hiredThisYear = all.filter(e => new Date(e.hire_date) >= startOfYear && new Date(e.hire_date) <= endOfYear).length;
  const terminatedThisYear = all.filter(e => e.termination_date && new Date(e.termination_date) >= startOfYear && new Date(e.termination_date) <= endOfYear).length;
  const avgHeadcount = all.length || 1;
  const turnover = ((terminatedThisYear / avgHeadcount) * 100).toFixed(1);

  return {
    success: true,
    data: {
      year: y,
      hired: hiredThisYear,
      terminated: terminatedThisYear,
      avg_headcount: all.length,
      turnover_rate: parseFloat(turnover),
    },
  };
}

export async function getPayrollSummary(tenantId, month, year) {
  const m = month || new Date().getMonth() + 1;
  const y = year || new Date().getFullYear();

  const { data: payslips } = await supabase
    .from('hr_payslips')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('period_month', m)
    .eq('period_year', y);

  const slips = payslips || [];
  const totalGross = slips.reduce((s, p) => s + parseFloat(p.gross_salary || 0), 0);
  const totalCharges = slips.reduce((s, p) => s + parseFloat(p.social_charges || 0), 0);
  const totalTax = slips.reduce((s, p) => s + parseFloat(p.income_tax || 0), 0);
  const totalNet = slips.reduce((s, p) => s + parseFloat(p.net_salary || 0), 0);

  return {
    success: true,
    data: {
      period: { month: m, year: y },
      payslips_count: slips.length,
      total_gross: Math.round(totalGross * 100) / 100,
      total_social_charges: Math.round(totalCharges * 100) / 100,
      total_income_tax: Math.round(totalTax * 100) / 100,
      total_net: Math.round(totalNet * 100) / 100,
      by_status: {
        draft: slips.filter(p => p.status === 'draft').length,
        generated: slips.filter(p => p.status === 'generated').length,
        sent: slips.filter(p => p.status === 'sent').length,
        paid: slips.filter(p => p.status === 'paid').length,
      },
    },
  };
}
