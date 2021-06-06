import { HexTextFile } from './HexTextFile';

class HexTextOffset {
	static readonly startMark = 0;
	static readonly byteCount = 1;
	static readonly addressOffset = 3;
	static readonly recordType = 7;
	static readonly data = 9;
}

type AnalyzeRecordFunc = (byteCount: number, address: number, data: string) => void;

export class IntelHex extends HexTextFile {
	private _addressOffset: number;
	private _analyzeTbl: AnalyzeRecordFunc[];
	public regCS: number;
	public regIP: number;

	constructor() {
		super();
		this._format = 'hex';
		//
		this._addressOffset = 0;
		this._analyzeTbl = [
			this._analyze00Record,
			this._analyze01Record,
			this._analyze02Record,
			this._analyze03Record,
			this._analyze04Record,
			this._analyze05Record,
		];
		this.regCS = 0;
		this.regIP = 0;
	}

	public parse(line: string): boolean {

		// フォーマットチェック
		if (!this._checkStartMark(line)) {
			return false;
		}
		try {
			// データ取得
			const byteCount = this._getByteCount(line);
			const addressOffset = this._getAddressOffset(line);
			const recordType = this._getRecordType(line);
			const data = this._getData(line, byteCount);
			const checksum = this._getChecksum(line, byteCount);
			// check checksum
			const check = this._checkChecksum(line, byteCount, checksum);
			// データ反映
			this._analyzeTbl[recordType].call(this, byteCount, addressOffset, data);
		}
		catch (e) {
			return false;
		}

		return true;
	}

	private _checkStartMark(line: string): boolean {
		const startMark = line.charAt(0);
		if (startMark !== ':') {
			return false;
		}
		return true;
	}

	private _getByteCount(line: string): number {
		// バイトカウント
		const startPos = HexTextOffset.byteCount;
		const endPos = HexTextOffset.addressOffset;
		return parseInt(line.slice(startPos, endPos), 16);
	}

	private _getAddressOffset(line: string): number {
		// アドレスオフセット
		const startPos = HexTextOffset.addressOffset;
		const endPos = HexTextOffset.recordType;
		return parseInt(line.slice(startPos, endPos), 16);
	}

	private _getRecordType(line: string): number {
		// レコードタイプ
		const startPos = HexTextOffset.recordType;
		const endPos = HexTextOffset.data;
		return parseInt(line.slice(startPos, endPos), 16);
	}

	private _getData(line: string, byteCount: number): string {
		// データ
		const startPos = HexTextOffset.data;
		const dataLen = byteCount * 2;
		const datas = line.slice(startPos, startPos + dataLen);
		return datas;
	}

	private _getChecksum(line: string, byteCount: number): number {
		// チェックサム
		const startPos = HexTextOffset.data + (byteCount * 2);
		const dataLen = 2;
		return parseInt(line.slice(startPos, startPos + dataLen), 16);
	}

	private _checkChecksum(line: string, byteCount: number, checksum: number): boolean {
		const checksumPos = HexTextOffset.data + (byteCount * 2);
		const checksumTgt = line.slice(1, checksumPos);
		const checksumTgtArray = this._dataToArray(checksumTgt);
		const sum = checksumTgtArray.reduce((acc, value) => acc + value, 0);
		if (sum === undefined) {
			return false;
		}
		if ( (-sum & 0xFF) !== checksum ) {
			return false;
		}
		return true;
	}

	private _analyze00Record(byteCount: number, addressOffset: number, data: string) {
		// データレコード
		const address = this._getAddress(addressOffset);
		const dataArray = this._dataToArray(data);
		this.addData(address, dataArray, byteCount);
	}

	private _getAddress(address: number): number {
		return address + this._addressOffset;
	}

	private _dataToArray(data: string): number[] {
		// データ
		const datas = data.match(/.{2}/g)?.map(value => parseInt(value, 16));
		if (datas === undefined) {
			throw Error('input line is invalid Intel-HEX.');
		}
		return datas;
	}

	private _analyze01Record(byteCount: number, address: number, data: string) {
		// エンドレコード
		// 特に何もしない
	}

	private _analyze02Record(byteCount: number, address: number, data: string) {
		// 拡張セグメントアドレスレコード
		const segmentBaseAddress = parseInt(data, 16);
		this._addressOffset = (segmentBaseAddress << 4);
	}

	private _analyze03Record(byteCount: number, address: number, data: string) {
		// スタートアドレスレコード
		this.regCS = parseInt(data.slice(0, 2), 16);
		this.regIP = parseInt(data.slice(2, 4), 16);
	}

	private _analyze04Record(byteCount: number, address: number, data: string) {
		// 拡張リニアアドレスレコード
		const segmentBaseAddress = parseInt(data, 16);
		this._addressOffset = (segmentBaseAddress << 16);
	}

	private _analyze05Record(byteCount: number, address: number, data: string) {
		// 32bitスタートリニアアドレスレコード
		const segmentBaseAddress = parseInt(data, 16);
		this._addressOffset = (segmentBaseAddress << 16);
	}

	public static validation(line: string): boolean {
		const obj = new IntelHex();
		// フォーマットチェック
		if (!obj._checkStartMark(line)) {
			return false;
		}

		return true;
	}
}
