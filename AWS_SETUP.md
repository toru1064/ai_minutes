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

## フロントエンドの S3 + CloudFront 公開

以下はコンソールと AWS CLI で今後行う手順です。このリポジトリの変更は既存 AWS リソースを作成・変更・削除しません。カスタムドメインは任意であり、CloudFront の割り当てドメインだけで公開できます。

### 初回構築

1. フロントエンド専用 S3 バケットを選択または作成し、**ブロックパブリックアクセスを4項目とも有効**、ACL を無効にします。S3 静的ウェブサイトホスティングは有効にせず、静的ウェブサイトエンドポイントをオリジンにしません。バケット名はソースコードへ記載しません。
2. CloudFront ディストリビューションを作成し、通常の S3 バケットオリジンを選択します。Origin Access Control (OAC) を新規作成または選択し、署名動作を「常に署名」にします。Default Root Object は `index.html`、Viewer protocol policy は **Redirect HTTP to HTTPS**（より厳格にする場合は HTTPS only）にします。SPA 用の 403/404 から `index.html` へのカスタムエラーレスポンスは設定しません。このアプリは複数 HTML 構成です。
3. コンソールが提示する OAC 用ポリシーをバケットへ設定します。少なくとも次のように、当該ディストリビューションからの `s3:GetObject` のみに限定します（値は置換します）。

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontReadOnly",
    "Effect": "Allow",
    "Principal": {"Service": "cloudfront.amazonaws.com"},
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::FRONTEND_BUCKET/*",
    "Condition": {"StringEquals": {"AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"}}
  }]
}
```

4. Default behavior は `GET, HEAD`（必要なら `OPTIONS`）だけを許可し、圧縮を有効にします。まず CloudFront managed cache policy **CachingOptimized** を利用できます。更新頻度の高い HTML は短い TTL または別 behavior（`*.html`）で **CachingDisabled** を選ぶと安全です。ハッシュ付きの `assets/*` は長期キャッシュ可能です。HTML 更新時は後述の invalidation を必ず実施します。
5. Viewer response headers policy には managed **SecurityHeadersPolicy** を推奨します。少なくとも HSTS、`X-Content-Type-Options: nosniff`、`X-Frame-Options`、`Referrer-Policy` を確認します。CSP は Cognito、既存 API Gateway、必要な AWS エンドポイントへの接続を許可する値を検証してからカスタムポリシーで段階導入してください。未検証の CSP を一律適用して認証や API を壊さないようにします。
6. 初回ファイルをアップロードし、ディストリビューションのデプロイ完了後、`https://CLOUDFRONT_DOMAIN/` と各 `*.html` を直接確認します。
7. CloudFront URL が確定してから、Cognito と API Gateway を次項の順で設定します。

### Cognito の許可 URL

Cognito User Pool の対象 App Client の Hosted UI 設定で、次の **完全一致 URL** を両方の一覧に追加します。開発用 URL は削除しません。App Client Secret は作成・配布せず、既存の Authorization Code + PKCE 構成を維持します。

- Allowed callback URLs: `http://localhost:5500/`、`https://CLOUDFRONT_DOMAIN/`
- Allowed sign-out URLs: `http://localhost:5500/`、`https://CLOUDFRONT_DOMAIN/`

フロントエンドはブラウザが現在表示している `window.location.origin` の直下（末尾 `/` 付き）だけを callback/sign-out URL に使います。クエリ、Local Storage、外部入力は戻り先の生成に使いません。

### API Gateway CORS

既存 HTTP API の CORS 設定を開き、Allowed origins に次の2件を**個別指定**してステージへ反映します。

- 開発: `http://localhost:5500`
- 本番: `https://CLOUDFRONT_DOMAIN`（Origin なので末尾 `/` なし）

Allowed methods は既存機能に必要な `GET,POST,PATCH,PUT,DELETE,OPTIONS`、Allowed headers は `Authorization,Content-Type` を維持します。認証付き通信のため Allowed origins に `*` を使わず、`Access-Control-Allow-Credentials` が必要な構成でもワイルドカードを使いません。既存 Cognito JWT Authorizer、Lambda 認可、所有権判定、DemoUser 制限、AI/通常操作回数、TTL、添付制限は変更しません。変更後は API の対象ステージへデプロイし、localhost と CloudFront の双方で preflight と認証付き API を確認します。API Gateway は東京リージョン (`ap-northeast-1`) の既存 API を使用します。

### AWS CLI による初回アップロード（Windows PowerShell）

事前に AWS CLI の認証プロファイルと既定リージョンを設定します。S3 バケット操作ではバケット所在リージョン（例: `ap-northeast-1`）を明示します。CloudFront はグローバルサービスのため invalidation コマンドにリージョン指定は不要です。

```powershell
$BucketName = "your-private-frontend-bucket"
$DistributionId = "YOUR_DISTRIBUTION_ID"
npm ci
npm run build
aws s3 sync dist/ "s3://$BucketName" --delete --region ap-northeast-1
aws cloudfront create-invalidation --distribution-id $DistributionId --paths "/*"
```

`--delete` が削除するのは、指定したフロントエンド用バケットの同期先に存在する一方で `dist/` に存在しないオブジェクトだけです。他のバケットやローカルファイルは削除しません。ただし同じバケットに別用途のオブジェクトを混在させないでください。

アップロード後、CloudFront URL 取得 → Cognito callback/sign-out URL 追加 → API Gateway CORS Origin 追加・ステージ反映 → CloudFront 各ページと認証/API の確認、の順で完了させます。

### 2回目以降の更新（Windows PowerShell）

```powershell
$BucketName = "your-private-frontend-bucket"
$DistributionId = "YOUR_DISTRIBUTION_ID"
npm ci
npm run build
aws s3 sync dist/ "s3://$BucketName" --delete --region ap-northeast-1
aws cloudfront create-invalidation --distribution-id $DistributionId --paths "/*"
```

通常更新では S3/CloudFront/Cognito/API Gateway の再作成は不要です。全パス invalidation により HTML を含む古いキャッシュを破棄します。Origin やドメインを変更した場合だけ、Cognito の完全一致 URL と API Gateway の明示 Origin を先に追加し、動作確認後に旧値を整理します。
