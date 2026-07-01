import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = window.NOV_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.NOV_SUPABASE_ANON_KEY || "";
let supabase = null;

const claimList = document.querySelector("#claimList");
const claimForm = document.querySelector("#claimForm");
const receiptInput = document.querySelector("#receiptFile");
const receiptStatus = document.querySelector("#receiptStatus");
const analyzeReceiptButton = document.querySelector("#analyzeReceiptButton");
const exportCsvButton = document.querySelector("#exportCsvButton");
const csvFormatFilter = document.querySelector("#csvFormatFilter");
const csvStatusFilter = document.querySelector("#csvStatusFilter");
const accountingExportHistory = document.querySelector("#accountingExportHistory");
const claimStatusFilter = document.querySelector("#claimStatusFilter");
const bulkApproveButton = document.querySelector("#bulkApproveButton");
const bulkSettleButton = document.querySelector("#bulkSettleButton");
const profileLabel = document.querySelector("#profileLabel");
const storeRank = document.querySelector("#storeRank");
const departmentRank = document.querySelector("#departmentRank");
const roleInsight = document.querySelector("#roleInsight");
const notificationList = document.querySelector("#notificationList");
const markNotificationsReadButton = document.querySelector("#markNotificationsReadButton");
const authPanel = document.querySelector("#authPanel");
const authForm = document.querySelector("#authForm");
const appContent = document.querySelector("#appContent");
const signOutButton = document.querySelector("#signOutButton");
const employeePanel = document.querySelector("#employeePanel");
const employeeForm = document.querySelector("#employeeForm");
const employeeList = document.querySelector("#employeeList");
const employeeNewButton = document.querySelector("#employeeNewButton");
const permissionPanel = document.querySelector("#permissionPanel");
const permissionForm = document.querySelector("#permissionForm");
const permissionList = document.querySelector("#permissionList");
const claimPrecheck = document.querySelector("#claimPrecheck");
const applyLastClaimButton = document.querySelector("#applyLastClaimButton");
const lastClaimHint = document.querySelector("#lastClaimHint");
const vendorSuggestion = document.querySelector("#vendorSuggestion");
const highAmountReasonField = document.querySelector("#highAmountReasonField");
const workflowCommentDialog = document.querySelector("#workflowCommentDialog");
const workflowCommentForm = document.querySelector("#workflowCommentForm");
const workflowCommentTitle = document.querySelector("#workflowCommentTitle");
const workflowCommentTemplate = document.querySelector("#workflowCommentTemplate");
const workflowCommentText = document.querySelector("#workflowCommentText");
const monthlyFiscalMonth = document.querySelector("#monthlyFiscalMonth");
const monthlyCreateButton = document.querySelector("#monthlyCreateButton");
const monthlyRefreshButton = document.querySelector("#monthlyRefreshButton");
const monthlyAttachDraftsButton = document.querySelector("#monthlyAttachDraftsButton");
const monthlySubmitButton = document.querySelector("#monthlySubmitButton");
const monthlyReportSummary = document.querySelector("#monthlyReportSummary");
const monthlyReportList = document.querySelector("#monthlyReportList");
const monthlyAccountingPanel = document.querySelector("#monthlyAccountingPanel");
const monthlyAccountingList = document.querySelector("#monthlyAccountingList");
const viewTabs = document.querySelector("#viewTabs");

let uploadedReceiptPath = "";
let currentEmployee = null;
let employeeOptions = null;
let permissionOptions = null;
let claimsCache = [];
let monthlyReportsCache = [];
let currentMonthlyReport = null;
let activeView = "input";
let hubContext = null;
let pendingMonthlyReportId = "";
let pendingClaimId = "";
let notificationsCache = [];
let auditLogCache = new Map();
let exportedClaimCache = new Map();

document.querySelector("#refreshButton").addEventListener("click", refreshAll);
claimForm.addEventListener("submit", submitClaim);
claimForm.addEventListener("input", handleClaimFormInput);
claimForm.addEventListener("click", handleClaimFormClick);
applyLastClaimButton.addEventListener("click", applyLastClaimDefaults);
receiptInput.addEventListener("change", handleReceiptSelected);
analyzeReceiptButton.addEventListener("click", analyzeReceipt);
exportCsvButton.addEventListener("click", exportAccountingCsv);
claimStatusFilter.addEventListener("change", renderClaims);
bulkApproveButton.addEventListener("click", () => runBulkWorkflowAction("approve"));
bulkSettleButton.addEventListener("click", () => runBulkWorkflowAction("settle"));
markNotificationsReadButton.addEventListener("click", markNotificationsRead);
monthlyRefreshButton.addEventListener("click", loadMonthlyReports);
monthlyCreateButton.addEventListener("click", createCurrentMonthlyReport);
monthlyAttachDraftsButton.addEventListener("click", attachDraftClaimsToCurrentReport);
monthlySubmitButton.addEventListener("click", submitCurrentMonthlyReport);
authForm.addEventListener("submit", signIn);
signOutButton.addEventListener("click", signOut);
employeeForm.addEventListener("submit", saveEmployee);
employeeNewButton.addEventListener("click", resetEmployeeForm);
permissionForm.addEventListener("submit", assignPermission);
permissionForm.elements.scopeType.addEventListener("change", updatePermissionScopeOptions);
viewTabs?.addEventListener("click", handleViewTabClick);

await initialize();

async function initialize() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    claimList.innerHTML = "<p>config.js に Supabase URL と anon key を設定してください。</p>";
    authPanel.hidden = true;
    appContent.hidden = true;
    return;
  }

  hubContext = readHubContext();
  pendingMonthlyReportId = new URLSearchParams(window.location.search).get("monthly_report_id") || "";
  pendingClaimId = new URLSearchParams(window.location.search).get("expense_claim_id") || "";
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    showSignedOut();
    return;
  }

  profileLabel.textContent = `認証済み確認中: ${sessionData.session.user?.email || "メール未取得"}`;
  await bootSignedInApp();
}

async function bootSignedInApp() {
  authPanel.hidden = true;
  appContent.hidden = false;
  document.querySelector("#refreshButton").hidden = false;
  signOutButton.hidden = false;
  currentEmployee = await loadCurrentEmployee();
  renderProfile(currentEmployee);
  activeView = initialViewFromUrl() || defaultViewForEmployee(currentEmployee);
  updateViewVisibility();
  renderLastClaimHint();
  initializeMonthlyFiscalMonth();
  await refreshAll();
}

async function refreshAll() {
  await loadDashboard();
  await loadNotifications();
  await loadClaims();
  await loadMonthlyReports();
  await loadAccountingExportHistory();
  renderRoleInsight();
  await loadEmployeeAdmin();
  await loadPermissionAdmin();
  updateViewVisibility();
}

async function loadNotifications() {
  if (!notificationList) return;

  const { data, error } = await supabase
    .schema("os")
    .from("nov_hub_notification_inbox")
    .select("id,title,body,status,unread,created_at,entity_type,entity_id,action_label,target_module,target_view,target_query")
    .eq("target_module", "expense_hub")
    .eq("unread", true)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.warn(error);
    notificationList.innerHTML = `<p class="muted">通知を取得できませんでした。</p>`;
    return;
  }

  notificationsCache = data || [];
  renderNotifications();
}

function renderNotifications() {
  if (!notificationList) return;
  markNotificationsReadButton.disabled = notificationsCache.length === 0;

  if (!notificationsCache.length) {
    notificationList.innerHTML = `<p class="muted">未読通知はありません。</p>`;
    return;
  }

  notificationList.innerHTML = notificationsCache.map((notification) => `
    <article class="notification-item">
      <div>
        <strong>${escapeHtml(notification.title)}</strong>
        <p>${escapeHtml(notification.body || "")}</p>
      </div>
      <div class="notification-actions">
        <span class="muted">${escapeHtml(formatDateTime(notification.created_at))}</span>
        ${notification.action_label ? `<span class="notification-label">${escapeHtml(notification.action_label)}</span>` : ""}
        ${notification.entity_id ? `<button type="button" data-jump-entity="${escapeHtml(notification.entity_id)}" data-entity-type="${escapeHtml(notification.entity_type || "")}">対象を見る</button>` : ""}
      </div>
    </article>
  `).join("");

  notificationList.querySelectorAll("button[data-jump-entity]").forEach((button) => {
    button.addEventListener("click", () => jumpToNotificationEntity(button.dataset.entityType, button.dataset.jumpEntity));
  });
}

async function markNotificationsRead() {
  const ids = notificationsCache.map((notification) => notification.id).filter(Boolean);
  if (!ids.length) return;

  markNotificationsReadButton.disabled = true;
  const { error } = await supabase
    .schema("os")
    .rpc("mark_nov_hub_notifications_read", {
      p_notification_ids: ids,
    });

  if (error) {
    alert(error.message);
    markNotificationsReadButton.disabled = false;
    return;
  }

  await loadNotifications();
}

function jumpToNotificationEntity(entityType, entityId) {
  if (entityType === "monthly_expense_report") {
    jumpToMonthlyReport(entityId);
    return;
  }

  jumpToClaim(entityId);
}

function jumpToClaim(claimId) {
  if (!claimId) return;
  setActiveView("reports");
  claimStatusFilter.value = "all";
  renderClaims();

  requestAnimationFrame(() => {
    const claimElement = claimList.querySelector(`[data-claim-id="${CSS.escape(claimId)}"]`);
    if (!claimElement) {
      alert("対象の申請が現在の一覧に見つかりません。更新してから再度確認してください。");
      return;
    }
    claimElement.scrollIntoView({ behavior: "smooth", block: "center" });
    claimElement.classList.add("claim-highlight");
    window.setTimeout(() => claimElement.classList.remove("claim-highlight"), 2200);
  });
}

function jumpToMonthlyReport(reportId) {
  if (!reportId) return;
  const report = monthlyReportsCache.find((row) => row.id === reportId);
  const targetView = report && ["accounting_pending", "settlement_pending"].includes(report.status) && canAccessView("accounting")
    ? "accounting"
    : "monthly";
  setActiveView(targetView);

  requestAnimationFrame(() => {
    const reportElement = document.querySelector(`[data-monthly-report-id="${CSS.escape(reportId)}"]`);
    if (!reportElement) {
      alert("対象の月次精算が現在の一覧に見つかりません。更新してから再度確認してください。");
      return;
    }
    reportElement.scrollIntoView({ behavior: "smooth", block: "center" });
    reportElement.classList.add("claim-highlight");
    window.setTimeout(() => reportElement.classList.remove("claim-highlight"), 2200);
  });
}

