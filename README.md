# Dopa Fit / ドパフィット

**Move your body. Build the beat.**

[**Play Dopa Fit → https://dopa-fit.vercel.app/**](https://dopa-fit.vercel.app/)

スマートフォンのインカメラで身体をコントローラーにする、独立したOSSフィットネス実験。手を伸ばしてターゲットに触れると、音楽・光・Particle・ENERGY・FEVERが育ちます。静的HTML・JavaScriptだけで動作し、ビルド・サーバーAPI・ログインは不要です。

![Dopa Fitの応援ロボット](assets/characters/idle.png)

現在は**公開候補版**です。Androidで音と手振りが動作し、音声改善後にはiPhoneでも音が出たとの利用者報告があります。rc.9の半身モードと5段階の視覚演出も利用者確認済みです。rc.10では配置と可変テンポ音楽を改善。rc.11では日本語／英語の切替と、肩・両手・腰の認識状況を見ながら準備できる案内を追加しました。rc.12では最長10秒の練習、FEVER前のタメと音楽に同期した突入、保存できる成果カードを追加しました。rc.13ではFace Mask × Dopa Record、3つの背景、成長ストーリーの自動編集、SUPERNOVA以降の反復と変奏を追加しました。好きなだけ運動して、自分で終了するとその回の成長動画ができます。録画はFace Maskと独立して選べます。MY ROOMでマスクOFFにすると顔も動画に映り、ONにすると顔を隠して録画します。実機の顔追跡比較と長時間受入は未完了です。[実装・容量上限・実機PoC](docs/face-mask-dopa-record.md)。準備案内の折りたたみ、FEVERの同時ターゲット数とSUPERNOVA演出も強化しました。[変更と改善案](docs/calibration-fever-improvements.md)。新しい音楽・配置・準備案内・成果画像保存の実機評価、機種／OSの特定、長時間の性能・発熱・バッテリー評価は未完了です。[確認状況](docs/release-checklist.md)を参照してください。

## Concept

Movement creates reward. 身体を動かすほど音楽の編成と光の演出が豊かになります。累計ENERGYと解放済みの楽器は、休憩や認識が途切れても保持します。

## Philosophy

- No MISS
- No penalty
- No game over
- Movement creates reward
- Success makes the experience richer

## Language / 言語

説明・設定・準備・結果・プライバシーは日本語と英語で切り替えられます。初期値は端末の優先言語（日本語なら日本語、それ以外は英語）。トップ画面、準備画面、Pauseから手動変更でき、この端末に保存します。

Instructions, setup, settings, results and privacy are available in Japanese and English. Your device’s preferred language sets the initial choice. Use the language selector to change it; your choice is saved only on your device.

**Quick start:** stand your phone upright → Start → allow camera → show shoulders and both hands in front of your chest → wait for the checks and countdown → try the left and right glowing targets (up to 10 seconds, skippable) → reach for targets with either hand. Upper body works seated or standing; Full body also needs visible hips. You can switch modes during setup. Match the example pose loosely; precise alignment is not required.

## How to Play

1. スマートフォンを安定した場所に立て、縦画面でDopa Fitを開く。「遊び方」で半身／全身を選ぶ。
2. START MOVINGを押し、カメラを許可する。
3. 半身では両手を胸の前へ。全身では肩・両手・腰が映る位置へ。3秒の準備を待つ。
4. 最初は左→右の大きなターゲットで練習。両方に触れたら通常プレイへ進み、触れなくても10秒で切り替わります。スキップも可能で、練習中のHITも加算します。通常プレイはGOのターゲットへ、好きな手をゆっくり伸ばす。光る側とNEXTを追うと左右交互に動けます。別のターゲットに触れても成功です。速さ・方向・拍の正確さは必要ありません。
5. 手の動きでビートを育てる。100 ENERGYごとにFEVERがSPARK → GROOVE → RUSH → HYPER → SUPERNOVAと育つ。
6. ひと息つきたいときはPause。音量や演出を設定し、「また動こう」で再開。成果はそのまま。
7. 終了すると最高FEVER・HIT・ENERGY・運動時間の成果カード。「画像で保存」でPNGを保存し、「もう一回」で新しいセッションを始められます。写真はカードに含みません。

半身モードは近くでのリーチや座ったままの手の動きに向けた設定です。肩幅が大きくてもターゲットを画面内の届く範囲へ収め、腰の認識を要求しません。カメラ映像全体から推論して、画面いっぱい表示の切り抜き外にある肩・肘も体格の基準に使います。手の初期認識は見えている範囲で行います。約60cmでの実機動作は未確認で、端末の画角により両手が入る距離・角度の調整が必要です。胸の前で動かし、映りづらい場合はPauseの「カメラ表示 → 広く映す」を選べます。

全身モードも標準で画面いっぱいにカメラを表示し、腰まで認識できる位置へ下がって開始します。Pauseの「広く映す」で映像全体を確認する表示へ切り替えられます。ステップ・上下動も加点対象。半身の3分コースは手と腕の案内にし、腰の運動を加点しません。START前またはPauseで切り替えられ、セッション内のENERGY・FEVER段階は再開時にも保持します。iPhoneではSafariの共有メニューから「ホーム画面に追加」し、追加したアイコンから開くとブラウザのバーがない広い画面で遊べます。

FEVERは5段階。通常112 BPMから、SPARK 120 → GROOVE 128 → RUSH 138 → HYPER 148 → SUPERNOVA 160 BPMへ加速します。SPARKは四つ打ちと明るいシンセ、GROOVEは細かいハットと跳ねるリズム、RUSHは共鳴するベースと16分音符のリード、HYPERはシンコペーションと厚い和音、SUPERNOVAは高速リードと和音を組み合わせます。4小節のコード進行も独自合成です。FEVERは次の未予約小節から1小節のタメ（上昇シンセ、細かくなるスネア、BGMの絞り込み）に入り、続く小節頭でテンポ・ドラム・ベース・和音が一気に展開。光の拡散と紙吹雪もその音声時刻に同期します。HIT音は即時。ターゲットと光も実際の拍に追従します。同時発音24／AudioNode160／粒子240の上限を共有。FEVERは段階のテンポで8小節相当（約12〜16秒）、ひと息は100 BPMで4小節相当。FEVERの残り時間は実際の突入から数えます。ひと息の音楽切替は次の小節頭です。余分なENERGYは繰り越し、最高段階でもSUPERNOVAを繰り返せます。録音・追加の第三者音源は使用しません。

手首から肘と反対の方向へ少し補正した位置に、半径20〜40pxの手の周辺判定を設けています。大きくしたターゲットに周辺の円が重なればHIT。手首の信頼度はHITだけ0.3以上で拾い、運動の回数・MOVEでは従来の条件を維持します。認識が欠けたときは表示を最大320ms保ち、直前の肘が追えている場合だけ最大220ms動きを補助します。表示の保持だけで加点せず、長い追跡欠落・新しいターゲットへの重なり・手を置き続ける動作で連打しません。

START時に短い確認音を鳴らします。音が聞こえない場合は、Pause内の「音を有効にする」／「音を試す」をタップしてください。設定中はカメラとBGMを休止し、確認音で音声を再起動します。ENERGYと時間は保持し、「また動こう」のタップで再開します。音の開始に失敗した場合はプレイ画面に「音を有効に ♪」が現れます。端末の音量・消音設定も確認できます。対応ブラウザでは音楽再生用Audio Sessionを設定します。実機での修正確認は継続中です。[音声の確認手順](docs/audio-compatibility.md)。

ターゲット外の手振りにも控えめなペンタトニック音と「MOVE +1」を返します。両手合計で最大2回／秒、静止・再検出では発音しません。HITと同時の場合はHITの音と表示を優先します。

HITで約280msの収縮・白い局所フラッシュ・三重リング（HYPERは四重、SUPERNOVAは五重）、約190msの合成音と短い粒子爆発を連動。手のTrailは約240ms残ります。速い動きでは演出を最大35%強めますが、ゆっくり触れても同じHIT +5です。通常は左右各4段、計8か所の候補から配置。半身では横幅と縦の到達範囲を分け、肩が低く映っても届く範囲の上・中央・下へ広げます。HUDと左上マスコットの高さを避け、マスコットはターゲットやお祝いに重なる場合に一時非表示。画面端で重なる候補は除外します。通常・ひと息で触れるターゲットは最大2個、予告は最大1個で、HIT後は次の場所へ小さなNEXTタイルが近づき、拍に沿って次が現れます。予告はまだ判定せず、到着後の円がタッチ範囲です。逃しても静かに次へ移り、減点しません。Pauseの「その場で小さく」で動く範囲を縮められます。FEVERはSPARKから4／6／8／10／12個を上限に同時出現を増やし、重ならない数まで運動範囲と画面に合わせて調整します。FEVERのHIT待ちは220ms、RUSH以降は半拍で補充します。SUPERNOVAは継続する紙吹雪・星・拡散する光の輪・5重のHITリングを加えます。ひと息では2個の穏やかな配置へ戻ります。楽器解放でNEW SOUND、累計HITの節目でお祝い。FEVERが近づくと予告し、到達すると紙吹雪・ビートの光・厚い編成へ変化します。Pause内の「演出ひかえめ」で収縮・フラッシュ・Trailなどを抑えられます。[今回の演出と次の改善案](docs/experience-roadmap.md)。

「カメラなしで試す」はドラッグ／タップで同じHIT・音楽・NEXTの流れを試すデモです。運動記録にもデモと表示します。3分コースではリーチ・両手上げ・ステップ・上下動・自由運動・クールダウンを案内します。上下動認識はフォーム採点ではありません。全身モードでは腰まで映る配置が必要です。

## Supported Devices

主対象はiPhone Safari縦画面（iPhone 12相当以降を性能目安）とAndroid Chromeです。2026-10-01の利用者報告：Androidで音と手振りが動作、音声改善後にiPhoneでも音が動作。機種・OS・ブラウザ版は未特定で、全実機ゲートの合格ではありません。自動検証と報告は`docs/verification.md`へ記録します。カメラはHTTPSまたはPCのlocalhostで動作します。LANの通常HTTPでは動作しません。

## Local Development

Python 3で、リポジトリのルートから起動します。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

PCで<http://localhost:8000/>を開きます。アプリの実行にNode.jsやnpm installは不要です。スマホ検証にはHTTPSを使用してください。

開発時のURL：`?phase=1`でCamera → Pose → Wrist → HIT → Soundだけを評価できます。`?phase=2`でENERGY・音楽、`?phase=3`で演出、`?phase=4`以降で全身認識・履歴を追加。通常アクセスは全機能です。`?debug=1`で端末内のFPS・推論時間・粒子・発音数・Tensor数を表示します。診断値は送信しません。

Node.js 22以降でロジック・配布物を検証します。

```powershell
npm test
npm run audit:files
```

ブラウザ試験は開発専用のPlaywrightを使用します。静的アプリの依存ではありません。

```powershell
npm install
npx playwright install chromium
npm run test:browser
npm run test:pwa
```

音声の開始・復旧は`npx playwright install webkit`後、`npm run test:audio-browser`でChromiumとデスクトップWebKitを検証します。WebKitの結果は実機iPhoneの消音スイッチやスピーカー出力を保証しません。

ブラウザ試験は自分で一時的なlocalhostサーバーを起動し、合成入力・偽カメラで検証します。画像や実写テスト映像を保存しません。結果と画面のスクリーンショットは無視対象の`test-results/`へ出力します。`DOPA_BASE_URL`指定時はそのURLを使います。

依存の取得記録は[dependency-manifest](docs/dependency-manifest.json)、ライセンス取得元は[license-sources](docs/license-sources.json)、分類は[asset-audit](docs/asset-audit.md)。依存更新時だけ`python tools/fetch-deps.py`と`python tools/fetch-licenses.py`を実行し、条件と通信を再確認してください。

## Privacy

カメラ映像と姿勢データをブラウザ内で処理し、アプリからサーバーへ送信・保存しません。マイク・利用統計・分析SDKは使いません。設定と直近30回の集計だけを端末に保存し、記録画面で削除できます。ライブラリ・モデルも同じ配信元から取得します。ホスティングの通常アクセス通信はあります。[Privacy](PRIVACY.md)を参照してください。

## Inspired by dopa-drill

Dopa Fit is an independent open-source fitness experiment inspired by the positive-feedback design philosophy of [dopa-drill](https://github.com/grmchn/dopa-drill). It is not an official sequel or an affiliated project.

dopa-drillの「成功で体験を豊かにする」という思想に敬意を表します。実装・UI・音楽パターン・マスコット・ロゴ・文章は新規制作し、dopa-drillのコードやブランド素材を同梱しません。[分類と確認根拠](docs/asset-audit.md)を参照してください。

## License

Dopa Fit独自コード・文書・独自SVGは[MIT](LICENSE)。独自生成キャラクターは[assetsの利用条件](assets/LICENSE.md)を適用します。第三者ライブラリ・モデル・WASMをMITへ付け替えるものではありません。Apache-2.0、MIT、BSD等の条件と全文は[THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)と`licenses/`にまとめています。システムフォントのみ使用し、フォントや録音音源は配布しません。

## Deployment

VercelでGitHub `kajirudo/dopa-fit`をImportし、チーム`kajirudos-projects`、Production Branch `main`、Framework `Other`、Build Command空欄、Output Directory `.`を使用します。Functions・DB・分析SDKは不要です。[公開手順](docs/deployment.md)と[実機チェック](docs/release-checklist.md)を完了してからRelease Readyとします。

PWAインストールは任意。キャッシュ保存完了後はオフラインでも動作します。更新は全タブで運動を終えて適用します。静的ファイル変更後は必ず`npm run audit:files`でキャッシュのハッシュを再生成してください。

準備画面：映像をぼかさず、姿勢の例・認識チェック・安定待ちの進捗・足りない部位への短い案内を表示します。両手は一度ずつ見せ、肩の位置が約0.75秒安定すると3秒のカウントダウンへ進みます。全身は腰も必要。準備中に半身へ変更でき、準備画面を閉じて設定へ戻る必要はありません。シルエットに正確に合わせる必要はなく、判定条件とHITの成功扱いは維持します。

導入・FEVER同期・成果PNG・再プレイは `npm run test:experience-browser` で検証します。
