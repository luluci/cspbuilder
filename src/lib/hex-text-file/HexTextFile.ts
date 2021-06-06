

export type HexTextFileFormat =
	'mot' |
	'hex' |
	'None';

export class HexRecord {
	static readonly recordSize: number = 16;
	public data: Array<number>;
	public address: number;

	constructor() {
		this.data = Array<number>(HexRecord.recordSize);
		this.address = 0;
	}
}


export class HexTextFile {
	protected _format: HexTextFileFormat;
	public data: Map<number,HexRecord>;

	constructor() {
		this._format = 'None';
		this.data = new Map<number,HexRecord>();
	}

	public parse(line: string): boolean { return false; }

	get format(): HexTextFileFormat {
		return this._format;
	}

	public checksum(blank: number, start: number, end: number): number {
		let idx = Math.floor(start / 16);
		let pos = start % 16;
		// Record参照取得
		let record = this._getRecord(idx);
		// sum計算
		let sum = 0;
		let address = start;
		while (address <= end) {
			if (record.data[pos] !== undefined) {
				sum += record.data[pos];
			} else {
				sum += blank;
			}
			++pos;
			// アドレスがレコード境界を超えたら、次のレコードへ
			if (pos >= HexRecord.recordSize) {
				pos = 0;
				++idx;
				record = this._getRecord(idx);
			}
			//
			++address;
		}
		return sum;
	}

	public addData(address: number, data: number[], byteCount: number) {
		let idx = Math.floor(address / 16);
		let pos = address % 16;
		// Record参照取得
		let record = this._getRecord(idx);
		// データ設定
		for (const byte of data) {
			record.data[pos] = byte;
			++pos;
			// アドレスがレコード境界を超えたら、次のレコードへ
			if (pos >= HexRecord.recordSize) {
				pos = 0;
				++idx;
				record = this._getRecord(idx);
			}
		}
	}

	private _getRecord(idx: number): HexRecord {
		// Record参照取得
		let record = this.data.get(idx);
		// 存在チェック
		if (!record) {
			this.data.set(idx, new HexRecord());
			record = this.data.get(idx)!;
		}
		//
		return record;
	}
}