function applyPendingRouteTargets() {
  if (pendingMonthlyReportId && monthlyReportsCache.some((report) => report.id === pendingMonthlyReportId)) {
    const targetId = pendingMonthlyReportId;
    pendingMonthlyReportId = "";
    jumpToMonthlyReport(targetId);
    return;
  }

  if (pendingClaimId && claimsCache.some((claim) => claim.id === pendingClaimId)) {
    const targetId = pendingClaimId;
    pendingClaimId = "";
    jumpToClaim(targetId);
  }
}

function showSignedOut() {
  authPanel.hidden = false;
  appContent.hidden = true;
  document.querySelector("#refreshButton").hidden = true;
  signOutButton.hidden = true;
  activeView = "input";
  profileLabel.classList.remove("auth-ok", "auth-warning");
  profileLabel.classList.add("auth-signed-out");
  profileLabel.textContent = "未ログイン";
}

async function signIn(event) {
  event.preventDefault();
  const fd = new FormData(authForm);
  const { error } = await supabase.auth.signInWithPassword({
    email: String(fd.get("email") || ""),
    password: String(fd.get("password") || ""),
  });
  if (error) {
    alert(error.message);
    return;
  }
  await bootSignedInApp();
}

async function signOut() {
  signOutButton.disabled = true;
  try {
    if (supabase) {
      await supabase.auth.signOut({ scope: "local" });
    }
  } catch (error) {
    console.warn(error);
  } finally {
    clearSupabaseSessionStorage();
    currentEmployee = null;
    showSignedOut();
    window.location.reload();
  }
}

function clearSupabaseSessionStorage() {
  for (const storage of [localStorage, sessionStorage]) {
    Object.keys(storage).forEach((key) => {
      if (key.startsWith("sb-") || key.toLowerCase().includes("supabase")) {
        storage.removeItem(key);
      }
    });
  }
}

function readHubContext() {
  const raw = new URLSearchParams(window.location.search).get("hub_context");
  if (!raw) return null;

  for (const value of contextDecodeCandidates(raw)) {
    try {
      const parsed = JSON.parse(value);
      return normalizeHubContext(parsed);
    } catch (error) {
      console.debug("hub_context parse candidate failed", error);
    }
  }

  console.warn("hub_context could not be parsed");
  return null;
}

function contextDecodeCandidates(raw) {
  const candidates = new Set([raw]);
  try {
    candidates.add(decodeURIComponent(raw));
  } catch (error) {
    console.debug(error);
  }

  [...candidates].forEach((value) => {
    try {
      const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = decodeURIComponent(escape(window.atob(base64)));
      candidates.add(decoded);
    } catch (error) {
      console.debug(error);
    }
  });

  return [...candidates].filter(Boolean);
}

function normalizeHubContext(context) {
  if (!context || typeof context !== "object") return null;
  const employeeId = context.employee_id || context.employeeId || context.employees_id || context.employee?.id || null;
  const roleKeys = context.roleKeys || context.role_keys || context.roles || context.employee?.roleKeys || [];
  return {
    ...context,
    employee_id: employeeId,
    roleKeys: normalizeRoleKeys(roleKeys),
  };
}

function normalizeRoleKeys(roleKeys) {
  if (Array.isArray(roleKeys)) return roleKeys.map(String).filter(Boolean);
  if (typeof roleKeys === "string") return roleKeys.split(/[,\s]+/).map((role) => role.trim()).filter(Boolean);
  return [];
}

async function loadCurrentEmployee() {
  const { data, error } = await supabase
    .schema("core")
    .rpc("current_employee_profile");

  if (!error) {
    const profile = Array.isArray(data) ? data[0] : data;
    if (profile) return normalizeEmployee(profile);
  }

  if (error) console.warn(error);
  return loadCurrentEmployeeByAuthEmail();
}

async function loadCurrentEmployeeByAuthEmail() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.warn(userError);
    return null;
  }

  const email = userData?.user?.email;
  if (!email) return null;

  const { data: employees, error: employeeError } = await supabase
    .schema("core")
    .from("employees")
    .select(`
      id,
      employee_code,
      email,
      name,
      corporation_id,
      store_id,
      department_id,
      position_id
    `)
    .ilike("email", email)
    .limit(1);

  if (employeeError) {
    console.warn(employeeError);
    return null;
  }

  const employee = employees?.[0];
  if (!employee) return null;

  const { data: roleRows, error: roleError } = await supabase
    .schema("core")
    .from("employee_roles")
    .select(`
      scope_type,
      scope_id,
      roles (
        code,
        name
      )
    `)
    .eq("employee_id", employee.id);

  if (roleError) console.warn(roleError);

  return normalizeEmployee({
    ...employee,
    roles: (roleRows || []).map((row) => ({
      role_code: row.roles?.code,
      role_name: row.roles?.name,
      scope_type: row.scope_type,
      scope_id: row.scope_id,
    })),
  });
}

function normalizeEmployee(employee) {
  if (!employee) return null;
  const roles = Array.isArray(employee.roles) ? [...employee.roles] : [];
  for (const roleKey of hubContext?.roleKeys || []) {
    const exists = roles.some((role) => (role.role_code || role.code) === roleKey);
    if (!exists) {
      roles.push({
        role_code: roleKey,
        role_name: roleKey,
        source: "hub_context",
      });
    }
  }

  return {
    ...employee,
    id: employee.id || employee.employee_id || hubContext?.employee_id,
    employee_id: employee.employee_id || employee.id || hubContext?.employee_id,
    hub_context_employee_id: hubContext?.employee_id || null,
    roles,
  };
}

function renderProfile(employee) {
  if (!employee) {
    profileLabel.classList.remove("auth-ok", "auth-signed-out");
    profileLabel.classList.add("auth-warning");
    profileLabel.textContent = "社員未解決";
    return;
  }

  profileLabel.classList.remove("auth-warning", "auth-signed-out");
  profileLabel.classList.add("auth-ok");
  const roleNames = (employee.roles || [])
    .map((role) => role.role_name || role.name || role.role_code || role.code)
    .filter(Boolean)
    .join(" / ");
  const contextLabel = hubContext ? " / HUB連携" : "";
  profileLabel.textContent = `認証済み${contextLabel}: ${employee.name || employee.email || "ログイン中"}${roleNames ? " | " + roleNames : ""}`;
}

function hasRole(employee, roleCode) {
  return Boolean((employee?.roles || []).some((role) => (role.role_code || role.code) === roleCode));
}

function defaultViewForEmployee(employee) {
  if (hasRole(employee, "accounting")) return "accounting";
  if (hasRole(employee, "executive")) return "dashboard";
  if (hasRole(employee, "manager")) return "dashboard";
  return "input";
}

function initialViewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get("view");
  if (requestedView && canAccessView(requestedView)) return requestedView;
  if (pendingMonthlyReportId && canAccessView("accounting")) return "accounting";
  if (pendingMonthlyReportId) return "monthly";
  if (pendingClaimId && canAccessView("reports")) return "reports";
  return "";
}

function handleViewTabClick(event) {
  const button = event.target.closest("button[data-view-tab]");
  if (!button || button.disabled) return;
  setActiveView(button.dataset.viewTab);
}

function setActiveView(view) {
  if (!canAccessView(view)) return;
  activeView = view;
  updateViewVisibility();
}

function canAccessView(view) {
  if (!currentEmployee) return false;
  if (view === "accounting") return hasRole(currentEmployee, "accounting") || hasRole(currentEmployee, "executive");
  if (view === "admin") return hasRole(currentEmployee, "executive");
  if (view === "reports") return hasRole(currentEmployee, "accounting") || hasRole(currentEmployee, "executive");
  return true;
}

function updateViewVisibility() {
  if (!viewTabs) return;
  if (!canAccessView(activeView)) activeView = defaultViewForEmployee(currentEmployee);

  document.querySelectorAll("[data-view-section]").forEach((section) => {
    const view = section.dataset.viewSection;
    section.hidden = view !== activeView || !canAccessView(view);
  });

  viewTabs.querySelectorAll("button[data-view-tab]").forEach((button) => {
    const view = button.dataset.viewTab;
    const allowed = canAccessView(view);
    button.disabled = !allowed;
    button.classList.toggle("is-active", view === activeView && allowed);
  });
}

async function loadDashboard() {
  const { data, error } = await supabase
    .schema("finance")
    .rpc("expense_dashboard");

  if (error) {
    console.warn(error);
    return;
  }

  const dashboard = Array.isArray(data) ? data[0] : data;
  if (!dashboard) return;
  renderDashboardSummary(dashboard.summary || {});
  renderRank(storeRank, dashboard.stores || [], "store_name");
  renderRank(departmentRank, dashboard.departments || [], "department_name");
}

function renderDashboardSummary(summary) {
  document.querySelector("#metricAll").textContent = summary.total_count ?? 0;
  document.querySelector("#metricPending").textContent = summary.pending_count ?? 0;
  document.querySelector("#metricSettlement").textContent = summary.settlement_pending_count ?? 0;
  document.querySelector("#metricRisk").textContent = summary.high_risk_count ?? 0;
}

function renderRank(container, rows, nameKey) {
  if (!rows.length) {
    container.innerHTML = `<p class="muted">データなし</p>`;
    return;
  }

  container.innerHTML = rows.map((row) => `
    <div class="rank-item">
      <span>${escapeHtml(row[nameKey] || "未設定")} <span class="muted">(${row.claim_count || 0}件)</span></span>
      <strong>${Number(row.total_amount || 0).toLocaleString("ja-JP")}円</strong>
    </div>
  `).join("");
}

function initializeMonthlyFiscalMonth() {
  if (!monthlyFiscalMonth) return;
  const now = new Date();
  const value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  monthlyFiscalMonth.value = value;
}

function selectedFiscalMonthDate() {
  const value = monthlyFiscalMonth?.value;
  if (!value) return null;
  return `${value}-01`;
}

function fiscalMonthFromExpenseDate(expenseDate) {
  if (!expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) return null;
  return `${expenseDate.slice(0, 7)}-01`;
}

function setMonthlyFiscalMonthFromExpenseDate(expenseDate) {
  if (!monthlyFiscalMonth || !expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) return;
  monthlyFiscalMonth.value = expenseDate.slice(0, 7);
}

async function loadMonthlyReports() {
  if (!monthlyReportList || !currentEmployee) return;

  const { data, error } = await supabase
    .schema("finance")
    .from("monthly_expense_reports")
    .select("id,title,applicant_employee_id,fiscal_month,report_sequence,report_kind,status,total_amount,total_tax,line_count,submitted_at,accounting_checked_at,settled_at,accounting_comment,created_at")
    .order("fiscal_month", { ascending: false })
    .order("report_sequence", { ascending: false })
    .limit(12);

  if (error) {
    monthlyReportSummary.innerHTML = `<p class="muted">月次精算を取得できませんでした: ${escapeHtml(error.message)}</p>`;
    monthlyReportList.innerHTML = "";
    return;
  }

  monthlyReportsCache = data || [];
  const selectedMonth = selectedFiscalMonthDate();
  const reportsForSelectedMonth = monthlyReportsCache.filter((report) =>
    report.fiscal_month === selectedMonth &&
    report.applicant_employee_id === currentEmployee?.id
  );
  currentMonthlyReport = reportsForSelectedMonth.find((report) =>
    ["draft", "returned"].includes(report.status)
  ) || reportsForSelectedMonth[0] || null;
  renderMonthlyReports();
}

