'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require fs';
'require ui';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('runet-fix'),
			callServiceList('runet-fix'),
			fs.read('/tmp/runet-fix-adblock.count').then(function(res) {
				return parseInt((res || '').trim()) || 0;
			}).catch(function() {
				return fs.stat('/tmp/dnsmasq.d/runet-fix-adblock.conf').then(function(stat) {
					return (stat && stat.size > 0) ? Math.round(stat.size / 30) : 0;
				}).catch(function() { return 0; });
			}),
			fs.read('/usr/share/runet-fix/version').then(function(res) {
				return (res || '').trim() || '—';
			}).catch(function() { return '—'; }),
			fs.read('/tmp/tg-ws-proxy-stats.json').then(function(res) {
				try { return JSON.parse(res || '{}'); } catch(e) { return {}; }
			}).catch(function() { return {}; }),
			fs.read('/tmp/runet-fix-hosts.count').then(function(res) {
				return parseInt((res || '').trim()) || 0;
			}).catch(function() { return 0; })
		]);
	},

	render: function(data) {
		var serviceData = data[1] || {};
		var adblockRules = data[2] || 0;
		var hostsCount = data[5] || 0;

		// Extract instances from procd
		var instances = (serviceData['runet-fix'] && serviceData['runet-fix'].instances) ? serviceData['runet-fix'].instances : {};
		var zapret = instances['zapret'] || null;
		var telegram = instances['telegram'] || null;

		var zapretRunning = zapret && zapret.running;
		var zapretPid = zapret ? zapret.pid : null;

		var telegramRunning = telegram && telegram.running;
		var telegramPid = telegram ? telegram.pid : null;
		var currentVersion = data[3] || '—';
		var tgStats = data[4] || {};

		window.runetFixCheckUpdate = function() {
			var statusEl = document.getElementById('rf-update-status');
			var btnUpd = document.getElementById('btn-do-upd');
			var btnCheck = document.getElementById('btn-check-upd');

			if (statusEl) statusEl.innerHTML = '<span style="color:#ffc107;">' + _('Checking GitHub...') + '</span>';
			if (btnCheck) btnCheck.disabled = true;

			fs.exec('/usr/bin/runet-fix', ['check-update', '--json']).then(function(res) {
				if (btnCheck) btnCheck.disabled = false;
				var stdout = (res && res.stdout) ? res.stdout.trim() : '';
				var parsed = null;
				try { parsed = JSON.parse(stdout); } catch(e) {}

				if (parsed && parsed.status === 'ok') {
					if (parsed.update_available) {
						if (statusEl) {
							statusEl.innerHTML = '<span class="badge" style="background:#28a745;color:#fff;padding:3px 8px;border-radius:4px;font-weight:bold;">' + 
								_('Update available') + ': v' + parsed.latest_version + '</span>';
						}
						if (btnUpd) {
							btnUpd.innerText = _('Update to') + ' v' + parsed.latest_version;
							btnUpd.className = 'btn cbi-button-positive';
							btnUpd.onclick = function() { window.runetFixPerformUpdate(parsed.latest_version); };
						}
					} else {
						if (statusEl) {
							statusEl.innerHTML = '<span style="color:#28a745;font-weight:bold;">' + _('Latest version installed') + ' (v' + parsed.current_version + ')</span>';
						}
						if (btnUpd) {
							btnUpd.innerText = _('Update');
							btnUpd.className = 'btn cbi-button-save';
							btnUpd.onclick = function() { window.runetFixPerformUpdate(); };
						}
					}
				} else {
					var err = (parsed && parsed.message) ? parsed.message : _('Response error');
					if (statusEl) statusEl.innerHTML = '<span style="color:#dc3545;">' + err + '</span>';
				}
			}).catch(function(err) {
				if (btnCheck) btnCheck.disabled = false;
				if (statusEl) statusEl.innerHTML = '<span style="color:#dc3545;">' + (err.message || err) + '</span>';
			});
		};

		window.runetFixPerformUpdate = function(ver) {
			var msg = ver ? 
				(_('Update Runet-Fix to version v') + ver + '?') : 
				_('Update Runet-Fix from GitHub to the latest version?');
			if (!confirm(msg)) {
				return;
			}
			ui.showModal(_('Updating Runet-Fix'), [
				E('p', { 'style': 'font-size:14px;margin-bottom:15px;' }, _('Downloading latest release from GitHub, updating files and restarting services...')),
				E('div', { 'class': 'spinning', 'style': 'margin:20px auto;' })
			]);

			var savedTimeout = L.env.rpctimeout;
			L.env.rpctimeout = 180;
			fs.exec('/usr/bin/runet-fix', ['update']).then(function(res) {
				L.env.rpctimeout = savedTimeout;
				ui.hideModal();
				if (res && res.code === 0) {
					ui.addNotification(null, E('p', _('Update installed successfully! Reloading page...')), 'info');
					setTimeout(function() {
						location.reload();
					}, 2500);
				} else {
					var errMsg = (res && (res.stderr || res.stdout)) ? (res.stderr || res.stdout).trim() : (_('Command exited with code ') + (res ? res.code : 'unknown'));
					ui.addNotification(null, E('p', _('Update failed: ') + errMsg), 'error');
				}
			}).catch(function(err) {
				L.env.rpctimeout = savedTimeout;
				ui.hideModal();
				ui.addNotification(null, E('p', _('Update error: ') + (err.message || err)), 'error');
			});
		};

		window.runZapretAutotune = function() {
			var msg = _('Run Zapret Autotune?\n\nKey strategies will be benchmarked against YouTube and Discord (~10-15s). The fastest working preset will be activated automatically.');
			if (!confirm(msg)) return;

			ui.showModal(_('Zapret Autotune'), [
				E('p', { 'style': 'font-size:14px;margin-bottom:15px;' }, _('Benchmarking desync strategies (Flowseal General, YouTube 4K, ALT, FAKE TLS)... Please wait.')),
				E('div', { 'class': 'spinning', 'style': 'margin:20px auto;' })
			]);

			var savedTimeout = L.env.rpctimeout;
			L.env.rpctimeout = 120;
			fs.exec('/usr/bin/runet-fix', ['autotune', '--json', '--apply']).then(function(res) {
				L.env.rpctimeout = savedTimeout;
				ui.hideModal();
				var stdout = (res && res.stdout) ? res.stdout.trim() : '';
				var parsed = null;
				try { parsed = JSON.parse(stdout); } catch(e) {}
				if (parsed && parsed.best_preset) {
					ui.addNotification(null, E('p', {}, _('Fastest preset activated: ') + parsed.best_preset), 'info');
					setTimeout(function() { location.reload(); }, 1500);
				} else {
					ui.addNotification(null, E('p', {}, _('Autotune result: ') + stdout), 'warning');
				}
			}).catch(function(err) {
				L.env.rpctimeout = savedTimeout;
				ui.hideModal();
				ui.addNotification(null, E('p', {}, _('Autotune error: ') + (err.message || err)), 'error');
			});
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
				btn.innerText = _('Testing...');
			}
			if (resBox) resBox.style.display = 'grid';
			if (vYt) vYt.innerHTML = '<span style="color:#ffc107;">' + _('Testing...') + '</span>';
			if (vDc) vDc.innerHTML = '<span style="color:#ffc107;">' + _('Testing...') + '</span>';
			if (vTg) vTg.innerHTML = '<span style="color:#ffc107;">' + _('Testing...') + '</span>';
			if (vDns) vDns.innerHTML = '<span style="color:#ffc107;">' + _('Testing...') + '</span>';

			function applyResult(parsed) {
				if (btn) {
					btn.disabled = false;
					btn.innerText = _('Test Services (1 sec)');
				}
				if (!parsed) {
					if (vYt) vYt.innerHTML = '<span style="color:#dc3545;font-weight:bold;">' + _('Response error') + '</span>';
					return;
				}

				if (parsed.youtube && parsed.youtube.ok) {
					vYt.innerHTML = '<span style="color:#28a745;font-weight:bold;">' + _('Available') + '</span> <small style="color:#aaa;">(' + parsed.youtube.ms + 'ms)</small>';
					if (cYt) cYt.style.borderLeftColor = '#28a745';
				} else {
					vYt.innerHTML = '<span style="color:#dc3545;font-weight:bold;">' + _('Blocked') + '</span>';
					if (cYt) cYt.style.borderLeftColor = '#dc3545';
				}

				if (parsed.discord && parsed.discord.ok) {
					vDc.innerHTML = '<span style="color:#28a745;font-weight:bold;">' + _('Available') + '</span> <small style="color:#aaa;">(' + parsed.discord.ms + 'ms)</small>';
					if (cDc) cDc.style.borderLeftColor = '#28a745';
				} else {
					vDc.innerHTML = '<span style="color:#dc3545;font-weight:bold;">' + _('Unavailable') + '</span>';
					if (cDc) cDc.style.borderLeftColor = '#dc3545';
				}

				if (parsed.telegram && parsed.telegram.ok) {
					var extra = _('(Tunnel :1443 active)');
					if (parsed.telegram.stats && parsed.telegram.stats.active_sessions !== undefined) {
						extra = _('sessions: ') + parsed.telegram.stats.active_sessions;
					}
					vTg.innerHTML = '<span style="color:#28a745;font-weight:bold;">' + _('Connected') + '</span> <small style="color:#aaa;">(' + extra + ')</small>';
					if (cTg) cTg.style.borderLeftColor = '#28a745';
				} else {
					vTg.innerHTML = '<span style="color:#dc3545;font-weight:bold;">' + _('STOPPED') + '</span>';
					if (cTg) cTg.style.borderLeftColor = '#dc3545';
				}

				if (parsed.dns && parsed.dns.ok && parsed.dns.adblock_ok) {
					vDns.innerHTML = '<span style="color:#28a745;font-weight:bold;">' + _('ACTIVE') + '</span> <small style="color:#aaa;">' + _('(Blocking active)') + '</small>';
					if (cDns) cDns.style.borderLeftColor = '#28a745';
				} else if (parsed.dns && parsed.dns.ok) {
					vDns.innerHTML = '<span style="color:#28a745;font-weight:bold;">' + _('DNS OK') + '</span>';
					if (cDns) cDns.style.borderLeftColor = '#28a745';
				} else {
					vDns.innerHTML = '<span style="color:#dc3545;font-weight:bold;">' + _('DNS Error') + '</span>';
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
						btn.innerText = _('Test Services (1 sec)');
					}
					if (vYt) vYt.innerHTML = '<span style="color:#dc3545;font-weight:bold;">' + _('RPC Error: ') + (err.message || err) + '</span>';
				});
			});
		};

		window.runetFixAction = function(act) {
			var btn = (window.event && window.event.target) ? window.event.target : null;
			var oldText = btn ? btn.innerText : '';
			if (btn) {
				btn.disabled = true;
				btn.innerText = _('Working...');
			}
			fs.exec('/usr/bin/runet-fix', [act]).then(function() {
				if (btn) btn.innerText = _('Success!');
				setTimeout(function() { location.reload(); }, 1200);
			}).catch(function() {
				if (btn) {
					btn.innerText = _('Error');
					setTimeout(function() { btn.disabled = false; btn.innerText = oldText; }, 2000);
				}
			});
		};

		window.runetFixUninstall = function() {
			var resp = prompt(_('Warning! Are you sure you want to completely uninstall Runet-Fix from this router?\n\nAll services will be stopped, nftables rules removed, cron jobs cleaned, and all scripts, lists, and LuCI web views deleted.\nConfig backup will be saved in /etc/config/.\n\nType UNINSTALL to confirm:'));
			if (resp !== 'UNINSTALL') {
				if (resp !== null) {
					ui.addNotification(null, E('p', _('Uninstall cancelled: confirmation mismatch')), 'warning');
				}
				return;
			}
			var btn = document.getElementById('btn-uninstall');
			if (btn) {
				btn.disabled = true;
				btn.innerText = _('Uninstalling Runet-Fix from router...');
			}
			ui.showModal(_('Uninstall Runet-Fix'), [
				E('p', { 'class': 'spinning' }, _('Uninstalling Runet-Fix from router...'))
			]);
			fs.exec('/usr/bin/runet-fix', ['uninstall']).then(function() {
				ui.hideModal();
				ui.addNotification(null, E('p', _('Runet-Fix has been removed. Redirecting...')), 'info');
				setTimeout(function() {
					window.location.href = L.url('admin/status/overview');
				}, 2000);
			}).catch(function(err) {
				ui.hideModal();
				ui.addNotification(null, E('p', 'Uninstall error: ' + (err.message || err)), 'error');
				if (btn) {
					btn.disabled = false;
					btn.innerText = _('Completely Uninstall Runet-Fix');
				}
			});
		};

		var m = new form.Map('runet-fix',
			_('Runet Fix - All-in-One Dashboard'),
			_('Unified high-performance suite for OpenWrt: Zapret DPI bypass, Transparent Telegram WebSocket tunnel, and Smart Adblock.'));

		// 1. Master Switch & System Overview
		var s = m.section(form.NamedSection, 'main', 'global', _('Master Switch & System Overview'));

		var o_en = s.option(form.Flag, 'enabled', _('Enable All Services'), _('Globally enables or disables all Runet-Fix subsystems.'));
		o_en.rmempty = false;
		o_en.default = o_en.enabled;

		var lanIfaces = s.option(form.Value, 'lan_ifaces', _('LAN interfaces'), _('Space-separated bridges whose traffic may be redirected to the Telegram proxy, dnsmasq, and nfqws. Empty follows the LAN device, then br-lan.'));
		lanIfaces.placeholder = 'br-lan';
		lanIfaces.rmempty = true;

		// Version & Update Management Row
		var v_ctrl = s.option(form.DummyValue, '_version_control', _('Runet-Fix Version'));
		v_ctrl.rawhtml = true;
		v_ctrl.cfgvalue = function() {
			return '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:4px 0;">' +
				'  <span class="badge" style="background:#007bff;color:#fff;padding:4px 10px;border-radius:4px;font-weight:bold;font-size:13px;">v' + currentVersion + '</span>' +
				'  <a href="https://github.com/zlaer/runet-fix-openwrt" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#58a6ff;text-decoration:none;font-weight:bold;display:inline-flex;align-items:center;gap:4px;">' +
				'    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>' +
				'    GitHub' +
				'  </a>' +
				'  <span id="rf-update-status" style="font-size:13px;color:#888;"></span>' +
				'  <div style="display:inline-flex;gap:8px;margin-left:auto;flex-wrap:wrap;">' +
				'    <button type="button" class="btn cbi-button-action" id="btn-check-upd" style="padding:4px 14px;font-size:12px;font-weight:bold;" onclick="window.runetFixCheckUpdate()">' + _('Check for Updates') + '</button>' +
				'    <button type="button" class="btn cbi-button-save" id="btn-do-upd" style="padding:4px 14px;font-size:12px;font-weight:bold;" onclick="window.runetFixPerformUpdate()">' + _('Update') + '</button>' +
				'  </div>' +
				'</div>';
		};

		// Status Overview Table
		var o = s.option(form.DummyValue, '_status_table', _('Subsystem Status'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			var zapretMode = uci.get('runet-fix', 'zapret', 'mode') || 'all';
			var zapretExtra = (zapretRunning && zapretMode === 'list') ?
				'<span style="font-size:12px;color:#28a745;margin-left:6px;font-weight:normal;">(' +
				_('hostlist: ') + (hostsCount > 0 ? hostsCount.toLocaleString() + ' ' + _('domains') : _('ACTIVE')) + ')</span>' : '';

			var zapretBadge = zapretRunning ? 
				'<span class="badge" style="background:#28a745;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">' + _('RUNNING') + ' (PID ' + zapretPid + ')</span>' + zapretExtra :
				'<span class="badge" style="background:#dc3545;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">' + _('STOPPED') + '</span>';

			var tgExtra = (telegramRunning && tgStats.total_sessions !== undefined) ?
				'<span style="font-size:12px;color:#28a745;margin-left:6px;font-weight:normal;">(' +
				_('sessions: ') + (tgStats.active_sessions || 0) + ' ' +
				_('act., total: ') + (tgStats.total_sessions || 0) + ')</span>' : '';

			var tgBadge = telegramRunning ?
				'<span class="badge" style="background:#28a745;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">' + _('ACTIVE') + ' (PID ' + telegramPid + ')</span>' + tgExtra :
				'<span class="badge" style="background:#dc3545;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">' + _('STOPPED') + '</span>';

			var adblockBadge = adblockRules > 0 ?
				'<span class="badge" style="background:#28a745;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">' + _('ACTIVE') + ' (' + adblockRules.toLocaleString() + ' ' + _('domains') + ')</span>' :
				'<span class="badge" style="background:#6c757d;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;">' + _('INACTIVE') + '</span>';

			return '<div class="table" style="margin-top:10px;">' +
				'<div class="tr"><div class="td" style="font-weight:bold;width:35%;">' + _('Zapret (YouTube 4K & Discord DPI)') + '</div><div class="td">' + zapretBadge + '</div></div>' +
				'<div class="tr"><div class="td" style="font-weight:bold;">' + _('Telegram Transparent Proxy') + '</div><div class="td">' + tgBadge + ' <small style="margin-left:10px;color:#888;">' + _('(Zero-config for whole LAN)') + '</small></div></div>' +
				'<div class="tr"><div class="td" style="font-weight:bold;">' + _('dnsmasq Smart Adblock') + '</div><div class="td">' + adblockBadge + ' <small style="margin-left:10px;color:#888;">' + _('(0 extra daemons, RAM optimized)') + '</small></div></div>' +
				'</div>';
		};

		// 2. Live RuNet Health Probe Diagnostics
		var s_diag = m.section(form.NamedSection, 'main', 'global', _('Service Availability Diagnostics (RuNet Health Probe)'));
		var probe_ui = s_diag.option(form.DummyValue, '_health_probe');
		probe_ui.rawhtml = true;
		probe_ui.cfgvalue = function() {
			return '<div id="probe-container" style="background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:14px;margin-top:6px;">' +
				'<style>' +
				'.rf-probe-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:10px; margin-top:14px; }' +
				'@media (max-width: 680px) { .rf-probe-grid { grid-template-columns:repeat(2, minmax(0, 1fr)) !important; gap:8px !important; } }' +
				'@media (max-width: 360px) { .rf-probe-grid { grid-template-columns:1fr !important; } }' +
				'</style>' +
				'<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
				'  <div>' +
				'    <strong style="font-size:14px;color:#fff;">' + _('Real-Time Network Health Probe') + '</strong><br>' +
				'    <small style="color:#aaa;">' + _('Instant verification (1–2 sec): YouTube 4K, Discord Gateway, Telegram tunnel, and adblock status.') + '</small>' +
				'  </div>' +
				'  <button type="button" class="btn cbi-button-action" id="btn-run-probe" style="padding:6px 16px;font-weight:bold;" onclick="window.runRuNetHealthProbe()">' + _('Test Services (1 sec)') + '</button>' +
				'</div>' +
				'<div id="probe-results" class="rf-probe-grid" style="display:none;">' +
				'  <div id="card-yt" style="background:#282c34;padding:8px 10px;border-radius:6px;border-left:4px solid #6c757d;min-width:0;">' +
				'    <div style="font-size:11px;color:#aaa;text-transform:uppercase;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _('YouTube 4K (DPI)') + '</div>' +
				'    <div id="val-yt" style="font-size:13px;font-weight:bold;margin-top:4px;color:#fff;">' + _('Not checked') + '</div>' +
				'  </div>' +
				'  <div id="card-dc" style="background:#282c34;padding:8px 10px;border-radius:6px;border-left:4px solid #6c757d;min-width:0;">' +
				'    <div style="font-size:11px;color:#aaa;text-transform:uppercase;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _('Discord Gateway') + '</div>' +
				'    <div id="val-dc" style="font-size:13px;font-weight:bold;margin-top:4px;color:#fff;">' + _('Not checked') + '</div>' +
				'  </div>' +
				'  <div id="card-tg" style="background:#282c34;padding:8px 10px;border-radius:6px;border-left:4px solid #6c757d;min-width:0;">' +
				'    <div style="font-size:11px;color:#aaa;text-transform:uppercase;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _('Telegram WebSocket') + '</div>' +
				'    <div id="val-tg" style="font-size:13px;font-weight:bold;margin-top:4px;color:#fff;">' + _('Not checked') + '</div>' +
				'  </div>' +
				'  <div id="card-dns" style="background:#282c34;padding:8px 10px;border-radius:6px;border-left:4px solid #6c757d;min-width:0;">' +
				'    <div style="font-size:11px;color:#aaa;text-transform:uppercase;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _('DNS & Adblock') + '</div>' +
				'    <div id="val-dns" style="font-size:13px;font-weight:bold;margin-top:4px;color:#fff;">' + _('Not checked') + '</div>' +
				'  </div>' +
				'</div>' +
				'</div>';
		};

		// 3. Quick Action Buttons
		var actions = s.option(form.DummyValue, '_actions', _('Quick Actions'));
		actions.rawhtml = true;
		actions.cfgvalue = function() {
			return '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +
				'<button type="button" class="btn cbi-button-action" id="btn-restart" onclick="window.runetFixAction(\'restart\')">' + _('Restart Services') + '</button> ' +
				'<button type="button" class="btn cbi-button-action" style="background:#6f42c1;color:#fff;font-weight:bold;" onclick="window.runZapretAutotune()">' + _('Zapret Autotune') + '</button> ' +
				'<button type="button" class="btn cbi-button-save" id="btn-hosts" onclick="window.runetFixAction(\'update-hosts\')">' + _('Update Zapret Hosts') + '</button> ' +
				'<button type="button" class="btn cbi-button-save" id="btn-adblock" onclick="window.runetFixAction(\'update-adblock\')">' + _('Update Adblock Now') + '</button> ' +
				'<button type="button" class="btn cbi-button-neutral" id="btn-refresh" onclick="location.reload()">' + _('Refresh Status') + '</button>' +
				'</div>';
		};

		// 4. Danger Zone (Uninstallation)
		var s_danger = m.section(form.NamedSection, 'main', 'global', _('Uninstall Runet-Fix'), _('Completely remove the Runet-Fix suite, stop all daemons, delete nftables firewall rules, clean cron schedule and LuCI web views.'));
		var uninstall_ui = s_danger.option(form.DummyValue, '_uninstall');
		uninstall_ui.rawhtml = true;
		uninstall_ui.cfgvalue = function() {
			return '<div style="margin-top:8px;">' +
				'<button type="button" class="btn cbi-button-negative" id="btn-uninstall" style="padding:7px 18px;font-weight:bold;" onclick="window.runetFixUninstall()">' + _('Completely Uninstall Runet-Fix') + '</button>' +
				'</div>';
		};

		return m.render();
	}
});
