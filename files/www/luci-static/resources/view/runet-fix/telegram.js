'use strict';
'require view';
'require form';
'require fs';
'require ui';

var I18N = {
	ru: {
		title: 'Прозрачный обход блокировок Telegram (tg-ws-proxy)',
		desc: 'Прозрачно перенаправляет и инкапсулирует весь трафик Telegram в WebSockets Cloudflare, полностью обходя замедление и блокировки ТСПУ без настройки прокси на клиентских устройствах.',
		lang_label: 'Язык:',
		section_title: 'Настройки прозрачного перенаправления',
		enable: 'Включить прозрачный прокси Telegram',
		enable_desc: 'Перехватывает исходящие соединения с дата-центрами Telegram и туннелирует их через реле WebSocket.',
		how_it_works_title: 'Как работает прозрачный режим:',
		how_it_works_text: 'Все устройства в вашей домашней сети (смартфоны, планшеты, ПК) будут подключаться к Telegram на максимальной скорости автоматически. Вам НЕ нужно устанавливать или настраивать прокси в самом приложении Telegram!',
		engine: 'Движок прокси',
		engine_desc: 'Выберите среду выполнения. Нативный бинарник C обеспечивает минимальное потребление ОЗУ (~1.2 МБ); Python обеспечивает гибкую балансировку asyncio.',
		engine_auto: 'Автоопределение (C при наличии, иначе Python)',
		engine_c: 'Нативный демон C (tg-transproxy, ~1.2 МБ ОЗУ)',
		engine_py: 'Демон Python Asyncio (tg_ws_transparent.py)',
		port: 'Локальный порт перенаправления',
		port_desc: 'Внутренний порт роутера, на который файрвол перенаправляет трафик Telegram.',
		domains: 'Пользовательские домены-реле Cloudflare',
		domains_desc: 'Список базовых доменов-реле Cloudflare через запятую. Оставьте пустым для использования активного пула сообщества.',
		workers: 'Пользовательские эндпоинты Cloudflare Workers',
		workers_desc: 'Опциональные приватные воркеры Cloudflare для выделенного туннелирования.',
		secret: 'Секрет MTProxy (опционально, Dual Mode)',
		secret_desc: 'Если указан, прокси также будет принимать стандартные подключения MTProto с этим секретом, продолжая прозрачную маршрутизацию.'
	},
	en: {
		title: 'Telegram Transparent Bypass (tg-ws-proxy)',
		desc: 'Transparently redirects and encapsulates all Telegram traffic into Cloudflare WebSockets, completely bypassing TSPU throttling and blocking without requiring any proxy setup on client devices.',
		lang_label: 'Language:',
		section_title: 'Transparent Redirection Settings',
		enable: 'Enable Telegram Transparent Proxy',
		enable_desc: 'Intercepts outgoing Telegram DC connections and tunnels them over WebSocket relays.',
		how_it_works_title: 'How Transparent Mode Works:',
		how_it_works_text: 'All devices connected to this router (smartphones, tablets, PCs) will connect to Telegram at full speed automatically. You DO NOT need to install or configure any proxy in the Telegram app!',
		engine: 'Proxy Engine Backend',
		engine_desc: 'Choose execution runtime. Native C offers extreme memory efficiency (~1.2MB RAM); Python offers rich asyncio balancing.',
		engine_auto: 'Auto-detect (Native C if present, else Python)',
		engine_c: 'Native C Daemon (tg-transproxy, ~1.2MB RAM)',
		engine_py: 'Python Asyncio Daemon (tg_ws_transparent.py)',
		port: 'Local Redirection Port',
		port_desc: 'Internal port where intercepted Telegram traffic is redirected by firewall.',
		domains: 'Custom Cloudflare Relay Domains',
		domains_desc: 'Comma-separated list of Cloudflare relay base domains. Leave empty to use community active pool.',
		workers: 'Custom Cloudflare Worker Endpoints',
		workers_desc: 'Optional custom Cloudflare Workers for private dedicated relaying.',
		secret: 'Optional MTProxy Secret (Dual Mode)',
		secret_desc: 'If configured, the proxy will also accept traditional MTProto proxy connections with this secret, while still handling transparent connections.'
	}
};

return view.extend({
	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(function() {
			ui.changes.apply(mode == '0');
			return fs.exec('/usr/bin/runet-fix', ['restart']);
		});
	},

	render: function() {
		var curLang = localStorage.getItem('runet_fix_lang') || 'ru';
		if (curLang !== 'en' && curLang !== 'ru') curLang = 'ru';
		var t = I18N[curLang];

		window.setRunetFixLang = function(lang) {
			localStorage.setItem('runet_fix_lang', lang);
			location.reload();
		};

		var m = new form.Map('runet-fix', t.title, t.desc);

		// Top language bar
		var s_top = m.section(form.NamedSection, 'telegram', 'telegram');
		s_top.render = function() {
			var ruBtnStyle = curLang === 'ru' ? 'background:#007bff;color:#fff;font-weight:bold;' : 'background:#2c2c2c;color:#bbb;';
			var enBtnStyle = curLang === 'en' ? 'background:#007bff;color:#fff;font-weight:bold;' : 'background:#2c2c2c;color:#bbb;';
			return E('div', {
				'style': 'display:flex;justify-content:flex-end;align-items:center;margin-bottom:12px;gap:8px;'
			}, [
				E('span', { 'style': 'font-size:13px;color:#888;font-weight:bold;' }, t.lang_label),
				E('div', {
					'class': 'btn-group',
					'style': 'display:inline-flex;border-radius:4px;overflow:hidden;border:1px solid #444;'
				}, [
					E('button', {
						'type': 'button',
						'class': 'btn',
						'style': 'padding:4px 14px;font-size:12px;border:none;cursor:pointer;' + ruBtnStyle,
						'click': function() { window.setRunetFixLang('ru'); }
					}, 'RU'),
					E('button', {
						'type': 'button',
						'class': 'btn',
						'style': 'padding:4px 14px;font-size:12px;border:none;cursor:pointer;' + enBtnStyle,
						'click': function() { window.setRunetFixLang('en'); }
					}, 'ENG')
				])
			]);
		};

		var s = m.section(form.NamedSection, 'telegram', 'telegram', t.section_title);

		s.option(form.Flag, 'enabled', t.enable, t.enable_desc);

		var desc = s.option(form.DummyValue, '_desc');
		desc.rawhtml = true;
		desc.cfgvalue = function() {
			return '<div class="alert-message notice" style="margin-top:5px;margin-bottom:15px;">' +
				'<strong>' + t.how_it_works_title + '</strong><br>' +
				t.how_it_works_text +
				'</div>';
		};

		var engine = s.option(form.ListValue, 'engine', t.engine, t.engine_desc);
		engine.value('auto', t.engine_auto);
		engine.value('c_native', t.engine_c);
		engine.value('python', t.engine_py);
		engine.default = 'auto';

		var port = s.option(form.Value, 'port', t.port, t.port_desc);
		port.datatype = 'port';
		port.default = '1443';

		var domains = s.option(form.Value, 'custom_domains', t.domains, t.domains_desc);
		domains.placeholder = 'virkgj.co.uk, vmmzovy.co.uk';

		var workers = s.option(form.Value, 'custom_workers', t.workers, t.workers_desc);
		workers.placeholder = 'my-tg-worker.yourname.workers.dev';

		var secret = s.option(form.Value, 'secret', t.secret, t.secret_desc);
		secret.placeholder = 'e.g. ee00112233445566778899aabbccddeeff';

		return m.render();
	}
});
