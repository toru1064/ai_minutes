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

### 添付 S3 バケットの CORS（管理者による設定が必要）

ブラウザは署名付き POST の取得を API Gateway へ行った後、ファイル本体を API Gateway 経由ではなく添付用 S3 バケットへ直接 `POST` します。このため **API Gateway の CORS と添付 S3 の CORS は別設定**です。API が 200 でも S3 側に閲覧中の Origin がなければ、ブラウザは S3 の応答を遮断して `Failed to fetch` と表示します。

対象は添付ファイル用バケット **`ai-minutes-attachments`** です。AWS コンソールの **Amazon S3 → バケット → ai-minutes-attachments → アクセス許可 → Cross-origin resource sharing (CORS) → 編集**を開き、次を設定してください（このリポジトリから AWS リソースは変更しません）。Origin は完全一致であり、**末尾に `/` を付けません**。署名付き POST とダウンロードに必要な最小限の `POST`、`GET`、`HEAD` だけを許可し、削除は Lambda が行うため `DELETE` や `PUT` は許可しません。

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["POST", "GET", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:5500",
      "https://d6poxps1sqgd0.cloudfront.net"
    ],
    "ExposeHeaders": ["ETag"]
  }
]
```

設定後は localhost と CloudFront の双方で、開発者ツールの Network を開いて添付操作を行います。(1) `POST /tasks/{task_id}/attachments/presign` が 200、(2) S3 バケット宛ての preflight/`POST` が CORS エラーなしで成功、(3) `POST /attachments/complete` が 201、(4) 一覧更新後にダウンロードできることを確認します。フォームの `Content-Type` ヘッダーはブラウザに境界値を生成させ、署名済みフィールド、`Content-Type`、メタデータを変更せず、ファイルを最後のフォームフィールドとして送信します。確認時も署名付き URL 全体や Authorization ヘッダーをログ、チケット、スクリーンショットへ残さないでください。

既存レコードのうち `approver_id` または `registered_by_id` がないものは、表示名を Cognito ID とみなして自動移行しません。同名ユーザーへの誤認可を避けるため承認・差し戻しは拒否され、変更不可能な所有者 ID もないレコードは編集・再申請も拒否されます。必要なレコードだけを管理者が真正な Cognito ID を確認して個別移行するか、所有者 ID が既にあるレコードは画面で承認者を選び直して保存してください。DynamoDB の全件更新は行いません。

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

## GitHub Actions による本番自動デプロイ

### 動作と変更検知

Pull Request（対象ブランチ `main`）では `.github/workflows/ci.yml` だけが動作し、Node.js 22（LTS）で `npm ci`、全 JavaScript の構文確認、`npm test`、`npm run build` を、Lambda ランタイムと同じ Python 3.14 で依存関係の導入、構文確認、`python -m unittest discover -v` を実行します。このワークフローに `id-token: write` や AWS 認証ステップはなく、AWS は変更しません。Python 3.14 を `setup-python` が GitHub hosted runner に提供できない場合、ジョブを失敗させる設計です。Lambda と異なる Python 版へ暗黙にフォールバックすると互換性検証にならないためです。その場合は、GitHub runner で 3.14 が提供された後に再実行するか、Python 3.14 を備えた自己ホスト runner を明示的に採用してください。

`main` への push（PR のマージを含む）では、次の path filter に一致したワークフローだけがテスト成功後にデプロイします。ローカル commit では GitHub Actions は起動しません。

- フロントエンド: `frontend/**`、`package.json`、`package-lock.json`、`vite.config.js`、`.github/workflows/deploy-frontend.yml`
- Lambda 本番コード・パッケージ設定: `lambda_function.py`、`demo_access.py`、`dynamodb_service.py`、`project_service.py`、`task_service.py`、`attachment_service.py`、`user_service.py`、`bedrock_service.py`、`requirements.txt`、`scripts/prepare_requirements.py`、`.github/workflows/deploy-lambda.yml`

上記 Python ファイルは `lambda_function.py` から直接・間接に import されるローカルモジュールをすべて含みます。`test_*.py` だけの push は本番コードを変えないため Lambda を更新しません（PR 時の CI ではテストされます）。文書だけの push もデプロイしません。両方の filter に一致すれば両デプロイが独立して動作します。各 deploy workflow は `cancel-in-progress: false` の concurrency group を持つため、進行中の本番更新をキャンセルせず次の更新を待たせます。Actions 画面の **Run workflow** から各対象を `workflow_dispatch` で個別に手動実行することもできます。

Git 管理中の `requirements.txt` は既存の UTF-16 LE BOM 形式を変更しません。CI と Lambda deploy は `scripts/prepare_requirements.py` で、UTF-8、UTF-8 BOM、UTF-16 LE BOM、UTF-16 BE BOMを厳密に判定し、ランナーの `${RUNNER_TEMP}` に BOM なしUTF-8の一時ファイルを生成してから pip に渡します。入力は上書きせず、内容をログへ出力せず、不正なエンコーディングではデプロイ前に失敗します。テスト用とZIP用の依存導入は同じ一時ファイルを使います。

外部 Actions は供給網リスクを抑えるため、コメントに示したリリースの full commit SHA に固定しています。Dependabot 等で更新する場合も、公式リポジトリの release/tag と commit SHA を照合してから変更してください。

### Repository Variables と production Environment

リポジトリの **Settings → Secrets and variables → Actions → Variables** に次を Repository Variables として登録します。値は認証秘密ではありませんが、ソースへ直書きせず Actions 設定として管理します。

| 名前 | 値 |
|---|---|
| `AWS_REGION` | `ap-northeast-1` |
| `AWS_ROLE_ARN` | `arn:aws:iam::<AWS_ACCOUNT_ID>:role/<GITHUB_ACTIONS_ROLE_NAME>` |
| `S3_BUCKET_NAME` | `toru1064-ai-minutes-frontend` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `ENSW5CMMOSR3O` |
| `LAMBDA_FUNCTION_NAME` | `ai-minutes-generator` |

`AWS_ACCOUNT_ID` は ARN のルーティングに使う公開可能な識別子でパスワードではありませんが、実アカウントに置換します。AWS access key、secret access key、Cognito デモユーザーのパスワード、JWT、メールパスワード、App Client Secret は GitHub の Variables/Secrets のどちらにも登録しません。アクセスキー方式へのフォールバックはしません。

リポジトリの **Settings → Environments → New environment** で `production` を作成し、Deployment branches and tags を **Selected branches and tags** の `main` のみに制限します。workflow はこの Environment を指定済みです。上記5値は共通設定なので Repository Variables に置き、Environment Variables へ重複登録しません（同名値の上書きによる事故を避けるため）。必要な reviewer/wait timer は組織の運用に合わせた任意設定で、毎回承認を今回の必須条件にはしません。Environment 自体と branch restriction は公開リポジトリを含む GitHub Free で利用できますが、private/internal リポジトリにおける required reviewers 等の保護ルールはプランにより制約されるため、GitHub の現在のプラン表示を確認してください。

### AWS OIDC Provider と信頼ポリシー

IAM の Identity providers で OpenID Connect provider を次の値で一度だけ作成します（既に GitHub 用 provider があれば再作成不要です）。

- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

次に GitHub Actions 専用 IAM role を作ります。Web identity は `token.actions.githubusercontent.com`、Audience は `sts.amazonaws.com` を選びます。デプロイ workflow は `production` Environment を使うため、従来の名前ベース subject は `repo:toru1064/ai_minutes:environment:production` です。branch 形式 `repo:toru1064/ai_minutes:ref:refs/heads/main` は Environment を使わない workflow の例であり、現在の workflow の trust policy には使いません。

ただし、2026-07-15 以降に作成されたリポジトリや organization の OIDC subject customization では、owner/repository の可変名ではなく immutable owner/repository ID を含む subject が発行される可能性があります。ID 形式の具体的な文字列をリポジトリ名から推測してはいけません。初回設定時に GitHub の organization/repository OIDC subject customization 設定（REST API の OIDC subject claim customization endpoint を含む）を確認し、GitHub Actions が発行する ID token の payload の `sub` を、トークン本体をログへ出さない一時的な管理者確認手段で確認してください。確認用 workflow を残さず、JWT 全体、署名、`ACTIONS_ID_TOKEN_REQUEST_TOKEN` は出力しません。名前形式は rename に追従しない一方、immutable ID 形式は rename 後も同じ repository/owner を識別する点が異なります。実際の `sub` が ID 形式なら、下記 `<ACTUAL_GITHUB_OIDC_SUB>` を観測した完全一致値へ置換します。古い名前形式を決め打ちしないでください。

信頼ポリシー（`AWS_ACCOUNT_ID`、provider ARN、`sub` を実環境で確認して置換）:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "<ACTUAL_GITHUB_OIDC_SUB>"
      }
    }
  }]
}
```

名前形式が実際に発行されることを確認できた場合の `<ACTUAL_GITHUB_OIDC_SUB>` は `repo:toru1064/ai_minutes:environment:production` です。`StringLike` の wildcard、任意 repository、任意 branch を許可しません。Environment の main 制限と、この subject 完全一致の両方を設定します。

### GitHub Actions role の最小権限

同じ専用 role を両 deploy workflow が利用する場合の inline policy 例です。`<AWS_ACCOUNT_ID>` を置換します。CloudFront ARN にも所有アカウント ID が必要です。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FrontendBucketMetadata",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::toru1064-ai-minutes-frontend"
    },
    {
      "Sid": "FrontendObjects",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::toru1064-ai-minutes-frontend/*"
    },
    {
      "Sid": "InvalidateFrontendDistribution",
      "Effect": "Allow",
      "Action": ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"],
      "Resource": "arn:aws:cloudfront::<AWS_ACCOUNT_ID>:distribution/ENSW5CMMOSR3O"
    },
    {
      "Sid": "UpdateExistingLambdaCodeOnly",
      "Effect": "Allow",
      "Action": ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"],
      "Resource": "arn:aws:lambda:ap-northeast-1:<AWS_ACCOUNT_ID>:function:ai-minutes-generator"
    }
  ]
}
```

この role に IAM、DynamoDB、Cognito、API Gateway、Bedrock、全 S3、Lambda 作成/削除、CloudFront 作成/削除/設定変更の権限を追加しません。既存 Lambda 実行 role とは別物です。自動処理は `UpdateFunctionCode` のみで、環境変数、実行 role、timeout、memory、API Gateway を変更しません。フロントエンド同期先は `dist/` と上記1バケットだけで、invalidation は対象 distribution の `/*` だけです。

### 初回設定と通常運用

1. GitHub OIDC provider を確認または作成する。
2. 実際の OIDC `sub` 形式を確認し、上記 trust policy の完全一致値で Actions 専用 role を作成する。
3. 上記最小権限 policy を role に付ける。
4. GitHub `production` Environment を作り、deployment branch を `main` のみにする。
5. 5個の Repository Variables を登録する（長期 AWS credentials は登録しない）。
6. PR を作成し、`Pull request CI` がすべて成功することを確認して `main` へ merge する。
7. Actions で変更対象の deploy workflow のテスト、build/package、OIDC 認証、更新、最終確認が成功したことを確認する。

通常は PR の CI 成功後に merge するだけです。frontend と Lambda が同時に変われば両方、片方だけなら該当側だけが実行されます。文書変更だけなら AWS workflow は起動しません。障害時の再実行は Actions の失敗 run の再実行、または該当 deploy workflow の **Run workflow**（branch は `main`）を使用します。

### Actions を使わない手動デプロイ（障害時）

既存の管理者用 AWS CLI profile をローカルで明示的に使用します。自動デプロイ role の credentials を保存・流用しません。フロントエンドの PowerShell 手順は前節のまま利用できます。bash の同等手順は次のとおりです。

```bash
npm ci
npm test
npm run build
aws s3 sync dist/ s3://toru1064-ai-minutes-frontend --delete --region ap-northeast-1
aws cloudfront create-invalidation --distribution-id ENSW5CMMOSR3O --paths '/*'
```

Lambda はリポジトリ外の一時ディレクトリで ZIP の直下へ実行ファイルを置きます。

```bash
work_dir="$(mktemp -d)"
python3.14 scripts/prepare_requirements.py requirements.txt "$work_dir/requirements.txt"
python3.14 -m pip install -r "$work_dir/requirements.txt"
python3.14 -m unittest discover -v
package_dir="$(mktemp -d)"
zip_path="$work_dir/lambda-deployment.zip"
python3.14 -m pip install -r "$work_dir/requirements.txt" --target "$package_dir"
cp lambda_function.py demo_access.py dynamodb_service.py project_service.py task_service.py \
  attachment_service.py user_service.py bedrock_service.py "$package_dir/"
(cd "$package_dir" && zip -q -r "$zip_path" .)
unzip -Z1 "$zip_path" | grep '^lambda_function.py$'
aws lambda update-function-code --function-name ai-minutes-generator \
  --zip-file "fileb://$zip_path" --region ap-northeast-1
aws lambda wait function-updated-v2 --function-name ai-minutes-generator --region ap-northeast-1
aws lambda get-function-configuration --function-name ai-minutes-generator \
  --region ap-northeast-1 --query '[LastUpdateStatus,State]'
rm -rf "$package_dir" "$work_dir"
```

最終出力が `Successful` と `Active` であることを確認します。この手順もコード以外の Lambda 設定を変更しません。

### 費用

GitHub OIDC provider、IAM role/policy、Repository Variables、Environment の作成自体に AWS の追加料金はありません。自動化のために新しい常時稼働 AWS resource は作りません。ただし実行時は、既存料金体系に従い S3 request/storage、CloudFront invalidation（無料枠超過分）、Lambda API request、および GitHub Actions minutes（プランの無料枠超過分）が発生し得ます。デプロイ頻度に比例する従量分以外の固定追加費用はありません。
