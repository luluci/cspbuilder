import { posix } from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { DeviceInfo, config } from './config';
import { MtpjInfo } from './CSPProjectInfo';
import { OutputExcel } from './release';

export class CSPBuilderPanel {
	// View ID
	public static readonly viewType = 'cspbuilder.cspbuilderView';
	// CurrentPanel 
	public static currentPanel?: CSPBuilderPanel;
	//
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _outputChannel: vscode.OutputChannel;
	private _disposables: vscode.Disposable[] = [];
	//
	private _wsInfo: Array<CSPWorkspaceInfo>;
	private _nonce: string;
	private _taskIsActive: boolean;
	// Release Settings
	private _releaseHex: boolean;
	private _releaseReleaseNote: boolean;
	// 
	private _webViewHtmlHeader?: string;
	private _webViewHtmlCommonInfo?: string;
	private _webViewHtmlProjQuickView?: string;
	private _webViewHtmlProjFileInfo?: string;

	private static getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
		return {
			// Enable javascript in the webview
			enableScripts: true,
			// And restrict the webview to only loading content from our extension's `media` directory.
			localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
		};
	}
	public static createOrShow(context: vscode.ExtensionContext) {
		const extensionUri = context.extensionUri;
		// 
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;
		// すでにパネルを作成済みなら表示
		if (CSPBuilderPanel.currentPanel) {
			CSPBuilderPanel.currentPanel._panel.reveal(column);
			return;
		}
		//
		const panel = vscode.window.createWebviewPanel(
			CSPBuilderPanel.viewType,
			"CS+ Builder",
			column || vscode.ViewColumn.One,
			CSPBuilderPanel.getWebviewOptions(extensionUri),
		);
		CSPBuilderPanel.currentPanel = new CSPBuilderPanel(panel, context);
	}
	public static revive(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
		CSPBuilderPanel.currentPanel = new CSPBuilderPanel(panel, context);
	}

	constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
		const extensionUri = context.extensionUri;
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._wsInfo = [];
		this._taskIsActive = false;
		this._releaseHex = true;
		this._releaseReleaseNote = true;
		this._outputChannel = vscode.window.createOutputChannel("CS+Builder");
		this._outputChannel.show();
		// WebView Init
		this._init();
		// Dispose
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		// View Changed
		this._panel.onDidChangeViewState(
			e => {
				if (this._panel.visible) {
					this._update();
				}
			},
			null,
			context.subscriptions
		);
		// PostMessage: WebView => Extension
		this._panel.webview.onDidReceiveMessage(
			(message) => {
				switch (message.command) {
					case 'onClickCheckBuidModeTgt':
						this._onClickCheckBuidModeTgt(message.prjId, message.buildModeId, message.state);
						break;
					case 'onClickCheckReleaseTgt':
						this._onClickCheckReleaseTgt(message.prjId, message.id, message.state);
						break;
					case 'onClickButtonBuild':
						this._onClickButtonBuild(message.prjId, message.buildModeId);
						break;
					case 'onClickButtonReBuild':
						this._onClickButtonReBuild(message.prjId, message.buildModeId);
						break;
					case 'onClickButtonCfgGen':
						this._onClickButtonCfgGen(message.prjId, message.buildModeId);
						break;
					case 'onClickButtonTool':
						this._onClickButtonTool(message.prjId, message.buildModeId);
						break;
					case 'onClickButtonRelease':
						this._onClickButtonRelease(true);
						break;
					case 'onClickButtonReleaseNoBuild':
						this._onClickButtonRelease(false);
						break;
					case 'onInputCommon':
						this._onInputCommon(message.type, message.value);
						break;
					default:
						vscode.window.showInformationMessage('Unknown event fired..');
						break;
				}
			},
			this,
			context.subscriptions
		);
		// Security
		this._nonce = getNonce();
	}


	public dispose() {
		CSPBuilderPanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}


	private _onClickCheckBuidModeTgt(prjId: number, buildModeId: number, state: boolean) {
		// BuildModeInfo取得
		const buildModeInfo = this._wsInfo[0].projInfos[prjId].buildModeInfos[buildModeId];
		// 有効無効切り替え
		buildModeInfo.buildTgt = state;
	}

	private _onClickCheckReleaseTgt(prjId: number, id: string, state: boolean) {
		// Release生成物対象設定
		switch (id) {
			case 'release-tgt-checkbox-hex':
				this._releaseHex = state;
				break;
			case 'release-tgt-checkbox-releasenote':
				this._releaseReleaseNote = state;
				break;
		}
	}

	private async _onClickButtonBuild(prjId: number, buildModeId: number) {
		// ビルドタスクは1つだけ許可する
		if (this._taskIsActive) {
			vscode.window.showInformationMessage('Now Building!');
		} else {
			this._taskIsActive = true;
			await this._build(prjId, buildModeId);
			this._taskIsActive = false;
		}
	}

	private async _onClickButtonReBuild(prjId: number, buildModeId: number) {
		// ビルドタスクは1つだけ許可する
		if (this._taskIsActive) {
			vscode.window.showInformationMessage('Now Building!');
		} else {
			this._taskIsActive = true;
			await this._rebuild(prjId, buildModeId);
			this._taskIsActive = false;
		}
	}

	private async _onClickButtonCfgGen(prjId: number, buildModeId: number) {
		// ビルドタスクは1つだけ許可する
		if (this._taskIsActive) {
			vscode.window.showInformationMessage('Now Building!');
		} else {
			this._taskIsActive = true;
			await this._cfgGen(prjId, buildModeId);
			this._taskIsActive = false;
		}
	}

	private async _onClickButtonTool(prjId: number, buildModeId: number) {
		await this._tool(prjId, buildModeId);
	}

	private async _onClickButtonRelease(enableRebuild: boolean) {
		// ビルドタスクは1つだけ許可する
		if (this._taskIsActive) {
			//vscode.window.setStatusBarMessage('Now Building!', 5000);
			vscode.window.showInformationMessage('Now Building!');
			return;
		}
		// 
		const wsInfo = this._wsInfo[0];
		if (!wsInfo.enableRelease) {
			vscode.window.showInformationMessage('Release Setting failed!');
			return;
		}
		// 処理実行
		this._taskIsActive = true;
		// プロジェクトファイルを全部チェック
		const prjInfos = wsInfo.projInfos;
		for (let prjId = 0; prjId < prjInfos.length; prjId++) {
			const prjInfo = prjInfos[prjId];
			// BuildModeを全部チェック
			for (let buildModeId = 0; buildModeId < prjInfo.buildModeInfos.length; buildModeId++) {
				const buildModeInfo = prjInfo.buildModeInfos[buildModeId];
				if (buildModeInfo.buildTgt) {
					// ターゲット設定されているビルドモードに対して実行
					if (enableRebuild) {
						// リビルドが必要であれば実行
						await this._rebuild(prjId, buildModeId);
					} else {
						// リビルド不要のとき
						// ビルドファイルが無いときはビルドをかける
						if (!buildModeInfo.enableOutputFile) {
							await prjInfo.build(buildModeId, this._outputChannel);
							this._updateHtmlBuildStatus(prjId, buildModeId);
							//this._update();
						}
					}
				}
			}
		}
		// リリース処理実施
		await this._release();
		this._taskIsActive = false;
	}

	/** プロジェクト共通情報inputハンドラ
	 * 
	 * @param type 
	 * @param value 
	 */
	private _onInputCommon(type: string, value: string) {
		// workspace取得
		const wsInfo = this._wsInfo[0];
		//
		switch (type) {
			case 'release_tag':
				wsInfo.update(value);
				this._updateHtmlCommonInfo();
				for (let prjId = 0; prjId < wsInfo.projInfos.length; prjId++) {
					for (let buildModeId = 0; buildModeId < wsInfo.projInfos[prjId].buildModeInfos.length; buildModeId++) {
						this._updateHtmlQuickView(prjId, buildModeId);
					}
				}
				break;
		}
	}



	private async _build(prjId: number, buildModeId: number) {
		this._outputChannel.show();
		// BuildModeInfo取得
		const prjInfo = this._wsInfo[0].projInfos[prjId];
		// ビルドタスク実行
		try {
			await prjInfo.build(buildModeId, this._outputChannel);
			this._updateHtmlBuildStatus(prjId, buildModeId);
			//this._update();
		} catch (e) {
			// 異常時
			this._outputChannel.appendLine("Build task terminated: " + e);
		} finally {
			// nothing
		}
	}

	private async _rebuild(prjId: number, buildModeId: number) {
		this._outputChannel.show();
		// BuildModeInfo取得
		const prjInfo = this._wsInfo[0].projInfos[prjId];
		// ビルドタスク実行
		try {
			await prjInfo.rebuild(buildModeId, this._outputChannel);
			this._updateHtmlBuildStatus(prjId, buildModeId);
			//this._update();
		} catch (e) {
			// 異常時
			this._outputChannel.appendLine("ReBuild task terminated: " + e);
		} finally {
			// nothing
		}
	}

	private async _cfgGen(prjId: number, buildModeId: number) {
		this._outputChannel.show();
		// BuildModeInfo取得
		const prjInfo = this._wsInfo[0].projInfos[prjId];
		// ビルドタスク実行
		try {
			await prjInfo.cfgGen(buildModeId, this._outputChannel);
			this._updateHtmlBuildStatus(prjId, buildModeId);
			//this._update();
		} catch (e) {
			// 異常時
			this._outputChannel.appendLine("CFG gen task terminated: " + e);
		} finally {
			// nothing
		}
	}

	private async _tool(prjId: number, buildModeId: number) {
		this._outputChannel.show();
		// BuildModeInfo取得
		const prjInfo = this._wsInfo[0].projInfos[prjId];
		// タスク実行
		try {
			//await prjInfo.calcChecksum(buildModeId, this._outputChannel);
			this._updateHtmlBuildStatus(prjId, buildModeId);
			//this._update();
		} catch (e) {
			// 異常時
			this._outputChannel.appendLine("Tool task terminated: " + e);
		} finally {
			// nothing
		}
	}

	private async _release() {
		this._outputChannel.show();
		// BuildModeInfo取得
		const wsInfo = this._wsInfo[0];
		// リリース処理を実施
		try {
			// 出力フォルダ作成
			await vscode.workspace.fs.createDirectory(wsInfo.releaseTagDirPath!);
			if (this._releaseHex) {
				// BuildMode毎出力ファイルをコピー
				// プロジェクトファイルを全部チェック
				for (let prjId = 0; prjId < wsInfo.projInfos.length; prjId++) {
					const prjInfo = wsInfo.projInfos[prjId];
					// BuildModeを全部チェック
					for (let buildModeId = 0; buildModeId < prjInfo.buildModeInfos.length; buildModeId++) {
						const buildMode = prjInfo.buildModeInfos[buildModeId];
						// ターゲット設定されているビルドモードに対して実行
						if (buildMode.buildTgt) {
							// Release可能な状態のとき
							if (buildMode.isReleasable()) {
								// hexファイルをリリースフォルダにコピー
								await vscode.workspace.fs.copy(buildMode.hexFilePath!, buildMode.releaseHexFilePath!, { overwrite: true });
							}
						}
					}
				}
			}
			if (this._releaseReleaseNote) {
				// リリースノート作成
				const text = wsInfo.getReleaseNote();
				fs.writeFileSync(wsInfo.releaseNotePath!.fsPath, text);
			}
			{
				const release = new OutputExcel(this._outputChannel);
				const releaseFilePath = vscode.Uri.parse(posix.join(wsInfo.releaseTagDirPathStr, 'test.xlsx'));
				release.run(releaseFilePath.fsPath);
			}
		} catch (e) {
			// 異常時
			this._outputChannel.appendLine("Release task terminated: " + e);
		} finally {
			// nothing
		}
	}


	private async _init() {
		this._panel.title = "CS+ Builder";
		// プロジェクトファイルを取得
		const wsList = await this._getPrjFiles();
		// html生成
		this._panel.webview.html = await this._getHtmlForWebview(wsList);
		// プロジェクトファイル情報を記憶
		this._wsInfo = wsList;
	}

	private async _update() {
		// html生成
		this._panel.webview.html = await this._getHtmlForWebview(this._wsInfo);
	}

	private async _getPrjFiles() {
		let wsList: Array<CSPWorkspaceInfo> = [];
		const rootDirs = vscode.workspace.workspaceFolders;
		if (rootDirs !== undefined) {
			// ディレクトリリスト作成
			for (let i = 0; i < rootDirs.length; i++) {
				const inf = new CSPWorkspaceInfo(rootDirs[i].uri);
				await inf.analyze(this._outputChannel);
				wsList.push(inf);
			}
		} else {
			// OK
		}
		return wsList;
	}

	private async _getHtmlForWebview(wsList: Array<CSPWorkspaceInfo>) {
		let self = this;
		if (wsList.length > 0) {
			return self._getHtmlForWebviewMain(wsList);
		} else {
			return self._getHtmlForWebviewEmpty();
		}
	}

	private _getHtmlForWebviewEmpty(): string {
		//
		const header = this._getHtmlForWebviewHeader();
		//
		return `
		<!DOCTYPE html>
		<html lang="ja">
		${header}
		<body>
			<h1>CS+ Builder</h1>
			<h3>Project Common Info</h3>
			<table>
				<thead>
					<tr>
						<th class="property">Property</th>
						<th class="data">Data</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="property">Empty</td>
						<td class="data">Empty</td>
					</tr>
				</tbody>
			</table>
			<table>
				<thead>
					<tr>
						<th>Project File</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Empty</td>
					</tr>
				</tbody>
			</table>
		</body>
		</html>
		`;
	}

	private _getHtmlForWebviewMain(wsList: Array<CSPWorkspaceInfo>): string {
		const webview = this._panel.webview;
		// Security: html生成毎に作成しなおす
		this._nonce = getNonce();
		// Local path to main script run in the webview
		const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');
		// And the uri we use to load this script in the webview
		const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
		// html部品生成
		const header = this._getHtmlForWebviewHeader();
		const tblCommonInfo = this._getHtmlForWebviewCommonInfo(wsList);
		const tblQuickView = this._getHtmlForWebviewProjQuickView(wsList);
		const tblProjFileInfo = this._getHtmlForWebviewProjFileInfo(wsList);
		// html結合
		return `
		<!DOCTYPE html>
		<html lang="ja">
		${header}
		<body>
			<div class="tooltop_container">
				<div class="title">
					CS+ Builder
				</div>
				<div class="tool">
					<button type="button" class="release-nobuild-button">RELEASE(no build)</button>
					<button type="button" class="release-button">RELEASE</button>
				</div>
			</div>
			${tblCommonInfo}
			${tblQuickView}
			${tblProjFileInfo}

			<script nonce="${this._nonce}" src="${scriptUri}"></script>
		</body>
		</html>
		`;
	}

	private _getHtmlForWebviewHeader(): string {
		const webview = this._panel.webview;

		//if (!this._webViewHtmlHeader) {
			// Local Resource Path
			const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');
			const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);
			// make html header
			this._webViewHtmlHeader = `
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${this._nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${stylesMainUri}" rel="stylesheet" type="text/css">

				<title>CS+ Builder</title>
			</head>
			`;
		//}
		return this._webViewHtmlHeader;
	}

	private _getHtmlForWebviewCommonInfo(wsList: Array<CSPWorkspaceInfo>): string {
		if (!this._webViewHtmlCommonInfo) {
			// 先頭要素のみ使用する
			const wsInfo = wsList[0];
			//
			const prjDir = this._getDispTextVscodeUriData(wsInfo.rootPath);
			// Outputパス情報
			const outputDir = this._getDispTextVscodeUriData(wsInfo.releaseTagDirPath);
			const outputReleaseNoteTitle = this._getDispTextVscodeUriData(wsInfo.releaseNotePath);
			//
			this._webViewHtmlCommonInfo = `
			<h2>Project Common Info</h2>
			<div class="project_common_info_container">
				<div class="project-property">
					<table>
						<thead>
							<tr>
								<th class="property">Property</th>
								<th class="data">Data</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td class="property">Project Dir</td>
								<td class="data">${prjDir}</td>
							</tr>
							<tr>
								<td class="property">Release Tag</td>
								<td class="data">
									<input type="text" class="data-input-common" data-type="release_tag" value="${wsInfo.releaseTag}" />
								</td>
							</tr>
							<tr>
								<td class="property">Release Output Dir</td>
								<td class="data">
									<span class="output-dir" id="output-dir">${outputDir}</span>
								</td>
							</tr>
							<tr>
								<td class="property">ReleaseNote File</td>
								<td class="data">
									<span class="output-release-note-file" id="output-release-note-file" title="${outputReleaseNoteTitle}">${wsInfo.releaseNoteFileName}</span>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
				<div class="release-settings">
					<table class="release-settings">
						<thead>
							<tr>
								<th class="checkbox">Tgt</th>
								<th class="property">Release Item</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td class="checkbox">
									<input type="checkbox" class="release-tgt-checkbox" id="release-tgt-checkbox-hex" checked="checked">
								</td>
								<td class="property">HEX/MOT file</td>
							</tr>
							<tr>
								<td class="checkbox">
									<input type="checkbox" class="release-tgt-checkbox" id="release-tgt-checkbox-releasenote" checked="checked">
								</td>
								<td class="property">Release Note</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
			`;
		}
		return this._webViewHtmlCommonInfo;
	}

	private _getHtmlForWebviewProjQuickView(wsList: Array<CSPWorkspaceInfo>): string {
		// 先頭要素のみ使用する
		const wsInfo = wsList[0];
		// html初期化
		this._webViewHtmlProjQuickView = "";
		// プロジェクトファイル/BuildMode 一覧表を作成
		for (let prjId = 0; prjId < wsInfo.projInfos.length; prjId++) {
			const prjInfo = wsInfo.projInfos[prjId];
			const prjFileName = prjInfo.projFileName;
			// プロジェクトファイルキャプション
			this._webViewHtmlProjQuickView += `<h2 class="prj-quick-view">Project Quick View</h2>`;
			// Table Header生成
			this._webViewHtmlProjQuickView += `<table class="prj-quick-view">`;
			this._webViewHtmlProjQuickView += `
				<thead>
					<tr>
						<th class="checkbox">Tgt</th>
						<th class="proj-file">ProjFile</th>
						<th class="build-mode">BuildMode</th>
						<th class="output-hex-file">Release Files</th>
					</tr>
				</thead>`;
			this._webViewHtmlProjQuickView += `<tbody>`;
			// html生成
			if (prjInfo.buildModeInfos.length > 0) {
				for (let buildModeId = 0; buildModeId < prjInfo.buildModeInfos.length; buildModeId++) {
					const buildMode = prjInfo.buildModeInfos[buildModeId];
					const buildId = prjId + "_" + buildModeId;
					// 設定取得
					// check設定
					let checked = 'checked="checked"';
					if (buildMode.buildTgt === false) {
						checked = '';
					}
					// ProjFile
					let prjFile = "";
					if (buildModeId === 0) {
						prjFile = prjFileName;
					}
					// Outputパス情報
					const outputHexTitle = this._getDispTextVscodeUriData(buildMode.releaseHexFilePath);
					// html
					this._webViewHtmlProjQuickView += `
						<tr>
							<td class="checkbox">
								<input type="checkbox" class="build-tgt-checkbox" id="build-tgt-checkbox_quickview_${buildId}" data-prj_id="${prjId}" data-buildmode_id="${buildModeId}" ${checked}>
							</td>
							<td class="proj-file">
								${prjFile}
							</td>
							<td class="build-mode"><a href="#BuildMode_${buildModeId}">${buildMode.buildMode}</a></td>
							<td class="output-hex-file" id="output-hex-file_${buildId}" title="${outputHexTitle}">${buildMode.releaseHexFileName}</td>
						</tr>
					`;
				}
			}
			this._webViewHtmlProjQuickView += `</tbody>`;
			this._webViewHtmlProjQuickView += `</table>`;
		}
		return this._webViewHtmlProjQuickView;
	}

	private _getHtmlForWebviewProjFileInfo(wsList: Array<CSPWorkspaceInfo>): string {
		//if (!this._webViewHtmlProjFileInfo) {
			// 先頭要素のみ使用する
			const wsInfo = wsList[0];
			// html初期化
			this._webViewHtmlProjFileInfo = `
				<h2>Project Files Detail Info</h2>
			`;
			// プロジェクトファイル毎にhtml作成
			for (let prjId = 0; prjId < wsInfo.projInfos.length; prjId++) {
				const prjInfo = wsInfo.projInfos[prjId];
				const prjFileName = prjInfo.projFileName;
				// プロジェクトファイルの情報整理
				let romArea = "<no setting>";
				if (prjInfo.micomDeviceInfo) {
					romArea = toHex(prjInfo.micomDeviceInfo.romAreaBegin, 8) + ":" + toHex(prjInfo.micomDeviceInfo.romAreaEnd, 8);
				}
				// プロジェクトファイルキャプション
				this._webViewHtmlProjFileInfo += `<h3 class="prj-file">${prjFileName}</h3>`;
				// BuildMode毎のhtml生成
				if (prjInfo.buildModeInfos.length > 0) {
					for (let buildModeId = 0; buildModeId < prjInfo.buildModeInfos.length; buildModeId++) {
						const buildMode = prjInfo.buildModeInfos[buildModeId];
						const buildId = prjId + "_" + buildModeId;
						// check設定
						let checked = 'checked="checked"';
						if (buildMode.buildTgt === false) {
							checked = '';
						}
						// 表示データ作成
						let buildStatus: string;
						if (buildMode.buildStatus !== undefined) {
							switch (buildMode.buildStatus) {
								case "Success":
									buildStatus = '<span class="BuildSuccess">Success</span>';
									break;
								case "Failed":
									buildStatus = '<span class="BuildFailed">Failed</span>';
									break;
								default:
									buildStatus = `<span>${buildMode.buildStatus}</span>`;
									break;
							}
						} else {
							buildStatus = '<span>未ビルド</span>';
						}
						let buildDate = this._getDispTextStringData(buildMode.buildDate);
						let ramSize = this._getDispTextByteData(buildMode.ramSize);
						let romSize = this._getDispTextByteData(buildMode.romSize);
						let programSize = this._getDispTextByteData(buildMode.programSize);
						let errorCount = this._getDispTextCountData(buildMode.errorCount);
						let warningCount = this._getDispTextCountData(buildMode.warningCount);
						// Build Property
						let hexFile: string;
						let mapFile: string;
						if (buildMode.enableOutputFile) {
							hexFile = this._getDispTextVscodeUriData(buildMode.hexFilePath);
							mapFile = this._getDispTextVscodeUriData(buildMode.mapFilePath);
						} else {
							hexFile = `-`;
							mapFile = `-`;
						}
						// RTOS情報
						let cfgInfo: string = "";
						let cfgButton: string = "";
						if (buildMode.hasRtosInfo) {
							cfgInfo = `
								<tr>
									<td class="property">cfg file</td>
									<td class="data">${buildMode.cfgFilePath!.fsPath}</td>
								</tr>
							`;
							cfgButton = `
								<button type="button" class="cfg-gen-button" data-prj_id="${prjId}" data-buildmode_id="${buildModeId}">CFG GEN</button>
							`;
						}
						// html生成
						this._webViewHtmlProjFileInfo += `
						<div class="build_mode_container" id="BuildMode_${buildModeId}">
							<div class="build-tgt">
								<input type="checkbox" class="build-tgt-checkbox" id="build-tgt-checkbox_detail_${buildId}" data-prj_id="${prjId}" data-buildmode_id="${buildModeId}" ${checked}>
							</div>
							<div class="build-status">
								<table class="build-status">
									<thead>
										<tr>
											<th class="property">Build</th>
											<th class="data">Status</th>
										</tr>
									</thead>
									<tbody>
										<tr>
											<td class="property">Result</td>
											<td class="data"><span class="BuildStatus" id="BuildStatus_Result_${buildId}">
												${buildStatus}
											</span></td>
										</tr>
										<tr>
											<td class="property">Date</td>
											<td class="data"><span class="Date" id="BuildStatus_Date_${buildId}">
												${buildDate}
											</span></td>
										</tr>
										<tr>
											<td class="property">RAM size</td>
											<td class="data"><span class="RamSize" id="BuildStatus_RamSize_${buildId}">
												${ramSize}
											</span></td>
										</tr>
										<tr>
											<td class="property">ROM size</td>
											<td class="data"><span class="RomSize" id="BuildStatus_RomSize_${buildId}">
												${romSize}
											</span></td>
										</tr>
										<tr>
											<td class="property">PROGRAM size</td>
											<td class="data"><span class="ProgramSize" id="BuildStatus_ProgramSize_${buildId}">
												${programSize}
											</span></td>
										</tr>
										<tr>
											<td class="property">Error Count</td>
											<td class="data"><span class="ErrorCount" id="BuildStatus_ErrorCount_${buildId}">
												${errorCount}
											</span></td>
										</tr>
										<tr>
											<td class="property">Warning Count</td>
											<td class="data"><span class="WarningCount" id="BuildStatus_WarningCount_${buildId}">
												${warningCount}
											</span></td>
										</tr>
									</tbody>
								</table>
							</div>
							<div class="build-info">
								<table>
									<thead>
										<tr>
											<th class="property">Property</th>
											<th class="data">Data</th>
										</tr>
									</thead>
									<tbody>
										<tr>
											<td class="property">BuildMode</td>
											<td class="data">${buildMode.buildMode}</td>
										</tr>
										<tr>
											<td class="property">ROM Area</td>
											<td class="data">${romArea}</td>
										</tr>
										<tr>
											<td class="property">hex/mot file</td>
											<td class="data">${hexFile}</td>
										</tr>
										<tr>
											<td class="property">map file</td>
											<td class="data">${mapFile}</td>
										</tr>
										${cfgInfo}
									</tbody>
								</table>
							</div>
							<div class="build-ope">
								<button type="button" class="build-button" data-prj_id="${prjId}" data-buildmode_id="${buildModeId}">Build</button>
								<button type="button" class="rebuild-button" data-prj_id="${prjId}" data-buildmode_id="${buildModeId}">ReBuild</button>
								${cfgButton}
								<button type="button" class="tool-button" data-prj_id="${prjId}" data-buildmode_id="${buildModeId}">Tool</button>
							</div>
						</div>
						`;
					}
				} else {
					// BuildModeが無いとき
					this._webViewHtmlProjFileInfo += `
						<p>BuildMode Info not found!</p>
					`;
				}
			}
		//}
		return this._webViewHtmlProjFileInfo;
	}

	private _getDispTextStringData(data: string | undefined): string {
		let text: string;
		if (data === undefined) {
			text = "-";
		} else {
			text = data;
		}
		return text;
	}

	private _getDispTextCountData(data: number | undefined): string {
		let text: string;
		if (data === undefined) {
			text = "-";
		} else {
			text = `${data}`;
		}
		return text;
	}

	private _getDispTextByteData(data: number | undefined): string {
		let text: string;
		if (data === undefined) {
			text = "-";
		} else {
			text = `${data} bytes`;
		}
		return text;
	}

	private _getDispTextVscodeUriData(data: vscode.Uri | undefined): string {
		let text: string;
		if (data === undefined) {
			text = "-";
		} else {
			text = `${data.fsPath}`;
		}
		return text;
	}

	private _updateHtmlBuildStatus(prjId: number, buildModeId: number) {
		const buildInfo = this._wsInfo[0].projInfos[prjId].buildModeInfos[buildModeId];
		this._postMsgForWebView({
			command: "BuildStatus",
			projectId: prjId,
			buildModeId: buildModeId,
			buildStatus: buildInfo.buildStatus,
			ramSize: this._getDispTextByteData(buildInfo.ramSize),
			romSize: this._getDispTextByteData(buildInfo.romSize),
			programSize: this._getDispTextByteData(buildInfo.programSize),
			errorCount: this._getDispTextCountData(buildInfo.errorCount),
			warningCount: this._getDispTextCountData(buildInfo.warningCount),
			buildDate: buildInfo.buildDate
		});
	}
	
	private _updateHtmlCommonInfo() {
		const wsInfo = this._wsInfo[0];
		this._postMsgForWebView({
			command: "CommonInfo",
			outputDir: this._getDispTextVscodeUriData(wsInfo.releaseTagDirPath),
			outputReleaseNoteFile: wsInfo.releaseNoteFileName,
			outputReleaseNoteTitle: this._getDispTextVscodeUriData(wsInfo.releaseNotePath)
		});
	}

	private _updateHtmlQuickView(prjId: number, buildModeId: number) {
		const wsInfo = this._wsInfo[0];
		const buildInfo = wsInfo.projInfos[prjId].buildModeInfos[buildModeId];
		this._postMsgForWebView({
			command: "QuickView",
			projectId: prjId,
			buildModeId: buildModeId,
			outputHexFile: buildInfo.releaseHexFileName,
			outputHexTitle: this._getDispTextVscodeUriData(buildInfo.releaseHexFilePath)
		});
	}

	private _postMsgForWebView(message: any) {
		this._panel.webview.postMessage(message);
	}

}

