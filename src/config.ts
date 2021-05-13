import * as vscode from 'vscode';

export class DeviceInfo {
	public series: string;
	public romAreaBegin: number;
	public romAreaEnd: number;

	constructor() {
		this.series = "";
		this.romAreaBegin = 0;
		this.romAreaEnd = 0;
	}
}

class CSPlusToolPath {
	public csplus: string;
	public rtos: Map<string, string>;
	public configurator: Map<string, string>;
	public devicefile: Map<string, string>;

	constructor() {
		this.csplus = "";
		this.rtos = new Map<string, string>();
		this.configurator = new Map<string, string>();
		this.devicefile = new Map<string, string>();
	}
}

class CSPlusConf {
	public cc: CSPlusToolPath;

	constructor() {
		this.cc = new CSPlusToolPath();
	}
}

function key2str(key: string | symbol): string {
	if (typeof(key) === "symbol") {
		return key.toString();
	} else {
		return key;
	}
}

export class Configuration {
	public path: CSPlusConf;
	public device: Map<string, DeviceInfo>;

	public defaultDeactive: Array<string>;

	constructor() {
		// 拡張機能Configuration取得
		const conf = vscode.workspace.getConfiguration('cspBuilder');
		///////////////////////////////
		// マイコン情報
		///////////////////////////////
		// CS+ツールパス情報
		this.path = new CSPlusConf();
		// CS+ for CC
		// CubeSuite+.exe
		this.path.cc.csplus = conf.path.CC.CSPlus;
		// RTOS dir
		const confRtos = conf.path.CC.RTOS.dir;
		for (const key of Reflect.ownKeys(confRtos)) {
			this.path.cc.rtos.set(key2str(key), confRtos[key]);
		}
		// RTOS Configurator
		const confConfigurator = conf.path.CC.RTOS.Configurator;
		for (const key of Reflect.ownKeys(confConfigurator)) {
			this.path.cc.configurator.set(key2str(key), confConfigurator[key]);
		}
		// Devicefile
		const confDevicefile = conf.path.CC.Devicefile;
		for (const key of Reflect.ownKeys(confDevicefile)) {
			this.path.cc.devicefile.set(key2str(key), confDevicefile[key]);
		}
		// Device情報
		this.device = new Map<string, DeviceInfo>();
		// Series-Device定義
		// RL78
		const confDeviceRL78 = conf.Micom.RL78;
		for (const key of Reflect.ownKeys(confDeviceRL78)) {
			// device情報取得
			let device = this.device.get(key2str(key));
			if (device === undefined) {
				// device情報未作成なら作成する
				this.device.set(key2str(key), new DeviceInfo());
				device = this.device.get(key2str(key));
			}
			// deviceにseries登録
			device!.series = "RL78";
		}
		// RX
		const confDeviceRX = conf.Micom.RX;
		for (const key of Reflect.ownKeys(confDeviceRX)) {
			// device情報取得
			let device = this.device.get(key2str(key));
			if (device === undefined) {
				// device情報未作成なら作成する
				this.device.set(key2str(key), new DeviceInfo());
				device = this.device.get(key2str(key));
			}
			// deviceにseries登録
			device!.series = "RX";
		}
		// ROMエリア定義
		const confROMArea = conf.Micom.ROMArea;
		for (const key of Reflect.ownKeys(confROMArea)) {
			const [begin, end] = confROMArea[key].split(":");
			const romAreaBegin = parseInt(begin, 16);
			const romAreaEnd = parseInt(end, 16);
			// valueチェック
			if (!isNaN(romAreaBegin) && !isNaN(romAreaEnd)) {
				// begin/endが両方とも16進数ならOK
				// device情報取得
				let device = this.device.get(key2str(key));
				if (device === undefined) {
					// device情報未作成なら作成する
					this.device.set(key2str(key), new DeviceInfo());
					device = this.device.get(key2str(key));
				}
				// deviceにROMエリア登録
				device!.romAreaBegin = romAreaBegin;
				device!.romAreaEnd = romAreaEnd;
			}
		}
		///////////////////////////////
		// 拡張機能用設定
		///////////////////////////////
		// DefaultDeactive設定
		this.defaultDeactive = this.commaSeqToArray(conf.BuildMode.DefaultDeactive);
	}

	public getDeviceInfo(device: string): DeviceInfo | undefined {
		let result: DeviceInfo | undefined = undefined;
		// deviceチェック
		let deviceInfo = this.device.get(device);
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
