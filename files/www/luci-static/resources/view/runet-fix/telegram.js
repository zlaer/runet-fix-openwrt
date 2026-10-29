'use strict';
'require view';
'require form';

return view.extend({
	render: function() {
		var m = new form.Map('runet-fix', _('Telegram Transparent Bypass (tg-ws-proxy)'),
			_('Transparently redirects and encapsulates all Telegram traffic into Cloudflare WebSockets, completely bypassing TSPU throttling and blocking without requiring any proxy setup on client devices.'));

		var s = m.section(form.NamedSection, 'telegram', 'telegram', _('Transparent Redirection Settings'));

		s.option(form.Flag, 'enabled', _('Enable Telegram Transparent Proxy'),
			_('Intercepts outgoing Telegram DC connections and tunnels them over WebSocket relays.'));

		var desc = s.option(form.DummyValue, '_desc');
		desc.rawhtml = true;
		desc.cfgvalue = function() {
			return '<div class="alert-message notice" style="margin-top:5px;margin-bottom:15px;">' +
				'<strong>' + _('How Transparent Mode Works:') + '</strong><br>' +
				_('All devices connected to this router (smartphones, tablets, PCs) will connect to Telegram at full speed automatically. ') +
				_('You <strong>do not need</strong> to install or configure any proxy in the Telegram app!') +
				'</div>';
		};

		var engine = s.option(form.ListValue, 'engine', _('Proxy Engine Backend'),
			_('Choose execution runtime. Native C offers extreme memory efficiency (~1.2MB RAM); Python offers rich asyncio balancing.'));
		engine.value('auto', _('Auto-detect (Native C if present, else Python)'));
		engine.value('c_native', _('Native C Daemon (tg-transproxy, ~1.2MB RAM)'));
		engine.value('python', _('Python Asyncio Daemon (tg_ws_transparent.py)'));
		engine.default = 'auto';

		var port = s.option(form.Value, 'port', _('Local Redirection Port'),
			_('Internal port where intercepted Telegram traffic is redirected by firewall.'));
		port.datatype = 'port';
		port.default = '1443';

		var domains = s.option(form.Value, 'custom_domains', _('Custom Cloudflare Relay Domains'),
			_('Comma-separated list of Cloudflare relay base domains. Leave empty to use community active pool (virkgj.co.uk, vmmzovy.co.uk, etc.).'));
		domains.placeholder = 'virkgj.co.uk, vmmzovy.co.uk';

		var workers = s.option(form.Value, 'custom_workers', _('Custom Cloudflare Worker Endpoints'),
			_('Optional custom Cloudflare Workers for private dedicated relaying.'));
		workers.placeholder = 'my-tg-worker.yourname.workers.dev';

		var secret = s.option(form.Value, 'secret', _('Optional MTProxy Secret (Dual Mode)'),
			_('If configured, the proxy will also accept traditional MTProto proxy connections with this secret, while still handling transparent connections.'));
		secret.placeholder = 'e.g. ee00112233445566778899aabbccddeeff';

		return m.render();
	}
});
