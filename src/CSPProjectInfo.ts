import * as vscode from 'vscode';
import { posix } from 'path';
import * as child_process from 'child_process';
import * as xml2js from 'xml2js';
import * as iconv from 'iconv-lite';

import { DeviceInfo, config } from './config';

/**
 * mtpjファイル情報管理
 */
export class MtpjInfo {
	public projName: string;
	public projFileName: string;
	public projDirPath: vscode.Uri;
	public rcpeFilePath: vscode.Uri;
	public enable: boolean;
	public buildModeCount: number;
	public buildModeInfos: Array<BuildModeInfo>;
	// プロジェクト情報
	public micomSeries: string;
	public micomDevice: string;
	public micomDeviceInfo?: DeviceInfo;

	constructor(public id: number, public projFilePath: vscode.Uri) {
		this.projFileName = posix.basename(projFilePath.path);
		this.projName = posix.basename(projFilePath.path, ".mtpj");
		const dir = posix.dirname(projFilePath.path);
		const file = posix.basename(projFilePath.path, ".mtpj") + ".rcpe";
		const rcpeFile = posix.join(dir, file);
		this.rcpeFilePath = vscode.Uri.parse(rcpeFile);
		this.projDirPath = vscode.Uri.parse(dir);
		this.buildModeCount = 0;
		this.buildModeInfos = [];
		this.enable = true;
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

	public async build(buildModeId: number, outputChannel: vscode.OutputChannel) {
		if (this.enable) {
			const buildModeInfo = this.buildModeInfos[buildModeId];
			buildModeInfo.building = true;
			await this._build(buildModeInfo, "/bb", outputChannel);
			await buildModeInfo.checkOutputFile();
		} else {
			throw new Error("This Project is disabled!");
		}
	}

	public async rebuild(buildModeId: number, outputChannel: vscode.OutputChannel) {
		if (this.enable) {
			const buildModeInfo = this.buildModeInfos[buildModeId];
			buildModeInfo.building = true;
			await this._build(buildModeInfo, "/br", outputChannel);
			await buildModeInfo.checkOutputFile();
		} else {
			throw new Error("This Project is disabled!");
		}
	}

	private _build(buildModeInfo: BuildModeInfo, buildOpt: string, outputChannel: vscode.OutputChannel): Promise<void> {
		return new Promise((resolve) => {
			const cspExePath = config.cspExePath.replace(/\\/g, "\\\\");
			const prjFilePath = this.projFilePath.fsPath.replace(/\\/g, "\\\\");
			const cmmand = `"${cspExePath}" ${buildOpt} "${buildModeInfo.buildMode}" "${prjFilePath}"`;
			//
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
				buildModeInfo.building = false;
				resolve();
			});
		});
	}

	private async _loadProjectFile() {
		// mtpjをjson形式に変換
		const xml = await vscode.workspace.openTextDocument(this.projFilePath);
		const json = await xml2js.parseStringPromise(xml.getText());
		// 情報取得
		// 解析結果を格納するBuildModeInfoインスタンスが必要になるので、
		// XMLの順序に依存しないように2回に分けてチェックし、
		// 1回目にBuildModeInfoインスタンスを作成、
		// 2回目にその他情報を収集する。
		await this._loadProjectFileFirst(json);
		await this._loadProjectFileSecond(json);
		// 各種ファイルの存在チェック
		await this._outputFileCheck();
		await this._loadMapFile();
	}
	private async _loadProjectFileFirst(json: any) {
		// 情報取得
		const classInfos = json.CubeSuiteProject.Class;
		for (let i = 0; i < classInfos.length; i++) {
			const instances = classInfos[i].Instance;
			for (let instanceId = 0; instanceId < instances.length; instanceId++) {
				const instance = instances[instanceId];
				// BuildMode情報
				if ("BuildModeCount" in instance) {
					// BuildModeCount取得
					// 数字であるはずなので、parseに失敗する場合はプロジェクトファイルに合わせてロジックの見直しが必要
					const buildModeCount = parseInt(instance.BuildModeCount[0]);
					if (isNaN(buildModeCount)) {
						this.enable = false;
						throw new Error("mtpj format is invalid!");
					}
					this.buildModeCount = buildModeCount;
					// BuildMode情報取得
					for (let buildModeId = 0; buildModeId < buildModeCount; buildModeId++) {
						const buildModeTag = `BuildMode${buildModeId}`;
						if (buildModeTag in instance) {
							const buildModeStr = instance[buildModeTag][0];
							const buildMode = Buffer.from(buildModeStr, 'base64').toString('utf16le');
							const buildModeInfo = new BuildModeInfo(this.id, buildModeId, buildMode);
							buildModeInfo.projectName = this.projName;
							// BuildModeInfo登録
							this.buildModeInfos.push(buildModeInfo);
						}
					}
					// BuildMode情報を取得したら終了する
					return;
				}
			}
		}
	}
	private async _loadProjectFileSecond(json: any) {
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
				// HexOption
				// "HexOptionOutputFolder-DefaultValue" が存在したら、HexOptionのinstanceと判断する
				if ("HexOptionOutputFolder-DefaultValue" in instance) {
					let key: string;
					for (let buildModeId = 0; buildModeId < this.buildModeCount; buildModeId++) {
						const buildModeInfo = this.buildModeInfos[buildModeId];
						key = `HexOptionOutputFolder-${buildModeId}`;
						if (key in instance) {
							const outputFolder = this._getProperty(instance[key][0], buildModeInfo);
							buildModeInfo.hexOutputDir = this._makeProjRelPath(outputFolder);
						}
						key = `HexOptionOutputFileName-${buildModeId}`;
						if (key in instance) {
							const outputFile = this._getProperty(instance[key][0], buildModeInfo);
							buildModeInfo.hexFileName = outputFile;
							buildModeInfo.hexFilePath = this._makeFilePath(buildModeInfo.hexOutputDir!, outputFile);
						}
					}
				}
				// LinkOption
				// "LinkOptionOutputFolder-DefaultValue"
				if ("LinkOptionOutputFolder-DefaultValue" in instance) {
					let key: string;
					for (let buildModeId = 0; buildModeId < this.buildModeCount; buildModeId++) {
						const buildModeInfo = this.buildModeInfos[buildModeId];
						key = `LinkOptionOutputFolder-${buildModeId}`;
						if (key in instance) {
							const outputFolder = this._getProperty(instance[key][0], buildModeInfo);
							buildModeInfo.linkOutputDir = this._makeProjRelPath(outputFolder);
						}
						key = `LinkOptionMapFileName-${buildModeId}`;
						if (key in instance) {
							const outputFile = this._getProperty(instance[key][0], buildModeInfo);
							buildModeInfo.mapFileName = outputFile;
							buildModeInfo.mapFilePath = this._makeFilePath(buildModeInfo.linkOutputDir!, outputFile);
						}
					}
				}
			}
		}
	}
	static reVarBuildModeName = /%BuildModeName%/;
	static reVarProjectName = /%ProjectName%/;
	/**
	 * mtpjファイル内の変数を処理する
	 * @param raw 
	 */
	private _getProperty(raw: string, buildModeInfo: BuildModeInfo): string {
		let result: string = raw;
		if (result.match(MtpjInfo.reVarBuildModeName)) {
			result = result.replace(MtpjInfo.reVarBuildModeName, buildModeInfo.buildMode);
		}
		if (result.match(MtpjInfo.reVarProjectName)) {
			result = result.replace(MtpjInfo.reVarProjectName, this.projName);
		}
		return result;
	}
	/**
	 * プロジェクトファイル内のディレクトリデータは相対パスと見なして単純に結合しておく
	 * @param path 
	 */
	private _makeProjRelPath(path: string): vscode.Uri {
		const dir = this.projDirPath.path;
		const absPath = posix.join(dir, path);
		return vscode.Uri.parse(absPath);
	}
	/**
	 * 引数で指定されたパスを結合する
	 * @param dirPath 
	 * @param filePath 
	 * @returns 
	 */
	private _makeFilePath(dirPath: vscode.Uri, filePath: string): vscode.Uri {
		const absPath = posix.join(dirPath.path, filePath);
		return vscode.Uri.parse(absPath);
	}

	private async _outputFileCheck() {
		for (let buildModeId = 0; buildModeId < this.buildModeCount; buildModeId++) {
			const buildModeInfo = this.buildModeInfos[buildModeId];
			await buildModeInfo.checkOutputFile();
		}
	}

	private async _loadMapFile() {
		for (let buildModeId = 0; buildModeId < this.buildModeCount; buildModeId++) {
			const buildModeInfo = this.buildModeInfos[buildModeId];
			if (buildModeInfo.enableOutputFile) {
				// mapファイルを解析して情報取得
				const text = await vscode.workspace.openTextDocument(buildModeInfo.mapFilePath!);
				for (let lineNo = 0; lineNo < text.lineCount; lineNo++) {
					buildModeInfo.analyzeMapFileText(text.lineAt(lineNo).text);
				}
				//
				buildModeInfo.buildStatus = "prebuild";
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
	// Hex
	public hexOutputDir?: vscode.Uri;
	public hexFileName: string;
	public hexFilePath?: vscode.Uri;
	// Link
	public linkOutputDir?: vscode.Uri;
	public mapFileName: string;
	public mapFilePath?: vscode.Uri;
	// ビルド情報
	public buildStatus?: string;
	public ramSize?: number;
	public romSize?: number;
	public programSize?: number;
	public errorCount?: number;
	public warningCount?: number;
	public successCount?: number;
	public failedCount?: number;
	public buildDate?: string;
	public enableOutputFile: boolean;
	// Buildログ解析正規表現
	static reBuildMsgRamDataSection = /RAMDATA SECTION:\s+([0-9a-fA-F]+)\s+Byte/;
	static reBuildMsgRomDataSection = /ROMDATA SECTION:\s+([0-9a-fA-F]+)\s+Byte/;
	static reBuildMsgProgramSection = /PROGRAM SECTION:\s+([0-9a-fA-F]+)\s+Byte/;
	static reBuildMsgBuildFinish1 = /ビルド終了\(エラー:([0-9]+)個, 警告:([0-9]+)個\)/;
	static reBuildMsgBuildFinish2 = /終了しました\(成功:([0-9]+)プロジェクト, 失敗:([0-9]+)プロジェクト\)\(([^\)]+)\)/;
	// mapファイル解析正規表現
	static reMapFileDate = /Renesas Optimizing Linker \([^\)]+\)\s+(.+)/;

	constructor(public projId: number, public buildModeId: number, public buildMode: string) {
		this.enable = true;
		this.building = false;
		this.projectName = "";
		this.absFile = "";
		this.hexFile = "";
		this.hexFileName = "";
		this.mapFileName = "";
		this.enableOutputFile = false;
	}

	public initBuildInfo() {
		// Build情報を初期化する
		this.buildStatus = undefined;
		this.ramSize = undefined;
		this.romSize = undefined;
		this.programSize = undefined;
		this.errorCount = undefined;
		this.warningCount = undefined;
		this.successCount = undefined;
		this.failedCount = undefined;
		this.buildDate = undefined;
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
			this.buildDate = match[3];
			// BuildStatus作成
			if (this.successCount !== 0 && this.failedCount === 0) {
				this.buildStatus = "Success";
			} else {
				this.buildStatus = "Failed";
				this.initBuildInfo();
			}
		}
	}

	public analyzeMapFileText(msg: string) {
		// Buildログを受け取って解析する
		let match: RegExpMatchArray | null;
		// PROGRAMサイズ
		if (match = msg.match(BuildModeInfo.reMapFileDate)) {
			this.buildDate = match[1];
		}
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
	}

	public async checkOutputFile() {
		if (this.hexFilePath && this.mapFilePath) {
			try {
				// 成功したら前回ビルド情報
				const hexStat = await vscode.workspace.fs.stat(this.hexFilePath);
				const mapStat = await vscode.workspace.fs.stat(this.mapFilePath);
				//
				this.enableOutputFile = true;
			} catch (e) {
				// ファイルが見つからなかったらパス無効
				this.enableOutputFile = false;
			}
		} else {
			// ファイルが見つからなかったらパス無効
			this.enableOutputFile = false;
		}
	}
}
