'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require uci';

var I18N = {
	ru: {
		title: 'Прозрачный шлюз Telegram (Без настройки на устройствах)',
		desc: 'Автоматически перехватывает и туннелирует трафик Telegram на уровне роутера. На смартфонах, компьютерах и Smart TV настраивать прокси НЕ нужно — Telegram работает штатно для всех устройств в домашней сети.',
		lang_label: 'Язык:',
		section_title: 'Параметры прозрачного шлюза',
		enable: 'Включить прозрачный шлюз Telegram',
		enable_desc: 'Файрвол роутера автоматически перехватывает соединения к дата-центрам Telegram и туннелирует их в обход ТСПУ.',
		zero_conf_title: 'Режим без настройки устройств (Zero Configuration):',
		zero_conf_text: 'Все устройства в вашей сети (iPhone, Android, Windows, Mac, Smart TV) подключаются к Telegram автоматически.<br>Вам <b>не нужно</b> включать прокси в настройках Telegram на телефонах или компьютерах.',
		worker_spoiler_title: 'Настройка Cloudflare Worker (дополнительно)',
		worker_field: 'Cloudflare Worker (Адрес реле)',
		worker_desc: 'Адрес вашего бесплатного воркера (например: my-tg.username.workers.dev). Роутер пропускает через него трафик Telegram всех устройств, полностью обходя блокировку провайдера и ускоряя загрузку фото/видео. Можно указать несколько через запятую.',
		worker_guide_title: 'Как получить бесплатный адрес Cloudflare Worker (2 минуты):',
		worker_guide_text: '1. Зарегистрируйтесь на <a href="https://dash.cloudflare.com" target="_blank" style="color:#38bdf8;text-decoration:underline;">dash.cloudflare.com</a> и перейдите в <b>Workers & Pages</b> → <b>Create application</b>.<br>' +
			'2. Нажмите <b>Create Worker</b> → <b>Deploy</b> → затем <b>Edit code</b>.<br>' +
			'3. Замените код скрипта на код ниже и нажмите <b>Deploy</b>:<br>' +
			'<pre style="background:#0f172a;color:#38bdf8;padding:8px 12px;border-radius:4px;font-size:11px;margin:6px 0;max-height:120px;overflow:auto;">import { connect } from "cloudflare:sockets";\nexport default {\n  async fetch(req) {\n    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected WS", {status:426});\n    const dst = new URL(req.url).searchParams.get("dst");\n    const pair = new WebSocketPair();\n    pair[1].accept();\n    const tcp = connect({ hostname: dst, port: 443 });\n    const w = tcp.writable.getWriter();\n    pair[1].addEventListener("message", async e => { try { await w.write(e.data); } catch { pair[1].close(); } });\n    (async () => { const r = tcp.readable.getReader(); while (true) { const {value, done} = await r.read(); if (done) break; pair[1].send(value); } pair[1].close(); })();\n    return new Response(null, { status: 101, webSocket: pair[0] });\n  }\n};</pre>' +
			'4. Скопируйте полученный домен (<code>*.workers.dev</code>) и вставьте в поле выше.',
		port: 'Порт внутреннего сервиса',
		port_desc: 'Локальный порт роутера для прозрачной маршрутизации (по умолчанию 1443).',
		domains: 'Дополнительные домены Cloudflare (CfProxy)',
		domains_desc: 'Пользовательские домены, направленные на Cloudflare (kws1..kws5). Оставьте пустым, если указан Worker.',
		manual_title: 'Дополнительно: Ручное подключение MTProxy',
		manual_desc: 'Если вам требуется подключить гостевое устройство вне домашней сети или использовать прямое MTProto-подключение:',
		btn_connect_tg: 'Подключить в Telegram',
		btn_open_tme: 'Ссылка t.me',
		btn_copy: 'Копировать',
		btn_gen_secret: 'Сгенерировать новый секрет',
		secret_label: 'Секрет MTProxy'
	},
	en: {
		title: 'Telegram Transparent Gateway (Zero Client Configuration)',
		desc: 'Automatically intercepts and tunnels Telegram traffic at the router level. No proxy configuration is required on phones, PCs, or Smart TVs — Telegram works out-of-the-box for all LAN devices.',
		lang_label: 'Language:',
		section_title: 'Transparent Gateway Parameters',
		enable: 'Enable Telegram Transparent Gateway',
		enable_desc: 'Router firewall intercepts outgoing Telegram DC traffic and tunnels it around ISP throttling.',
		zero_conf_title: 'Zero Client Configuration Mode:',
		zero_conf_text: 'All devices on your network (iPhone, Android, Windows, Mac, Smart TV) connect to Telegram automatically.<br>You <b>do not</b> need to configure proxy settings in Telegram apps on any device.',
		worker_spoiler_title: 'Cloudflare Worker Setup (Advanced)',
		worker_field: 'Cloudflare Worker (Relay Address)',
		worker_desc: 'Address of your free Cloudflare Worker (e.g. my-tg.username.workers.dev). Router tunnels Telegram traffic for all home devices through this relay, bypassing ISP blocks. Multiple can be comma-separated.',
		worker_guide_title: 'How to get a free Cloudflare Worker address (2 minutes):',
		worker_guide_text: '1. Register at <a href="https://dash.cloudflare.com" target="_blank" style="color:#38bdf8;text-decoration:underline;">dash.cloudflare.com</a> and go to <b>Workers & Pages</b> → <b>Create application</b>.<br>' +
			'2. Click <b>Create Worker</b> → <b>Deploy</b> → then <b>Edit code</b>.<br>' +
			'3. Paste the websocket bridge script and click <b>Deploy</b>.<br>' +
			'4. Copy your assigned <code>*.workers.dev</code> address and paste it into the field above.',
		port: 'Internal Service Port',
		port_desc: 'Local router port where transparent traffic is handled (default: 1443).',
		domains: 'Custom Cloudflare Relay Domains (CfProxy)',
		domains_desc: 'Custom domains pointed to Cloudflare (kws1..kws5). Leave empty if using Worker.',
		manual_title: 'Optional: Manual MTProxy Connection',
		manual_desc: 'Use only if connecting guest devices outside your home network:',
		btn_connect_tg: 'Connect in Telegram',
		btn_open_tme: 't.me Link',
		btn_copy: 'Copy',
		btn_gen_secret: 'Generate New Secret',
		secret_label: 'MTProxy Secret'
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
			return '<div class="alert-message notice" style="margin-top:5px;margin-bottom:12px;font-size:13px;line-height:1.6;">' +
				'<strong>' + t.zero_conf_title + '</strong><br>' +
				t.zero_conf_text +
				'</div>';
		};

		var workers = s.option(form.Value, 'custom_workers', t.worker_field, t.worker_desc);
		workers.placeholder = 'my-tg-worker.username.workers.dev';

		var origWorkersRender = workers.render;
		workers.render = function(option_index, section_id, in_table) {
			return origWorkersRender.apply(this, arguments).then(function(node) {
				var val = uci.get('runet-fix', section_id, 'custom_workers') || '';
				var hasValue = val.trim().length > 0;
				var details = E('details', {
					'style': 'background:#1e293b;padding:12px 16px;border-radius:6px;margin:15px 0;border:1px solid #334155;'
				}, [
					E('summary', {
						'style': 'font-weight:bold;color:#38bdf8;cursor:pointer;font-size:13px;'
					}, t.worker_spoiler_title),
					E('div', {
						'class': 'alert-message info',
						'style': 'margin-top:12px;margin-bottom:12px;font-size:12px;line-height:1.6;'
					}),
					node
				]);
				if (hasValue) {
					details.setAttribute('open', '');
				}
				details.querySelector('.alert-message.info').innerHTML =
					'<strong>' + t.worker_guide_title + '</strong><br>' + t.worker_guide_text;
				return details;
			});
		};

		var port = s.option(form.Value, 'port', t.port, t.port_desc);
		port.datatype = 'port';
		port.default = '1443';

		var domains = s.option(form.Value, 'custom_domains', t.domains, t.domains_desc);
		domains.placeholder = 'mydomain.com';

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

			return '<details style="background:#1e293b;padding:12px 16px;border-radius:6px;margin-top:15px;border:1px solid #334155;">' +
				'<summary style="font-weight:bold;color:#94a3b8;cursor:pointer;font-size:13px;">' + t.manual_title + '</summary>' +
				'<div style="margin-top:10px;font-size:12px;color:#cbd5e1;">' +
				'<p style="margin-bottom:10px;">' + t.manual_desc + '</p>' +
				'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
				'<a class="btn" style="background:#0284c7;color:#fff;font-weight:bold;padding:5px 14px;text-decoration:none;border-radius:4px;" href="' + tgUrl + '">' + t.btn_connect_tg + '</a>' +
				'<a class="btn" style="background:#334155;color:#e2e8f0;padding:5px 14px;text-decoration:none;border-radius:4px;" href="' + tmeUrl + '" target="_blank">' + t.btn_open_tme + '</a>' +
				'</div>' +
				'<span>' + t.secret_label + ': <code style="color:#facc15;">' + fullSec + '</code></span> ' +
				'<button type="button" class="btn" style="padding:2px 8px;font-size:11px;margin-left:6px;" onclick="navigator.clipboard.writeText(\'' + fullSec + '\');this.innerText=\'OK\';setTimeout(function(b){b.innerText=\'' + t.btn_copy + '\';}, 1500, this);">' + t.btn_copy + '</button>' +
				'</div>' +
				'</details>';
		};

		return m.render();
	}
});
