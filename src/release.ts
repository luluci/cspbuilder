import * as vscode from 'vscode';
import * as xlsx from 'xlsx';

export class OutputExcel {

	constructor(private _outputChannel: vscode.OutputChannel) {
		
	}

	public run(outputPath: string) {
		this._outputExcel(outputPath);
	}

	private _outputExcel(outputPath: string) {
		this._outputChannel.appendLine("");

		const book = xlsx.utils.book_new();
		const sheetName = 'sheet1';
		const sheet = xlsx.utils.aoa_to_sheet([]);
		xlsx.utils.book_append_sheet(book, sheet, sheetName);
//		const sheet = book.Sheets[sheetName];
		sheet['!ref'] = "B2:C3";
		sheet['B2'] = { t: "s", v:"test" };
		book.Sheets[sheetName] = sheet;
		//
		xlsx.writeFile(book, outputPath);
	}
}

