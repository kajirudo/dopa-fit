# License / Asset Audit

確認日：2026-10-01。対象：このリポジトリの配布ファイル。空の作業フォルダーから新規作成した実装です。過去のプロトタイプの監査結果を推測したものではありません。今後持ち込むものは追加監査します。

## 分類と承認状態

1＝Dopa Fit独自、2＝dopa-drillのアイデアのみ参考、3＝同コードを改変、4＝ほぼそのまま利用、5＝同由来アセット、6＝外部ライブラリ／取得元由来。分類と利用承認は別です。

| 対象／範囲 | 分類 | 出所・条件 | 使用部分／Modification | 判定 |
|---|---|---|---|---|
| `index.html`, `privacy.html` | 1 | この開発で新規作成、MIT | HTML、独自コピー、操作案内 | 採用可 |
| `style.css` | 1 | 新規作成、MIT | クリーム・ミント・アプリコットのレイアウト、鏡表示、レスポンシブ | 採用可 |
| `src/app.js`, `camera.js`, `pose.js`, `coordinates.js`, `calibration.js`, `hands.js`, `storage.js` | 1 | 新規作成、MIT。Pose API接続先は分類6を別記 | 状態遷移、座標変換、キャリブレーション、保存 | 採用可 |
| `src/game.js`, `music.js`, `fever.js` の体験仕様 | 2 | dopa-drillの成功による増幅という思想を参考 | カメラ入力、ENERGY、FEVER、小節の仕様は本計画。コードは独自（分類1） | 採用可 |
| `src/audio.js` | 1 | 新規作成、MIT | Web Audio合成、独自ノート／パターン、音源解放。録音音源なし | 採用可 |
| `src/renderer.js`, `effects.js`, `impact.js` | 1 | 新規作成、MIT | 円、手首、Trail、Particle、キャラ表示。dopa-drillの描画式コピーなし | 採用可 |
| UI・エフェクト・背景 | 1。成功時に演出が増す思想は2 | 独自HTML/CSS/Canvas、MIT | 外部UI画像なし | 採用可 |
| `assets/characters/*.png` | 1（AI生成） | OpenAI画像生成。権利が存在する範囲でMIT許諾 | 新規基準キャラとその2ポーズ。縮小・PNG圧縮のみ | 採用可。AI生成の権利・独占性は保証しない |
| ロゴ・`assets/icon.svg`・PNGアイコン | 1 | 新規制作、MIT | ロゴ文字はHTML、独自波形SVGをPNG化 | 採用可 |
| タイトル画面・背景・UI画像 | 1 | CSS／HTMLと独自キャラの組み合わせ | コピー・外部タイトル画像なし | 採用可 |
| フォント | 1（指定CSS） | 端末のsystem-ui／既存フォント | フォントファイルの取得・配布なし | 採用可 |
| 音源 | 1 | 独自Web Audio合成、MIT | 外部音源なし | 採用可 |
| README・Privacy・テスト・PWA・ツール・設定 | 1 | 新規作成、MIT | ユーザー計画に基づく記述、独自Attribution | 採用可 |
| `vendor/*.js`・`vendor/*.wasm` | 6 | 固定npm配布版、Apache-2.0および内包MIT/BSD/NCSA | バイトを変更せず同一配信元へ配置。全文とhashを記録 | 採用可 |
| `models/movenet-lightning-v4/*` | 6 | TF Hubモデルv4。モデルカードのApache-2.0を確認 | model.jsonと2重みのバイト変更なし | 採用可 |
| `licenses/*` | 6 | 上流LICENSE／モデルカードを固定版から取得 | ライセンス全文・著作権表示を保持 | 採用可 |
| MediaPipe Tasks | 未使用候補 | 採用しない。pose-detection内の対応コードを起動しない | ランタイム・モデル・CDN利用なし | 不採用 |
| 外部CDN | 6（開発時取得経路） | npm／jsDelivr／TF Hub | 実行時CDNはなし。取得先・版・hashを台帳で管理 | 採用可 |
| その他のBase64画像・SVG・フォント・音源 | 該当なし | 全配布ファイル棚卸し。Canvas合成、独自SVGのみ | 埋め込み第三者素材なし | 該当なし |