function renderMonthlyReports() {
  const draftLines = monthlyDraftClaimsForSelectedMonth();
  const currentReportLines = claimsCache.filter((claim) => claim.monthly_report_id === currentMonthlyReport?.id);
  monthlyCreateButton.disabled = !selectedFiscalMonthDate();
  monthlyAttachDraftsButton.disabled = !currentMonthlyReport || currentMonthlyReport.status !== "draft" || draftLines.length === 0;
  monthlySubmitButton.disabled = !currentMonthlyReport || !["draft", "returned"].includes(currentMonthlyReport.status) || Number(currentMonthlyReport.line_count || 0) === 0;

  if (!currentMonthlyReport) {
    monthlyReportSummary.innerHTML = `
      <div class="monthly-empty">
        <strong>対象月の月次精算パックはまだありません。</strong>
        <p class="muted">新しく保存した明細は対象月の月次精算へ自動で追加されます。対象月の未提出明細: ${draftLines.length}件</p>
      </div>
    `;
  } else {
    monthlyReportSummary.innerHTML = `
      <article class="monthly-current">
        <div>
          <strong>${escapeHtml(currentMonthlyReport.title)}</strong>
          <p class="muted">
            ${escapeHtml(formatMonth(currentMonthlyReport.fiscal_month))} /
            ${escapeHtml(statusLabel(currentMonthlyReport.status))} /
            ${escapeHtml(monthlyReportKindLabel(currentMonthlyReport))}
          </p>
        </div>
        <div class="monthly-total">
          <span>${Number(currentMonthlyReport.line_count || 0)}件</span>
          <strong>${Number(currentMonthlyReport.total_amount || 0).toLocaleString("ja-JP")}円</strong>
        </div>
      </article>
      ${renderMonthlyLinePreview(currentReportLines)}
      ${renderUnattachedDraftPreview(draftLines)}
    `;
  }

  monthlyReportList.innerHTML = monthlyReportsCache.map((report) => `
    <article class="monthly-row ${currentMonthlyReport?.id === report.id ? "is-current" : ""}" data-monthly-report-id="${escapeHtml(report.id)}">
      <div>
        <div class="claim-title">${escapeHtml(report.title)}</div>
        <div class="claim-meta">${escapeHtml(formatMonth(report.fiscal_month))} / ${escapeHtml(statusLabel(report.status))} / ${escapeHtml(monthlyReportKindLabel(report))} / ${Number(report.line_count || 0)}件</div>
      </div>
      <strong>${Number(report.total_amount || 0).toLocaleString("ja-JP")}円</strong>
    </article>
  `).join("") || `<p class="muted">月次精算パックはありません。</p>`;
  renderMonthlyAccountingReports();
  applyPendingRouteTargets();
}

function renderMonthlyLinePreview(lines) {
  if (!lines.length) {
    return `
      <div class="monthly-line-preview monthly-empty">
        <strong>この月次精算にはまだ明細がありません。</strong>
        <p class="muted">入力タブで明細を保存すると自動でここへ追加されます。</p>
      </div>
    `;
  }

  return `
    <div class="monthly-line-preview">
      <div class="monthly-preview-header">
        <strong>この月次精算に入っている明細</strong>
        <span>${lines.length}件</span>
      </div>
      ${lines.map((claim) => `
        <article class="monthly-line-item" data-claim-id="${escapeHtml(claim.id)}">
          <div>
            <strong>${escapeHtml(claim.title || claim.vendor_name_raw || "無題")}</strong>
            <p class="muted">${escapeHtml(claim.expense_date || "")} / ${escapeHtml(claim.vendor_name_raw || "")} / ${escapeHtml(claim.purpose || "")}</p>
          </div>
          <div class="monthly-line-amount">
            <strong>${Number(claim.amount || 0).toLocaleString("ja-JP")}円</strong>
            <span>${escapeHtml(statusLabel(claim.status))}</span>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderUnattachedDraftPreview(lines) {
  if (!lines.length || !currentMonthlyReport || currentMonthlyReport.status !== "draft") return "";

  const total = lines.reduce((sum, claim) => sum + Number(claim.amount || 0), 0);
  return `
    <div class="monthly-unattached-note">
      <strong>未提出明細が${lines.length}件残っています。</strong>
      <span>${total.toLocaleString("ja-JP")}円</span>
      <p class="muted">必要なら「未提出明細を追加」で、この月次精算へまとめて追加できます。</p>
    </div>
  `;
}

function monthlyReportKindLabel(report) {
  if (report?.report_kind === "supplemental") return `追加精算 ${Number(report.report_sequence || 1) - 1}`;
  return "通常精算";
}

function renderMonthlyAccountingReports() {
  if (!monthlyAccountingPanel || !monthlyAccountingList) return;

  const canAccounting = hasRole(currentEmployee, "accounting") || hasRole(currentEmployee, "executive");
  if (!canAccounting) {
    updateViewVisibility();
    return;
  }

  const rows = monthlyReportsCache.filter((report) =>
    ["accounting_pending", "settlement_pending", "returned"].includes(report.status)
  );

  if (!rows.length) {
    monthlyAccountingList.innerHTML = `<p class="muted">経理確認待ちの月次精算はありません。</p>`;
    return;
  }

  monthlyAccountingList.innerHTML = rows.map((report) => {
    const canApprove = canActOnMonthlyReport(report, "approve");
    const canReturn = canActOnMonthlyReport(report, "return");
    const canSettle = canActOnMonthlyReport(report, "settle");
    return `
      <article class="monthly-row monthly-review-row" data-monthly-report-id="${escapeHtml(report.id)}">
        <div>
          <div class="claim-title">${escapeHtml(report.title)}</div>
          <div class="claim-meta">
            ${escapeHtml(formatMonth(report.fiscal_month))} /
            ${escapeHtml(statusLabel(report.status))} /
            ${Number(report.line_count || 0)}件 /
            ${Number(report.total_amount || 0).toLocaleString("ja-JP")}円
          </div>
          ${report.accounting_comment ? `<p class="muted">${escapeHtml(report.accounting_comment)}</p>` : ""}
        </div>
        <div class="monthly-review-actions">
          <button type="button" data-monthly-action="approve" data-monthly-report-id="${escapeHtml(report.id)}" ${canApprove ? "" : "disabled"}>確認済み</button>
          <button type="button" class="secondary" data-monthly-action="return" data-monthly-report-id="${escapeHtml(report.id)}" ${canReturn ? "" : "disabled"}>差戻し</button>
          <button type="button" data-monthly-action="settle" data-monthly-report-id="${escapeHtml(report.id)}" ${canSettle ? "" : "disabled"}>精算済み</button>
        </div>
      </article>
    `;
  }).join("");

  monthlyAccountingList.querySelectorAll("button[data-monthly-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await runMonthlyWorkflowAction(button.dataset.monthlyAction, button.dataset.monthlyReportId);
    });
  });

  updateViewVisibility();
}

function canActOnMonthlyReport(report, action) {
  const canAccounting = hasRole(currentEmployee, "accounting") || hasRole(currentEmployee, "executive");
  if (!canAccounting) return false;
  if (action === "approve" || action === "return") return report.status === "accounting_pending";
  if (action === "settle") return report.status === "settlement_pending";
  return false;
}

function isOwnDraftClaim(claim) {
  return claim.applicant_employee_id === currentEmployee?.id &&
    ["draft", "manager_pending", "returned"].includes(claim.status);
}

function isClaimInFiscalMonth(claim, fiscalMonth) {
  if (!fiscalMonth || !claim?.expense_date) return false;
  return fiscalMonthFromExpenseDate(claim.expense_date) === fiscalMonth;
}

function monthlyDraftClaimsForSelectedMonth() {
  const fiscalMonth = currentMonthlyReport?.fiscal_month || selectedFiscalMonthDate();
  return claimsCache.filter((claim) =>
    isOwnDraftClaim(claim) &&
    !claim.monthly_report_id &&
    isClaimInFiscalMonth(claim, fiscalMonth)
  );
}

async function createCurrentMonthlyReport() {
  const fiscalMonth = selectedFiscalMonthDate();
  if (!fiscalMonth) {
    alert("対象月を選択してください。");
    return;
  }

  monthlyCreateButton.disabled = true;
  const title = `${monthlyFiscalMonth.value} 経費精算`;
  const { error } = await supabase
    .schema("finance")
    .rpc("get_or_create_monthly_expense_report", {
      p_fiscal_month: fiscalMonth,
      p_title: title,
    });

  if (error) {
    alert(error.message);
    monthlyCreateButton.disabled = false;
    return;
  }

  await loadMonthlyReports();
}

async function getOrCreateMonthlyReportForExpenseDate(expenseDate) {
  const fiscalMonth = fiscalMonthFromExpenseDate(expenseDate);
  if (!fiscalMonth) return null;

  const title = `${fiscalMonth.slice(0, 7)} 経費精算`;
  const { data, error } = await supabase
    .schema("finance")
    .rpc("get_or_create_monthly_expense_report", {
      p_fiscal_month: fiscalMonth,
      p_title: title,
    });

  if (error) throw error;
  return data;
}

async function attachClaimToMonthlyReport(claim, expenseDate) {
  if (!claim?.id) return null;

  const report = await getOrCreateMonthlyReportForExpenseDate(expenseDate);
  if (!report?.id) return null;

  const { error } = await supabase
    .schema("finance")
    .rpc("attach_claim_to_monthly_report", {
      p_expense_claim_id: claim.id,
      p_monthly_report_id: report.id,
    });

  if (error) throw error;
  return report;
}

async function attachDraftClaimsToCurrentReport() {
  if (!currentMonthlyReport) return;
  const draftLines = monthlyDraftClaimsForSelectedMonth();
  if (!draftLines.length) {
    alert("対象月に追加できる未提出明細がありません。");
    return;
  }

  const total = draftLines.reduce((sum, claim) => sum + Number(claim.amount || 0), 0);
  if (!confirm(`${formatMonth(currentMonthlyReport.fiscal_month)} の未提出明細 ${draftLines.length}件 / ${total.toLocaleString("ja-JP")}円を、この月次精算へ追加しますか？`)) {
    return;
  }

  monthlyAttachDraftsButton.disabled = true;
  for (const claim of draftLines) {
    const { error } = await supabase
      .schema("finance")
      .rpc("attach_claim_to_monthly_report", {
        p_expense_claim_id: claim.id,
        p_monthly_report_id: currentMonthlyReport.id,
      });

    if (error) {
      alert(error.message);
      break;
    }
  }

  await loadClaims();
  await loadMonthlyReports();
}

