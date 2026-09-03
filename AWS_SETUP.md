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
