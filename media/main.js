// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
	const vscode = acquireVsCodeApi();

	document.querySelectorAll('.build-tgt-checkbox').forEach((elem)=>{
		elem.addEventListener('click', (e) => {
			let state = false;
			let elem = e.currentTarget;
			let prjId = elem.dataset.prj_id;
			let buildModeId = elem.dataset.buildmode_id;
			if (elem) {
				state = elem.checked;
			}
			// GUI同期
			let sameIdElem;
			sameIdElem = document.getElementById(`build-tgt-checkbox_detail_${prjId}_${buildModeId}`);
			sameIdElem.checked = state;
			sameIdElem = document.getElementById(`build-tgt-checkbox_quickview_${prjId}_${buildModeId}`);
			sameIdElem.checked = state;
			//
			vscode.postMessage({
				command: 'onClickCheckBuidModeTgt',
				prjId: prjId,
				buildModeId: buildModeId,
				state: state
			});
		});
	});
	document.querySelectorAll('.build-button').forEach((elem) => {
		elem.addEventListener('click', (e) => {
			let elem = e.currentTarget;
			let prjId = elem.dataset.prj_id;
			let buildModeId = elem.dataset.buildmode_id;
			vscode.postMessage({
				command: 'onClickButtonBuild',
				prjId: prjId,
				buildModeId: buildModeId
			});
		});
	});
	document.querySelectorAll('.rebuild-button').forEach((elem) => {
		elem.addEventListener('click', (e) => {
			let elem = e.currentTarget;
			let prjId = elem.dataset.prj_id;
			let buildModeId = elem.dataset.buildmode_id;
			vscode.postMessage({
				command: 'onClickButtonReBuild',
				prjId: prjId,
				buildModeId: buildModeId
			});
		});
	});
	document.querySelectorAll('.cfg-gen-button').forEach((elem) => {
		elem.addEventListener('click', (e) => {
			let elem = e.currentTarget;
			let prjId = elem.dataset.prj_id;
			let buildModeId = elem.dataset.buildmode_id;
			vscode.postMessage({
				command: 'onClickButtonCfgGen',
				prjId: prjId,
				buildModeId: buildModeId
			});
		});
	});
	document.querySelectorAll('.release-button').forEach((elem) => {
		elem.addEventListener('click', (e) => {
			vscode.postMessage({
				command: 'onClickButtonRelease'
			});
		});
	});
	document.querySelectorAll('.data-input-common').forEach((elem) => {
		elem.addEventListener('input', (e) => {
			const elem = e.currentTarget;
			const inputType = elem.dataset.type;
			const value = elem.value;
			vscode.postMessage({
				command: 'onInputCommon',
				type: inputType,
				value: value
			});
		});
	});

	// Handle messages sent from the extension to the webview
	window.addEventListener('message', event => {
		const message = event.data; // The json data that the extension sent
		switch (message.command) {
			case 'BuildFinish':
				buildFinish(message);
				break;
		}
	});


	function buildFinish(message) {
		// ID
		const id = `${message.projectId}_${message.buildModeId}`;
		// BuildStatus
		const buildStatusId = `BuildStatus_Result_${id}`;
		const buildStatus = document.getElementById(buildStatusId);
		const currElem = buildStatus.querySelector("span");
		const newElem = document.createElement("span");
		if (message.buildStatus === "Success") {
			newElem.className = "BuildSuccess";
			newElem.textContent = "Success";
		} else {
			newElem.className = "BuildFailed";
			newElem.textContent = "Failed";
		}
		buildStatus.replaceChild(newElem, currElem);
		// RAM size
		const ramSizeId = `BuildStatus_RamSize_${id}`;
		const ramSize = document.getElementById(ramSizeId);
		ramSize.textContent = `${message.ramSize} bytes`;
		// RAM size
		const romSizeId = `BuildStatus_RomSize_${id}`;
		const romSize = document.getElementById(romSizeId);
		romSize.textContent = `${message.romSize} bytes`;
		// RAM size
		const programSizeId = `BuildStatus_ProgramSize_${id}`;
		const programSize = document.getElementById(programSizeId);
		programSize.textContent = `${message.programSize} bytes`;
		// ErrorCount
		const errorCountId = `BuildStatus_ErrorCount_${id}`;
		const errorCount = document.getElementById(errorCountId);
		errorCount.textContent = `${message.errorCount}`;
		// WarningCount
		const warningCountId = `BuildStatus_WarningCount_${id}`;
		const warningCount = document.getElementById(warningCountId);
		warningCount.textContent = `${message.warningCount}`;
	}

	/*
	const oldState = vscode.getState();

	const counter = document.getElementById('lines-of-code-counter');
	console.log(oldState);
	let currentCount = (oldState && oldState.count) || 0;
	counter.textContent = currentCount;

	setInterval(() => {
		counter.textContent = currentCount++;

		// Update state
		vscode.setState({ count: currentCount });

		// Alert the extension when the cat introduces a bug
		if (Math.random() < Math.min(0.001 * currentCount, 0.05)) {
			// Send a message back to the extension
			vscode.postMessage({
				command: 'alert',
				text: '🐛  on line ' + currentCount
			});
		}
	}, 100);

	*/
}());
