#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "請先設定 GOOGLE_CLOUD_PROJECT，或執行 gcloud config set project PROJECT_ID。" >&2
  exit 2
fi

ensure_secret() {
  local name="$1"
  if ! gcloud secrets describe "${name}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud secrets create "${name}" --replication-policy automatic --project "${PROJECT_ID}"
  fi
}

add_env_secret() {
  local secret_name="$1"
  local env_name="$2"
  local value="${!env_name:-}"
  if [[ -z "${value}" ]]; then
    echo "缺少環境變數 ${env_name}，未更新 ${secret_name}。" >&2
    return 1
  fi
  ensure_secret "${secret_name}"
  printf '%s' "${value}" | gcloud secrets versions add "${secret_name}" \
    --data-file=- --project "${PROJECT_ID}" >/dev/null
  echo "已安全更新 ${secret_name}。"
}

ensure_secret github-token
gh auth token | gcloud secrets versions add github-token \
  --data-file=- --project "${PROJECT_ID}" >/dev/null
echo "已從 GitHub CLI 安全更新 github-token。"

add_env_secret supabase-url SUPABASE_URL
add_env_secret supabase-service-role-key SUPABASE_SERVICE_ROLE_KEY
