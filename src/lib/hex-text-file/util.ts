import { HexTextFile } from './HexTextFile';
import { IntelHex } from './intel_hex';
import { MotSRecord } from './mot_s_recrod';

export function factoryHexTextFile(line: string): HexTextFile {
	const isIntelHex = IntelHex.validation(line);
	if (isIntelHex) {
		return new IntelHex();
	}
	const isMot = MotSRecord.validation(line);
	if (isMot) {
		return new MotSRecord();
	}

	return new HexTextFile();
}