async function submitCurrentMonthlyReport() {
  if (!currentMonthlyReport) return;
  if (!confirm("この月次精算を経理へ提出しますか？")) return;

  monthlySubmitButton.disabled = true;
  const { error } = await supabase
    .schema("finance")
    .rpc("submit_monthly_expense_report", {
      p_report_id: currentMonthlyReport.id,
      p_applicant_note: "",
    });

  if (error) {
    alert(error.message);
    monthlySubmitButton.disabled = false;
    return;
  }

  await refreshAll();
}

async function loadClaims() {
  const { data, error } = await supabase
    .schema("finance")
    .from("expense_claims")
    .select(`
      id,
      applicant_employee_id,
      title,
      expense_date,
      amount,
      tax,
      vendor_name_raw,
      payment_method,
      purpose,
      status,
      monthly_report_id,
      duplicate_risk,
      anomaly_risk,
      budget_risk,
      ai_account_title_candidate,
      expense_receipts (
        id
      )
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    claimList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  claimsCache = data || [];
  await loadAuditLogsForClaims(claimsCache);
  await loadExportedClaimHistoryForClaims(claimsCache);
  renderClaims();
  renderRoleInsight();
}

async function loadExportedClaimHistoryForClaims(rows) {
  exportedClaimCache = new Map();
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (!ids.length) return;

  const { data, error } = await supabase
    .schema("finance")
    .from("accounting_exported_claims")
    .select("expense_claim_id,export_count,last_exported_at,last_export_format,last_file_name,last_exported_by_name,last_exported_by_email")
    .in("expense_claim_id", ids);

  if (error) {
    console.warn(error);
    return;
  }

  (data || []).forEach((row) => {
    exportedClaimCache.set(row.expense_claim_id, row);
  });
}

async function loadAuditLogsForClaims(rows) {
  auditLogCache = new Map();
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (!ids.length) return;

  const { data, error } = await supabase
    .schema("finance")
    .from("expense_audit_logs")
    .select(`
      id,
      expense_claim_id,
      action,
      before_status,
      after_status,
      comment,
      created_at
    `)
    .in("expense_claim_id", ids)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn(error);
    return;
  }

  (data || []).forEach((log) => {
    const list = auditLogCache.get(log.expense_claim_id) || [];
    list.push(log);
    auditLogCache.set(log.expense_claim_id, list);
  });
}

function renderClaims() {
  const rows = sortClaimsForDisplay(filterClaims(claimsCache));
  claimList.innerHTML = rows.map(renderClaim).join("") || "<p>条件に合う申請はありません。</p>";
  bindClaimActions();
  applyPendingRouteTargets();
}

function sortClaimsForDisplay(rows) {
  if (claimStatusFilter.value !== "ai_review") return rows;
  return [...rows].sort((a, b) => reviewPriorityScore(b) - reviewPriorityScore(a));
}

function filterClaims(rows) {
  const filter = claimStatusFilter.value;
  if (filter === "all") return rows;
  if (filter === "actionable") {
    return rows.filter((row) => canActOnClaim(row));
  }
  if (filter === "ai_review") {
    return rows.filter((row) => aiReviewFlags(row).length > 0);
  }
  if (filter === "csv_unexported") {
    return rows.filter((row) => !exportedClaimCache.has(row.id));
  }
  if (filter === "csv_exported") {
    return rows.filter((row) => exportedClaimCache.has(row.id));
  }
  return rows.filter((row) => row.status === filter);
}

function canActOnClaim(row) {
  if (row.status === "manager_pending") return hasRole(currentEmployee, "manager") || hasRole(currentEmployee, "executive");
  if (row.status === "accounting_pending") return hasRole(currentEmployee, "accounting") || hasRole(currentEmployee, "executive");
  if (row.status === "executive_pending") return hasRole(currentEmployee, "executive");
  if (row.status === "settlement_pending") return hasRole(currentEmployee, "accounting") || hasRole(currentEmployee, "executive");
  return false;
}

function renderRoleInsight() {
  if (!currentEmployee || !roleInsight) {
    roleInsight.innerHTML = "";
    return;
  }

  const rows = claimsCache;
  const pendingForMe = rows.filter(canActOnClaim);
  const riskRows = rows.filter((row) => [row.duplicate_risk, row.anomaly_risk, row.budget_risk].includes("high"));
  const settlementRows = rows.filter((row) => row.status === "settlement_pending");
  const returnedRows = rows.filter((row) => row.status === "returned");

  const insights = [];
  if (hasRole(currentEmployee, "manager")) {
    insights.push({
      label: "店長確認",
      value: `${rows.filter((row) => row.status === "manager_pending").length}件`,
      note: "店舗の承認・差戻し対象",
    });
  }
  if (hasRole(currentEmployee, "accounting")) {
    insights.push({
      label: "経理確認",
      value: `${rows.filter((row) => row.status === "accounting_pending").length}件`,
      note: "勘定科目・重複・精算前確認",
    });
    insights.push({
      label: "精算待ち",
      value: `${settlementRows.length}件`,
      note: "振込・支払処理の対象",
    });
  }
  if (hasRole(currentEmployee, "executive")) {
    insights.push({
      label: "異常値・高リスク",
      value: `${riskRows.length}件`,
      note: "重複・予算超過・異常値の確認",
    });
  }

  insights.push({
    label: "自分の確認待ち",
    value: `${pendingForMe.length}件`,
    note: "今すぐ処理できる申請",
  });
  insights.push({
    label: "差戻し",
    value: `${returnedRows.length}件`,
    note: "再申請やコメント確認が必要",
  });

  roleInsight.innerHTML = insights.slice(0, 4).map((item) => `
    <article class="insight-item">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <p>${escapeHtml(item.note)}</p>
    </article>
  `).join("");
}

async function loadEmployeeAdmin() {
  if (!hasRole(currentEmployee, "executive")) {
    employeePanel.hidden = true;
    return;
  }

  const { data, error } = await supabase
    .schema("core")
    .rpc("employee_admin_options");

  if (error) {
    console.warn(error);
    employeePanel.hidden = true;
    return;
  }

  employeeOptions = Array.isArray(data) ? data[0] : data;
  employeePanel.hidden = false;
  renderEmployeeFormOptions();
  renderEmployeeList();
}

function renderEmployeeFormOptions() {
  setSelectOptions(employeeForm.elements.corporationId, employeeOptions?.corporations || [], "法人なし");
  setSelectOptions(employeeForm.elements.storeId, employeeOptions?.stores || [], "店舗なし");
  setSelectOptions(employeeForm.elements.departmentId, employeeOptions?.departments || [], "部署なし");
  setSelectOptions(employeeForm.elements.positionId, employeeOptions?.positions || [], "役職なし");
}

function setSelectOptions(select, rows, emptyLabel) {
  select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>` + rows.map((row) =>
    `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}</option>`
  ).join("");
}

function renderEmployeeList() {
  const employees = employeeOptions?.employees || [];
  if (!employees.length) {
    employeeList.innerHTML = `<p class="muted">社員データがありません。</p>`;
    return;
  }

  employeeList.innerHTML = employees.map((employee) => `
    <article class="employee-row">
      <div>
        <div class="claim-title">${escapeHtml(employee.name || employee.email)}</div>
        <div class="claim-meta">${escapeHtml(employee.email || "")} / ${escapeHtml(employee.employee_code || "コード未設定")}</div>
        <div class="claim-meta">${escapeHtml(employee.corporation_name || "法人なし")} / ${escapeHtml(employee.store_name || "店舗なし")} / ${escapeHtml(employee.department_name || "部署なし")} / ${escapeHtml(employee.position_name || "役職なし")}</div>
      </div>
      <div class="employee-actions">
        <span class="muted">${escapeHtml(employee.employment_status || "active")}</span>
        <button type="button" data-edit-employee="${escapeHtml(employee.id)}">編集</button>
      </div>
    </article>
  `).join("");

  employeeList.querySelectorAll("button[data-edit-employee]").forEach((button) => {
    button.addEventListener("click", () => {
      const employee = employees.find((row) => row.id === button.dataset.editEmployee);
      if (employee) fillEmployeeForm(employee);
    });
  });
}

function fillEmployeeForm(employee) {
  employeeForm.elements.employeeId.value = employee.id || "";
  employeeForm.elements.employeeCode.value = employee.employee_code || "";
  employeeForm.elements.name.value = employee.name || "";
  employeeForm.elements.email.value = employee.email || "";
  employeeForm.elements.corporationId.value = employee.corporation_id || "";
  employeeForm.elements.storeId.value = employee.store_id || "";
  employeeForm.elements.departmentId.value = employee.department_id || "";
  employeeForm.elements.positionId.value = employee.position_id || "";
  employeeForm.elements.firebaseUid.value = employee.firebase_uid || "";
  employeeForm.elements.employmentStatus.value = employee.employment_status || "active";
  employeeForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetEmployeeForm() {
  employeeForm.reset();
  employeeForm.elements.employeeId.value = "";
  employeeForm.elements.employmentStatus.value = "active";
}

async function saveEmployee(event) {
  event.preventDefault();
  const fd = new FormData(employeeForm);
  const { error } = await supabase
    .schema("core")
    .rpc("upsert_employee_admin", {
      p_employee_id: nullIfEmpty(fd.get("employeeId")),
      p_employee_code: nullIfEmpty(fd.get("employeeCode")),
      p_email: fd.get("email"),
      p_name: fd.get("name"),
      p_corporation_id: nullIfEmpty(fd.get("corporationId")),
      p_store_id: nullIfEmpty(fd.get("storeId")),
      p_department_id: nullIfEmpty(fd.get("departmentId")),
      p_position_id: nullIfEmpty(fd.get("positionId")),
      p_firebase_uid: nullIfEmpty(fd.get("firebaseUid")),
      p_employment_status: fd.get("employmentStatus") || "active",
    });

  if (error) {
    alert(error.message);
    return;
  }

  resetEmployeeForm();
  await loadEmployeeAdmin();
  await loadPermissionAdmin();
}

async function loadPermissionAdmin() {
  if (!hasRole(currentEmployee, "executive")) {
    permissionPanel.hidden = true;
    return;
  }

  const { data, error } = await supabase
    .schema("core")
    .rpc("permission_admin_options");

  if (error) {
    console.warn(error);
    permissionPanel.hidden = true;
    return;
  }

  permissionOptions = Array.isArray(data) ? data[0] : data;
  permissionPanel.hidden = false;
  renderPermissionFormOptions();
  renderPermissionList();
}

function renderPermissionFormOptions() {
  const employeeSelect = permissionForm.elements.employeeId;
  const roleSelect = permissionForm.elements.roleCode;
  employeeSelect.innerHTML = (permissionOptions?.employees || []).map((employee) =>
    `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name || employee.email)} / ${escapeHtml(employee.email || "")}</option>`
  ).join("");
  roleSelect.innerHTML = (permissionOptions?.roles || []).map((role) =>
    `<option value="${escapeHtml(role.code)}">${escapeHtml(role.name)} (${escapeHtml(role.code)})</option>`
  ).join("");
  updatePermissionScopeOptions();
}

function updatePermissionScopeOptions() {
  const scopeType = permissionForm.elements.scopeType.value;
  const scopeSelect = permissionForm.elements.scopeId;
  if (scopeType === "store") {
    scopeSelect.disabled = false;
    scopeSelect.innerHTML = (permissionOptions?.stores || []).map((store) =>
      `<option value="${escapeHtml(store.id)}">${escapeHtml(store.name)}</option>`
    ).join("");
  } else if (scopeType === "corporation") {
    scopeSelect.disabled = false;
    scopeSelect.innerHTML = (permissionOptions?.corporations || []).map((corp) =>
      `<option value="${escapeHtml(corp.id)}">${escapeHtml(corp.name)}</option>`
    ).join("");
  } else {
    scopeSelect.disabled = true;
    scopeSelect.innerHTML = `<option value="">全体</option>`;
  }
}

function renderPermissionList() {
  const employees = permissionOptions?.employees || [];
  if (!employees.length) {
    permissionList.innerHTML = `<p class="muted">社員データがありません。</p>`;
    return;
  }

  permissionList.innerHTML = employees.map((employee) => `
    <article class="permission-row">
      <div>
        <div class="claim-title">${escapeHtml(employee.name || employee.email)}</div>
        <div class="claim-meta">${escapeHtml(employee.email || "")} / ${escapeHtml(employee.store_name || "")} / ${escapeHtml(employee.corporation_name || "")}</div>
        <div>${renderRoleChips(employee)}</div>
      </div>
    </article>
  `).join("");

  permissionList.querySelectorAll("button[data-remove-role]").forEach((button) => {
    button.addEventListener("click", async () => {
      await removePermission({
        employeeId: button.dataset.employeeId,
        roleCode: button.dataset.roleCode,
        scopeType: button.dataset.scopeType,
        scopeId: button.dataset.scopeId || null,
      });
    });
  });
}

function renderRoleChips(employee) {
  const roles = employee.roles || [];
  if (!roles.length) return `<span class="muted">権限なし</span>`;

  return roles.map((role) => `
    <span class="role-chip">
      ${escapeHtml(role.role_name || role.role_code)}
      <span class="muted">${escapeHtml(role.scope_name || role.scope_type || "")}</span>
      <button class="secondary" type="button"
        data-remove-role="1"
        data-employee-id="${escapeHtml(employee.id)}"
        data-role-code="${escapeHtml(role.role_code)}"
        data-scope-type="${escapeHtml(role.scope_type)}"
        data-scope-id="${escapeHtml(role.scope_id || "")}">削除</button>
    </span>
  `).join("");
}

async function assignPermission(event) {
  event.preventDefault();
  const fd = new FormData(permissionForm);
  const scopeType = String(fd.get("scopeType") || "global");
  const scopeId = scopeType === "global" ? null : String(fd.get("scopeId") || "");
  const { error } = await supabase
    .schema("core")
    .rpc("assign_employee_role", {
      p_employee_id: fd.get("employeeId"),
      p_role_code: fd.get("roleCode"),
      p_scope_type: scopeType,
      p_scope_id: scopeId || null,
    });

  if (error) {
    alert(error.message);
    return;
  }

  await loadPermissionAdmin();
}

async function removePermission({ employeeId, roleCode, scopeType, scopeId }) {
  if (!confirm("この権限を削除しますか？")) return;

  const { error } = await supabase
    .schema("core")
    .rpc("remove_employee_role", {
      p_employee_id: employeeId,
      p_role_code: roleCode,
      p_scope_type: scopeType,
      p_scope_id: scopeId || null,
    });

  if (error) {
    alert(error.message);
    return;
  }

  await loadPermissionAdmin();
}

async function handleReceiptSelected() {
  uploadedReceiptPath = "";
  const file = receiptInput.files?.[0];
  if (!file) {
    receiptStatus.textContent = "レシート未選択";
    return;
  }

  receiptStatus.textContent = `${file.name} を準備中...`;

  try {
    const uploadFile = file.type.startsWith("image/")
      ? await compressImage(file)
      : file;
    const employeeId = currentEmployee?.id;
    if (!employeeId) {
      receiptStatus.textContent = "ログイン社員が未解決です。先にAuth/Core DB連携を確認してください。";
      return;
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${employeeId}/${crypto.randomUUID()}/${safeName}`;
    const { error } = await supabase.storage
      .from("expense-receipts")
      .upload(path, uploadFile, {
        cacheControl: "3600",
        contentType: uploadFile.type || file.type,
        upsert: false,
      });

    if (error) throw error;
    uploadedReceiptPath = path;
    receiptStatus.textContent = "レシートをアップロードしました";
  } catch (error) {
    receiptStatus.textContent = error.message || String(error);
  }
}

async function analyzeReceipt() {
  const ocrText = document.querySelector("#ocrText").value;
  if (!uploadedReceiptPath && !ocrText.trim()) {
    alert("レシート画像を選ぶか、OCRテキストを入力してください。");
    return;
  }

  analyzeReceiptButton.disabled = true;
  receiptStatus.textContent = "AI解析中...";

  let data = null;
  let error = null;

  try {
    const result = await supabase.functions.invoke("analyze-receipt", {
      body: {
        receiptPath: uploadedReceiptPath,
        ocrText,
      },
    });
    data = result.data;
    error = result.error;
  } catch (invokeError) {
    error = invokeError;
  }

  analyzeReceiptButton.disabled = false;

  if (error) {
    if (!ocrText.trim()) {
      receiptStatus.textContent = error.message || "AI解析に失敗しました";
      return;
    }
    data = parseReceiptTextFallback(ocrText);
    receiptStatus.textContent = "Edge Function未接続のため、入力テキストから簡易解析しました。";
  } else {
    receiptStatus.textContent = "AI解析が完了しました。内容を確認してください。";
  }

  fillFormFromReceipt(data || {});
}

function parseReceiptTextFallback(text) {
  const result = {};
  const date = text.match(/(20\d{2})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (date) {
    result.expenseDate = `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;
  }

  const amount = text.match(/(?:合計|総合計|お会計|税込|金額)[^\d]*(\d{1,3}(?:,\d{3})+|\d+)/);
  if (amount) result.amount = Number(amount[1].replaceAll(",", ""));

  const tax = text.match(/(?:消費税|税額)[^\d]*(\d{1,3}(?:,\d{3})+|\d+)/);
  if (tax) result.tax = Number(tax[1].replaceAll(",", ""));

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0]) result.vendor = lines[0].slice(0, 40);

  if (/クレジット|VISA|MASTER|AMEX|PayPay|電子マネー/i.test(text)) {
    result.paymentMethod = "キャッシュレス";
  } else if (/現金/.test(text)) {
    result.paymentMethod = "現金";
  }

  result.purposeCandidate = suggestPurposeFallback(result.vendor || "", result.amount || 0);
  result.accountTitleCandidate = suggestAccountTitleFallback(result.purposeCandidate);
  return result;
}

function suggestPurposeFallback(vendor, amount) {
  return inferExpenseCategory(vendor, amount).purpose;
}

function suggestAccountTitleFallback(purpose) {
  if (purpose === "交通費") return "旅費交通費";
  if (purpose === "研修・教育") return "研修費";
  if (purpose === "会議費") return "会議費";
  if (purpose === "材料購入") return "材料費";
  return "消耗品費";
}

function fillFormFromReceipt(data) {
  setField("expenseDate", data.expenseDate);
  setField("amount", data.amount);
  setField("tax", data.tax);
  setField("vendor", data.vendor);
  setField("paymentMethod", data.paymentMethod);
  setField("purpose", data.purposeCandidate);
  setField("accountTitleCandidate", data.accountTitleCandidate);
  const title = data.vendor && data.amount
    ? `${data.vendor} ${Number(data.amount).toLocaleString("ja-JP")}円`
    : data.vendor || "";
  setField("title", title);
  suggestMissingClaimFields();
}

function setField(name, value) {
  if (value === undefined || value === null || value === "") return;
  const field = claimForm.elements.namedItem(name);
  if (field) field.value = value;
}

function handleClaimFormInput(event) {
  if (!event.target?.name) return;
  if (["vendor", "amount", "expenseDate", "purpose", "paymentMethod"].includes(event.target.name)) {
    suggestMissingClaimFields();
  }
}

function handleClaimFormClick(event) {
  const quickFill = event.target.closest("[data-quick-fill]");
  if (quickFill) {
    setField(quickFill.dataset.quickFill, quickFill.dataset.value);
    suggestMissingClaimFields();
    return;
  }

  const purposePreset = event.target.closest("[data-purpose-preset]");
  if (purposePreset) {
    setField("purpose", purposePreset.dataset.purposePreset);
    setField("accountTitleCandidate", purposePreset.dataset.accountTitle);
    suggestMissingClaimFields();
  }
}

function suggestMissingClaimFields() {
  const vendor = String(claimForm.elements.vendor.value || "").trim();
  const amount = Number(claimForm.elements.amount.value || 0);
  const purpose = String(claimForm.elements.purpose.value || "").trim();
  const inferred = inferExpenseCategory(vendor, amount);
  updateHighAmountReasonVisibility(amount);

  if (amount > 0 && Number(claimForm.elements.tax.value || 0) === 0) {
    claimForm.elements.tax.value = Math.round(amount * 10 / 110);
  }

  if (inferred.confidence !== "none") {
    if (!claimForm.elements.purpose.value) {
      claimForm.elements.purpose.value = inferred.purpose;
    }
    if (!claimForm.elements.accountTitleCandidate.value) {
      claimForm.elements.accountTitleCandidate.value = inferred.accountTitle;
    }
    renderVendorSuggestion(inferred);
  } else {
    clearVendorSuggestion();
  }

  if (purpose && !claimForm.elements.accountTitleCandidate.value) {
    claimForm.elements.accountTitleCandidate.value = suggestAccountTitleFallback(purpose);
  }

  if (!claimForm.elements.title.value && (vendor || purpose || amount > 0)) {
    claimForm.elements.title.value = buildClaimTitle({ vendor, purpose, amount });
  }
}

function buildClaimTitle({ vendor, purpose, amount }) {
  const parts = [];
  if (vendor) parts.push(vendor);
  if (!vendor && purpose) parts.push(purpose);
  if (amount > 0) parts.push(`${amount.toLocaleString("ja-JP")}円`);
  return parts.join(" ");
}

function inferExpenseCategory(vendor, amount = 0) {
  const text = String(vendor || "");
  const rules = [
    {
      pattern: /駅|JR|鉄道|電鉄|地下鉄|タクシ|バス|高速|駐車場|パーキング|交通|Suica|PASMO/i,
      purpose: "交通費",
      accountTitle: "旅費交通費",
      reason: "交通・移動に関する店名",
    },
    {
      pattern: /Amazon|アマゾン|ヨドバシ|ビックカメラ|アスクル|モノタロウ|ホームセンター|文具|ダイソー|セリア|カインズ|コーナン/i,
      purpose: "備品購入",
      accountTitle: "消耗品費",
      reason: "備品・消耗品の購入先",
    },
    {
      pattern: /カフェ|喫茶|コーヒー|レストラン|居酒屋|食堂|会議|スターバックス|ドトール|タリーズ|コメダ/i,
      purpose: "会議費",
      accountTitle: "会議費",
      reason: "打合せ・会議利用の可能性が高い店名",
    },
    {
      pattern: /セミナー|研修|講座|スクール|教育|書籍|本屋|ブック|Amazon Kindle/i,
      purpose: "研修・教育",
      accountTitle: "研修費",
      reason: "研修・学習関連の可能性が高い店名",
    },
    {
      pattern: /材料|資材|仕入|問屋|市場|卸|業務スーパー/i,
      purpose: "材料購入",
      accountTitle: "材料費",
      reason: "材料・資材購入の可能性が高い店名",
    },
  ];

  const matched = rules.find((rule) => rule.pattern.test(text));
  if (matched) return { ...matched, confidence: "high" };
  if (Number(amount || 0) >= 50000) {
    return {
      purpose: "その他",
      accountTitle: "消耗品費",
      reason: "高額申請のため用途確認が必要",
      confidence: "medium",
    };
  }
  return {
    purpose: "備品購入",
    accountTitle: "消耗品費",
    reason: "",
    confidence: text ? "low" : "none",
  };
}

function renderVendorSuggestion(inferred) {
  if (!vendorSuggestion) return;
  if (!inferred.reason) {
    clearVendorSuggestion();
    return;
  }

  vendorSuggestion.hidden = false;
  vendorSuggestion.textContent = `推定: ${inferred.purpose} / ${inferred.accountTitle} (${inferred.reason})`;
}

function clearVendorSuggestion() {
  if (!vendorSuggestion) return;
  vendorSuggestion.hidden = true;
  vendorSuggestion.textContent = "";
}

async function submitClaim(event) {
  event.preventDefault();
  const fd = new FormData(claimForm);
  const precheck = validateClaimBeforeSubmit(fd);
  const duplicateWarnings = await findPossibleDuplicateClaims(fd);
  precheck.warnings.push(...duplicateWarnings);

  renderClaimPrecheck(precheck);

  if (precheck.errors.length) {
    claimPrecheck.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (precheck.warnings.length && !confirm(`${precheck.warnings.join("\n")}\n\nこのまま申請しますか？`)) {
    return;
  }

  const purposeWithReason = buildPurposeWithReason(fd);
  const payload = {
    p_title: fd.get("title"),
    p_expense_date: fd.get("expenseDate"),
    p_amount: Number(fd.get("amount")),
    p_tax: Number(fd.get("tax") || 0),
    p_vendor_name_raw: fd.get("vendor") || "",
    p_payment_method: fd.get("paymentMethod") || "",
    p_purpose: purposeWithReason,
    p_ai_account_title_candidate: fd.get("accountTitleCandidate") || "",
  };

  const { data, error } = await supabase
    .schema("finance")
    .rpc("create_expense_claim", payload);

  if (error) {
    alert(error.message);
    return;
  }

  if (uploadedReceiptPath && data?.id) {
    await supabase
      .schema("finance")
      .from("expense_receipts")
      .insert({
        expense_claim_id: data.id,
        storage_path: uploadedReceiptPath,
        file_name: receiptInput.files?.[0]?.name || "",
        mime_type: receiptInput.files?.[0]?.type || "",
      });
  }

  try {
    await attachClaimToMonthlyReport(data, fd.get("expenseDate"));
    setMonthlyFiscalMonthFromExpenseDate(fd.get("expenseDate"));
  } catch (monthlyError) {
    alert(`明細は保存しましたが、月次精算への自動追加に失敗しました。\n${monthlyError.message}`);
  }

  saveLastClaimDefaults(fd);
  claimForm.reset();
  updateHighAmountReasonVisibility(0);
  uploadedReceiptPath = "";
  receiptStatus.textContent = "レシート未選択";
  clearClaimPrecheck();
  renderLastClaimHint();
  await loadDashboard();
  await loadClaims();
  await loadMonthlyReports();
}

function saveLastClaimDefaults(fd) {
  const defaults = {
    paymentMethod: String(fd.get("paymentMethod") || "").trim(),
    purpose: String(fd.get("purpose") || "").trim(),
    accountTitleCandidate: String(fd.get("accountTitleCandidate") || "").trim(),
    vendor: String(fd.get("vendor") || "").trim(),
    savedAt: new Date().toISOString(),
  };

  localStorage.setItem(lastClaimStorageKey(), JSON.stringify(defaults));
}

function applyLastClaimDefaults() {
  const defaults = loadLastClaimDefaults();
  if (!defaults) {
    alert("まだ前回入力がありません。1件申請すると次回から使えます。");
    return;
  }

  setField("paymentMethod", defaults.paymentMethod);
  setField("purpose", defaults.purpose);
  setField("accountTitleCandidate", defaults.accountTitleCandidate);

  const currentVendor = String(claimForm.elements.vendor.value || "").trim();
  if (!currentVendor && defaults.vendor) {
    setField("vendor", defaults.vendor);
  }

  suggestMissingClaimFields();
  renderLastClaimHint();
}

function renderLastClaimHint() {
  if (!lastClaimHint || !applyLastClaimButton) return;
  const defaults = loadLastClaimDefaults();
  if (!defaults) {
    applyLastClaimButton.disabled = true;
    lastClaimHint.textContent = "1件申請すると、次回から用途・支払方法・勘定科目候補を再利用できます";
    return;
  }

  applyLastClaimButton.disabled = false;
  const parts = [defaults.purpose, defaults.paymentMethod, defaults.accountTitleCandidate].filter(Boolean);
  lastClaimHint.textContent = parts.length
    ? `前回: ${parts.join(" / ")}`
    : "前回入力を再利用できます";
}

function loadLastClaimDefaults() {
  try {
    const raw = localStorage.getItem(lastClaimStorageKey());
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function lastClaimStorageKey() {
  return `nov-expense-last-claim:${currentEmployee?.id || "anonymous"}`;
}

function validateClaimBeforeSubmit(fd) {
  const errors = [];
  const warnings = [];
  const amount = Number(fd.get("amount") || 0);
  const tax = Number(fd.get("tax") || 0);

  if (!String(fd.get("expenseDate") || "").trim()) errors.push("日付を入力してください。");
  if (!amount || amount <= 0) errors.push("金額を1円以上で入力してください。");
  if (!String(fd.get("vendor") || "").trim()) errors.push("店名を入力してください。");
  if (!String(fd.get("purpose") || "").trim()) errors.push("用途を入力してください。");
  if (!String(fd.get("title") || "").trim()) errors.push("タイトルを入力してください。");
  if (tax < 0) errors.push("消費税は0円以上で入力してください。");
  if (amount >= 100000 && !String(fd.get("highAmountReason") || "").trim()) {
    errors.push("10万円以上の高額申請は理由を入力してください。");
  }

  if (!uploadedReceiptPath) {
    warnings.push("レシートが未添付です。後で経理確認で差戻しになる可能性があります。");
  }

  if (amount >= 50000) {
    warnings.push("5万円以上の高額申請です。承認者が判断しやすいよう、用途・理由を確認してください。");
  }

  if (!String(fd.get("paymentMethod") || "").trim()) {
    warnings.push("支払方法が未入力です。");
  }

  if (!String(fd.get("accountTitleCandidate") || "").trim()) {
    warnings.push("勘定科目候補が未入力です。経理確認の手間が増える可能性があります。");
  }

  return { errors, warnings };
}

function updateHighAmountReasonVisibility(amount) {
  if (!highAmountReasonField) return;
  highAmountReasonField.hidden = !(Number(amount || 0) >= 100000);
}

function buildPurposeWithReason(fd) {
  const purpose = String(fd.get("purpose") || "").trim();
  const reason = String(fd.get("highAmountReason") || "").trim();
  if (!reason) return purpose;
  return `${purpose} / 高額理由: ${reason}`;
}

async function findPossibleDuplicateClaims(fd) {
  const warnings = [];
  const expenseDate = String(fd.get("expenseDate") || "").trim();
  const amount = Number(fd.get("amount") || 0);
  const vendor = normalizeText(fd.get("vendor"));

  if (!expenseDate || !amount) return warnings;

  const { data, error } = await supabase
    .schema("finance")
    .from("expense_claims")
    .select("id,title,expense_date,amount,vendor_name_raw,status")
    .eq("expense_date", expenseDate)
    .eq("amount", amount)
    .neq("status", "returned")
    .limit(10);

  if (error) {
    console.warn(error);
    return warnings;
  }

  const duplicates = (data || []).filter((row) => {
    const existingVendor = normalizeText(row.vendor_name_raw);
    return !vendor || !existingVendor || vendor.includes(existingVendor) || existingVendor.includes(vendor);
  });

  if (duplicates.length) {
    const titles = duplicates
      .slice(0, 3)
      .map((row) => row.title || row.vendor_name_raw || row.id)
      .join(" / ");
    warnings.push(`同じ日付・金額の申請が既にあります。重複申請ではないか確認してください。候補: ${titles}`);
  }

  return warnings;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[　・･\-ー−]/g, "");
}

function renderClaimPrecheck({ errors, warnings }) {
  if (!claimPrecheck) return;
  if (!errors.length && !warnings.length) {
    clearClaimPrecheck();
    return;
  }

  claimPrecheck.hidden = false;
  claimPrecheck.innerHTML = `
    ${errors.length ? `<div class="precheck-errors"><strong>申請前に修正してください</strong>${renderPrecheckList(errors)}</div>` : ""}
    ${warnings.length ? `<div class="precheck-warnings"><strong>確認してください</strong>${renderPrecheckList(warnings)}</div>` : ""}
  `;
}

function renderPrecheckList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function clearClaimPrecheck() {
  if (!claimPrecheck) return;
  claimPrecheck.hidden = true;
  claimPrecheck.innerHTML = "";
}

async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const maxSize = 1600;
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.82);
  });

  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function renderClaim(row) {
  const flags = aiReviewFlags(row);
  const priority = reviewPriority(row);
  return `
    <article class="claim${flags.length ? " claim-review" : ""}" data-claim-id="${escapeHtml(row.id)}">
      <label class="claim-select">
        <input type="checkbox" data-claim-select="${escapeHtml(row.id)}" />
        <span>選択</span>
      </label>
      <div>
        <div class="claim-title">
          ${flags.length ? renderPriorityBadge(priority) : ""}
          ${escapeHtml(row.title)}
        </div>
        <div class="claim-meta">${escapeHtml(row.expense_date)} / ${escapeHtml(row.vendor_name_raw || "")} / ${Number(row.amount || 0).toLocaleString("ja-JP")}円</div>
        <div class="claim-meta">用途: ${escapeHtml(row.purpose || "")}</div>
        <div class="claim-meta">AI勘定科目候補: ${escapeHtml(row.ai_account_title_candidate || "未設定")} / リスク: ${escapeHtml(riskLabel(row))}</div>
        ${renderCsvExportBadge(row.id)}
        ${flags.length ? renderReviewFlags(flags) : ""}
        ${renderAuditTrail(row.id)}
      </div>
      <div class="claim-actions">
        <span>${escapeHtml(statusLabel(row.status))}</span>
        ${renderActionButtons(row)}
      </div>
    </article>
  `;
}

