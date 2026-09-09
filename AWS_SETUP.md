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

## チケット添付ファイル（Amazon S3）

### 1. 非公開バケット

1. Lambda と同じリージョンで専用 S3 バケットを作成します。ACL は無効（Bucket owner enforced）にします。
2. **ブロックパブリックアクセス**の4項目をすべて有効にします。公開バケットポリシーや公開ACLは設定しません。
3. デフォルト暗号化を有効にします（SSE-S3、または組織管理のKMSキーを使う場合はSSE-KMS）。バージョニングは今回の要件では不要です。
4. Lambda の環境変数 `ATTACHMENTS_BUCKET_NAME` に作成した正確なバケット名を設定します。未設定時にコードは代替バケットへ接続せず、設定エラーを返します。

S3 CORS は実際に配信するフロントエンドのオリジンだけを許可します。本番例（ドメインは実値へ置換）:

```json
[{"AllowedOrigins":["https://app.example.com"],"AllowedMethods":["POST"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":300}]
```

ローカル開発用バケット（または開発環境の設定）では、Vite のオリジンを明示します。本番設定へ localhost を混在させません。

```json
[{"AllowedOrigins":["http://localhost:5500"],"AllowedMethods":["POST"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":300}]
```

`AllowedOrigins` に `*` を使わないでください。署名付きGETは画面遷移による取得のため、ブラウザJSでレスポンス本文を読む方式へ変更しない限りGETのS3 CORS許可は不要です。

### 2. Lambda 実行ロール

バケット内の `tasks/*` のみに、次の最小権限を追加します。SSE-KMSを選んだ場合は対象KMSキーに必要な暗号化・復号権限も限定して追加します。

```json
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::YOUR_PRIVATE_BUCKET/tasks/*"}]}
```

署名付きPOST/GETはLambda実行ロールの資格情報で発行されます。`HeadObject` は `s3:GetObject` で許可されます。バケット一覧・公開設定変更・他プレフィックスへの権限は不要です。

### 3. API Gateway

既存Lambda統合へ以下を**完全一致するルート**として追加し、4ルートすべてに既存 Cognito JWT Authorizer を適用します。

- `POST /tasks/{task_id}/attachments/presign`
- `POST /tasks/{task_id}/attachments/complete`
- `GET /tasks/{task_id}/attachments/{attachment_id}/download`
- `DELETE /tasks/{task_id}/attachments/{attachment_id}`

HTTP API の CORS は既存フロントエンドオリジンのみを許可し、既存の `GET,POST,PATCH,PUT,OPTIONS` に **DELETE** を追加します。許可ヘッダーは少なくとも `Authorization,Content-Type` とし、変更後にステージへデプロイします。未認証ルートや `$default` Authorizer 例外を作らないでください。

### 4. Lambda ZIP とデータ

デプロイZIPにはアプリケーションの全Pythonファイル、すなわち `lambda_function.py`、`attachment_service.py`、`dynamodb_service.py`、`task_service.py`、`project_service.py`、`user_service.py`、`bedrock_service.py` と、`requirements.txt` から導入した依存パッケージを含めます（テスト、frontend、文書は不要です）。

添付メタデータは既存 `ai-tasks` 項目の `attachments` 属性へ保存されます。テーブル、パーティションキー、GSI、キャパシティ設定の変更やデータ移行は不要です。既存項目に `attachments` がなければ空配列として扱われます。

## 制限付きデモユーザー（DemoUser）

1. Cognito ユーザープールの「グループ」で `DemoUser` を作成し、公開専用ユーザーを作成して同グループへ追加します。デモアカウントのパスワードは GitHub やソースコードへコミットしないでください。
2. DynamoDB の `ai-minutes`（プロジェクトと議事録）および `ai-tasks`（チケット）で、TTL 属性名を Number 型の `expires_at` として有効化します。TTL の削除は非同期であり、未設定でもアプリは動作します。既存項目の移行は不要です。
3. Lambda ZIP へ `demo_access.py` を追加し、`lambda_function.py`、`dynamodb_service.py`、`project_service.py`、`task_service.py`、`attachment_service.py`、`user_service.py`、`bedrock_service.py` と依存パッケージを更新します。
4. `ai-users` に対する既存権限へ `dynamodb:UpdateItem` を追加します。日次 AI（3回）・通常操作（30回）カウンターの条件付き原子更新に使用します。Bedrock 呼び出し失敗も、実行を試行したため AI 回数を消費します。
5. API Gateway の新規ルート、S3 CORS、バケット設定、Bedrock 権限の変更はありません。既存ルートすべてに Cognito JWT Authorizer が設定され、`sub` と `cognito:groups` が Lambda に届くことを確認します。

DemoUser が初めて `GET /users/me` または `GET /users` を呼び出した際、`ai-users` に表示名「デモユーザー」の初期プロフィールを条件付きで作成します。JWT の `sub` だけをキーに使用し、既存プロフィールは上書きせず、日次操作回数にも加算しません。デモユーザーの `PUT /users/me` は引き続き禁止されます。

動作確認では、通常ユーザーの従来操作、DemoUser の一覧・詳細・添付ダウンロード、デモデータ作成と所有データ更新、通常データ更新の403、添付追加・削除とプロフィール更新の403、AI 4回目と通常操作31回目の429、24時間後のTTL値を確認してください。