分類3・4・5の採用物はありません。利用条件未確定の配布素材も現時点ではありません。これは将来の追加物の承認ではありません。

## dopa-drillの固定参照

参照commit：`fdacd5fc8322f251f92ddc07f13ae85ccb2263dd`。

[元リポジトリ](https://github.com/grmchn/dopa-drill/tree/fdacd5fc8322f251f92ddc07f13ae85ccb2263dd)と[LICENSE](https://github.com/grmchn/dopa-drill/blob/fdacd5fc8322f251f92ddc07f13ae85ccb2263dd/LICENSE)を確認。コードのMITとキャラクター／ロゴの例外、同梱フォントのOFLを分けました。Dopa Fitはそのキャラの形状を描くJavaScriptも取得・改変しません。

元アーカイブのテキストをメモリ上で比較しました。独自`src/*.js`と上流JSの正規化した連続30トークンの完全一致は0件。[比較記録](reference-audit.json)。この機械比較だけで著作権上の非類似を証明するものではなく、新規制作の経緯、視覚・仕様・関数単位の確認を合わせて分類しました。一般的なCanvas／Audio API名の一致をコピーとは扱いません。

HTML・CSSは独自2カラムのタイトル画面、カメラステージ、PWA処理から構築。参考元は計算ドリルであり、画像・ロゴ・フォント・文章を転載しません。ユーザー指定のAttributionを新規記述しました。上流ブランド素材はGit履歴にも追加していません。

## Third-party provenance

[dependency-manifest](dependency-manifest.json)＝runtimeファイル別の版・出所・SHA-256・サイズ。
[license-sources](license-sources.json)＝固定取得元とライセンス全文のSHA-256。
[distribution-manifest](distribution-manifest.json)＝実配布ファイルの全棚卸し。

MoveNetはライブラリと別にモデルカードを確認。WASMはtfjs固定版のWORKSPACE／BUILDからXNNPACK、FP16、FXdiv、pthreadpool、cpuinfo、clog、psimdとEmscriptenを追跡。Emscriptenの同梱musl表示を追加しました。MITの独自コードとこれらの配布条件を混同しません。上流の配布バンドルを改変していないため、変更表示は「同一配信元へ配置・アプリ側のモデルURL設定」とします。

さらに、Emscriptenのsystem librariesのLLVM compiler-rt／libc++／libc++abi LICENSE全文（Apache-2.0 WITH LLVM-exceptionと追加表示）を記録・同梱。リンク時に除去される部分を含め保守的に通知しています。allocatorはtfjsのBUILDでemmallocと確認しました。これらの再配布表示も独自MITとは別に維持します。

開発専用Playwright 1.62.1はApache-2.0。npm取得される開発パッケージはWebアプリへ同梱しません。CIのGitHub Actionsは開発ツールです。

## 生成素材の制作記録

ツール：OpenAI built-in ImageGen、2026-10-01。外部のキャラクター画像やdopa-drillの画像を参照入力にしていません。基準画像のみを次のポーズの参照入力に使用しました。利用条件は[OpenAI Terms of Use](https://openai.com/policies/terms-of-use/)のOutputに関する規定を確認し、権利が存在する範囲でMIT許諾します。AI画像に独占的権利が必ず成立するという判断ではありません。

採用ファイル：`idle.png`（512px）、`cheer.png`（512px）、`fever.png`（512px）。透過PNG、sharpによる縮小・圧縮。原案を再描画する加工はしていません。最終ファイルのhashはdistribution-manifestへ記録します。

基準プロンプト：

> Use case: stylized-concept. Asset type: Dopa Fit independent open-source fitness web game mascot, idle base character, transparent-background cutout. Create ONE original friendly rounded little robot with a soft bean-shaped mint-green body, two short coral-apricot arms, two little navy feet, simple dark navy oval eyes, warm cheerful smile, a small cream belly panel with a mint heartbeat waveform. Soft matte clay-like 3D illustration with very subtle grain, premium playful Japanese lifestyle app visual. Full body centered, front three-quarter view, relaxed arms slightly spread as if welcoming someone to move. Rounded shapes, approachable, clearly visible at 96 pixels. Natural soft studio lighting, clean silhouette. Real transparent background, no floor, no cast shadow outside the character, no words, no logo, no watermark. Do not reference or imitate Dopa Drill or any existing mascot. Square composition with generous safe margins around arms and feet. Deliver one clean finished raster character asset.

派生プロンプトの要旨：cheer＝基準キャラの顔・色・パネル・素材を保持、両手を上げて片足を上げた応援ポーズ、透明背景。fever＝同じキャラを歓喜のジャンプ、両手・両足を上げ、周囲に小さな星3つ、文字・背景・床なし。ツール結果から各1枚を採用しました。ポーズ一致を目視確認済み。

## 追加・公開の運用

rc.9の5段階FEVER・半身／全身：`src/fever.js`の段階名・色・独自音列、段階ごとの音楽・描画・開始音・HIT音、近距離でのターゲット幅調整、モード別の推論入力・可視範囲・腰認識・案内、設定UIとテストは新規作成（分類1、MIT）。第三者のコード・素材・依存の追加なし。距離60cmの実機確認は未完了。

rc.8の縦画面・判定改善：cover／containに一致する座標と可視映像の切り抜き、`src/hands.js`の広い判定・手先方向の補正・短い肘補助・表示保持、ターゲット拡大・片手の連続発音制御・光と粒子・リング強化・表示設定とテストは新規独自作成（分類1、MIT）。利用者の写真は参照として画面を確認しただけで、配布物・テスト入力・Git履歴へ追加していません。第三者素材・依存の追加なし。

rc.7のターゲットフロー：`game.js`の配置候補・左右の誘導・拍での交換・NEXT計画、`music.js`の音声時計、独自Canvasタイルと予告、動く範囲の設定とテストは新規作成（分類1、MIT）。Beat Saberの体験を着想として参照しましたが、コード・譜面・画像・録音・ロゴは採用していません。新たな第三者同梱物はありません。

rc.6のHIT／UI改善：`src/impact.js`の280ms演出曲線、`game.js`の速度増幅・通過判定・静かな再配置、ターゲットの奥行き、短い粒子とTrail、合成HIT音、カメラideal条件、Pause設定画面、対応テストは新規独自作成（分類1、MIT）。加点条件は速度に依存せず、第三者コード・録音・素材・依存の追加なし。

rc.5の演出改善：`src/feedback.js`の累積報酬通知、二重リング・光線・拍動・紙吹雪・HIT文字、CSS通知、Web Audioの祝福音とFEVER編成、対応テストは新規独自作成（分類1、MIT）。成功時に体験が育つ思想は引き続き分類2。新しい第三者画像・録音・依存・コードのコピーはなく、配布ファイルhashを更新しています。

2026-10-01の音声改善：`audio.js`の確認音・Audio Session設定・復旧、`app.js`の音声操作、MOVE通知と音・Canvas表示、`tests/audio.test.js`、`tools/audio-browser-check.cjs`は独自作成（分類1、MIT）。Web標準APIを利用し、第三者コードや録音素材は追加していません。参照した互換性資料は[音声記録](audio-compatibility.md)にリンクし、コードのコピーと区別します。

新規ファイルや依存更新ごとに、分類・取得元・版・hash・必要表示・Modificationを追加します。不明なら「分類未確定／要確認」として配布から除外。公開履歴に入った場合は、最新版の削除だけで解決したと判断しません。現在は監査済み新規成果物から初回公開履歴を作成します。
