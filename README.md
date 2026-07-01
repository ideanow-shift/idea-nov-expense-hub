# 経費精算管理システム

IDEA NOV OS / Finance Module の経費明細登録、月次精算、経理確認、弥生会計CSV出力を扱うモジュールです。

公開URL:

- https://ideanow-shift.github.io/idea-nov-expense-hub/

## 方針

- 単独アプリではなく IDEA NOV OS の Finance Module として扱う
- 社員、店舗、部署、役職、権限は Core DB を正本にする
- 通知は `os.notifications` を正本にする
- NOV HUB 表示は `os.nov_hub_notification_inbox` を使う
- LINE WORKS、AI、外部API Secret は Supabase Edge Functions 側に置く
- GitHub Pages にはフロントだけを置く

## 主要機能

- 経費明細登録
- レシート添付、OCR補助、AI勘定科目候補
- 月次精算パック作成
- 締め後追加精算
- 経理確認、差戻し、精算済み処理
- 月次締め
- 弥生会計CSV出力
- CSV出力履歴、二重出力警告
- NOV HUB通知Inbox連携
- Dashboard、本番準備チェック

## 運用チェック

本番運用前に Dashboard の `本番準備チェック` を確認します。

- 弥生CSV未出力
- レシート未添付
- 経理未処理パック
- 未提出・差戻しパック
- 締め済み精算

CSVはデフォルトで出力済み明細を除外します。再出力が必要な場合だけ `CSV出力済みも含める` をONにします。

## 権限

Core DB 側の正式role_keyへ寄せます。

- 経理: `accounting`
- 幹部: `executive`
- 全体管理: `super_admin`
- 店舗管理者: `store_manager`
- エリア管理者: `area_manager`
- 部門管理者: `department_manager`
- 運用管理: `backoffice`

`manager` / `admin` は互換ラベルとして扱い、正式な権限判定はCore DB側に寄せます。

## 注意

- `service_role` key をフロントへ置かない
- LINE WORKS Secret をGitHub Pages、config.js、localStorageへ置かない
- 経費精算専用の社員、店舗、部署、権限マスタを作らない
- 弥生会計へ取り込むCSVは、出力履歴と対象範囲を確認してから使う