class CSPWorkspaceInfo {
	// プロジェクトファイル情報リスト(複数ファイルを想定)
	public projInfos: Array<MtpjInfo>;
	public projDirPath?: vscode.Uri;
	// プロジェクト共通情報
	public releaseDirName: string;
	public releaseTag: string;
	public releaseNoteName: string;
	// RELEASEアウトプットパス
	public releaseDirPathStr: string;			// 
	public releaseDirPath?: vscode.Uri;			// release共通ディレクトリパス: projDir/release
	public releaseTagDirPathStr: string;		//
	public releaseTagDirPath?: vscode.Uri;		// Tag付けディレクトリパス: <releaseDirPath>/<ReleaseTag>
	// RELEASEアウトプットパス(表示用相対パス文字列)
	public releaseDirPathDisp?: string;
	public releaseTagDirPathDisp?: string;
	// ReleaseNoteパス
	public releaseNoteFileName: string;
	public releaseNotePathStr: string;
	public releaseNotePath?: vscode.Uri;
	// RELEASE初期化済みフラグ
	public enableRelease: boolean;

	constructor(public rootPath: vscode.Uri) {
		this.projInfos = [];
		this.releaseDirName = "release";
		this.releaseTag = "vXXXX";
		this.releaseNoteName = config.releaseNoteName;
		this.releaseNoteFileName = `${this.releaseNoteName}_${this.releaseTag}.txt`;
		this.releaseDirPathStr = "";
		this.releaseTagDirPathStr = "";
		this.releaseNotePathStr = "";
		this.enableRelease = false;
	}

