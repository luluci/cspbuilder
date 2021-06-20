import { HexTextFile } from './HexTextFile';

class HexTextOffset {
	static readonly recordHeader = 0;
	static readonly recordType = 1;
	static readonly byteCount = 2;
	static readonly address = 4;
}

type AnalyzeRecordFunc = (line: string, byteCount: number) => void;

export class MotSRecord extends HexTextFile {
	private _address: number;
	private _analyzeTbl: AnalyzeRecordFunc[];

	constructor() {
		super();
		this._format = 'mot';
		//
		this._address = 0;
		this._analyzeTbl = [
			this._analyzeS0Record,
			this._analyzeS1Record,
			this._analyzeS2Record,
			this._analyzeS3Record,
			this._analyzeSXRecordDummy,
			this._analyzeSXRecordDummy,
			this._analyzeSXRecordDummy,
			this._analyzeSXRecordDummy,
			this._analyzeSXRecordDummy,
			this._analyzeSXRecordDummy,
		];
	}

	public parse(line: string): boolean {

		// フォーマットチェック
		if (!this.checkFormat(line)) {
			return false;
		}
		try {
			// データ取得
			const recordType = this._getRecordType(line);
			const byteCount = this._getByteCount(line);
			// データ反映
			this._analyzeTbl[recordType].call(this, line, byteCount);
		}
		catch (e) {
			return false;
		}

		return true;
	}

	public checkFormat(line: string): boolean {
		const startMark = line.charAt(HexTextOffset.recordHeader);
		if (startMark !== 'S') {
			return false;
		}
		return true;
	}

	private _getRecordType(line: string): number {
		// レコードタイプ
		const startPos = HexTextOffset.recordType;
		const endPos = HexTextOffset.byteCount;
		return parseInt(line.slice(startPos, endPos), 16);
	}

	private _getByteCount(line: string): number {
		// バイトカウント
		const startPos = HexTextOffset.byteCount;
		const endPos = HexTextOffset.address;
		return parseInt(line.slice(startPos, endPos), 16);
	}


	private _analyzeS0Record(line: string, byteCount: number) {
		// S0レコード:サイズ定義
		const addressSize = 2;
		const filenameSize = 8;
		const fileExtSize = 3;
		const checksumSize = 1;
		// チェックサム取得
		//const checksumPos = HexTextOffset.address + ((addressSize + filenameSize + fileExtSize) * 2);
		const checksumPos = HexTextOffset.address + ((byteCount - 1) * 2);
		const checksum = this._getChecksum(line, checksumPos, checksumSize*2);
		const checksumBeginPos = HexTextOffset.byteCount;
		const checksumEndPos = checksumPos;
		const check = this._checkChecksum(line, checksumBeginPos, checksumEndPos, checksum);
		// ファイル名取得
		const filenamePos = HexTextOffset.address + ((addressSize) * 2);
		const fileExtPos = HexTextOffset.address + ((addressSize + filenameSize) * 2);
		const filenameBytes = line.slice(filenamePos, fileExtPos);
		const fileExtBytes = line.slice(fileExtPos, checksumPos);
	}

	private _analyzeS1Record(line: string, byteCount: number) {
		// S1レコード(データレコード):サイズ定義
		const addressSize = 2;
		//const checksumSize = 1;
		// データ解析
		this._analyzeDataRecord(line, byteCount, addressSize);
	}

	private _analyzeS2Record(line: string, byteCount: number) {
		// S2レコード(データレコード):サイズ定義
		const addressSize = 3;
		//const checksumSize = 1;
		// データ解析
		this._analyzeDataRecord(line, byteCount, addressSize);
	}

	private _analyzeS3Record(line: string, byteCount: number) {
		// S3レコード(データレコード):サイズ定義
		const addressSize = 4;
		//const checksumSize = 1;
		// データ解析
		this._analyzeDataRecord(line, byteCount, addressSize);
	}

	private _analyzeDataRecord(line: string, byteCount: number, addressSize: number) {
		// データレコード:サイズ定義
		const checksumSize = 1;
		// チェックサム取得
		const checksumPos = HexTextOffset.address + ((byteCount - 1) * 2);
		const checksum = this._getChecksum(line, checksumPos, checksumSize * 2);
		const checksumBeginPos = HexTextOffset.byteCount;
		const checksumEndPos = checksumPos;
		const check = this._checkChecksum(line, checksumBeginPos, checksumEndPos, checksum);
		// アドレス取得
		const address = this._getLoadAddress(line, addressSize);
		// データレコード取得
		const data = this._getData(line, byteCount, addressSize);
		// データレコード登録
		const dataArray = this._dataToArray(data);
		this.addData(address, dataArray, byteCount);
	}

	private _getLoadAddress(line: string, size: number): number {
		// ロードアドレス
		const startPos = HexTextOffset.address;
		const endPos = startPos + (size * 2);
		return parseInt(line.slice(startPos, endPos), 16);
	}

	private _getData(line: string, byteCount: number, addressSize: number): string {
		// データ
		const startPos = HexTextOffset.address + (addressSize * 2);
		const dataLen = (byteCount - addressSize - 1) * 2;
		const datas = line.slice(startPos, startPos + dataLen);
		return datas;
	}

	private _getChecksum(line: string, checksumPos: number, checksumSize: number): number {
		// チェックサム
		return parseInt(line.slice(checksumPos, checksumPos + checksumSize), 16);
	}

	private _checkChecksum(line: string, begin: number, end: number, checksum: number): boolean {
		const checksumTgt = line.slice(begin, end);
		const checksumTgtArray = this._dataToArray(checksumTgt);
		const sum = checksumTgtArray.reduce((acc, value) => acc + value, 0);
		if (sum === undefined) {
			return false;
		}
		// 1の補数
		if (((sum ^ 0xFF) & 0xFF) !== checksum) {
			return false;
		}
		return true;
	}

	private _dataToArray(data: string): number[] {
		// データ
		const datas = data.match(/.{2}/g)?.map(value => parseInt(value, 16));
		if (datas === undefined) {
			throw Error('input line is invalid Intel-HEX.');
		}
		return datas;
	}


	private _analyzeSXRecordDummy(line: string, byteCount: number) {
		// 
	}

	public static validation(line: string): boolean {
		const obj = new MotSRecord();
		// フォーマットチェック
		if (!obj.checkFormat(line)) {
			return false;
		}

		return true;
	}
}
