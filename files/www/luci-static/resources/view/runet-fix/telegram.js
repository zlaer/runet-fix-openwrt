'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require uci';

var I18N = {
	ru: {
		title: 'Обход блокировок Telegram (tg-ws-proxy)',
		desc: 'Перенаправляет трафик Telegram через реле WebSocket / Cloudflare Worker (архитектура Flowseal и zapret-tv-bridge). Поддерживает как прозрачный режим (без настройки устройств), так и прямое подключение MTProto в 1 клик.',
		lang_label: 'Язык:',
		section_title: 'Настройки прокси Telegram',
		enable: 'Включить прокси Telegram',
		enable_desc: 'Перехватывает исходящие соединения с дата-центрами Telegram и туннелирует их через реле WebSocket / Worker.',
		how_it_works_title: 'Как работает режим обхода:',
		how_it_works_text: '1. <b>Прозрачный режим</b>: устройства в локальной сети (смартфоны, ТВ, ПК) подключаются к Telegram автоматически.<br>' +
			'2. <b>Режим MTProto Proxy</b>: вы можете в 1 клик подключить прокси в официальном клиенте Telegram по ссылке ниже (подходит для любых сетей).',
		quick_connect_title: 'Быстрое подключение MTProto Proxy (1 клик):',
		btn_connect_tg: 'Подключить в Telegram',
		btn_open_tme: 'Ссылка t.me',
		btn_copy: 'Копировать',
		btn_gen_secret: 'Сгенерировать случайный секрет',
		secret_label: 'Ключ подключения',
		no_secret_warning: 'Секрет MTProxy еще не сгенерирован. Нажмите кнопку «Сгенерировать случайный секрет» ниже или введите свой 32-значный ключ и нажмите «Сохранить и применить».',
		worker_guide_title: 'Инструкция: как создать собственный бесплатный Cloudflare Worker (2 минуты):',
		worker_guide_text: '1. Зарегистрируйтесь на dash.cloudflare.com и перейдите в <b>Workers & Pages</b> → <b>Create application</b>.<br>' +
			'2. Нажмите <b>Create Worker</b> → <b>Deploy</b> → затем <b>Edit code</b>.<br>' +
			'3. Вставьте стандартный скрипт вебсокет-моста (import { connect } from "cloudflare:sockets" ... connect({ hostname: dst, port: 443 })).<br>' +
			'4. Скопируйте полученный домен <code>*.workers.dev</code> и вставьте в поле <b>Cloudflare Workers</b> ниже.',
		port: 'Локальный порт прокси',
		port_desc: 'Внутренний порт роутера, на котором слушает сервис (по умолчанию 1443).',
		workers: 'Cloudflare Workers (Рекомендуется)',
		workers_desc: 'Адрес вашего бесплатного Cloudflare Worker (например: my-tg.username.workers.dev). Обеспечивает 100% стабильный обход замедлений и мгновенную загрузку фото/видео. Можно указать несколько через запятую.',
		domains: 'Пользовательские домены Cloudflare (CfProxy)',
		domains_desc: 'Собственные домены, привязанные к Cloudflare (kws1..kws5). Оставьте пустым, если используете Cloudflare Worker.',
		fake_tls: 'Маскирующий домен Fake TLS (SNI)',
		fake_tls_desc: 'Домен для маскировки TLS ClientHello (например, cloudflare.com или google.com). Включает защищенный ee-секрет.',
		secret: 'Секрет MTProxy (32 hex-символа)',
		secret_desc: 'Секретный ключ для авторизации подключений к MTProto прокси. Генерируется автоматически или задается вручную.'
	},
	en: {
		title: 'Telegram Bypass Proxy (tg-ws-proxy)',
		desc: 'Redirects Telegram traffic via WebSocket relays / Cloudflare Worker (Flowseal & zapret-tv-bridge architecture). Supports both transparent mode (zero client configuration) and 1-click MTProto proxy connection.',
		lang_label: 'Language:',
		section_title: 'Telegram Proxy Settings',
		enable: 'Enable Telegram Proxy',
		enable_desc: 'Intercepts Telegram DC connections and tunnels them over WebSocket / Worker relays.',
		how_it_works_title: 'How Bypass Modes Work:',
		how_it_works_text: '1. <b>Transparent mode</b>: devices on your LAN (phones, TVs, PCs) connect to Telegram automatically.<br>' +
			'2. <b>MTProto Proxy mode</b>: you can connect in 1 click using the Telegram MTProxy link below.',
		quick_connect_title: '1-Click MTProto Proxy Connection:',
		btn_connect_tg: 'Connect in Telegram',
		btn_open_tme: 't.me Link',
		btn_copy: 'Copy',
		btn_gen_secret: 'Generate Random Secret',
		secret_label: 'Connection Key',
		no_secret_warning: 'MTProxy secret is not generated yet. Click "Generate Random Secret" below or enter a 32-character hex key and click Save & Apply.',
		worker_guide_title: 'Guide: How to set up a free Cloudflare Worker (2 minutes):',
		worker_guide_text: '1. Log into dash.cloudflare.com and go to <b>Workers & Pages</b> → <b>Create application</b>.<br>' +
			'2. Click <b>Create Worker</b> → <b>Deploy</b> → then <b>Edit code</b>.<br>' +
			'3. Paste the standard websocket bridge script (import { connect } from "cloudflare:sockets" ... connect({ hostname: dst, port: 443 })).<br>' +
			'4. Copy your resulting <code>*.workers.dev</code> domain and paste it into the <b>Cloudflare Workers</b> field below.',
		port: 'Local Proxy Port',
		port_desc: 'Internal router port where the proxy daemon listens (default: 1443).',
		workers: 'Cloudflare Workers (Recommended)',
		workers_desc: 'Address of your free Cloudflare Worker (e.g. my-tg.username.workers.dev). Provides 100% reliable bypass of throttling and instant photo/video loading. Multiple can be comma-separated.',
		domains: 'Custom Cloudflare Domains (CfProxy)',
		domains_desc: 'Custom domains pointed to Cloudflare (kws1..kws5). Leave empty if using Cloudflare Worker.',
		fake_tls: 'Fake TLS Masking Domain (SNI)',
		fake_tls_desc: 'Domain used to mask TLS ClientHello (e.g. cloudflare.com or google.com). Activates ee-secret masking.',
		secret: 'MTProxy Secret (32 hex characters)',
		secret_desc: 'Secret key for MTProto proxy authentication. Generated automatically or entered manually.'
	}
};

