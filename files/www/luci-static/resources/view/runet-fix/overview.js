'use strict';
'require view';
'require form';
'require rpc';
'require fs';
'require ui';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

var callExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: [ 'command', 'params' ],
	expect: { '': {} }
});

return view.extend({
	load: function() {
		return Promise.all([
			callServiceList('runet-fix'),
			fs.read('/tmp/dnsmasq.d/runet-fix-adblock.conf').catch(function() { return ''; }),
			fs.exec_direct('/usr/bin/pgrep', ['-f', 'nfqws']).catch(function() { return ''; }),
			fs.exec_direct('/usr/bin/pgrep', ['-f', 'tg-transproxy|tg_ws_transparent']).catch(function() { return ''; })
		]);
	},

	render: function(data) {
		var serviceData = data[0] || {};
		var adblockRules = data[1] ? data[1].trim().split('\n').length : 0;
		var nfqwsPid = data[2] ? data[2].trim() : '';
		var tgPid = data[3] ? data[3].trim() : '';

		var m = new form.Map('runet-fix', _('Runet Fix - All-in-One Dashboard'),
			_('Unified high-performance suite for OpenWrt: Zapret DPI bypass, Transparent Telegram WebSocket tunnel, and Smart Adblock.'));

		var s = m.section(form.NamedSection, 'main', 'global', _('Master Switch & System Overview'));

		s.option(form.Flag, 'enabled', _('Enable All Services'),
			_('Globally enables or disables all Runet-Fix subsystems.'));

		// Status Overview Table
		var o = s.option(form.DummyValue, '_status_table', _('Subsystem Status'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			var zapretBadge = nfqwsPid ? 
				'<span class="badge" style="background:#28a745;color:#fff;padding:4px 8px;border-radius:4px;">RUNNING (PID ' + nfqwsPid + ')</span>' :
				'<span class="badge" style="background:#dc3545;color:#fff;padding:4px 8px;border-radius:4px;">STOPPED</span>';

			var tgBadge = tgPid ?
				'<span class="badge" style="background:#28a745;color:#fff;padding:4px 8px;border-radius:4px;">ACTIVE (PID ' + tgPid + ')</span>' :
				'<span class="badge" style="background:#dc3545;color:#fff;padding:4px 8px;border-radius:4px;">STOPPED</span>';

			var adblockBadge = adblockRules > 0 ?
				'<span class="badge" style="background:#28a745;color:#fff;padding:4px 8px;border-radius:4px;">ACTIVE (' + adblockRules + ' domains)</span>' :
				'<span class="badge" style="background:#6c757d;color:#fff;padding:4px 8px;border-radius:4px;">INACTIVE</span>';

			return '<div class="table" style="margin-top:10px;">' +
				'<div class="tr"><div class="td" style="font-weight:bold;width:30%;">Zapret (YouTube & Discord DPI)</div><div class="td">' + zapretBadge + '</div></div>' +
				'<div class="tr"><div class="td" style="font-weight:bold;">Telegram Transparent Proxy</div><div class="td">' + tgBadge + ' <small style="margin-left:10px;color:#888;">(Zero-config for whole LAN)</small></div></div>' +
				'<div class="tr"><div class="td" style="font-weight:bold;">dnsmasq Smart Adblock</div><div class="td">' + adblockBadge + ' <small style="margin-left:10px;color:#888;">(0 extra daemons, RAM optimized)</small></div></div>' +
				'</div>';
		};

		// Quick Action Buttons
		var actions = s.option(form.DummyValue, '_actions', _('Quick Actions'));
		actions.rawhtml = true;
		actions.cfgvalue = function() {
			return '<div style="margin-top:12px;">' +
				'<button class="btn cbi-button-action" onclick="window.runetFixAction(\'restart\')">' + _('Restart Services') + '</button> ' +
				'<button class="btn cbi-button-save" onclick="window.runetFixAction(\'update_adblock\')">' + _('Update Adblock Now') + '</button> ' +
				'<button class="btn cbi-button-neutral" onclick="window.runetFixAction(\'test\')">' + _('Run Diagnostics') + '</button>' +
				'</div>' +
				'<script>' +
				'window.runetFixAction = function(act) {' +
				'  var btn = event.target;' +
				'  btn.disabled = true;' +
				'  btn.innerText = "Processing...";' +
				'  var cmd = "/usr/bin/runet-fix";' +
				'  var args = [act];' +
				'  L.resolveDefault(L.Request.get("/cgi-bin/luci/admin/services/runet-fix"), {}).then(function() {' +
				'     return fs.exec_direct(cmd, args);' +
				'  }).then(function(res) {' +
				'     btn.disabled = false;' +
				'     btn.innerText = "Done!";' +
				'     location.reload();' +
				'  }).catch(function() {' +
				'     btn.disabled = false;' +
				'     btn.innerText = "Error";' +
				'  });' +
				'};' +
				'</script>';
		};

		return m.render();
	}
});
