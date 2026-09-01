# Google Cloud 批次部署

此目錄將重要批次從 GitHub `schedule` 搬到 Cloud Scheduler 與 Cloud Run Jobs。GitHub Actions 的 `workflow_dispatch` 保留為人工備援。四個 Scheduler 定期喚醒；行情批次以 Git 差異判斷是否有新資料，財經內容每 30 分鐘更新，晨報則以線圖的實際市場日期與既有寄送紀錄判斷，休市日不重複寄送舊行情，特殊開市或延遲資料可由後續時段補抓、補發。

## 排程

- 台股／美股資料：台北時間平日 17:30、18:30、19:30、20:30、21:30、23:30；若 repo 已有當日台股快照便跳過後續重複更新。
- 美股資料：台北時間週二至週六 05:20。
- 聯準會政策、財經影音與總經新聞：每日每 30 分鐘。
- 會員盤後晨報：台北時間週二至週六 06:30，分析台股與美股前一交易日行情，並以還原權息避免除息落差造成誤判。

四個排程各自啟動一個 Cloud Run Job。Job 失敗最多重試兩次，Scheduler 呼叫失敗最多重試五次。

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
   gcloud run jobs execute financial-content --region asia-east1 --wait
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
- Cloud Scheduler 每個 Billing account 前三個 job 免費；新增財經內容後為四個 job，第四個依 Google Cloud 當期費率計費。
- Artifact Registry 自動保留最近兩版，並刪除超過 14 天的未標記舊版，避免映像持續累積費用。