function renderCsvExportBadge(expenseClaimId) {
  const exportInfo = exportedClaimCache.get(expenseClaimId);
  if (!exportInfo) return "";

  const exportedBy = exportInfo.last_exported_by_name || exportInfo.last_exported_by_email || "出力者不明";
  const exportCount = Number(exportInfo.export_count || 0);
  const suffix = exportCount > 1 ? ` / ${exportCount}回` : "";

  return `
    <div class="exported-claim-badge">
      CSV出力済 ${escapeHtml(formatDateTime(exportInfo.last_exported_at))} / ${escapeHtml(exportedBy)}${escapeHtml(suffix)}
    </div>
  `;
}

function reviewPriority(row) {
  const score = reviewPriorityScore(row);
  if (score >= 80) return { label: "高", className: "high" };
  if (score >= 40) return { label: "中", className: "medium" };
  if (score > 0) return { label: "低", className: "low" };
  return { label: "通常", className: "normal" };
}

function reviewPriorityScore(row) {
  let score = 0;
  if (row.duplicate_risk === "high") score += 90;
  if (row.anomaly_risk === "high") score += 80;
  if (!Array.isArray(row.expense_receipts) || row.expense_receipts.length === 0) score += 70;
  if (Number(row.amount || 0) >= 100000) score += 70;
  else if (Number(row.amount || 0) >= 50000) score += 45;
  if (row.budget_risk === "high") score += 40;
  if (!row.ai_account_title_candidate) score += 35;
  if (String(row.purpose || "").includes("高額理由:")) score += 20;
  return score;
}

