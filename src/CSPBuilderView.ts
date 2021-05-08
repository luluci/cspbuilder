import { posix } from 'path';
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as xml2js from 'xml2js';
import * as iconv from 'iconv-lite';

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
		this._update();
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
			this._disposables
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
		// BuildModeInfo取得
		const prjInfo = this._wsInfo[0].projInfos[prjId];
		// ビルドタスク実行
		try {
			await prjInfo.build(buildModeId, this._outputChannel);
			this._updateHtmlBuildFinish(prjId, buildModeId);
		} catch (e) {
			// 異常時
			this._outputChannel.appendLine("Build task terminated: " + e);
		} finally {
			// nothing
		}
	}

	private async _rebuild(prjId: number, buildModeId: number) {
		// BuildModeInfo取得
		const prjInfo = this._wsInfo[0].projInfos[prjId];
		// ビルドタスク実行
		try {
			await prjInfo.rebuild(buildModeId, this._outputChannel);
			this._updateHtmlBuildFinish(prjId, buildModeId);
		} catch (e) {
			// 異常時
			this._outputChannel.appendLine("ReBuild task terminated: " + e);
		} finally {
			// nothing
		}
	}

	private async _release(prjId: number, buildModeId: number) {
		// BuildModeInfo取得
		const prjInfo = this._wsInfo[0].projInfos[prjId];
		// ビルドタスク実行
		try {
			await prjInfo.rebuild(buildModeId, this._outputChannel);
			this._updateHtmlBuildFinish(prjId, buildModeId);
		} catch (e) {
			// 異常時
			this._outputChannel.appendLine("Build task terminated: " + e);
		} finally {
			// nothing
		}
	}


	private async _update() {
		this._panel.title = "CS+ Builder";
		// プロジェクトファイルを取得
		const wsList = await this._getPrjFiles();
		// html生成
		this._panel.webview.html = await this._getHtmlForWebview(wsList);
		// プロジェクトファイル情報を記憶
		this._wsInfo = wsList;
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

		if (!this._webViewHtmlHeader) {
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
		}
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
		if (!this._webViewHtmlProjFileInfo) {
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
												<span>${buildMode.buildStatus}</span>
											</span></td>
										</tr>
										<tr>
											<td class="property">RAM size</td>
											<td class="data"><span class="RamSize" id="BuildStatus_RamSize_${buildId}">
												-
											</span></td>
										</tr>
										<tr>
											<td class="property">ROM size</td>
											<td class="data"><span class="RomSize" id="BuildStatus_RomSize_${buildId}">
												-
											</span></td>
										</tr>
										<tr>
											<td class="property">PROGRAM size</td>
											<td class="data"><span class="ProgramSize" id="BuildStatus_ProgramSize_${buildId}">
												-
											</span></td>
										</tr>
										<tr>
											<td class="property">Error Count</td>
											<td class="data"><span class="ErrorCount" id="BuildStatus_ErrorCount_${buildId}">
												-
											</span></td>
										</tr>
										<tr>
											<td class="property">Warning Count</td>
											<td class="data"><span class="WarningCount" id="BuildStatus_WarningCount_${buildId}">
												-
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
											<td class="property">情報1</td>
											<td class="data">1</td>
										</tr>
										<tr>
											<td class="property">情報2</td>
											<td class="data">2</td>
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
		}
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
	public projInfos: Array<ProjInfo>;
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
					const inf = new ProjInfo(projId, fileUri);
					await inf.analyze(outputChannel);
					this.projInfos.push(inf);
				}
			}
		}
	}
}

class ProjInfo {
	public projFileName: string;
	public rcpeFilePath: vscode.Uri;
	public enable: boolean;
	public buildModeInfos: Array<BuildModeInfo>;
	// プロジェクト情報
	private _projectName: string;
	public micomSeries: string;
	public micomDevice: string;
	public micomDeviceInfo?: DeviceInfo;

	constructor(public id: number, public projFilePath: vscode.Uri) {
		this.projFileName = posix.basename(projFilePath.path);
		const dir = posix.dirname(projFilePath.path);
		const file = posix.basename(projFilePath.path, ".mtpj") + ".rcpe";
		const rcpeFile = posix.join(dir, file);
		this.rcpeFilePath = vscode.Uri.parse(rcpeFile);
		this.buildModeInfos = [];
		this.enable = true;
		this._projectName = "";
		this.micomSeries = "";
		this.micomDevice = "";
	}

	public async analyze(outputChannel: vscode.OutputChannel) {
		//await this._checkRcpeFile(outputChannel);
		//await this._loadRcpeFile();
		await this._loadProjectFile();
	}

	public building(buildModeId: number = -1): boolean {
		if (buildModeId === -1) {
			let result = true;
			for (let buildMode of this.buildModeInfos) {
				if (buildMode.building) {
					result = false;
					break;
				}
			}
			return result;
		} else {
			const buildMode = this.buildModeInfos[buildModeId];
			return buildMode.building;
		}
	}

