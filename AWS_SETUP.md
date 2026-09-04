# チケット管理機能のAWSコンソール設定

コードの反映後、次の操作をAWSコンソールで行います（本変更ではAWSリソースを操作していません）。

1. **DynamoDB**: 東京リージョンに `ai-tasks` テーブルを作成し、パーティションキーを文字列型 `task_id` とする。オンデマンドキャパシティを推奨する。カウンター項目は初回登録時に自動作成される。
2. **IAM**: 既存Lambda `ai-minutes-generator` の実行ロールへ、`ai-tasks` テーブルに対する `dynamodb:GetItem`、`PutItem`、`UpdateItem`、`Scan` を許可する。既存の `ai-minutes` 権限は維持する。
3. **Lambda**: 新しい関数は作らず、既存 `ai-minutes-generator` に `lambda_function.py`、`task_service.py` と既存依存ファイルをデプロイする。ランタイムとハンドラー設定は変更しない。
4. **API Gateway**: 既存HTTP APIに認証設定を引き継いだ `GET /tasks`、`POST /tasks`、`GET /tasks/{task_id}`、`PATCH /tasks/{task_id}` を追加し、既存Lambdaへ統合する。CORSで利用中フロントエンドのオリジン、`GET,POST,PATCH,OPTIONS`、`Authorization,Content-Type` を許可してステージへデプロイする。

## 詳細編集API（追加設定）

API Gateway HTTP API に次のLambda統合ルートを追加し、既存のCognito JWT Authorizerを設定してください。

- `PATCH /projects/{project_id}`
- `PATCH /minutes/{minutes_id}`（既存の `PATCH /minutes/{minutes_id}/status` はそのまま維持）

`PATCH /tasks/{task_id}` は既存ルートを利用します。DynamoDBテーブルやGSIの追加、データ移行、AWSリソースの新規作成は不要です。Lambda実行ロールには既存2テーブルに対する `dynamodb:Scan`、`dynamodb:GetItem`、`dynamodb:UpdateItem` 権限が必要です。

## ユーザープロフィール管理

1. 東京リージョンに DynamoDB `ai-users` テーブルを、文字列パーティションキー `user_id`、オンデマンドキャパシティで作成する。GSI、既存テーブルの変更、データ移行は不要。
2. Lambda 実行ロールに `ai-users` テーブルだけを対象とする `dynamodb:GetItem`、`dynamodb:PutItem`、`dynamodb:Scan` を追加する。
3. API Gateway HTTP API に `GET /users`、`GET /users/me`、`PUT /users/me` を既存 Lambda 統合で追加し、すべてに既存 Cognito JWT Authorizer を適用する。CORS のメソッドに `PUT` を追加してデプロイする。
4. Lambda ZIP には既存ファイルに加え `user_service.py` を含める。必要に応じて環境変数 `USERS_TABLE_NAME` でテーブル名を上書きでき、未設定時は `ai-users` となる。

新しい Lambda、Cognito、SNS、SQS、GSI、既存データの移行は不要です。

## ユーザー選択・ダッシュボード（2026-09）

担当者、承認者、責任者は既存の `ai-users` と `GET /users` を利用し、Cognito JWT の `sub` を `assignee_id` / `approver_id` / `manager_id` として保存します。表示名はサーバーが `ai-users` から解決したスナップショットを既存の名前フィールドへ保存します。新しい API Gateway ルート、DynamoDB テーブル、GSI、Cognito 設定、IAM 権限は不要です。既存データの一括移行も不要で、IDのない自由入力名はそのまま表示・更新できます。

バックエンドを変更したため Lambda の更新が必要です。デプロイ ZIP には `lambda_function.py`、`dynamodb_service.py`、`task_service.py`、`project_service.py`、`user_service.py`、`bedrock_service.py` と依存パッケージを含めてください。既存 HTTP API のルートと JWT Authorizer をそのまま利用します。
