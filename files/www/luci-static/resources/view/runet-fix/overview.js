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

		// Live RuNet Health Probe Diagnostics
		var s_diag = m.section(form.NamedSection, 'main', 'global', _('Диагностика доступности сервисов (RuNet Health Probe)'));
		var probe_ui = s_diag.option(form.DummyValue, '_health_probe');
		probe_ui.rawhtml = true;
		probe_ui.cfgvalue = function() {
			return '<div id="probe-container" style="background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:14px;margin-top:6px;">' +
				'<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
				'  <div>' +
				'    <strong style="font-size:14px;color:#fff;">⚡ Проверка сетевых сервисов в реальном времени</strong><br>' +
				'    <small style="color:#aaa;">Мгновенная проверка (1–2 сек): доступность YouTube 4K, Discord Gateway, Telegram туннеля и блокировки рекламы.</small>' +
				'  </div>' +
				'  <button class="btn cbi-button-action" id="btn-run-probe" style="padding:6px 16px;font-weight:bold;" onclick="window.runRuNetHealthProbe()">' + _('▶ Проверить сервисы (1 сек)') + '</button>' +
				'</div>' +
				'<div id="probe-results" style="display:none;margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px;">' +
				'  <div id="card-yt" style="background:#282c34;padding:10px;border-radius:6px;border-left:4px solid #6c757d;">' +
				'    <div style="font-size:11px;color:#aaa;text-transform:uppercase;font-weight:bold;">YouTube 4K (DPI)</div>' +
				'    <div id="val-yt" style="font-size:14px;font-weight:bold;margin-top:4px;color:#fff;">Не проверялось</div>' +
				'  </div>' +
				'  <div id="card-dc" style="background:#282c34;padding:10px;border-radius:6px;border-left:4px solid #6c757d;">' +
				'    <div style="font-size:11px;color:#aaa;text-transform:uppercase;font-weight:bold;">Discord Gateway</div>' +
				'    <div id="val-dc" style="font-size:14px;font-weight:bold;margin-top:4px;color:#fff;">Не проверялось</div>' +
				'  </div>' +
				'  <div id="card-tg" style="background:#282c34;padding:10px;border-radius:6px;border-left:4px solid #6c757d;">' +
				'    <div style="font-size:11px;color:#aaa;text-transform:uppercase;font-weight:bold;">Telegram WebSocket</div>' +
				'    <div id="val-tg" style="font-size:14px;font-weight:bold;margin-top:4px;color:#fff;">Не проверялось</div>' +
				'  </div>' +
				'  <div id="card-dns" style="background:#282c34;padding:10px;border-radius:6px;border-left:4px solid #6c757d;">' +
				'    <div style="font-size:11px;color:#aaa;text-transform:uppercase;font-weight:bold;">DNS &amp; Adblock</div>' +
				'    <div id="val-dns" style="font-size:14px;font-weight:bold;margin-top:4px;color:#fff;">Не проверялось</div>' +
				'  </div>' +
				'</div>' +
				'</div>' +
				'<script>' +
				'window.runRuNetHealthProbe = function() {' +
				'  var btn = document.getElementById("btn-run-probe");' +
				'  var resBox = document.getElementById("probe-results");' +
				'  var vYt = document.getElementById("val-yt");' +
				'  var vDc = document.getElementById("val-dc");' +
				'  var vTg = document.getElementById("val-tg");' +
				'  var vDns = document.getElementById("val-dns");' +
				'  var cYt = document.getElementById("card-yt");' +
				'  var cDc = document.getElementById("card-dc");' +
				'  var cTg = document.getElementById("card-tg");' +
				'  var cDns = document.getElementById("card-dns");' +
				'  btn.disabled = true;' +
				'  btn.innerText = "⏳ Замер...";' +
				'  resBox.style.display = "grid";' +
				'  vYt.innerHTML = "<span style=\'color:#ffc107;\'>Проверка...</span>";' +
				'  vDc.innerHTML = "<span style=\'color:#ffc107;\'>Проверка...</span>";' +
				'  vTg.innerHTML = "<span style=\'color:#ffc107;\'>Проверка...</span>";' +
				'  vDns.innerHTML = "<span style=\'color:#ffc107;\'>Проверка...</span>";' +
				'  fs.exec_direct("/usr/bin/runet-fix", ["test", "--json"]).then(function(res) {' +
				'    btn.disabled = false;' +
				'    btn.innerText = "▶ Проверить сервисы (1 сек)";' +
				'    try {' +
				'      var data = JSON.parse(res);' +
				'      if (data.youtube && data.youtube.ok) {' +
				'        vYt.innerHTML = "<span style=\'color:#28a745;\'>✔ Доступен</span> <small style=\'color:#aaa;\'>(" + data.youtube.ms + "ms)</small>";' +
				'        cYt.style.borderLeftColor = "#28a745";' +
				'      } else {' +
				'        vYt.innerHTML = "<span style=\'color:#dc3545;\'>✖ Заблокирован</span>";' +
				'        cYt.style.borderLeftColor = "#dc3545";' +
				'      }' +
				'      if (data.discord && data.discord.ok) {' +
				'        vDc.innerHTML = "<span style=\'color:#28a745;\'>✔ Доступен</span> <small style=\'color:#aaa;\'>(" + data.discord.ms + "ms)</small>";' +
				'        cDc.style.borderLeftColor = "#28a745";' +
				'      } else {' +
				'        vDc.innerHTML = "<span style=\'color:#dc3545;\'>✖ Недоступен</span>";' +
				'        cDc.style.borderLeftColor = "#dc3545";' +
				'      }' +
				'      if (data.telegram && data.telegram.ok) {' +
				'        vTg.innerHTML = "<span style=\'color:#28a745;\'>✔ Подключен</span> <small style=\'color:#aaa;\'> (Туннель :1443 активен)</small>";' +
				'        cTg.style.borderLeftColor = "#28a745";' +
				'      } else {' +
				'        vTg.innerHTML = "<span style=\'color:#dc3545;\'>✖ Остановлен</span>";' +
				'        cTg.style.borderLeftColor = "#dc3545";' +
				'      }' +
				'      if (data.dns && data.dns.ok && data.dns.adblock_ok) {' +
				'        vDns.innerHTML = "<span style=\'color:#28a745;\'>✔ Активен</span> <small style=\'color:#aaa;\'> (Блокировка работает)</small>";' +
				'        cDns.style.borderLeftColor = "#28a745";' +
				'      } else if (data.dns && data.dns.ok) {' +
				'        vDns.innerHTML = "<span style=\'color:#28a745;\'>✔ DNS OK</span>";' +
				'        cDns.style.borderLeftColor = "#28a745";' +
				'      } else {' +
				'        vDns.innerHTML = "<span style=\'color:#dc3545;\'>✖ Ошибка DNS</span>";' +
				'        cDns.style.borderLeftColor = "#dc3545";' +
				'      }' +
				'    } catch(e) {' +
				'      vYt.innerHTML = "<span style=\'color:#dc3545;\'>Ошибка ответа</span>";' +
				'    }' +
				'  }).catch(function(err) {' +
				'    btn.disabled = false;' +
				'    btn.innerText = "▶ Проверить сервисы (1 сек)";' +
				'    vYt.innerHTML = "<span style=\'color:#dc3545;\'>Ошибка RPC: " + err + "</span>";' +
				'  });' +
				'};' +
				'</script>';
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
