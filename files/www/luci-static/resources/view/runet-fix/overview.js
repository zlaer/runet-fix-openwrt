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

var I18N = {
	ru: {
		title: 'Runet Fix - Панель управления',
		desc: 'Единый комплекс для OpenWrt: обход блокировок Zapret DPI, прозрачный WebSocket туннель Telegram и умная блокировка рекламы.',
		lang_label: 'Язык:',
		master_section: 'Главный переключатель и состояние системы',
		enable_all: 'Включить все службы',
		enable_all_desc: 'Глобально включает или отключает все подсистемы Runet-Fix.',
		status_table: 'Состояние подсистем',
		zapret_name: 'Zapret (YouTube 4K и Discord DPI)',
		tg_name: 'Telegram Transparent Proxy',
		tg_sub: '(Без настройки клиентов, для всей сети)',
		adblock_name: 'dnsmasq Smart Adblock',
		adblock_sub: '(Без фоновых демонов, экономия ОЗУ)',
		running: 'РАБОТАЕТ',
		active: 'АКТИВЕН',
		stopped: 'ОСТАНОВЛЕН',
		inactive: 'НЕАКТИВЕН',
		domains: 'доменов',
		diag_section: 'Диагностика доступности сервисов (RuNet Health Probe)',
		diag_title: 'Проверка сетевых сервисов в реальном времени',
		diag_desc: 'Мгновенная проверка (1–2 сек): доступность YouTube 4K, Discord Gateway, Telegram туннеля и блокировки рекламы.',
		btn_run_diag: 'Проверить сервисы (1 сек)',
		btn_running_diag: 'Проверка...',
		card_yt: 'YouTube 4K (DPI)',
		card_dc: 'Discord Gateway',
		card_tg: 'Telegram WebSocket',
		card_dns: 'DNS и Adblock',
		not_checked: 'Не проверялось',
		checking: 'Проверка...',
		available: 'Доступен',
		blocked: 'Заблокирован',
		unavailable: 'Недоступен',
		connected: 'Подключен',
		tg_tunnel_active: '(Туннель :1443 активен)',
		blocking_active: '(Блокировка работает)',
		dns_ok: 'DNS OK',
		dns_err: 'Ошибка DNS',
		resp_err: 'Ошибка ответа',
		rpc_err: 'Ошибка RPC: ',
		actions_section: 'Быстрые действия',
		btn_restart: 'Перезапустить службы',
		btn_zapret_settings: 'Настройки Zapret',
		btn_update_adblock: 'Обновить Adblock',
		btn_refresh: 'Обновить статус',
		working: 'Выполняется...',
		success: 'Успешно!',
		error: 'Ошибка',
		danger_section: 'Удаление Runet-Fix',
		danger_desc: 'Полное и чистое удаление пакета Runet-Fix, остановка служб, сброс правил файрвола nftables, очистка cron и интерфейса LuCI.',
		btn_uninstall: 'Полностью удалить Runet-Fix',
		uninstall_confirm: 'Внимание! Вы действительно хотите полностью удалить Runet-Fix с роутера?\n\nБудут остановлены все службы, удалены правила файрвола nftables, очищен cron, удалены все скрипты, списки и веб-интерфейс LuCI.',
		uninstalling: 'Удаление Runet-Fix с роутера...',
		uninstall_done: 'Runet-Fix успешно удален. Перенаправление...'
	},
	en: {
		title: 'Runet Fix - All-in-One Dashboard',
		desc: 'Unified high-performance suite for OpenWrt: Zapret DPI bypass, Transparent Telegram WebSocket tunnel, and Smart Adblock.',
		lang_label: 'Language:',
		master_section: 'Master Switch & System Overview',
		enable_all: 'Enable All Services',
		enable_all_desc: 'Globally enables or disables all Runet-Fix subsystems.',
		status_table: 'Subsystem Status',
		zapret_name: 'Zapret (YouTube 4K & Discord DPI)',
		tg_name: 'Telegram Transparent Proxy',
		tg_sub: '(Zero-config for whole LAN)',
		adblock_name: 'dnsmasq Smart Adblock',
		adblock_sub: '(0 extra daemons, RAM optimized)',
		running: 'RUNNING',
		active: 'ACTIVE',
		stopped: 'STOPPED',
		inactive: 'INACTIVE',
		domains: 'domains',
		diag_section: 'Service Availability Diagnostics (RuNet Health Probe)',
		diag_title: 'Real-Time Network Health Probe',
		diag_desc: 'Instant verification (1–2 sec): YouTube 4K, Discord Gateway, Telegram tunnel, and adblock status.',
		btn_run_diag: 'Test Services (1 sec)',
		btn_running_diag: 'Testing...',
		card_yt: 'YouTube 4K (DPI)',
		card_dc: 'Discord Gateway',
		card_tg: 'Telegram WebSocket',
		card_dns: 'DNS & Adblock',
		not_checked: 'Not checked',
		checking: 'Testing...',
		available: 'Available',
		blocked: 'Blocked',
		unavailable: 'Unavailable',
		connected: 'Connected',
		tg_tunnel_active: '(Tunnel :1443 active)',
		blocking_active: '(Blocking active)',
		dns_ok: 'DNS OK',
		dns_err: 'DNS Error',
		resp_err: 'Response error',
		rpc_err: 'RPC Error: ',
		actions_section: 'Quick Actions',
		btn_restart: 'Restart Services',
		btn_zapret_settings: 'Zapret Settings',
		btn_update_adblock: 'Update Adblock Now',
		btn_refresh: 'Refresh Status',
		working: 'Working...',
		success: 'Success!',
		error: 'Error',
		danger_section: 'Uninstall Runet-Fix',
		danger_desc: 'Completely remove the Runet-Fix suite, stop all daemons, delete nftables firewall rules, clean cron schedule and LuCI web views.',
		btn_uninstall: 'Completely Uninstall Runet-Fix',
		uninstall_confirm: 'Warning! Are you sure you want to completely uninstall Runet-Fix from this router?\n\nAll services will be stopped, nftables rules removed, cron jobs cleaned, and all scripts, lists, and LuCI web views deleted.',
		uninstalling: 'Uninstalling Runet-Fix from router...',
		uninstall_done: 'Runet-Fix has been removed. Redirecting...'
	}
};

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
		var curLang = localStorage.getItem('runet_fix_lang') || 'ru';
		if (curLang !== 'en' && curLang !== 'ru') curLang = 'ru';
		var t = I18N[curLang];

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

		// Attach global window handlers with closures to fs and translations
		window.setRunetFixLang = function(lang) {
			localStorage.setItem('runet_fix_lang', lang);
			location.reload();
		};

		window.runRuNetHealthProbe = function() {
			var btn = document.getElementById('btn-run-probe');
			var resBox = document.getElementById('probe-results');
			var vYt = document.getElementById('val-yt');
			var vDc = document.getElementById('val-dc');
			var vTg = document.getElementById('val-tg');
			var vDns = document.getElementById('val-dns');
			var cYt = document.getElementById('card-yt');
			var cDc = document.getElementById('card-dc');
			var cTg = document.getElementById('card-tg');
			var cDns = document.getElementById('card-dns');

			if (btn) {
				btn.disabled = true;
				btn.innerText = t.btn_running_diag;
			}
			if (resBox) resBox.style.display = 'grid';
			if (vYt) vYt.innerHTML = '<span style="color:#ffc107;">' + t.checking + '</span>';
			if (vDc) vDc.innerHTML = '<span style="color:#ffc107;">' + t.checking + '</span>';
			if (vTg) vTg.innerHTML = '<span style="color:#ffc107;">' + t.checking + '</span>';
			if (vDns) vDns.innerHTML = '<span style="color:#ffc107;">' + t.checking + '</span>';

			function applyResult(parsed) {
				if (btn) {
					btn.disabled = false;
					btn.innerText = t.btn_run_diag;
				}
				if (!parsed) {
					if (vYt) vYt.innerHTML = '<span style="color:#dc3545;font-weight:bold;">' + t.resp_err + '</span>';
					return;
				}

				if (parsed.youtube && parsed.youtube.ok) {
					vYt.innerHTML = '<span style="color:#28a745;font-weight:bold;">' + t.available + '</span> <small style="color:#aaa;">(' + parsed.youtube.ms + 'ms)</small>';
					if (cYt) cYt.style.borderLeftColor = '#28a745';
				} else {
					vYt.innerHTML = '<span style="color:#dc3545;font-weight:bold;">' + t.blocked + '</span>';
					if (cYt) cYt.style.borderLeftColor = '#dc3545';
				}

				if (parsed.discord && parsed.discord.ok) {
					vDc.innerHTML = '<span style="color:#28a745;font-weight:bold;">' + t.available + '</span> <small style="color:#aaa;">(' + parsed.discord.ms + 'ms)</small>';
					if (cDc) cDc.style.borderLeftColor = '#28a745';
				} else {
					vDc.innerHTML = '<span style="color:#dc3545;font-weight:bold;">' + t.unavailable + '</span>';
					if (cDc) cDc.style.borderLeftColor = '#dc3545';
				}

				if (parsed.telegram && parsed.telegram.ok) {
					vTg.innerHTML = '<span style="color:#28a745;font-weight:bold;">' + t.connected + '</span> <small style="color:#aaa;">' + t.tg_tunnel_active + '</small>';
					if (cTg) cTg.style.borderLeftColor = '#28a745';
				} else {
					vTg.innerHTML = '<span style="color:#dc3545;font-weight:bold;">' + t.stopped + '</span>';
					if (cTg) cTg.style.borderLeftColor = '#dc3545';
				}

				if (parsed.dns && parsed.dns.ok && parsed.dns.adblock_ok) {
					vDns.innerHTML = '<span style="color:#28a745;font-weight:bold;">' + t.active + '</span> <small style="color:#aaa;">' + t.blocking_active + '</small>';
					if (cDns) cDns.style.borderLeftColor = '#28a745';
				} else if (parsed.dns && parsed.dns.ok) {
					vDns.innerHTML = '<span style="color:#28a745;font-weight:bold;">' + t.dns_ok + '</span>';
					if (cDns) cDns.style.borderLeftColor = '#28a745';
				} else {
					vDns.innerHTML = '<span style="color:#dc3545;font-weight:bold;">' + t.dns_err + '</span>';
					if (cDns) cDns.style.borderLeftColor = '#dc3545';
				}
			}

			// Execute test via ubus file exec
			fs.exec('/usr/bin/runet-fix', ['test', '--json']).then(function(res) {
				var stdout = (res && res.stdout) ? res.stdout.trim() : '';
				if (stdout) {
					try {
						var parsed = JSON.parse(stdout);
						applyResult(parsed);
						return;
					} catch(e) {}
				}
				// Fallback to reading /tmp/runet-fix-test.json
				return fs.read('/tmp/runet-fix-test.json').then(function(fcontent) {
					var parsed = JSON.parse((fcontent || '').trim());
					applyResult(parsed);
				}).catch(function() {
					applyResult(null);
				});
			}).catch(function(err) {
				fs.read('/tmp/runet-fix-test.json').then(function(fcontent) {
					var parsed = JSON.parse((fcontent || '').trim());
					applyResult(parsed);
				}).catch(function() {
					if (btn) {
						btn.disabled = false;
						btn.innerText = t.btn_run_diag;
					}
					if (vYt) vYt.innerHTML = '<span style="color:#dc3545;font-weight:bold;">' + t.rpc_err + (err.message || err) + '</span>';
				});
			});
		};

		window.runetFixAction = function(act) {
			var btn = (window.event && window.event.target) ? window.event.target : null;
			var oldText = btn ? btn.innerText : '';
			if (btn) {
				btn.disabled = true;
				btn.innerText = t.working;
			}
			fs.exec('/usr/bin/runet-fix', [act]).then(function() {
				if (btn) btn.innerText = t.success;
				setTimeout(function() { location.reload(); }, 1200);
			}).catch(function() {
				if (btn) {
					btn.innerText = t.error;
					setTimeout(function() { btn.disabled = false; btn.innerText = oldText; }, 2000);
				}
			});
		};

		window.runetFixUninstall = function() {
			if (!confirm(t.uninstall_confirm)) {
				return;
			}
			var btn = document.getElementById('btn-uninstall');
			if (btn) {
				btn.disabled = true;
				btn.innerText = t.uninstalling;
			}
			ui.showModal(t.danger_section, [
				E('p', { 'class': 'spinning' }, t.uninstalling)
			]);
			fs.exec('/usr/bin/runet-fix', ['uninstall']).then(function() {
				ui.hideModal();
				ui.addNotification(null, E('p', t.uninstall_done), 'info');
				setTimeout(function() {
					window.location.href = L.url('admin/status/overview');
				}, 2000);
			}).catch(function(err) {
				ui.hideModal();
				ui.addNotification(null, E('p', 'Uninstall error: ' + (err.message || err)), 'error');
				if (btn) {
					btn.disabled = false;
					btn.innerText = t.btn_uninstall;
				}
			});
		};

		var m = new form.Map('runet-fix', t.title, t.desc);

		// Top language bar
		var s_top = m.section(form.NamedSection, 'main', 'global');
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

		// 1. Master Switch & System Overview
		var s = m.section(form.NamedSection, 'main', 'global', t.master_section);

		s.option(form.Flag, 'enabled', t.enable_all, t.enable_all_desc);

		// Status Overview Table
		var o = s.option(form.DummyValue, '_status_table', t.status_table);
		o.rawhtml = true;
		o.cfgvalue = function() {
			var zapretBadge = zapretRunning ? 
				'<span class="badge" style="background:#28a745;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">' + t.running + ' (PID ' + zapretPid + ')</span>' :
				'<span class="badge" style="background:#dc3545;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">' + t.stopped + '</span>';

			var tgBadge = telegramRunning ?
				'<span class="badge" style="background:#28a745;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">' + t.active + ' (PID ' + telegramPid + ')</span>' :
				'<span class="badge" style="background:#dc3545;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">' + t.stopped + '</span>';

			var adblockBadge = adblockRules > 0 ?
				'<span class="badge" style="background:#28a745;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">' + t.active + ' (' + adblockRules.toLocaleString() + ' ' + t.domains + ')</span>' :
				'<span class="badge" style="background:#6c757d;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">' + t.inactive + '</span>';

			return '<div class="table" style="margin-top:10px;">' +
				'<div class="tr"><div class="td" style="font-weight:bold;width:35%;">' + t.zapret_name + '</div><div class="td">' + zapretBadge + '</div></div>' +
				'<div class="tr"><div class="td" style="font-weight:bold;">' + t.tg_name + '</div><div class="td">' + tgBadge + ' <small style="margin-left:10px;color:#888;">' + t.tg_sub + '</small></div></div>' +
				'<div class="tr"><div class="td" style="font-weight:bold;">' + t.adblock_name + '</div><div class="td">' + adblockBadge + ' <small style="margin-left:10px;color:#888;">' + t.adblock_sub + '</small></div></div>' +
				'</div>';
		};

		// 2. Live RuNet Health Probe Diagnostics
		var s_diag = m.section(form.NamedSection, 'main', 'global', t.diag_section);
		var probe_ui = s_diag.option(form.DummyValue, '_health_probe');
		probe_ui.rawhtml = true;
		probe_ui.cfgvalue = function() {
			return '<div id="probe-container" style="background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:14px;margin-top:6px;">' +
				'<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
				'  <div>' +
				'    <strong style="font-size:14px;color:#fff;">' + t.diag_title + '</strong><br>' +
				'    <small style="color:#aaa;">' + t.diag_desc + '</small>' +
				'  </div>' +
				'  <button type="button" class="btn cbi-button-action" id="btn-run-probe" style="padding:6px 16px;font-weight:bold;" onclick="window.runRuNetHealthProbe()">' + t.btn_run_diag + '</button>' +
				'</div>' +
				'<div id="probe-results" style="display:none;margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px;">' +
				'  <div id="card-yt" style="background:#282c34;padding:10px;border-radius:6px;border-left:4px solid #6c757d;">' +
				'    <div style="font-size:11px;color:#aaa;text-transform:uppercase;font-weight:bold;">' + t.card_yt + '</div>' +
				'    <div id="val-yt" style="font-size:14px;font-weight:bold;margin-top:4px;color:#fff;">' + t.not_checked + '</div>' +
				'  </div>' +
				'  <div id="card-dc" style="background:#282c34;padding:10px;border-radius:6px;border-left:4px solid #6c757d;">' +
				'    <div style="font-size:11px;color:#aaa;text-transform:uppercase;font-weight:bold;">' + t.card_dc + '</div>' +
				'    <div id="val-dc" style="font-size:14px;font-weight:bold;margin-top:4px;color:#fff;">' + t.not_checked + '</div>' +
				'  </div>' +
				'  <div id="card-tg" style="background:#282c34;padding:10px;border-radius:6px;border-left:4px solid #6c757d;">' +
				'    <div style="font-size:11px;color:#aaa;text-transform:uppercase;font-weight:bold;">' + t.card_tg + '</div>' +
				'    <div id="val-tg" style="font-size:14px;font-weight:bold;margin-top:4px;color:#fff;">' + t.not_checked + '</div>' +
				'  </div>' +
				'  <div id="card-dns" style="background:#282c34;padding:10px;border-radius:6px;border-left:4px solid #6c757d;">' +
				'    <div style="font-size:11px;color:#aaa;text-transform:uppercase;font-weight:bold;">' + t.card_dns + '</div>' +
				'    <div id="val-dns" style="font-size:14px;font-weight:bold;margin-top:4px;color:#fff;">' + t.not_checked + '</div>' +
				'  </div>' +
				'</div>' +
				'</div>';
		};

		// 3. Quick Action Buttons
		var actions = s.option(form.DummyValue, '_actions', t.actions_section);
		actions.rawhtml = true;
		actions.cfgvalue = function() {
			return '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">' +
				'<button type="button" class="btn cbi-button-action" id="btn-restart" onclick="window.runetFixAction(\'restart\')">' + t.btn_restart + '</button> ' +
				'<a class="btn cbi-button-action" style="text-decoration:none;display:inline-block;" href="zapret">' + t.btn_zapret_settings + '</a> ' +
				'<button type="button" class="btn cbi-button-save" id="btn-adblock" onclick="window.runetFixAction(\'update_adblock\')">' + t.btn_update_adblock + '</button> ' +
				'<button type="button" class="btn cbi-button-neutral" id="btn-refresh" onclick="location.reload()">' + t.btn_refresh + '</button>' +
				'</div>';
		};

		// 4. Danger Zone (Uninstallation)
		var s_danger = m.section(form.NamedSection, 'main', 'global', t.danger_section, t.danger_desc);
		var uninstall_ui = s_danger.option(form.DummyValue, '_uninstall');
		uninstall_ui.rawhtml = true;
		uninstall_ui.cfgvalue = function() {
			return '<div style="margin-top:8px;">' +
				'<button type="button" class="btn cbi-button-negative" id="btn-uninstall" style="padding:7px 18px;font-weight:bold;" onclick="window.runetFixUninstall()">' + t.btn_uninstall + '</button>' +
				'</div>';
		};

		return m.render();
	}
});
