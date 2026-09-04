#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GOOGLE_CLOUD_REGION:-asia-east1}"
TIME_ZONE="${BATCH_TIME_ZONE:-Asia/Taipei}"
AR_REPOSITORY="market-batches"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}/runner:latest"
RUNTIME_SA_NAME="market-batch-runtime"
SCHEDULER_SA_NAME="market-batch-scheduler"
RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SCHEDULER_SA="${SCHEDULER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "請先設定 GOOGLE_CLOUD_PROJECT，或執行 gcloud config set project PROJECT_ID。" >&2
  exit 2
fi

for secret in github-token supabase-url supabase-service-role-key; do
  if ! gcloud secrets describe "${secret}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    echo "缺少 Secret Manager secret：${secret}" >&2
    echo "請先執行 infra/cloud-run/load-secrets.sh。" >&2
    exit 2
  fi
done

gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  translate.googleapis.com \
  secretmanager.googleapis.com \
  --project "${PROJECT_ID}"

if ! gcloud artifacts repositories describe "${AR_REPOSITORY}" \
  --location "${REGION}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${AR_REPOSITORY}" \
    --repository-format docker \
    --location "${REGION}" \
    --description "Market data and morning report batch images" \
    --project "${PROJECT_ID}"
fi

gcloud artifacts repositories set-cleanup-policies "${AR_REPOSITORY}" \
  --location "${REGION}" \
  --policy "$(dirname "$0")/artifact-cleanup-policy.json" \
  --project "${PROJECT_ID}" >/dev/null

for account in "${RUNTIME_SA_NAME}" "${SCHEDULER_SA_NAME}"; do
  if ! gcloud iam service-accounts describe "${account}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project "${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud iam service-accounts create "${account}" \
      --display-name "${account}" \
      --project "${PROJECT_ID}"
  fi
done

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${RUNTIME_SA}" \
  --role roles/secretmanager.secretAccessor \
  --condition None >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${RUNTIME_SA}" \
  --role roles/cloudtranslate.user \
  --condition None >/dev/null

if [[ "${SKIP_BUILD:-false}" != "true" ]]; then
  gcloud builds submit "$(dirname "$0")" --tag "${IMAGE}" --project "${PROJECT_ID}"
else
  echo "SKIP_BUILD=true，沿用既有映像：${IMAGE}"
fi

COMMON_ENV="GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GITHUB_REPOSITORY=garyfan1973/tw-etf-tracker-v2.0,GITHUB_BRANCH=main,MORNING_REPORT_BASE_URL=https://tw-etf-tracker-v2-0.vercel.app"
COMMON_SECRETS="GITHUB_TOKEN=github-token:latest,SUPABASE_URL=supabase-url:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest"

deploy_job() {
  local name="$1"
  local mode="$2"
  local memory="$3"
  local timeout="$4"
  gcloud run jobs deploy "${name}" \
    --image "${IMAGE}" \
    --region "${REGION}" \
    --service-account "${RUNTIME_SA}" \
    --tasks 1 \
    --max-retries 2 \
    --task-timeout "${timeout}" \
    --cpu 1 \
    --memory "${memory}" \
    --set-env-vars "${COMMON_ENV}" \
    --set-secrets "${COMMON_SECRETS}" \
    --args "${mode}" \
    --project "${PROJECT_ID}"
}

deploy_job market-data-tw data-tw 1Gi 45m
deploy_job market-data-us data-us 1Gi 45m
deploy_job financial-content financial-content 1Gi 20m
deploy_job member-morning-report morning-report 2Gi 90m

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${SCHEDULER_SA}" \
  --role roles/run.invoker \
  --condition None >/dev/null

upsert_schedule() {
  local schedule_name="$1"
  local run_job="$2"
  local cron="$3"
  local uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${run_job}:run"
  local action="create"
  if gcloud scheduler jobs describe "${schedule_name}" \
    --location "${REGION}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    action="update"
  fi
  gcloud scheduler jobs "${action}" http "${schedule_name}" \
    --location "${REGION}" \
    --schedule "${cron}" \
    --time-zone "${TIME_ZONE}" \
    --uri "${uri}" \
    --http-method POST \
    --oauth-service-account-email "${SCHEDULER_SA}" \
    --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform" \
    --max-retry-attempts 5 \
    --min-backoff 30s \
    --max-backoff 5m \
    --max-doublings 3 \
    --project "${PROJECT_ID}"
}

# 同一個 Scheduler job 可包含多個小時，仍只佔一個免費 job 額度。
# 每日喚醒以涵蓋臨時休市、特殊開市與資料延遲；程式依實際行情日期
# 及既有寄送紀錄決定是否更新／寄送，休市日不會重複發送舊晨報。
upsert_schedule market-data-tw market-data-tw "30 17,18,19,20,21,23 * * *"
upsert_schedule market-data-us market-data-us "20 5,6,7 * * *"
upsert_schedule financial-content financial-content "5,35 * * * *"
upsert_schedule member-morning-report member-morning-report "30 6,7,8 * * *"

echo "部署完成。先個別執行四個 Cloud Run Jobs 驗證，確認後再停用 GitHub schedule。"
