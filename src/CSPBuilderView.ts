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
		const buildModeInfo = this._wsInfo[0].projInfos[prjId].buildModes[buildModeId];
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
				for (let buildModeId = 0; buildModeId < prjInfo.buildModes.length; buildModeId++) {
					const buildModeInfo = prjInfo.buildModes[buildModeId];
					if (buildModeInfo.enable) {
						// 有効であればビルド実行
						await this._release(prjId, buildModeId);
					}
				}
			}
			this._taskIsActive = false;
		}
	}



	private async _build(prjId: number, buildModeId: number) {
		// BuildModeInfo取得
		const prjInfo = this._wsInfo[0].projInfos[prjId];
		// ビルドタスク実行
		try {
			await prjInfo.build(buildModeId, this._outputChannel);
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
			await prjInfo.build(buildModeId, this._outputChannel);
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
				// プロジェクトファイルキャプション
				this._webViewHtmlProjFileInfo += `<h3>${prjFileName}</h3>`;
				// BuildMode毎のhtml生成
				if (prjInfo.buildModes.length > 0) {
					for (let buildModeId = 0; buildModeId < prjInfo.buildModes.length; buildModeId++) {
						const buildMode = prjInfo.buildModes[buildModeId];
						const buildId = prjId + "_" + buildModeId;
						this._webViewHtmlProjFileInfo += `
						<div class="build_mode_container">
							<div class="left_item">
								<input type="checkbox" class="build-tgt-checkbox" data-prj_id="${prjId}" data-buildmode_id="${buildModeId}" checked="checked">
							</div>
							<div class="main_item">
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
											<td class="data">${buildMode.id}</td>
										</tr>
										<tr>
											<td class="property">ROMRAMサイズ</td>
											<td class="data"></td>
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
							<div class="right_item">
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
						<p>たぶん、rcpeファイルが無いよ！</p>
					`;
				}
			}
		}
		return this._webViewHtmlProjFileInfo;
	}

}

class CSPWorkspaceInfo {
	public projInfos: Array<ProjInfo>;

	constructor(public rootPath: vscode.Uri) {
		this.projInfos = [];
	}

