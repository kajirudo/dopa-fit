# GitHub / Vercel deployment

公開先：[GitHub kajirudo/dopa-fit](https://github.com/kajirudo/dopa-fit)、Vercel `kajirudos-projects`。

公開候補URL：[https://dopa-fit.vercel.app/](https://dopa-fit.vercel.app/)。2026-10-01にGitHub main連携で静的デプロイし、未ログインのHTTPSアクセスを確認しました。実機受入は未完了です。

## 変更を公開する前

1. `npm test`、`npm run audit:files`、`npm run test:browser`を実行。
2. 追加ファイル・依存のライセンス、通信、Privacyとの差分を確認。
3. `cache-manifest.js`と`docs/distribution-manifest.json`を変更と同じcommitに入れる。
4. `git status`がcleanで、公開したくないファイル・秘密情報・実写映像が履歴にないことを確認。
5. 実機ゲート未完了なら公開候補として明示し、Release Readyとは表示しない。

## Vercelの新規Import

GitHub連携でこのリポジトリをImport。Team：kajirudos-projects、Project：dopa-fit、Framework：Other、Build Command：空欄、Output Directory：`.`、Production Branch：main。アプリに環境変数・APIキー・Functionsは不要です。`vercel.json`のCSP・Permissions-Policy等を使います。

プレビューのアクセス制限と本番URLの公開設定を区別します。認証が必要なプレビューを一般公開URLと呼びません。本番URLを未ログインのブラウザで確認します。一般公開後も実機ゲートを満たすまでは候補版とします。

mainをpushし、VercelのGitHub連携が新しいcommitを自動デプロイしたことをDashboardで確認。READMEに実在する本番URLを追加し、release-checklistへURLとcommitを記録します。仮のURLを完成したLive Demoとして記載しません。

## 復旧

問題が出た場合はVercelの直前の確認済みDeploymentをProductionに戻し、main側にもrevert commitを作り整合させます。キャッシュの版も再生成してpush。Service Workerの待機更新は運動終了後に適用します。履歴改変や強制pushを通常の復旧手段にしません。

## 静的ホスティング互換性

同じファイルを他のHTTPS静的ホスティングへ配置しても動作します。ルートまたはサブディレクトリに配置可能です。`sw.js`・`cache-manifest.js`の通常HTTPキャッシュを長期間固定しないでください。HTTPS、JavaScript／JSON／WASMの正しいContent-Typeが必要です。フォールバックは単一WASM threadのためcross-origin isolationを要求しません。
