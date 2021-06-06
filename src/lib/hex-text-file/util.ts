import { HexTextFile } from './HexTextFile';
import { IntelHex } from './intel_hex';

export function factoryHexTextFile(line: string): HexTextFile {
	const isIntelHex = IntelHex.validation(line);
	if (isIntelHex) {
		return new IntelHex();
	}

	return new HexTextFile();
}
