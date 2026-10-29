'use strict';
'require view';
'require form';
'require fs';
'require ui';

var I18N = {
	ru: {
		title: 'Прозрачный обход блокировок Telegram (tg-ws-proxy)',
		desc: 'Прозрачно перенаправляет трафик Telegram через реле WebSocket / Cloudflare Worker, полностью обходя замедление и блокировки ТСПУ без настройки прокси на клиентских устройствах.',
		lang_label: 'Язык:',
		section_title: 'Настройки прозрачного перенаправления',
		enable: 'Включить прозрачный прокси Telegram',
		enable_desc: 'Перехватывает исходящие соединения с дата-центрами Telegram и туннелирует их через реле WebSocket / Worker.',
		how_it_works_title: 'Как работает прозрачный режим:',
		how_it_works_text: 'Все устройства в вашей домашней сети (смартфоны, планшеты, ПК) будут подключаться к Telegram на максимальной скорости автоматически. Настраивать прокси в самом приложении Telegram НЕ требуется.',
		worker_guide_title: 'Инструкция: как создать собственный бесплатный Cloudflare Worker (2 минуты):',
		worker_guide_text: '1. Зарегистрируйтесь на dash.cloudflare.com и перейдите в <b>Workers & Pages</b> → <b>Create application</b>.<br>' +
			'2. Нажмите <b>Create Worker</b> → <b>Deploy</b> → затем <b>Edit code</b>.<br>' +
			'3. Вставьте стандартный скрипт вебсокет-моста (import { connect } from "cloudflare:sockets" ... connect({ hostname: dst, port: 443 })).<br>' +
			'4. Скопируйте полученный домен <code>*.workers.dev</code> и вставьте в поле <b>Cloudflare Workers</b> ниже.',
		port: 'Локальный порт перенаправления',
		port_desc: 'Внутренний порт роутера, на который файрвол перенаправляет трафик Telegram (по умолчанию 1443).',
		workers: 'Cloudflare Workers (Рекомендуется)',
		workers_desc: 'Адрес вашего бесплатного Cloudflare Worker (например: my-tg.username.workers.dev). Обеспечивает 100% стабильный обход замедлений и мгновенную загрузку медиа. Можно указать несколько через запятую.',
		domains: 'Пользовательские домены Cloudflare (CfProxy)',
		domains_desc: 'Собственные домены, привязанные к Cloudflare (kws1..kws5). Оставьте пустым, если используете Cloudflare Worker.',
		secret: 'Секрет MTProxy (опционально, Dual Mode)',
		secret_desc: 'Если указан 32-значный hex-секрет, прокси также принимает ручные подключения по ссылке tg://proxy?server=IP&port=1443&secret=...'
	},
	en: {
		title: 'Telegram Transparent Bypass (tg-ws-proxy)',
		desc: 'Transparently redirects Telegram traffic via WebSocket relays / Cloudflare Worker, completely bypassing TSPU throttling and blocking without requiring proxy configuration on client devices.',
		lang_label: 'Language:',
		section_title: 'Transparent Redirection Settings',
		enable: 'Enable Telegram Transparent Proxy',
		enable_desc: 'Intercepts outgoing Telegram DC connections and tunnels them over WebSocket / Worker relays.',
		how_it_works_title: 'How Transparent Mode Works:',
		how_it_works_text: 'All devices connected to this router (smartphones, tablets, PCs) connect to Telegram at full speed automatically. No manual proxy setup inside the Telegram app is needed.',
		worker_guide_title: 'Guide: How to set up a free Cloudflare Worker (2 minutes):',
		worker_guide_text: '1. Log into dash.cloudflare.com and go to <b>Workers & Pages</b> → <b>Create application</b>.<br>' +
			'2. Click <b>Create Worker</b> → <b>Deploy</b> → then <b>Edit code</b>.<br>' +
			'3. Paste the standard websocket bridge script (import { connect } from "cloudflare:sockets" ... connect({ hostname: dst, port: 443 })).<br>' +
			'4. Copy your resulting <code>*.workers.dev</code> domain and paste it into the <b>Cloudflare Workers</b> field below.',
		port: 'Local Redirection Port',
		port_desc: 'Internal router port where intercepted Telegram traffic is redirected (default: 1443).',
		workers: 'Cloudflare Workers (Recommended)',
		workers_desc: 'Address of your free Cloudflare Worker (e.g. my-tg.username.workers.dev). Provides 100% reliable bypass of throttling and instant photo/video loading. Multiple can be comma-separated.',
		domains: 'Custom Cloudflare Domains (CfProxy)',
		domains_desc: 'Custom domains pointed to Cloudflare (kws1..kws5). Leave empty if using Cloudflare Worker.',
		secret: 'MTProxy Secret (Optional, Dual Mode)',
		secret_desc: 'Optional 32-character hex secret allowing manual connections via tg://proxy?server=IP&port=1443&secret=...'
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
			return '<div class="alert-message notice" style="margin-top:5px;margin-bottom:10px;">' +
				'<strong>' + t.how_it_works_title + '</strong><br>' +
				t.how_it_works_text +
				'</div>' +
				'<div class="alert-message info" style="margin-top:5px;margin-bottom:15px;font-size:12px;line-height:1.6;">' +
				'<strong>' + t.worker_guide_title + '</strong><br>' +
				t.worker_guide_text +
				'</div>';
		};

		var workers = s.option(form.Value, 'custom_workers', t.workers, t.workers_desc);
		workers.placeholder = 'my-tg-worker.username.workers.dev';

		var domains = s.option(form.Value, 'custom_domains', t.domains, t.domains_desc);
		domains.placeholder = 'mydomain.com';

		var port = s.option(form.Value, 'port', t.port, t.port_desc);
		port.datatype = 'port';
		port.default = '1443';

		var secret = s.option(form.Value, 'secret', t.secret, t.secret_desc);
		secret.placeholder = 'e.g. ee00112233445566778899aabbccddeeff';

		return m.render();
	}
});