	public async build(buildModeId: number, outputChannel:vscode.OutputChannel) {
		if (this.enable) {
			this.buildModeInfos[buildModeId].building = true;
			await this._build(buildModeId, "/bb", outputChannel);
		} else {
			throw new Error("This Project is disabled!");
		}
	}

	public async rebuild(buildModeId: number, outputChannel: vscode.OutputChannel) {
		if (this.enable) {
			this.buildModeInfos[buildModeId].building = true;
			await this._build(buildModeId, "/br", outputChannel);
		} else {
			throw new Error("This Project is disabled!");
		}
	}

	private _build(buildModeId: number, buildOpt: string, outputChannel: vscode.OutputChannel): Promise<void> {
		return new Promise((resolve) => {
			const buildModeInfo = this.buildModeInfos[buildModeId];
			const cspExePath = config.cspExePath.replace(/\\/g, "\\\\");
			const prjFilePath = this.projFilePath.fsPath.replace(/\\/g, "\\\\");
			const cmmand = `"${cspExePath}" ${buildOpt} "${buildModeInfo.buildMode}" "${prjFilePath}"`;
			//
			buildModeInfo.buildStart();
			outputChannel.appendLine("Build Start: " + cmmand);
			//
			const proc = child_process.spawn(cspExePath, [buildOpt, buildModeInfo.buildMode, prjFilePath]);
			proc.stdout.on("data", (log) => {
				const msg = iconv.decode(log, "sjis");
				buildModeInfo.analyzeBuildMsg(msg);
				outputChannel.append(msg);
			});
			proc.stderr.on("data", (log) => {
				const msg = iconv.decode(log, "sjis");
				buildModeInfo.analyzeBuildMsg(msg);
				outputChannel.append(msg);
			});
			// 途中終了:exit
			/*
			proc.on("exit", (code) => {
				outputChannel.appendLine("");
				outputChannel.appendLine("Build Treminated?");
			});
			*/
			// 終了イベント
			proc.on("close", (exitCode) => {
				if (exitCode === 0) {
					outputChannel.appendLine("");
					outputChannel.appendLine("Build Success!");
				} else {
					outputChannel.appendLine("");
					outputChannel.appendLine("Build Failed!");
				}
				resolve();
				buildModeInfo.building = false;
			});
		});
	}

	private async _loadProjectFile() {
		// mtpjをjson形式に変換
		const xml = await vscode.workspace.openTextDocument(this.projFilePath);
		const json = await xml2js.parseStringPromise(xml.getText());
		// 情報取得
		const classInfos = json.CubeSuiteProject.Class;
		for (let i = 0; i < classInfos.length; i++) {
			const instances = classInfos[i].Instance;
			for (let instanceId = 0; instanceId < instances.length; instanceId++) {
				const instance = instances[instanceId];
				// Device情報
				if ("DeviceName" in instance) {
					this.micomDevice = instance.DeviceName[0];
					this.micomDeviceInfo = config.getRomArea(this.micomDevice);
				}
				// BuildMode情報
				if ("BuildModeCount" in instance) {
					// BuildModeCount取得
					// 数字であるはずなので、parseに失敗する場合はプロジェクトファイルに合わせてロジックの見直しが必要
					const buildModeCount = parseInt(instance.BuildModeCount[0]);
					if (isNaN(buildModeCount)) {
						this.enable = false;
						throw new Error("mtpj format is invalid!");
					}
					// BuildMode情報取得
					for (let buildModeId = 0; buildModeId < buildModeCount; buildModeId++) {
						const buildModeTag = `BuildMode${buildModeId}`;
						if (buildModeTag in instance) {
							const buildModeStr = instance[buildModeTag][0];
							const buildMode = Buffer.from(buildModeStr, 'base64').toString('utf16le');
							const buildModeInfo = new BuildModeInfo(this.id, buildModeId, buildMode);
							buildModeInfo.projectName = this._projectName;
							// BuildModeInfo登録
							this.buildModeInfos.push(buildModeInfo);
						}
					}
				}
			}
		}
	}
}

