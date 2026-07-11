const CANCELABLE_SELF_STATUSES = new Set(["draft", "returned"]);
const CANCELABLE_MANAGEMENT_STATUSES = new Set([
  "draft",
  "returned",
  "manager_pending",
  "accounting_pending",
  "executive_pending",
  "settlement_pending",
]);
const MANAGEMENT_ROLE_KEYS = new Set([
  "super_admin",
  "admin",
  "executive",
  "accounting",
  "backoffice",
]);

const SAFE_MESSAGES = Object.freeze({
  reason_required: "取消理由を入力してください。",
  reason_too_long: "取消理由は500文字以内で入力してください。",
  client_confirmation_required: "内容を確認してから取消を実行してください。",
  cancel_request_in_progress: "この明細の取消処理を確認中です。完了までお待ちください。",
  authorization_required: "ログイン状態を確認できません。再ログインしてください。",
  authorization_invalid: "ログインの有効期限が切れています。再ログインしてください。",
  actor_login_disabled: "このアカウントでは現在この操作を利用できません。",
  actor_resolution_failed: "操作する社員情報を確認できませんでした。管理者へ連絡してください。",
  permission_denied: "この明細を取り消す権限がありません。",
  claim_not_found: "対象の明細が見つかりません。画面を更新してください。",
  claim_not_cancelable: "この明細は現在の状態では取り消せません。画面を更新してください。",
  claim_already_exported: "CSV出力済みの明細は取り消せません。",
  cancel_rejected: "取消を完了できませんでした。明細の状態と権限を確認してください。",
  cancel_request_failed: "取消処理を確認できませんでした。時間をおいて再度お試しください。",
});

export function isCancelClaimEligibleHint({ claim, currentEmployee, exported = false }) {
  if (!claim || !currentEmployee || exported) return false;
  if (["cancelled", "settled"].includes(String(claim.status || ""))) return false;

  const isApplicant = String(claim.applicant_employee_id || "") === String(currentEmployee.id || "");
  if (isApplicant && CANCELABLE_SELF_STATUSES.has(claim.status)) return true;

  const roleKeys = (currentEmployee.roles || [])
    .flatMap((role) => [role?.role_code, role?.code])
    .filter(Boolean)
    .map(String);
  const hasManagementRole = roleKeys.some((roleKey) => MANAGEMENT_ROLE_KEYS.has(roleKey));
  return hasManagementRole && CANCELABLE_MANAGEMENT_STATUSES.has(claim.status);
}

export function safeCancelMessage(safeCode, status = 500) {
  if (safeCode && SAFE_MESSAGES[safeCode]) return SAFE_MESSAGES[safeCode];
  if (status === 401) return SAFE_MESSAGES.authorization_invalid;
  if (status === 403) return SAFE_MESSAGES.permission_denied;
  if (status === 404) return SAFE_MESSAGES.claim_not_found;
  if (status === 409) return SAFE_MESSAGES.claim_not_cancelable;
  return SAFE_MESSAGES.cancel_request_failed;
}

export function createCancelClaimAdapter({ endpoint, getAccessToken, fetchImpl = fetch }) {
  const inFlightClaimIds = new Set();

  return async function cancelClaim({ claimId, reason, clientConfirmation }) {
    const normalizedClaimId = String(claimId || "").trim();
    if (!normalizedClaimId) throw new CancelAdapterError("claim_id_required", 400);
    const normalizedReason = normalizeCancelReason(reason);
    if (clientConfirmation !== true) {
      throw new CancelAdapterError("client_confirmation_required", 400);
    }
    if (inFlightClaimIds.has(normalizedClaimId)) {
      throw new CancelAdapterError("cancel_request_in_progress", 409);
    }

    const token = await getAccessToken();
    if (!token) throw new CancelAdapterError("authorization_required", 401);

    inFlightClaimIds.add(normalizedClaimId);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          claimId: normalizedClaimId,
          reason: normalizedReason,
          clientConfirmation: true,
        }),
      });

      let result = {};
      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok || result?.ok !== true) {
        throw new CancelAdapterError(
          typeof result?.safeCode === "string" ? result.safeCode : "cancel_request_failed",
          response.status || 500,
        );
      }

      return { ok: true, status: "cancelled" };
    } finally {
      inFlightClaimIds.delete(normalizedClaimId);
    }
  };
}

function normalizeCancelReason(value) {
  const reason = String(value || "").trim();
  if (!reason) throw new CancelAdapterError("reason_required", 400);
  if (reason.length > 500) throw new CancelAdapterError("reason_too_long", 400);
  return reason;
}

class CancelAdapterError extends Error {
  constructor(safeCode, status) {
    super(safeCode);
    this.name = "CancelAdapterError";
    this.safeCode = safeCode;
    this.status = status;
    this.userMessage = safeCancelMessage(safeCode, status);
  }
}
