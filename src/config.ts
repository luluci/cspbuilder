import * as vscode from 'vscode';

export class DeviceInfo {
	public romAreaBegin: number;
	public romAreaEnd: number;

	constructor() {
		this.romAreaBegin = 0;
		this.romAreaEnd = 0;
	}
}


export class Configuration {

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

	public getRomArea(device: string): DeviceInfo | undefined {
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
export const config = new Configuration();
