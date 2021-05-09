import { posix } from 'path';
import * as vscode from 'vscode';
import { DeviceInfo, config } from './config';
import { MtpjInfo } from './CSPProjectInfo';

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
	// 
	private _webViewHtmlHeader?: string;
	private _webViewHtmlCommonInfo?: string;
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
					//this._update();
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
					case 'onClickButtonBuild':
						this._onClickButtonBuild(message.prjId, message.buildModeId);
						break;
					case 'onClickButtonReBuild':
						this._onClickButtonReBuild(message.prjId, message.buildModeId);
						break;
					case 'onClickButtonRelease':
						this._onClickButtonRelease();
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
		buildModeInfo.enable = state;
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

	private async _onClickButtonRelease() {
		// ビルドタスクは1つだけ許可する
		if (this._taskIsActive) {
			//vscode.window.setStatusBarMessage('Now Building!', 5000);
			vscode.window.showInformationMessage('Now Building!');
		} else {
			this._taskIsActive = true;
			// プロジェクトファイルを全部チェック
			const prjInfos = this._wsInfo[0].projInfos;
			for (let prjId = 0; prjId < prjInfos.length; prjId++) {
				const prjInfo = prjInfos[prjId];
				// BuildModeを全部チェック
				for (let buildModeId = 0; buildModeId < prjInfo.buildModeInfos.length; buildModeId++) {
					const buildModeInfo = prjInfo.buildModeInfos[buildModeId];
					if (buildModeInfo.enable) {
						// 有効であればビルド実行
						await this._release(prjId, buildModeId);
					}
				}
			}
			this._taskIsActive = false;
		}
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
			case 'version':
				wsInfo.version(value);
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
			//this._updateHtmlBuildFinish(prjId, buildModeId);
			this._update();
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
			//this._updateHtmlBuildFinish(prjId, buildModeId);
			this._update();
		} catch (e) {
			// 異常時
			this._outputChannel.appendLine("ReBuild task terminated: " + e);
		} finally {
			// nothing
		}
	}

	private async _release(prjId: number, buildModeId: number) {
		this._outputChannel.show();
		// BuildModeInfo取得
		const prjInfo = this._wsInfo[0].projInfos[prjId];
		// ビルドタスク実行
		try {
			await prjInfo.rebuild(buildModeId, this._outputChannel);
			//this._updateHtmlBuildFinish(prjId, buildModeId);
			this._update();
		} catch (e) {
			// 異常時
			this._outputChannel.appendLine("Build task terminated: " + e);
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
					<button type="button" class="release-button">RELEASE</button>
				</div>
			</div>
			<h2>Project Common Info</h2>
			${tblCommonInfo}
			<h2>Project Files Info</h2>
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
			this._webViewHtmlCommonInfo = `
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
						<td class="data">${wsInfo.rootPath.path}</td>
					</tr>
					<tr>
						<td class="property">Version</td>
						<td class="data">
							<input type="text" class="data-input-common" data-type="version" />
						</td>
					</tr>
				</tbody>
			</table>
			`;
		}
		return this._webViewHtmlCommonInfo;
	}

	private _getHtmlForWebviewProjFileInfo(wsList: Array<CSPWorkspaceInfo>): string {
		//if (!this._webViewHtmlProjFileInfo) {
			// 先頭要素のみ使用する
			const wsInfo = wsList[0];
			// html初期化
			this._webViewHtmlProjFileInfo = "";
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
				this._webViewHtmlProjFileInfo += `<h3>${prjFileName}</h3>`;
				// BuildMode毎のhtml生成
				if (prjInfo.buildModeInfos.length > 0) {
					for (let buildModeId = 0; buildModeId < prjInfo.buildModeInfos.length; buildModeId++) {
						const buildMode = prjInfo.buildModeInfos[buildModeId];
						const buildId = prjId + "_" + buildModeId;
						// check設定
						let checked = 'checked="checked"';
						if (config.defaultDeactive.includes(buildMode.buildMode)) {
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
						let buildDate: string;
						if (buildMode.buildDate !== undefined) {
							buildDate = `${buildMode.buildDate}`;
						} else {
							buildDate = `-`;
						}
						let ramSize: string;
						if (buildMode.ramSize !== undefined) {
							ramSize = `${buildMode.ramSize} bytes`;
						} else {
							ramSize = `-`;
						}
						let romSize: string;
						if (buildMode.romSize !== undefined) {
							romSize = `${buildMode.romSize} bytes`;
						} else {
							romSize = `-`;
						}
						let programSize: string;
						if (buildMode.programSize !== undefined) {
							programSize = `${buildMode.programSize} bytes`;
						} else {
							programSize = `-`;
						}
						let errorCount: string;
						if (buildMode.errorCount !== undefined) {
							errorCount = `${buildMode.errorCount}`;
						} else {
							errorCount = `-`;
						}
						let warningCount: string;
						if (buildMode.warningCount !== undefined) {
							warningCount = `${buildMode.warningCount}`;
						} else {
							warningCount = `-`;
						}
						// Build Property
						let hexFile: string;
						if (buildMode.hexFilePath !== undefined) {
							hexFile = buildMode.hexFilePath.fsPath;
						} else {
							hexFile = `-`;
						}
						let mapFile: string;
						if (buildMode.mapFilePath !== undefined) {
							mapFile = buildMode.mapFilePath.fsPath;
						} else {
							mapFile = `-`;
						}
						// html生成
						this._webViewHtmlProjFileInfo += `
						<div class="build_mode_container">
							<div class="build-tgt">
								<input type="checkbox" class="build-tgt-checkbox" data-prj_id="${prjId}" data-buildmode_id="${buildModeId}" ${checked}>
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
									</tbody>
								</table>
							</div>
							<div class="build-ope">
								<button type="button" class="build-button" data-prj_id="${prjId}" data-buildmode_id="${buildModeId}">Build</button>
								<button type="button" class="rebuild-button" data-prj_id="${prjId}" data-buildmode_id="${buildModeId}">ReBuild</button>
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

	private _updateHtmlBuildFinish(prjId: number, buildModeId: number) {
		const buildInfo = this._wsInfo[0].projInfos[prjId].buildModeInfos[buildModeId];
		this._postMsgForWebView({
			command: "BuildFinish",
			projectId: prjId,
			buildModeId: buildModeId,
			buildStatus: buildInfo.buildStatus,
			ramSize: buildInfo.ramSize,
			romSize: buildInfo.romSize,
			programSize: buildInfo.programSize,
			errorCount: buildInfo.errorCount,
			warningCount: buildInfo.warningCount,
			buildDate: buildInfo.buildDate
		});
	}

	private _postMsgForWebView(message: any) {
		this._panel.webview.postMessage(message);
	}

}

class CSPWorkspaceInfo {
	// プロジェクトファイル情報リスト(複数ファイルを想定)
	public projInfos: Array<MtpjInfo>;
	// プロジェクト共通情報
	private _version: string;

	constructor(public rootPath: vscode.Uri) {
		this.projInfos = [];
		this._version = "";
	}

	public version(value: string) {
		// 必要に応じて整形処理を入れる
		this._version = value;
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
					this.projInfos.push(inf);
				}
			}
		}
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