class BuildModeInfo {
	public enable: boolean;
	public building: boolean;
	public projectName: string;
	public absFile: string;
	public hexFile: string;
	// ビルド情報
	public buildStatus: string;
	public ramSize: number;
	public romSize: number;
	public programSize: number;
	public errorCount: number;
	public warningCount: number;
	public successCount: number;
	public failedCount: number;
	public buildDate: string;
	// Buildログ解析正規表現
	static reBuildMsgRamDataSection = /RAMDATA SECTION:\s+([0-9a-fA-F]+)\s+Byte/;
	static reBuildMsgRomDataSection = /ROMDATA SECTION:\s+([0-9a-fA-F]+)\s+Byte/;
	static reBuildMsgProgramSection = /PROGRAM SECTION:\s+([0-9a-fA-F]+)\s+Byte/;
	static reBuildMsgBuildFinish1 = /ビルド終了\(エラー:([0-9]+)個, 警告:([0-9]+)個\)/;
	static reBuildMsgBuildFinish2 = /終了しました\(成功:([0-9]+)プロジェクト, 失敗:([0-9]+)プロジェクト\)\(([^\)]+)\)/;

	constructor(public projId: number, public buildModeId: number, public buildMode: string) {
		this.enable = true;
		this.building = false;
		this.projectName = "";
		this.absFile = "";
		this.hexFile = "";
		//
		this.buildStatus = "<未ビルド>";
		this.ramSize = 0;
		this.romSize = 0;
		this.programSize = 0;
		this.errorCount = 0;
		this.warningCount = 0;
		this.successCount = 0;
		this.failedCount = 0;
		this.buildDate = "";
	}

	public buildStart() {
		// Build開始時に各種情報を初期化する
		this.buildStatus = "<未ビルド>";
	}

	public analyzeBuildMsg(msg: string) {
		// Buildログを受け取って解析する
		let match: RegExpMatchArray | null;
		// RAMサイズ
		if (match = msg.match(BuildModeInfo.reBuildMsgRamDataSection)) {
			this.ramSize = parseInt(match[1], 16);
		}
		// ROMサイズ
		if (match = msg.match(BuildModeInfo.reBuildMsgRomDataSection)) {
			this.romSize = parseInt(match[1], 16);
		}
		// PROGRAMサイズ
		if (match = msg.match(BuildModeInfo.reBuildMsgProgramSection)) {
			this.programSize = parseInt(match[1], 16);
		}
		// error数/warning数
		if (match = msg.match(BuildModeInfo.reBuildMsgBuildFinish1)) {
			this.errorCount = parseInt(match[1]);
			this.warningCount = parseInt(match[2]);
		}
		// PROGRAMサイズ
		if (match = msg.match(BuildModeInfo.reBuildMsgBuildFinish2)) {
			this.successCount = parseInt(match[1]);
			this.failedCount = parseInt(match[2]);
			this.buildDate = match[2];
			// BuildStatus作成
			if (this.successCount !== 0 && this.failedCount === 0) {
				this.buildStatus = "Success";
			} else {
				this.buildStatus = "Failed";
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

class DeviceInfo {
	public romAreaBegin: number;
	public romAreaEnd: number;

	constructor() {
		this.romAreaBegin = 0;
		this.romAreaEnd = 0;
	}
}

class Configuration {
	
	public cspExePath: string;
	public defaultDeactive: Array<string>;
	public romArea: Map<string, DeviceInfo>;

	constructor() {
		// 拡張機能Configuration取得
		const conf = vscode.workspace.getConfiguration('cspBuilder');
		// CS+パス
		this.cspExePath = conf.csplus.path;
		// DefaultDeactive設定
		this.defaultDeactive = this.commaSeqToArray(conf.BuildMode.DefaultDeactive);
		// ROMエリア定義
		this.romArea = new Map<string, DeviceInfo>();
		const confROMArea = conf.Micom.ROMArea;
		for (const key of Reflect.ownKeys(confROMArea)) {
			const valueAsHex = confROMArea[key];
			const [device, area] = key.toString().split(".");
			// valueチェック
			let value = parseInt(valueAsHex, 16);
			if (!isNaN(value)) {
				// valueが無効値の場合はスキップ
				// deviceチェック
				let mapDevice = this.romArea.get(device);
				if (mapDevice === undefined) {
					this.romArea.set(device, new DeviceInfo());
					mapDevice = this.romArea.get(device);
				}
				// areaチェック
				switch (area) {
					case "begin":
						mapDevice!.romAreaBegin = value;
						break;
					case "end":
						mapDevice!.romAreaEnd = value;
						break;
				}
			}
		}
	}

	public getRomArea(device:string): DeviceInfo|undefined {
		let result: DeviceInfo | undefined = undefined;
		// deviceチェック
		let deviceInfo = this.romArea.get(device);
		if (deviceInfo) {
			result = deviceInfo;
		}
		return result;
	}

	private commaSeqToArray(org: string) {
		let result: Array<string> = [];
		let reSep = /(["'])/;
		//
		while (org !== "") {
			// 空白スキップ
			let temp = org.trim();
			// 先頭文字チェック
			let posBegin = 0;
			let posOffset = 0;
			let ch = temp.charAt(posBegin);
			let reMatch = ch.match(reSep);
			let sep = ",";
			if (reMatch) {
				posBegin = 1;
				posOffset = 1;
				sep = reMatch[0];
			}
			// 区切り文字の位置を探す
			let posEnd = temp.indexOf(sep, posBegin);
			if (posEnd === -1) {
				posEnd = temp.length;
			}
			// 先頭データ分割
			let token = temp.slice(posBegin, posEnd).trim();
			result.push(token);
			// 次文字列作成
			org = temp.slice(posEnd + 1 + posOffset);
		}
		return result;
	}
}
const config = new Configuration();
