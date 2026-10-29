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

var callInitAction = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

return view.extend({
	load: function() {
		return Promise.all([
			callServiceList('runet-fix'),
			fs.read('/tmp/runet-fix-adblock.count').then(function(res) {
				return parseInt((res || '').trim()) || 0;
			}).catch(function() {
				return fs.stat('/tmp/dnsmasq.d/runet-fix-adblock.conf').then(function(stat) {
					return (stat && stat.size > 0) ? Math.round(stat.size / 30) : 0;
				}).catch(function() { return 0; });
			})
		]);
	},

	render: function(data) {
		var serviceData = data[0] || {};
		var adblockRules = data[1] || 0;

		// Extract instances from procd
		var instances = (serviceData['runet-fix'] && serviceData['runet-fix'].instances) ? serviceData['runet-fix'].instances : {};
		var zapret = instances['zapret'] || null;
		var telegram = instances['telegram'] || null;

		var zapretRunning = zapret && zapret.running;
		var zapretPid = zapret ? zapret.pid : null;

		var telegramRunning = telegram && telegram.running;
		var telegramPid = telegram ? telegram.pid : null;

		var m = new form.Map('runet-fix', _('Runet Fix - All-in-One Dashboard'),
			_('Unified high-performance suite for OpenWrt: Zapret DPI bypass, Transparent Telegram WebSocket tunnel, and Smart Adblock.'));

		var s = m.section(form.NamedSection, 'main', 'global', _('Master Switch & System Overview'));

		s.option(form.Flag, 'enabled', _('Enable All Services'),
			_('Globally enables or disables all Runet-Fix subsystems.'));

		// Status Overview Table
		var o = s.option(form.DummyValue, '_status_table', _('Subsystem Status'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			var zapretBadge = zapretRunning ? 
				'<span class="badge" style="background:#28a745;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">RUNNING (PID ' + zapretPid + ')</span>' :
				'<span class="badge" style="background:#dc3545;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">STOPPED</span>';

			var tgBadge = telegramRunning ?
				'<span class="badge" style="background:#28a745;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">ACTIVE (PID ' + telegramPid + ')</span>' :
				'<span class="badge" style="background:#dc3545;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">STOPPED</span>';

			var adblockBadge = adblockRules > 0 ?
				'<span class="badge" style="background:#28a745;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">ACTIVE (' + adblockRules.toLocaleString() + ' domains)</span>' :
				'<span class="badge" style="background:#6c757d;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">INACTIVE</span>';

			return '<div class="table" style="margin-top:10px;">' +
				'<div class="tr"><div class="td" style="font-weight:bold;width:35%;">Zapret (YouTube 4K & Discord DPI)</div><div class="td">' + zapretBadge + '</div></div>' +
				'<div class="tr"><div class="td" style="font-weight:bold;">Telegram Transparent Proxy</div><div class="td">' + tgBadge + ' <small style="margin-left:10px;color:#888;">(Zero-config for whole LAN)</small></div></div>' +
				'<div class="tr"><div class="td" style="font-weight:bold;">dnsmasq Smart Adblock</div><div class="td">' + adblockBadge + ' <small style="margin-left:10px;color:#888;">(0 extra daemons, RAM optimized)</small></div></div>' +
				'</div>';
		};

		// Quick Action Buttons
		var actions = s.option(form.DummyValue, '_actions', _('Quick Actions'));
		actions.rawhtml = true;
		actions.cfgvalue = function() {
			return '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">' +
				'<button class="btn cbi-button-action" id="btn-restart" onclick="window.runetFixAction(\'restart\')">' + _('Restart Services') + '</button> ' +
				'<a class="btn cbi-button-action" style="text-decoration:none;display:inline-block;" href="zapret">' + _('⚡ Zapret Settings') + '</a> ' +
				'<button class="btn cbi-button-save" id="btn-adblock" onclick="window.runetFixAction(\'update_adblock\')">' + _('Update Adblock Now') + '</button> ' +
				'<button class="btn cbi-button-neutral" id="btn-refresh" onclick="location.reload()">' + _('Refresh Status') + '</button>' +
				'</div>' +
				'<script>' +
				'window.runetFixAction = function(act) {' +
				'  var btn = event.target;' +
				'  btn.disabled = true;' +
				'  var oldText = btn.innerText;' +
				'  btn.innerText = "Working...";' +
				'  fs.exec_direct("/usr/bin/runet-fix", [act]).then(function(res) {' +
				'     btn.innerText = "Success!";' +
				'     setTimeout(function() { location.reload(); }, 1200);' +
				'  }).catch(function(err) {' +
				'     btn.innerText = "Error";' +
				'     setTimeout(function() { btn.disabled = false; btn.innerText = oldText; }, 2000);' +
				'  });' +
				'};' +
				'</script>';
		};

		return m.render();
	}
});