function renderPriorityBadge(priority) {
  return `<span class="priority-badge priority-${escapeHtml(priority.className)}">優先度 ${escapeHtml(priority.label)}</span>`;
}

function aiReviewFlags(row) {
  const flags = [];
  if (row.duplicate_risk === "high") flags.push("重複注意");
  if (row.anomaly_risk === "high") flags.push("異常値");
  if (row.budget_risk === "high") flags.push("予算超過");
  if (Number(row.amount || 0) >= 50000) flags.push("高額");
  if (!row.ai_account_title_candidate) flags.push("科目未確定");
  if (!Array.isArray(row.expense_receipts) || row.expense_receipts.length === 0) flags.push("レシートなし");
  if (String(row.purpose || "").includes("高額理由:")) flags.push("高額理由あり");
  return flags;
}

function renderReviewFlags(flags) {
  return `
    <div class="review-flags">
      ${flags.map((flag) => `<span>${escapeHtml(flag)}</span>`).join("")}
    </div>
  `;
}

function renderAuditTrail(expenseClaimId) {
  const logs = auditLogCache.get(expenseClaimId) || [];
  if (!logs.length) return `<div class="audit-trail muted">履歴なし</div>`;

  return `
    <div class="audit-trail">
      ${logs.map((log) => `
        <div class="audit-item">
          <span>${escapeHtml(formatDateTime(log.created_at))}</span>
          <strong>${escapeHtml(actionLabel(log.action))}</strong>
          <span>${escapeHtml(statusLabel(log.before_status) || "-")} → ${escapeHtml(statusLabel(log.after_status) || "-")}</span>
          ${log.comment ? `<span>${escapeHtml(log.comment)}</span>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function actionLabel(action) {
  return {
    submit: "申請",
    approve: "承認",
    return: "差戻し",
    settle: "精算",
  }[action] || action;
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderActionButtons(row) {
  if (row.status === "returned") {
    return `<button class="secondary" type="button" data-resubmit-id="${escapeHtml(row.id)}">再申請</button>`;
  }

  if (!canActOnClaim(row)) return "";

  if (["manager_pending", "accounting_pending", "executive_pending"].includes(row.status)) {
    return `
      <button type="button" data-action="approve" data-id="${escapeHtml(row.id)}">承認</button>
      <button class="secondary" type="button" data-action="return" data-id="${escapeHtml(row.id)}">差戻し</button>
    `;
  }

  if (row.status === "settlement_pending") {
    return `<button type="button" data-action="settle" data-id="${escapeHtml(row.id)}">精算済み</button>`;
  }

  return "";
}

function riskLabel(row) {
  const risks = [];
  if (row.duplicate_risk === "high") risks.push("重複");
  if (row.anomaly_risk === "high") risks.push("異常値");
  if (row.budget_risk === "high") risks.push("予算");
  return risks.length ? risks.join(" / ") : "通常";
}

function bindClaimActions() {
  claimList.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const expenseClaimId = button.dataset.id;
      const comment = await requestWorkflowComment(action);
      if (comment === null) return;
      await runWorkflowAction(action, expenseClaimId, comment);
    });
  });

  claimList.querySelectorAll("button[data-resubmit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const claim = claimsCache.find((row) => row.id === button.dataset.resubmitId);
      if (claim) fillClaimFormForResubmit(claim);
    });
  });
}

function requestWorkflowComment(action) {
  if (!workflowCommentDialog || !workflowCommentForm) {
    return Promise.resolve(prompt(workflowCommentLabel(action), "") ?? "");
  }

  workflowCommentTitle.textContent = workflowCommentLabel(action);
  workflowCommentText.value = "";
  renderWorkflowCommentTemplates(action);

  return new Promise((resolve) => {
    const handleClose = () => {
      workflowCommentDialog.removeEventListener("close", handleClose);
      resolve(workflowCommentDialog.returnValue === "ok" ? workflowCommentText.value.trim() : null);
    };
    workflowCommentDialog.addEventListener("close", handleClose);
    workflowCommentDialog.showModal();
  });
}

function renderWorkflowCommentTemplates(action) {
  const templates = workflowCommentTemplates(action);
  workflowCommentTemplate.innerHTML = templates.map((template) =>
    `<option value="${escapeHtml(template.value)}">${escapeHtml(template.label)}</option>`
  ).join("");
  workflowCommentTemplate.onchange = () => {
    workflowCommentText.value = workflowCommentTemplate.value;
  };
  workflowCommentText.value = templates[0]?.value || "";
}

function workflowCommentLabel(action) {
  return {
    approve: "承認コメント",
    return: "差戻し理由",
    settle: "振込メモ",
  }[action] || "コメント";
}

function workflowCommentTemplates(action) {
  if (action === "return") {
    return [
      { label: "レシート添付なし", value: "レシートが添付されていません。レシートを添付して再申請してください。" },
      { label: "用途が不明", value: "用途が不明確です。何のための支出か分かるように補足してください。" },
      { label: "金額・日付の確認", value: "金額または日付がレシート内容と一致しているか確認してください。" },
      { label: "高額理由不足", value: "高額申請の理由が不足しています。購入理由・必要性を追記してください。" },
      { label: "重複の可能性", value: "同じ日付・金額の申請があるため、重複申請でないか確認してください。" },
      { label: "その他", value: "" },
    ];
  }

  if (action === "settle") {
    return [
      { label: "振込完了", value: "振込処理済み" },
      { label: "現金精算済み", value: "現金精算済み" },
      { label: "その他", value: "" },
    ];
  }

  return [
    { label: "問題なし", value: "内容確認済み" },
    { label: "その他", value: "" },
  ];
}

function fillClaimFormForResubmit(claim) {
  setField("expenseDate", claim.expense_date);
  setField("amount", claim.amount);
  setField("tax", claim.tax);
  setField("vendor", claim.vendor_name_raw);
  setField("paymentMethod", claim.payment_method);
  setField("purpose", stripHighAmountReason(claim.purpose));
  setField("accountTitleCandidate", claim.ai_account_title_candidate);
  setField("title", claim.title ? `再申請: ${claim.title.replace(/^再申請:\s*/, "")}` : "再申請");
  suggestMissingClaimFields();
  claimForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function stripHighAmountReason(value) {
  return String(value || "").split(" / 高額理由:")[0].trim();
}

async function runMonthlyWorkflowAction(action, monthlyReportId) {
  if (!monthlyReportId) return;

  const report = monthlyReportsCache.find((row) => row.id === monthlyReportId);
  if (!report || !canActOnMonthlyReport(report, action)) {
    alert("現在の権限または状態では処理できません。");
    return;
  }

  const comment = await requestWorkflowComment(action);
  if (comment === null) return;

  const { error } = action === "settle"
    ? await supabase
      .schema("finance")
      .rpc("settle_monthly_expense_report", {
        p_report_id: monthlyReportId,
        p_comment: comment,
      })
    : await supabase
      .schema("finance")
      .rpc("accounting_check_monthly_expense_report", {
        p_report_id: monthlyReportId,
        p_action: action,
        p_comment: comment,
      });

  if (error) {
    alert(error.message);
    return;
  }

  await refreshAll();
}

async function runWorkflowAction(action, expenseClaimId, comment) {
  const { error } = action === "settle"
    ? await supabase
      .schema("finance")
      .rpc("settle_expense_claim", {
        p_expense_claim_id: expenseClaimId,
        p_transfer_memo: comment,
      })
    : await supabase
      .schema("finance")
      .rpc("act_expense_claim", {
        p_expense_claim_id: expenseClaimId,
        p_action: action,
        p_comment: comment,
      });

  if (error) {
    alert(error.message);
    return;
  }

  await loadDashboard();
  await loadClaims();
}

async function runBulkWorkflowAction(action) {
  const selectedIds = selectedClaimIds();
  if (!selectedIds.length) {
    alert("対象の申請を選択してください。");
    return;
  }

  const targets = selectedIds
    .map((id) => claimsCache.find((row) => row.id === id))
    .filter(Boolean)
    .filter((claim) => canBulkActOnClaim(claim, action));

  if (!targets.length) {
    alert("選択された申請の中に、現在の権限・状態で一括処理できるものがありません。");
    return;
  }

  const skipped = selectedIds.length - targets.length;
  const label = action === "settle" ? "精算済み" : "承認";
  const message = skipped > 0
    ? `${targets.length}件を${label}します。${skipped}件は状態または権限のため対象外です。`
    : `${targets.length}件を${label}します。`;

  if (!confirm(message)) return;

  setBulkButtonsDisabled(true);
  const errors = [];

  for (const claim of targets) {
    const { error } = action === "settle"
      ? await supabase
        .schema("finance")
        .rpc("settle_expense_claim", {
          p_expense_claim_id: claim.id,
          p_transfer_memo: "一括精算済み",
        })
      : await supabase
        .schema("finance")
        .rpc("act_expense_claim", {
          p_expense_claim_id: claim.id,
          p_action: "approve",
          p_comment: "一括承認",
        });

    if (error) errors.push(`${claim.title || claim.id}: ${error.message}`);
  }

  setBulkButtonsDisabled(false);
  await loadDashboard();
  await loadClaims();

  if (errors.length) {
    alert(`一部の処理に失敗しました。\n${errors.slice(0, 5).join("\n")}`);
  }
}

function selectedClaimIds() {
  return [...claimList.querySelectorAll("input[data-claim-select]:checked")]
    .map((input) => input.dataset.claimSelect)
    .filter(Boolean);
}

function canBulkActOnClaim(claim, action) {
  if (action === "settle") return claim.status === "settlement_pending" && canActOnClaim(claim);
  if (action === "approve") return ["manager_pending", "accounting_pending", "executive_pending"].includes(claim.status) && canActOnClaim(claim);
  return false;
}

function setBulkButtonsDisabled(disabled) {
  bulkApproveButton.disabled = disabled;
  bulkSettleButton.disabled = disabled;
}

async function exportAccountingCsv() {
  const csvFormat = csvFormatFilter?.value || "review";
  const csvStatus = csvStatusFilter?.value || "settlement_pending";
  const { data, error } = await supabase
    .schema("finance")
    .rpc("export_expense_accounting_csv", {
      p_status: csvStatus,
    });

  if (error) {
    alert(error.message);
    return;
  }

  const rows = data || [];
  if (!rows.length) {
    alert("出力対象の明細がありません。CSVステータスを確認してください。");
    return;
  }

  const existingExports = await loadExistingExportRecords(rows);
  if (existingExports.length) {
    const sample = existingExports.slice(0, 5).map((row) =>
      `・${formatDateTime(row.last_exported_at)} ${row.last_file_name || ""}`
    ).join("\n");
    const more = existingExports.length > 5 ? `\nほか ${existingExports.length - 5}件` : "";
    if (!confirm(`このCSVには既に出力済みの明細が ${existingExports.length}件 含まれています。\n二重取込にならないか確認してください。\n\n${sample}${more}\n\nこのままCSVを出力しますか？`)) {
      return;
    }
  }

  const csv = csvFormat.startsWith("yayoi")
    ? buildYayoiCsv(rows, { includeHeader: csvFormat === "yayoi_review" })
    : buildReviewCsv(rows);

  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = `${csvFilePrefix(csvFormat)}_${csvStatus}_${formatFileDate(new Date())}.csv`;
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);

  await recordAccountingExport({
    csvFormat,
    csvStatus,
    fileName,
    rows,
  });
  await loadAccountingExportHistory();
}

async function loadExistingExportRecords(rows) {
  const claimIds = rows
    .map((row) => row.expense_claim_id)
    .filter(Boolean);
  if (!claimIds.length) return [];

  const { data, error } = await supabase
    .schema("finance")
    .from("accounting_exported_claims")
    .select("expense_claim_id,export_count,last_exported_at,last_file_name")
    .in("expense_claim_id", claimIds);

  if (error) {
    console.warn(error);
    return [];
  }

  return data || [];
}

async function recordAccountingExport({ csvFormat, csvStatus, fileName, rows }) {
  const claimIds = rows
    .map((row) => row.expense_claim_id)
    .filter(Boolean);

  const { error } = await supabase
    .schema("finance")
    .rpc("record_accounting_export", {
      p_export_format: csvFormat,
      p_status_filter: csvStatus,
      p_file_name: fileName,
      p_expense_claim_ids: claimIds,
    });

  if (error) {
    alert(`CSVは出力しましたが、出力履歴の記録に失敗しました。\n${error.message}`);
  }
}

async function loadAccountingExportHistory() {
  if (!accountingExportHistory || !currentEmployee) return;
  if (!hasRole(currentEmployee, "accounting") && !hasRole(currentEmployee, "executive")) {
    accountingExportHistory.innerHTML = `<p class="muted">経理権限で表示されます。</p>`;
    return;
  }

  const { data, error } = await supabase
    .schema("finance")
    .from("accounting_export_history")
    .select("id,export_format,status_filter,file_name,row_count,created_at,exported_by_name,exported_by_email")
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    accountingExportHistory.innerHTML = `<p class="muted">CSV出力履歴を取得できませんでした。</p>`;
    console.warn(error);
    return;
  }

  const rows = data || [];
  if (!rows.length) {
    accountingExportHistory.innerHTML = `<p class="muted">CSV出力履歴はまだありません。</p>`;
    return;
  }

  accountingExportHistory.innerHTML = rows.map((row) => `
    <article class="export-history-item">
      <div>
        <strong>${escapeHtml(csvFormatLabel(row.export_format))}</strong>
        <p class="muted">${escapeHtml(row.file_name)} / ${escapeHtml(csvStatusLabel(row.status_filter))}</p>
      </div>
      <div class="export-history-meta">
        <strong>${Number(row.row_count || 0)}件</strong>
        <span>${escapeHtml(formatDateTime(row.created_at))}</span>
        <span>${escapeHtml(row.exported_by_name || row.exported_by_email || "")}</span>
      </div>
    </article>
  `).join("");
}

function csvFormatLabel(format) {
  return {
    review: "確認用CSV",
    yayoi_review: "弥生確認CSV",
    yayoi_import: "弥生取込CSV",
  }[format] || format || "";
}

function csvStatusLabel(status) {
  return {
    settlement_pending: "精算待ち",
    settled: "精算済み",
    all: "全件",
  }[status] || status || "";
}

function buildReviewCsv(rows) {
  const columns = [
    ["申請ID", "expense_claim_id"],
    ["経費日", "expense_date"],
    ["申請者", "applicant_name"],
    ["社員コード", "employee_code"],
    ["店舗", "store_name"],
    ["法人", "corporation_name"],
    ["部署", "department_name"],
    ["取引先/店名", "vendor_name"],
    ["用途", "purpose"],
    ["借方勘定科目", "debit_account_title"],
    ["金額", "debit_amount"],
    ["消費税", "tax_amount"],
    ["貸方勘定科目", "credit_account_title"],
    ["支払方法", "payment_method"],
    ["精算状態", "settlement_status"],
    ["申請状態", "claim_status"],
    ["リスク", "risk_flags"],
    ["メモ", "memo"],
  ];

  return [
    columns.map(([label]) => csvCell(label)).join(","),
    ...rows.map((row) => columns.map(([, key]) => csvCell(row[key])).join(",")),
  ].join("\n");
}

function buildYayoiCsv(rows, { includeHeader = false } = {}) {
  const lines = rows.map((row) => {
    const amount = Number(row.debit_amount || 0);
    const tax = Number(row.tax_amount || 0);
    const debitTaxType = yayoiDebitTaxType(tax);
    const summary = buildYayoiSummary(row);

    return [
      "2000", // 識別フラグ: 仕訳データ
      "",
      "",
      formatYayoiDate(row.expense_date),
      row.debit_account_title || "消耗品費",
      "",
      row.store_name || row.department_name || "",
      debitTaxType,
      amount,
      tax,
      row.credit_account_title || "現金",
      "",
      "",
      "対象外",
      amount,
      0,
      summary,
      yayoiVoucherNo(row),
      "",
      "0",
      "",
      row.memo || "",
      "",
      "",
      "",
    ].map(csvCell).join(",");
  });

  if (!includeHeader) return lines.join("\n");

  return [
    yayoiCsvColumns().map(csvCell).join(","),
    ...lines,
  ].join("\n");
}

function yayoiCsvColumns() {
  return [
    "識別フラグ",
    "伝票No.",
    "決算",
    "取引日付",
    "借方勘定科目",
    "借方補助科目",
    "借方部門",
    "借方税区分",
    "借方金額",
    "借方税金額",
    "貸方勘定科目",
    "貸方補助科目",
    "貸方部門",
    "貸方税区分",
    "貸方金額",
    "貸方税金額",
    "摘要",
    "番号",
    "期日",
    "タイプ",
    "生成元",
    "仕訳メモ",
    "付箋1",
    "付箋2",
    "調整",
  ];
}

function yayoiDebitTaxType(tax) {
  return Number(tax || 0) > 0 ? "課税仕入10%" : "対象外";
}

function buildYayoiSummary(row) {
  return [
      row.vendor_name,
      row.purpose,
      row.applicant_name,
      row.expense_claim_id ? `ExpenseHub:${String(row.expense_claim_id).slice(0, 8)}` : "",
    ].filter(Boolean).join(" / ").slice(0, 120);
}

function yayoiVoucherNo(row) {
  return row.expense_claim_id ? String(row.expense_claim_id).slice(0, 8) : "";
}

function csvFilePrefix(csvFormat) {
  return {
    review: "expense_review",
    yayoi_review: "yayoi_review",
    yayoi_import: "yayoi_import",
    yayoi: "yayoi_import",
  }[csvFormat] || "expense_export";
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function formatYayoiDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replaceAll("-", "/");
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function formatFileDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function formatMonth(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 7);
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, "0")}月`;
}

function statusLabel(status) {
  return {
    draft: "下書き",
    submitted: "提出済み",
    manager_pending: "店長承認待ち",
    accounting_pending: "経理確認待ち",
    executive_pending: "二次承認待ち",
    returned: "差戻し",
    settlement_pending: "精算待ち",
    settled: "精算済み",
  }[status] || status;
}

function nullIfEmpty(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}
