'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';

return view.extend({
	load: function() {
		return uci.load('runet-fix');
	},

	render: function() {
		var m = new form.Map('runet-fix',
			_('Telegram Transparent Gateway (Zero Client Configuration)'),
			_('Automatically intercepts and tunnels Telegram traffic at the router level. No proxy configuration is required on phones, PCs, or Smart TVs — Telegram works out-of-the-box for all LAN devices.'));

		var s = m.section(form.NamedSection, 'telegram', 'telegram', _('Transparent Gateway Parameters'));

		var o_en = s.option(form.Flag, 'enabled', _('Enable Telegram Transparent Gateway'), _('Router firewall intercepts outgoing Telegram DC traffic and tunnels it around ISP throttling.'));
		o_en.rmempty = false;
		o_en.default = o_en.enabled;

		var desc = s.option(form.DummyValue, '_desc');
		desc.rawhtml = true;
		desc.cfgvalue = function() {
			return '<div class="alert-message notice" style="margin-top:5px;margin-bottom:12px;font-size:13px;line-height:1.6;">' +
				'<strong>' + _('Zero Client Configuration Mode:') + '</strong><br>' +
				_('All devices on your network (iPhone, Android, Windows, Mac, Smart TV) connect to Telegram automatically.<br>You <b>do not</b> need to configure proxy settings in Telegram apps on any device.') +
				'</div>';
		};

		var workersSlot = E('div', { 'class': 'rf-workers-slot' });
		var domainsSlot = E('div', { 'class': 'rf-domains-slot', 'style': 'margin-top:12px;' });

		var workerDetails = E('details', {
			'style': 'background:#1e293b;padding:12px 16px;border-radius:6px;margin:15px 0;border:1px solid #334155;'
		}, [
			E('summary', {
				'style': 'font-weight:bold;color:#38bdf8;cursor:pointer;font-size:13px;'
			}, _('Cloudflare Worker Setup (Advanced)')),
			E('div', {
				'class': 'alert-message info',
				'style': 'margin-top:12px;margin-bottom:12px;font-size:12px;line-height:1.6;'
			}),
			workersSlot,
			domainsSlot
		]);
		workerDetails.querySelector('.alert-message.info').innerHTML =
			'<strong>' + _('How to get a free Cloudflare Worker address (2 minutes):') + '</strong><br>' +
			_('1. Register at <a href="https://dash.cloudflare.com" target="_blank" style="color:#38bdf8;text-decoration:underline;">dash.cloudflare.com</a> and go to <b>Workers & Pages</b> → <b>Create application</b>.<br>' +
			'2. Click <b>Create Worker</b> → <b>Deploy</b> → then <b>Edit code</b>.<br>' +
			'3. Paste the websocket bridge script and click <b>Deploy</b>.<br>' +
			'4. Copy your assigned <code>*.workers.dev</code> address and paste it into the field above.');

		var workers = s.option(form.Value, 'custom_workers', _('Cloudflare Worker (Relay Address)'), _('Address of your free Cloudflare Worker (e.g. my-tg.username.workers.dev). Router tunnels Telegram traffic for all home devices through this relay, bypassing ISP blocks. Multiple can be comma-separated.'));
		workers.placeholder = 'my-tg-worker.username.workers.dev';

		var origWorkersRender = workers.render;
		workers.render = function(option_index, section_id, in_table) {
			return origWorkersRender.apply(this, arguments).then(function(node) {
				var valW = uci.get('runet-fix', section_id, 'custom_workers') || '';
				var valD = uci.get('runet-fix', section_id, 'custom_domains') || '';
				if (valW.trim().length > 0 || valD.trim().length > 0) {
					workerDetails.setAttribute('open', '');
				}
				workersSlot.appendChild(node);
				return workerDetails;
			});
		};

		var domains = s.option(form.Value, 'custom_domains', _('Custom Cloudflare Relay Domains (CfProxy)'), _('Custom domains pointed to Cloudflare (kws1..kws5). Leave empty if using Worker.'));
		domains.placeholder = 'mydomain.com';

		var origDomainsRender = domains.render;
		domains.render = function(option_index, section_id, in_table) {
			return origDomainsRender.apply(this, arguments).then(function(node) {
				var valD = uci.get('runet-fix', section_id, 'custom_domains') || '';
				if (valD.trim().length > 0) {
					workerDetails.setAttribute('open', '');
				}
				domainsSlot.appendChild(node);
				return E('span', { 'style': 'display:none' });
			});
		};

		var port = s.option(form.Value, 'port', _('Internal Service Port'), _('Local router port where transparent traffic is handled (default: 1443).'));
		port.datatype = 'port';
		port.default = '1443';

		// Optional manual section
		var manualSection = s.option(form.DummyValue, '_manual');
		manualSection.rawhtml = true;
		manualSection.cfgvalue = function() {
			var host = window.location.hostname || '192.168.1.1';
			var sec = uci.get('runet-fix', 'telegram', 'secret') || '75febd06a20f38f1d1151919a0540b13';
			var p = uci.get('runet-fix', 'telegram', 'port') || '1443';
			var fullSec = 'dd' + sec;
			var tgUrl = 'tg://proxy?server=' + host + '&port=' + p + '&secret=' + fullSec;
			var tmeUrl = 'https://t.me/proxy?server=' + host + '&port=' + p + '&secret=' + fullSec;
			var copyText = _('Copy');

			return '<details style="background:#1e293b;padding:12px 16px;border-radius:6px;margin-top:15px;border:1px solid #334155;">' +
				'<summary style="font-weight:bold;color:#94a3b8;cursor:pointer;font-size:13px;">' + _('Optional: Manual MTProxy Connection') + '</summary>' +
				'<div style="margin-top:10px;font-size:12px;color:#cbd5e1;">' +
				'<p style="margin-bottom:10px;">' + _('Use only if connecting guest devices outside your home network:') + '</p>' +
				'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
				'<a class="btn" style="background:#0284c7;color:#fff;font-weight:bold;padding:5px 14px;text-decoration:none;border-radius:4px;" href="' + tgUrl + '">' + _('Connect in Telegram') + '</a>' +
				'<a class="btn" style="background:#334155;color:#e2e8f0;padding:5px 14px;text-decoration:none;border-radius:4px;" href="' + tmeUrl + '" target="_blank">' + _('t.me Link') + '</a>' +
				'</div>' +
				'<span>' + _('MTProxy Secret') + ': <code style="color:#facc15;">' + fullSec + '</code></span> ' +
				'<button type="button" class="btn" style="padding:2px 8px;font-size:11px;margin-left:6px;" onclick="navigator.clipboard.writeText(\'' + fullSec + '\');this.innerText=\'OK\';setTimeout(function(b){b.innerText=\'' + copyText + '\';}, 1500, this);">' + copyText + '</button>' +
				'</div>' +
				'</details>';
		};

		return m.render();
	}
});