return view.extend({
	load: function() {
		return uci.load('runet-fix');
	},

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
			var host = window.location.hostname || '192.168.1.1';
			var sec = uci.get('runet-fix', 'telegram', 'secret') || '';
			var p = uci.get('runet-fix', 'telegram', 'port') || '1443';
			var ftls = uci.get('runet-fix', 'telegram', 'fake_tls_domain') || '';

			var connectBlock = '';
			if (sec && sec.length === 32) {
				var fullSec = 'dd' + sec;
				if (ftls) {
					var hexDomain = Array.from(new TextEncoder().encode(ftls)).map(function(b) {
						return b.toString(16).padStart(2, '0');
					}).join('');
					fullSec = 'ee' + sec + hexDomain;
				}
				var tgUrl = 'tg://proxy?server=' + host + '&port=' + p + '&secret=' + fullSec;
				var tmeUrl = 'https://t.me/proxy?server=' + host + '&port=' + p + '&secret=' + fullSec;

				connectBlock = '<div style="background:#1e293b;padding:14px 16px;border-radius:6px;margin-top:10px;margin-bottom:12px;border:1px solid #334155;">' +
					'<div style="font-weight:bold;color:#38bdf8;margin-bottom:8px;font-size:13px;">' + t.quick_connect_title + '</div>' +
					'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
					'<a class="btn" style="background:#0284c7;color:#fff;font-weight:bold;padding:6px 16px;text-decoration:none;border-radius:4px;" href="' + tgUrl + '">' + t.btn_connect_tg + '</a>' +
					'<a class="btn" style="background:#334155;color:#e2e8f0;padding:6px 16px;text-decoration:none;border-radius:4px;" href="' + tmeUrl + '" target="_blank">' + t.btn_open_tme + '</a>' +
					'</div>' +
					'<div style="font-size:12px;color:#cbd5e1;">' +
					'<span>' + t.secret_label + ': <code style="color:#facc15;font-size:12px;">' + fullSec + '</code></span> ' +
					'<button type="button" class="btn" style="padding:2px 10px;font-size:11px;margin-left:8px;" onclick="navigator.clipboard.writeText(\'' + fullSec + '\');this.innerText=\'OK\';setTimeout(function(b){b.innerText=\'' + t.btn_copy + '\';}, 1500, this);">' + t.btn_copy + '</button>' +
					'</div>' +
					'</div>';
			}

			return '<div class="alert-message notice" style="margin-top:5px;margin-bottom:10px;">' +
				'<strong>' + t.how_it_works_title + '</strong><br>' +
				t.how_it_works_text +
				'</div>' +
				connectBlock +
				'<div class="alert-message info" style="margin-top:5px;margin-bottom:15px;font-size:12px;line-height:1.6;">' +
				'<strong>' + t.worker_guide_title + '</strong><br>' +
				t.worker_guide_text +
				'</div>';
		};

		var workers = s.option(form.Value, 'custom_workers', t.workers, t.workers_desc);
		workers.placeholder = 'my-tg-worker.username.workers.dev';

		var domains = s.option(form.Value, 'custom_domains', t.domains, t.domains_desc);
		domains.placeholder = 'mydomain.com';

		var fakeTls = s.option(form.Value, 'fake_tls_domain', t.fake_tls, t.fake_tls_desc);
		fakeTls.placeholder = 'cloudflare.com';

		var port = s.option(form.Value, 'port', t.port, t.port_desc);
		port.datatype = 'port';
		port.default = '1443';

		var secret = s.option(form.Value, 'secret', t.secret, t.secret_desc);
		secret.placeholder = 'e.g. 75febd06a20f38f1d1151919a0540b13';

		var genBtn = s.option(form.Button, '_gen_sec');
		genBtn.title = t.btn_gen_secret;
		genBtn.inputtitle = t.btn_gen_secret;
		genBtn.inputstyle = 'action';
		genBtn.onclick = function() {
			var rnd = '';
			var chars = '0123456789abcdef';
			for (var i = 0; i < 32; i++) {
				rnd += chars.charAt(Math.floor(Math.random() * chars.length));
			}
			var el = document.getElementById('cbid.runet-fix.telegram.secret');
			if (el) {
				el.value = rnd;
				el.dispatchEvent(new Event('change', { bubbles: true }));
			}
		};

		return m.render();
	}
});
