# 會員正式開通交接：專案管理員

2026-10-15 只讀核對：現有 Supabase 專案 Email=true、Google=false、Apple=false、Phone=false；LINE 未在公開 provider 設定中提供。已透過使用者登入的控制台確認可進入 stock filter 組織的 Taiwan stock2（bruqrbvbjxntgoljxsne），與網站連線一致；尚未改動線上設定。資料表管理頁本次載入未完成，不能據此宣稱會員表已存在或不存在。

## 已可執行的程式

- 會員資料直接沿用 `SIG_SB_URL` / `SIG_SB_ANON` 呼叫 Auth `/user`，避免 file:// 本機頁誤打尚未部署的新 API。
- 個資以白名單存入 user_metadata：暱稱、姓名、縣市、出生年月日、投資經驗、關注市場、使用目的。除暱稱外選填。
- 個資不是授權來源。會員權益讀 Auth 回傳的 app_metadata（目前僅一般會員顯示）。實際高權限 API 仍需各自驗證授權，不可信任前端顯示。
- 登入及註冊共用社群入口：根據 `/auth/v1/settings` 的實際啟用狀態開放 Google/Apple/手機；LINE 必須確認並接入正確供應商，不能只把 label 改為 LINE。
- OAuth 採 PKCE，verifier 存 sessionStorage，回呼後換 token 並再驗證 `/user`，更新既有網站登入狀態。
- 手機支援 OTP 發送、60 秒重送倒數與驗證；還須設定簡訊供應商及伺服器端濫用防護。

## 管理員操作清單

1. 在 Supabase Authentication URL Configuration 設定正式與 UAT 的實際網站網址、允許回呼。不要允許任意萬用網域。
2. 本機開發改用 localhost HTTP 服務；file:// 無法作 OAuth 回呼。需把指定 localhost port 加入開發白名單。
3. Google Cloud 建立/選擇 Web OAuth client，設定品牌同意畫面、openid/email/profile，Google redirect URI 使用 Supabase 控制台顯示的 `/auth/v1/callback`。Client ID/secret 只在 Supabase 管理後台填寫。
4. Apple Developer 設定 Sign in with Apple、Services ID、網域與回呼網址，再在 Supabase 啟用 Apple。金鑰維護與到期更新需指定負責人。
5. LINE Developers 設定 channel、品牌與回呼、Email scope（需要時申請）。在 Supabase 新增 OIDC 自訂供應商，識別名稱固定為 `custom:line`（前端已對應），issuer 與 endpoints 依 LINE 官方 discovery 文件確認。沒有 Email 權限時評估 email_optional 並另外驗證通知信箱。不可用未驗證 LINE token 自建會員。
6. 在 Supabase 啟用 Phone provider 並設定簡訊供應商、頻率限制、驗證碼設定、預算告警及 CAPTCHA；測試手機與供應商帳單須由管理員確認。
7. 建立 `member-avatars` Storage bucket：公開頭像讀取、限制 image/webp、大小 262144 bytes。會員公開頭像不得包含證件等敏感資料。
8. 在 storage.objects 設定 authenticated 的 insert/update/select 權限，必須同時符合 `bucket_id='member-avatars'` 及 `(storage.foldername(name))[1] = (select auth.uid())::text`；其他會員不得覆寫。程式只會寫 `自己 UUID/avatar.webp`。
9. 使用兩個測試會員驗證 A 不能覆寫 B 的檔案，未登入不能上傳，超大/非圖片被拒絕；確認成功後才開放頭像儲存。
10. 正式案件、寄信、通知、會員權益及付款後台，依 member-system-design.md 的資料模型另行建立；目前沒有自動開通付費方案。

## 驗收與未完成邊界

第三方供應商 client、回呼、簡訊及 Storage 開通後，仍要用真實測試帳號驗證登入、取消授權、重複帳號、過期 callback、頭像權限與跨裝置同步。單純公開 settings=true 不等於完整驗收。

本版可完成頭像選檔/圓形裁切/預覽與正式 Storage 上傳流程；若 bucket/RLS 未設定，上傳顯示失敗，不會假裝已儲存或只偷偷存在瀏覽器。

### 頭像儲存設定範本（只供管理員審核，尚未執行）

先確認 bucket 名稱沒有既有用途；以下公開 bucket 僅能存放使用者同意公開的會員頭像，不可存個資附件。

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-avatars', 'member-avatars', true, 262144, array['image/webp'])
on conflict (id) do nothing;

create policy "member_avatar_insert_own" on storage.objects
for insert to authenticated with check (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "member_avatar_select_own" on storage.objects
for select to authenticated using (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "member_avatar_update_own" on storage.objects
for update to authenticated using (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
```

如已有同名 policy，應先檢查原條件再決定調整，不可直接刪除既有規則。正式部署前以兩個測試帳號驗證覆寫隔離。

## 參考

- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/social-login/auth-apple
- https://supabase.com/docs/guides/auth/phone-login
- https://supabase.com/docs/guides/auth/custom-oauth-providers
- https://developers.line.biz/en/docs/line-login/overview/

## 本次服務遷移與下一步

先由專案 schema 維護者審核 `docs/database/member-services.sql`，再在上述正確專案執行。此檔尚未套用線上；不可直接在其他專案執行，也不可遇到同名表就刪除重建。它包含會員專屬推薦碼、推薦歸屬、雙方禮遇、優惠碼兌換、領取權益、回饋案件、寄信佇列與 RLS。

已在隔離 PostgreSQL 執行整份遷移，驗證唯一推薦碼、自我推薦拒絕、不可更換推薦人、雙方獎勵不重發、優惠碼次數限制、重複領取、回饋重試去重，以及跨會員資料隔離。這不代表線上服務已開通。

建議啟用順序：會員遷移 → 頭像 bucket/政策 → 寄信工作程序與寄件網域 → Google/LINE/Apple/手機供應商 → 兩個測試會員驗收。推薦活動預設關閉；須先由後台明確設定禮物功能與天數後才啟用。郵件佇列不等於已寄信，現版沒有寄信 worker 或客服回覆管理畫面。
