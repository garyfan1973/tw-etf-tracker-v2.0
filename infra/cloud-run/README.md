# Google Cloud 批次部署

此目錄將重要批次從 GitHub `schedule` 搬到 Cloud Scheduler 與 Cloud Run Jobs。GitHub Actions 的 `workflow_dispatch` 保留為人工備援。

## 排程

- 台股／美股資料：台北時間平日 17:30、18:30、19:30、20:30、21:30、23:30；若 repo 已有當日台股快照便跳過後續重複更新。
- 美股資料：台北時間週二至週六 05:20。
- 會員盤後晨報：台北時間週二至週六 06:30，涵蓋台股與美股前一交易日收盤資料。

三個排程各自啟動一個 Cloud Run Job。Job 失敗最多重試兩次，Scheduler 呼叫失敗最多重試五次。

## 第一次部署

1. 安裝並登入 Google Cloud CLI。
2. 建立已連結 Billing 的 Google Cloud project。
3. 設定專案：

   ```bash
   gcloud config set project YOUR_PROJECT_ID
   export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
   ```

4. 從現有安全來源載入秘密變數；不要把值寫進命令歷史或檔案：

   ```bash
   export SUPABASE_URL='...'
   export SUPABASE_SERVICE_ROLE_KEY='...'
   ./infra/cloud-run/load-secrets.sh
   unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
   ```

5. 部署：

   ```bash
   ./infra/cloud-run/deploy.sh
   ```

   若映像已建置完成、只需更新 Jobs 或 Scheduler 設定，可略過重建：

   ```bash
   SKIP_BUILD=true ./infra/cloud-run/deploy.sh
   ```

6. 驗證三個 Job，再移除 GitHub workflow 的 `schedule` 區塊：

   ```bash
   gcloud run jobs execute market-data-tw --region asia-east1 --wait
   gcloud run jobs execute market-data-us --region asia-east1 --wait
   gcloud run jobs execute member-morning-report --region asia-east1 --wait
   ```

晨報具有資料庫防重複機制，但驗證時仍應先確認當日寄送狀態；不要任意使用強制重寄。
如只想驗證晨報產生流程、不寄出 Email，可覆寫單次執行參數：

```bash
gcloud run jobs execute member-morning-report \
  --region asia-east1 \
  --args morning-report-dry-run \
  --wait
```

## 安全與成本

- `GITHUB_TOKEN`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 只存於 Secret Manager。
- Runtime service account 只有讀取秘密的權限；Scheduler service account 只有啟動 Jobs 的權限。
- 容器內透過 `GIT_ASKPASS` 使用 GitHub token，不把 token 放入 clone URL 或 log。
- 三個 Cloud Scheduler jobs 落在每個 Billing account 的免費額度內。
- Artifact Registry 自動保留最近兩版，並刪除超過 14 天的未標記舊版，避免映像持續累積費用。
