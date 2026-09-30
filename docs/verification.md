# Verification record / 2026-10-01

## 実行した検証

Windows、Node.js 22、Playwright 1.62.1／Chromium 151.0.7922.34。独立したlocalhostサーバー、偽カメラ、合成骨格とポインター入力。実写映像の保存はしていません。

- Nodeロジック試験：12項目成功。座標・鏡・余白・古い結果、HIT保持・退出・欠落、ENERGY／FEVER2周期、MOVE上限、安定キャリブレーション、両手上げ・ステップ・上下動の保持／再検出、保存領域拒否、許可回答が遅れたカメラのキャンセル・解放を確認。
- ブラウザ試験：11項目成功。1440px／390px表示、ポインターHIT→音→ENERGY→FEVER、休憩後の保持、音源解放、履歴区分と削除、Camera→ローカルMoveNet推論、合成骨格からのキャリブレーション→HIT→音、カメラ停止、完全キャッシュ後オフライン起動、通信とConsole。
- PWA／fallback試験：4項目成功。別タブプレイ中の更新拒否、全タブ終了後の更新と旧キャッシュ削除、hash不一致の更新拒否、WebGL不可を模擬した単一thread WASM推論。

ブラウザ試験で最大24voice、74AudioNodeを観測し、音楽を止めると稼働voiceは0。通常経路のConsole error・未処理例外は0。すべての観測リクエストは同一localhost origin、GETのみ、外部通信0、本文付きアップロード0でした。キャッシュ保存時のWASM取得も含めて確認しています。

配布キャッシュ合計は約7.72MiB（アプリ・素材・依存・モデル・ライセンス込み）。これはファイルサイズの合計で、空キャッシュ起動時の実転送量やロード時間の測定とは異なります。PWA保存と初回モデル取得が重なる場合の重複通信を含む実転送量は実機の通信条件で計測が必要です。

## 確認の限界

偽カメラ映像には人物がいないため、MoveNetの検出人物は0です。モデルを実際にロードして推論完了したことは確認しましたが、人体追跡の精度を確認したことにはなりません。HITの一連の処理は別に合成骨格をAppControllerへ入力して確認しました。

デスクトップのソフトウェアWebGLによる3回の推論処理（50ms待機を含む）は約2.77秒で、スマートフォンのPerformance Budget達成の根拠には使いません。Tensor数180はモデル稼働時のスナップショットです。20分のメモリ推移や発熱を測定した値ではありません。

iPhone／Android実機でのカメラ許可・追跡・リーチ判定・Audio開始・画面回転・スリープ・20分負荷・電池・本番URL監査は未確認です。詳細は[release-checklist](release-checklist.md)。実機ゲートの完了前は**公開候補**であり、Release Readyではありません。

## 再現方法

`npm test`、`npm run audit:files`、`npm run test:browser`、`npm run test:pwa`。

ブラウザ試験とPWA試験は自前の一時サーバーを起動します。PWA更新試験はOSの一時フォルダーに配布ファイルのコピーを作り、コピーだけに意図した変更・hash破損を加え、終了時にその一時フォルダーを削除します。作業リポジトリの配布物は変更しません。

生の結果と確認画像はローカルの無視対象`test-results/`。利用者の通信ログ・認証情報を公開する運用ではありません。GitHub Actionsでも同じ試験を実行します。

## GitHub・Vercelの公開確認

GitHub公開：https://github.com/kajirudo/dopa-fit 。初回監査コミット `2d4a8b7f7d9896366014272b911bf6a4121794ad`。GitHub Actions [36786982876](https://github.com/kajirudo/dopa-fit/actions/runs/36786982876) は成功。新しい空フォルダーへmainをcloneし、Node12項目、依存／ライセンスhash、キャッシュマニフェスト再生成後の差分0を確認しました。

本番URL：https://dopa-fit.vercel.app/ 。Vercel `kajirudos-projects/dopa-fit`、mainに接続、Framework Other、Build Command空、Output Directory `.`。初回Deployment `4dqjzpYMh57ck9CkitJBvKHaLTTq` が上記commitを配信しReadyになったことをDashboardで確認しました。Functions使用なし、Web Analytics／Speed Insights SDKを追加していません。

未ログインのChromiumから本番URLのブラウザ11項目を再実行し、すべて成功。CameraとローカルMoveNetの推論完了、合成骨格のHIT、デモのAudio／ENERGY／FEVER、カメラ停止、履歴、オフラインを確認しました。通信originは `https://dopa-fit.vercel.app` だけ、GETだけ、外部通信・アップロード・Console errorは0です。WASMのContent-Typeはapplication/wasm、モデルはapplication/json、HTTPS／CSP／Permissions-Policy／nosniffも確認。物理端末での試験の代用ではありません。

公開候補のタグは `v0.1.0-rc.1`。実機ゲート未完了のため安定版・Release Readyとは扱いません。