	public async analyze(outputChannel: vscode.OutputChannel) {
		// ProjectID
		let projId: number = 0;
		// ディレクトリ探索
		for (const [name, type] of await vscode.workspace.fs.readDirectory(this.rootPath)) {
			// rootディレクトリ内のファイルだけチェック
			if (type === vscode.FileType.File) {
				// プロジェクトファイル(.mtpj)を取得
				const ext = posix.extname(name);
				if (ext === '.mtpj') {
					const fileUri = vscode.Uri.parse(posix.join(this.rootPath.path, name));
					const inf = new MtpjInfo(projId, fileUri);
					await inf.analyze(outputChannel);
					inf.initReleaseInfo(this.releaseDirName, this.releaseTag);
					this.projInfos.push(inf);
				}
			}
		}
		// Release情報初期化
		this.initReleaseInfo();
	}

	public initReleaseInfo() {
		// Workspace共通情報を設定
		// Releaseファイル収集先フォルダ
		const baseDir = this.rootPath.path;
		const releaseDir = posix.join(baseDir, this.releaseDirName);
		this.releaseDirPathStr = releaseDir;
		this.releaseDirPath = vscode.Uri.parse(releaseDir);
		this.releaseDirPathDisp = `/${this.releaseDirName}`;
		// 
		this.setReleaseInfo();
		//
		for (const wsinfo of this.projInfos) {
			wsinfo.initReleaseInfo(this.releaseTagDirPathStr, this.releaseTag);
		}
		//
		this.enableRelease = true;
	}

