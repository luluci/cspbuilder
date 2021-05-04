

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
	const vscode = acquireVsCodeApi();

	document.querySelectorAll('.build-tgt-checkbox').forEach((elem)=>{
		elem.addEventListener('click', (e) => {
			onClickCheckBuidModeTgt(e);
		});
	});
	document.querySelectorAll('.build-button').forEach((elem) => {
		elem.addEventListener('click', (e) => {
			onClickButtonBuild(e);
		});
	});
	document.querySelectorAll('.rebuild-button').forEach((elem) => {
		elem.addEventListener('click', (e) => {
			onClickButtonReBuild(e);
		});
	});
	document.querySelectorAll('.release-button').forEach((elem) => {
		elem.addEventListener('click', (e) => {
			onClickButtonRelease(e);
		});
	});

	function onClickCheckBuidModeTgt(e) {
		let state = false;
		let elem = e.currentTarget;
		let prjId = elem.dataset.prj_id;
		let buildModeId = elem.dataset.buildmode_id;
		if (elem) {
			state = elem.checked;
		}
		vscode.postMessage({
			command: 'onClickCheckBuidModeTgt',
			prjId: prjId,
			buildModeId: buildModeId,
			state: state
		});
	}

	function onClickButtonBuild(e) {
		let elem = e.currentTarget;
		let prjId = elem.dataset.prj_id;
		let buildModeId = elem.dataset.buildmode_id;
		vscode.postMessage({
			command: 'onClickButtonBuild',
			prjId: prjId,
			buildModeId: buildModeId
		});
	}

	function onClickButtonReBuild(e) {
		let elem = e.currentTarget;
		let prjId = elem.dataset.prj_id;
		let buildModeId = elem.dataset.buildmode_id;
		vscode.postMessage({
			command: 'onClickButtonReBuild',
			prjId: prjId,
			buildModeId: buildModeId
		});
	}

	function onClickButtonRelease(e) {
		let elem = e.currentTarget;
		vscode.postMessage({
			command: 'onClickButtonRelease'
		});
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

	// Handle messages sent from the extension to the webview
	window.addEventListener('message', event => {
		const message = event.data; // The json data that the extension sent
		switch (message.command) {
			case 'refactor':
				currentCount = Math.ceil(currentCount * 0.5);
				counter.textContent = currentCount;
				break;
		}
	});
	*/
}());
