'use strict';
'require view';
'require fs';
'require ui';

return view.extend({
	load: function() {
		return Promise.all([
			fs.exec_direct('/usr/bin/runet-fix', ['test']).catch(function(e) { return 'Diagnostics tool output unavailable: ' + e; }),
			fs.exec_direct('/sbin/logread', ['-e', 'runet-fix']).catch(function() { return 'No system logs available.'; })
		]);
	},

	render: function(data) {
		var testOutput = data[0] || 'No diagnostic output';
		var logOutput = data[1] || 'No logs available';

		var view = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Runet Fix - Diagnostics & System Logs')),
			E('div', { 'class': 'cbi-map-descr' }, _('Check connectivity status to YouTube, Discord, and Telegram WebSocket relays, and view live system logs.')),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Connectivity Test')),
				E('pre', {
					'style': 'background:#1e1e1e;color:#00ff66;padding:12px;border-radius:4px;font-family:monospace;white-space:pre-wrap;margin-bottom:15px;'
				}, testOutput),
				E('button', {
					'class': 'btn cbi-button-action',
					'click': function(ev) {
						var btn = ev.target;
						btn.disabled = true;
						btn.innerText = _('Running Tests...');
						fs.exec_direct('/usr/bin/runet-fix', ['test']).then(function(res) {
							btn.previousElementSibling.innerText = res;
							btn.disabled = false;
							btn.innerText = _('Rerun Test');
						}).catch(function(err) {
							btn.disabled = false;
							btn.innerText = _('Error Running Test');
						});
					}
				}, _('Rerun Test'))
			]),

			E('div', { 'class': 'cbi-section', 'style': 'margin-top:20px;' }, [
				E('h3', {}, _('Recent System Logs')),
				E('pre', {
					'style': 'background:#1e1e1e;color:#ddd;padding:12px;border-radius:4px;font-family:monospace;max-height:400px;overflow-y:auto;white-space:pre-wrap;'
				}, logOutput),
				E('button', {
					'class': 'btn cbi-button-neutral',
					'style': 'margin-top:10px;',
					'click': function(ev) {
						var btn = ev.target;
						btn.disabled = true;
						fs.exec_direct('/sbin/logread', ['-e', 'runet-fix']).then(function(res) {
							btn.previousElementSibling.innerText = res;
							btn.disabled = false;
						});
					}
				}, _('Refresh Logs'))
			])
		]);

		return view;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