	public setReleaseInfo() {
		// リリースフォルダパス作成
		const releaseTagDir = posix.join(this.releaseDirPathStr, this.releaseTag);
		this.releaseTagDirPathStr = releaseTagDir;
		this.releaseTagDirPath = vscode.Uri.parse(releaseTagDir);
		this.releaseTagDirPathDisp = `/${this.releaseDirName}/${this.releaseTag}`;
		// リリースノートパス作成
		this.releaseNoteFileName = `${this.releaseNoteName}_${this.releaseTag}.txt`;
		this.releaseNotePathStr = posix.join(releaseTagDir, this.releaseNoteFileName);
		this.releaseNotePath = vscode.Uri.parse(this.releaseNotePathStr);
	}

	public update(releaseTag: string) {
		this.releaseTag = releaseTag;
		// プロジェクト共通情報更新
		this.setReleaseInfo();
		// プロジェクトファイル情報更新
		for (const inf of this.projInfos) {
			inf.setReleaseInfo(this.releaseTagDirPathStr, releaseTag);
		}
	}

	public getReleaseNote(): string {
		let releaseFiles = "";

		// プロジェクトファイルを全部チェック
		for (let prjId = 0; prjId < this.projInfos.length; prjId++) {
			const prjInfo = this.projInfos[prjId];
			// BuildModeを全部チェック
			for (let buildModeId = 0; buildModeId < prjInfo.buildModeInfos.length; buildModeId++) {
				const buildMode = prjInfo.buildModeInfos[buildModeId];
				// ターゲット設定されているビルドモードに対して実行
				if (buildMode.buildTgt) {
					// Release可能な状態のとき
					if (buildMode.isReleasable()) {
						// hexファイルをリリースフォルダにコピー
						if (releaseFiles === "") {
							releaseFiles = buildMode.releaseHexFileName;
						} else {
							releaseFiles = `${releaseFiles}\r\n${buildMode.releaseHexFileName}`;
						}
					}
				}
			}
		}
	
		// ReleaseNote作成
		let text = `# ReleaseNote

## FileName
${releaseFiles}

## Version


`;

		// 文字列fix
		text = text.replace(/\n/g, "\r\n");
		return text;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function toHex(value:number, len:number): string {
	return ("0000000000000000" + value.toString(16).toUpperCase()).slice(-len);
}
