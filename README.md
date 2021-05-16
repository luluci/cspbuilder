# CS+ Builder README

## Features

workspace内のCS+プロジェクトファイル(.mtpj)を解析して情報を取得し、VSCodeからのビルド等の操作を提供する。

## Requirements

None

## Extension Settings

This extension contributes the following settings:

### 拡張機能コンフィグ
* `cspBuilder.BuildMode.DefaultDeactive`: 指定したBuildModeをデフォルトでビルドターゲットから外す。

### CS+コンフィグ
* `cspBuilder.path.CC.CSPlus`: CS+をコマンドラインから操作するための "CubeSuite+.exe" へのパスを設定する。

### CS+ RTOS利用プロジェクト用コンフィグ
* `cspBuilder.path.CC.RTOS.dir`: RTOSインストールディレクトリを設定する。
* `cspBuilder.path.CC.RTOS.Configurator`: RTOSコンフィグレータのパスを設定する。
* `cspBuilder.path.CC.Devicefile`: Devicefileディレクトリのパスを設定する。(RL78コンフィグレータ向け)

### マイコンコンフィグ
* `cspBuilder.Micom.RL78`: マイコン型番(Device情報)を設定する。ここで設定したDeviceはRL78マイコンと認識する。
* `cspBuilder.Micom.RX`: マイコン型番(Device情報)を設定する。ここで設定したDeviceはRL78マイコンと認識する。
* `cspBuilder.Micom.ROMArea`: マイコン型番(Device情報)とROMエリアを紐づけて設定する。(この領域をターゲットに何かする予定。)

## Known Issues

None

## Release Notes

### 0.0.1

Initial release of CS+Builder
