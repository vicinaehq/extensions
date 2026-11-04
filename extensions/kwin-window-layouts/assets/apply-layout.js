(function () {
	const targetId = __TARGET_ID__;
	const layout = __LAYOUT__;

	function point(start, length, numerator, denominator) {
		return Math.round(start + (length * numerator) / denominator);
	}

	let target = null;
	const windows = workspace.stackingOrder;
	for (let index = 0; index < windows.length; index += 1) {
		if (windows[index] && String(windows[index].internalId) === targetId) {
			target = windows[index];
			break;
		}
	}
	if (!target) {
		throw new Error("The target window no longer exists.");
	}

	const area = workspace.clientArea(KWin.MaximizeArea, target);
	const left = point(area.x, area.width, layout[0], layout[1]);
	const right = point(area.x, area.width, layout[2], layout[3]);
	const top = point(area.y, area.height, layout[4], layout[5]);
	const bottom = point(area.y, area.height, layout[6], layout[7]);

	if (target.fullScreen) {
		target.fullScreen = false;
	}
	if (target.tile) {
		target.tile = null;
	}
	target.setMaximize(false, false);

	const geometry = Object.assign({}, target.frameGeometry);
	geometry.x = left;
	geometry.y = top;
	geometry.width = right - left;
	geometry.height = bottom - top;
	target.frameGeometry = geometry;
	workspace.activeWindow = target;
	workspace.raiseWindow(target);
})();