	public async analyze(outputChannel: vscode.OutputChannel) {
		// ディレクトリ探索
		for (const [name, type] of await vscode.workspace.fs.readDirectory(this.rootPath)) {
			// rootディレクトリ内のファイルだけチェック
			if (type === vscode.FileType.File) {
				// プロジェクトファイル(.mtpj)を取得
				const ext = posix.extname(name);
				if (ext === '.mtpj') {
					const fileUri = vscode.Uri.parse(posix.join(this.rootPath.path, name));
					const inf = new ProjInfo(fileUri);
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
	public buildModes: Array<BuildModeInfo>;

	constructor(public projFilePath: vscode.Uri) {
		this.projFileName = posix.basename(projFilePath.path);
		const dir = posix.dirname(projFilePath.path);
		const file = posix.basename(projFilePath.path, ".mtpj") + ".rcpe";
		const rcpeFile = posix.join(dir, file);
		this.rcpeFilePath = vscode.Uri.parse(rcpeFile);
		this.buildModes = [];
		this.enable = false;
	}

	public async analyze(outputChannel: vscode.OutputChannel) {
		await this._checkRcpeFile(outputChannel);
		await this._loadRcpeFile();
	}

	public building(buildModeId: number = -1): boolean {
		if (buildModeId === -1) {
			let result = true;
			for (let buildMode of this.buildModes) {
				if (buildMode.building) {
					result = false;
					break;
				}
			}
			return result;
		} else {
			const buildMode = this.buildModes[buildModeId];
			return buildMode.building;
		}
	}

	public async build(buildModeId: number, outputChannel:vscode.OutputChannel) {
		if (this.enable) {
			this.buildModes[buildModeId].building = true;
			await this._build(buildModeId, "/bb", outputChannel);
		} else {
			throw new Error("This Project is disabled!");
		}
	}

	public async rebuild(buildModeId: number, outputChannel: vscode.OutputChannel) {
		if (this.enable) {
			this.buildModes[buildModeId].building = true;
			await this._build(buildModeId, "/br", outputChannel);
		} else {
			throw new Error("This Project is disabled!");
		}
	}

	private _build(buildModeId: number, buildOpt: string, outputChannel: vscode.OutputChannel): Promise<void> {
		return new Promise((resolve) => {
			const buildMode = this.buildModes[buildModeId];
			const cspExePath = config.cspExePath.replace(/\\/g, "\\\\");
			const prjFilePath = this.projFilePath.fsPath.replace(/\\/g, "\\\\");
			const cmmand = `"${cspExePath}" ${buildOpt} "${buildMode.id}" "${prjFilePath}"`;
			//
			outputChannel.appendLine("Build Start: " + cmmand);
			//
			const proc = child_process.spawn(cspExePath, [buildOpt, buildMode.id, prjFilePath]);
			proc.stdout.on("data", (log) => {
				outputChannel.append(iconv.decode(log, "sjis"));
			});
			proc.stderr.on("data", (log) => {
				outputChannel.append(iconv.decode(log, "sjis"));
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
				buildMode.building = false;
			});
		});
	}

	private async _loadRcpeFile() {
		if (this.enable) {
			// rcpeをjson形式に変換
			const xml = await vscode.workspace.openTextDocument(this.rcpeFilePath);
			const json = await xml2js.parseStringPromise(xml.getText());
			// Project情報
			const projectName = json.MicomToolCommonProjectFile.Project[0].$["Name"];
			// BuildModeをすべてチェック
			const jsonBuildOpt = json.MicomToolCommonProjectFile.Project[0].BuildOptions[0];
			for (let i = 0; i < jsonBuildOpt.BuildMode.length; i++) {
				// BuildModeInfo作成
				const jsonBuildMode = jsonBuildOpt.BuildMode[i];
				const buildModeName = jsonBuildMode.$["Name"];
				const buildModeInfo = new BuildModeInfo(buildModeName);
				buildModeInfo.projectName = projectName;
				this._analyzeJsonLinkOptions(buildModeInfo, jsonBuildMode.LinkOptions[0]);
				// BuildModeInfo登録
				this.buildModes.push(buildModeInfo);
			}
		}
	}

	private _analyzeJsonLinkOptions(buildModeInfo: BuildModeInfo, jsonLinkOptions: any) {
		// LinkOptionsを解析して情報を抽出する
		for (let i = 0; i < jsonLinkOptions.Option.length; i++) {
			const option: string = jsonLinkOptions.Option[i];
			let match: RegExpMatchArray | null;
			// absファイル
			match = option.match(/\-OUtput=((?:[^\\]+\\)*)(.+\.abs)/);
			if (match) {
				const dir = match[1];
				const file = match[2];
				buildModeInfo.absFile = dir + file;
			}
			// hex/motファイル
			match = option.match(/\-OUtput=((?:[^\\]+\\)*)(.+\.(?:hex|mot))/);
			if (match) {
				const dir = match[1];
				const file = match[2];
				buildModeInfo.hexFile = dir + file;
			}
		}
	}

	private async _checkRcpeFile(outputChannel: vscode.OutputChannel) {
		await vscode.workspace.fs.stat(this.rcpeFilePath)
			.then(
				(value) => {
					// 成功ならrcpeファイルが存在するので何もしない
					//console.log("ok");
					//console.log(value);
					this.enable = true;
				},
				(e) => {
					// 失敗の場合はrcpeファイルを生成する
					//console.log("ng");
					//console.log(e);
					this._makeRcpeFile(outputChannel);
					this.enable = false;
				}
			);
	}
	private _makeRcpeFile(outputChannel: vscode.OutputChannel) {
		outputChannel.appendLine(".rcpe not found: このプロジェクトファイルは無効とします。");
		/*
		const prjPathWin = this.projFilePath.fsPath.replace(/\\/g, "\\\\");
		const cmmand = `"${config.cspExePath.replace(/\\/g, "\\\\")}" /cve "${prjPathWin}"`;
		outputChannel.appendLine("Make .rcpe file: " + cmmand);
		child_process.exec(
			cmmand,
			(error, stdout, stderr) => {
				outputChannel.appendLine(stdout);
				outputChannel.appendLine(stderr);
			}
		);
		*/
	}
}

class BuildModeInfo {
	public enable: boolean;
	public building: boolean;
	public projectName: string;
	public absFile: string;
	public hexFile: string;

	constructor(public id: string) {
		this.enable = true;
		this.building = false;
		this.projectName = "";
		this.absFile = "";
		this.hexFile = "";
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

class Configuration {
	public cspExePath: string;

	constructor() {
		//
		const conf = vscode.workspace.getConfiguration('cspBuilder');
		this.cspExePath = conf.csplus.path;
	}
}
let config = new Configuration();