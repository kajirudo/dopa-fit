# Third Party Notices

Dopa Fitの独自部分はMITです。以下の第三者配布物にはそれぞれの条件が適用されます。取得版・SHA-256・配置先は[dependency-manifest](docs/dependency-manifest.json)、ライセンスの固定取得元・ハッシュは[license-sources](docs/license-sources.json)に記録しています。依存を改変した場合はこの文書も更新してください。

| Project | Source / version | License | Used portion | Modification |
|---|---|---|---|---|
| dopa-drill | [grmchn/dopa-drill](https://github.com/grmchn/dopa-drill), 固定commitは監査台帳参照 | コードMIT、キャラクター／ロゴは例外、同梱フォントOFL | ポジティブフィードバックの設計思想のみ。コード・素材の同梱なし | 独自実装。派生コードなし |
| TensorFlow.js core / converter / WebGL / WASM | [tensorflow/tfjs tfjs-v4.22.0](https://github.com/tensorflow/tfjs/tree/tfjs-v4.22.0) | Apache-2.0 | `vendor/tf-*.min.js`, WASM3ファイル | npmの配布バイトを変更せず同一配信元へ配置 |
| TensorFlow.js CPU kernels | 上記の同じ版 | Apache-2.0 | WebGL／WASMバンドル内のヘルパー。CPU backendを別途起動しない | バンドル内に含まれるまま |
| TensorFlow pose-detection | [tfjs-models pose-detection-v2.1.3](https://github.com/tensorflow/tfjs-models/tree/pose-detection-v2.1.3) | Apache-2.0 | `vendor/pose-detection.min.js`のMoveNet detector | 配布バイト変更なし。ローカルモデルURLを設定 |
| MoveNet SinglePose Lightning v4 | [公式モデルカード](licenses/movenet-lightning-v4-model-card.md) | Apache-2.0（モデルカードで確認） | `models/movenet-lightning-v4/` model.jsonと2つの重み | 配布バイト変更なし |
| long 4.0.0 | [npm](https://www.npmjs.com/package/long/v/4.0.0) | Apache-2.0 | TensorFlow.jsバンドル内の整数処理 | 変更なし |
| seedrandom 3.0.5 | [davidbau/seedrandom](https://github.com/davidbau/seedrandom) | MIT | TensorFlow.jsバンドル内の乱数処理 | 変更なし |
| tslib 2.4.0 | [Microsoft/tslib](https://github.com/microsoft/tslib) | BSD-0-Clause | pose-detectionのTypeScript runtime helpers | 変更なし |
| XNNPACK | [google/XNNPACK](https://github.com/google/XNNPACK), 5e8033a | BSD-3-Clause | WASMに組み込まれる演算 | バイナリ変更なし |
| FP16 / FXdiv / psimd | [Maratyszcza](https://github.com/Maratyszcza) | MIT | XNNPACKの半精度変換／整数除算／SIMDヘルパー | バイナリ変更なし |
| pthreadpool | [Maratyszcza/pthreadpool](https://github.com/Maratyszcza/pthreadpool) | BSD-2-Clause | XNNPACKのスレッド処理。アプリは1threadに固定 | バイナリ変更なし |
| cpuinfo / clog | [pytorch/cpuinfo](https://github.com/pytorch/cpuinfo) | BSD-2-Clause | XNNPACKのCPU情報／ログヘルパー | バイナリ変更なし |
| Emscripten 3.1.28 | [emscripten-core](https://github.com/emscripten-core/emscripten/tree/3.1.28) | MIT / NCSA。全文にNode.js表示を含む | WASMの生成runtime glue | バイナリ変更なし |
| musl libc | Emscriptenに同梱された版 | MITとCOPYRIGHT内の表示 | WASMのCライブラリ | バイナリ変更なし |
| LLVM compiler-rt / libc++ / libc++abi | Emscripten 3.1.28に同梱された版 | Apache-2.0 WITH LLVM-exceptionと同梱表示 | WASM toolchainのコンパイラ支援／C++標準・ABIライブラリ。リンクで除去される部分も含め保守的に表示 | バイナリ変更なし。各LICENSE全文を同梱 |

Apache本文は[Apache-2.0](licenses/Apache-2.0.txt)、上流著作権は[tensorflow-js](licenses/tensorflow-js-LICENSE.txt)・[tensorflow-models](licenses/tensorflow-models-LICENSE.txt)。その他の全文は`licenses/*-LICENSE*.txt`、muslは`licenses/musl-COPYRIGHT.txt`。WASM構成の根拠はtfjs-v4.22.0の[WORKSPACE](https://github.com/tensorflow/tfjs/blob/tfjs-v4.22.0/WORKSPACE)と[BUILD.bazel](https://github.com/tensorflow/tfjs/blob/tfjs-v4.22.0/tfjs-backend-wasm/src/cc/BUILD.bazel)。推移依存も通知対象とし、ビルド専用テストツールはアプリに同梱しません。

LLVMの例外条件と追加表示は[compiler-rt](licenses/compiler-rt-LICENSE.txt)・[libc++](licenses/libcxx-LICENSE.txt)・[libc++abi](licenses/libcxxabi-LICENSE.txt)に保持しています。これらを独自部分のMITへ付け替えません。WASMのallocatorはBUILDの`MALLOC=emmalloc`で確認し、EmscriptenのMIT/NCSA表示に含めます。dlmallocを使用中としては記載しません。

## CDN・候補・素材について

npm registry／jsDelivr／TF Hubは開発時の取得経路です。一般利用時は同一配信元のローカルファイルを読み、CDNへ接続しません。CDNの使用とパッケージのライセンスは区別しています。

外部フォント、録音音源は採用していません。Pose DetectionのUMDファイルにMediaPipe対応コードは含まれますが、通常のPoseはMoveNetです。Face Mask／背景選択では、別のMediaPipe Tasksランタイムを端末内で起動します。音楽とHIT音はDopa Fit独自のWeb Audio合成です。ロゴ・アイコン・CSS背景は新規制作。AI生成キャラクターの制作記録は[asset-audit](docs/asset-audit.md)、素材の扱いは[assets/LICENSE](assets/LICENSE.md)を参照してください。

## Face Mask / Dopa Recordの追加配布物

- MediaPipe Tasks Vision 1.0.1（Apache-2.0）：npm tarballから無改変で配布。SIMD／非SIMD WASMとJSローダーを同一配信元から遅延取得します。[上流LICENSE全文](licenses/mediapipe-LICENSE.txt)。
- MediaPipe Face Detector、Face Landmarker、Selfie Segmenter：公式配布のfloat16 version 1を固定しています。取得URL・サイズ・SHA-256は[Record依存マニフェスト](docs/record-dependency-manifest.json)。顔追跡方式は実機PoCが終わるまで未確定です。
- Mediabunny 1.61.0（MPL-2.0）：無改変のES module bundleを配布。[LICENSE全文](licenses/mediabunny-LICENSE.txt)。対応するソースは[固定版npm tarball](https://registry.npmjs.org/mediabunny/-/mediabunny-1.61.0.tgz)内の`package/src/`です。独自のアプリコードのMITとライセンスを分けています。

追加のライブラリ・モデルは約28.5MBの独立した任意キャッシュです。カメラ素材や完成動画はこのキャッシュに保存しません。配布バイナリのハッシュを`audit:files`で検証します。
