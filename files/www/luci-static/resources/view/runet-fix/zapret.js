'use strict';
'require view';
'require form';
'require fs';
'require ui';

return view.extend({
	load: function() {
		return Promise.all([
			fs.read('/usr/share/runet-fix/lists/zapret-hosts.txt').catch(function() { return ''; }),
			fs.read('/tmp/zapret-autotest-results.json').then(function(res) {
				try { return JSON.parse(res); } catch(e) { return null; }
			}).catch(function() { return null; }),
			fs.read('/tmp/zapret-autotest-status.json').then(function(res) {
				try { return JSON.parse(res); } catch(e) { return null; }
			}).catch(function() { return null; })
		]);
	},

	render: function(data) {
		var hostlistContent = data[0] || '';
		var testResults = data[1] || null;
		var activeStatus = data[2] || null;

		var m = new form.Map('runet-fix', _('Zapret (DPI Circumvention)'),
			_('Configures nfqws/nfqws2 packet desynchronization for unthrottling YouTube 4K, Discord voice & media, and ISP-blocked sites.'));

		// 1. Auto-Tester & Benchmark Section
		var s_bench = m.section(form.NamedSection, 'zapret', 'zapret', _('Automated Strategy Benchmark & Tester'));
		
		var bench_ui = s_bench.option(form.DummyValue, '_autotest');
		bench_ui.rawhtml = true;
		bench_ui.cfgvalue = function() {
			var initialResults = testResults || activeStatus;

			return '<style>' +
				'@keyframes rf-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }' +
				'@keyframes rf-stripes { 0% { background-position: 40px 0; } 100% { background-position: 0 0; } }' +
				'@keyframes rf-pulse-border { 0% { border-color: #00bc8c; box-shadow: 0 0 6px rgba(0,188,140,0.3); } 50% { border-color: #20c997; box-shadow: 0 0 16px rgba(0,188,140,0.7); } 100% { border-color: #00bc8c; box-shadow: 0 0 6px rgba(0,188,140,0.3); } }' +
				'.rf-spin-icon { display: inline-block; width: 18px; height: 18px; border: 3px solid rgba(255, 255, 255, 0.2); border-top-color: #00bc8c; border-radius: 50%; animation: rf-spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px; }' +
				'.rf-done-icon { display: inline-block; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; background: #28a745; color: #fff; font-weight: bold; font-size: 11px; margin-right: 8px; }' +
				'.rf-progress-box { background: #1a1e24; border: 1px solid #00bc8c; border-radius: 8px; padding: 16px; margin: 14px 0; animation: rf-pulse-border 2.5s infinite ease-in-out; }' +
				'.rf-progress-bar-bg { background: #2b303c; border-radius: 6px; height: 22px; overflow: hidden; margin: 12px 0 8px 0; box-shadow: inset 0 1px 3px rgba(0,0,0,0.6); position: relative; }' +
				'.rf-progress-bar-fill { height: 100%; width: 0%; background-color: #00bc8c; background-image: linear-gradient(45deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%, transparent); background-size: 32px 32px; animation: rf-stripes 1s linear infinite; transition: width 0.4s ease-in-out; }' +
				'.rf-badge-active { display: inline-block; padding: 3px 8px; background: #007bff; color: #fff; border-radius: 3px; font-weight: bold; font-size: 11px; letter-spacing: 0.5px; }' +
				'.rf-badge-pass { color: #28a745; font-weight: bold; }' +
				'.rf-badge-fail { color: #dc3545; font-weight: bold; }' +
				'</style>' +
				'<div id="zapret-autotest-box">' +
				'<p style="margin-bottom:12px;color:#ccc;">' + _('Провайдеры в РФ используют разное оборудование ТСПУ/DPI с разными правилами фильтрации. Данный бенчмарк поочередно проверяет рабочие стратегии обхода на реальных эндпоинтах YouTube 4K и Discord Gateway, вычисляя оптимальный профиль с минимальной задержкой.') + '</p>' +
				'<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
				'<button class="btn cbi-button-save" id="btn-run-autotest" style="font-size:13px;padding:6px 14px;" onclick="window.startZapretAutoTest()">' + _('🚀 Запустить авто-тест стратегий') + '</button>' +
				'<span id="autotest-status" style="font-weight:bold;margin-left:10px;"></span>' +
				'</div>' +

				// Animated Progress Box
				'<div id="zapret-progress-box" class="rf-progress-box" style="display:none;">' +
				'  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
				'    <div style="display:flex;align-items:center;">' +
				'      <span id="rf-spinner" class="rf-spin-icon"></span>' +
				'      <span id="rf-progress-title" style="font-weight:bold;font-size:14px;color:#fff;">' + _('Идет тестирование DPI стратегий...') + '</span>' +
				'    </div>' +
				'    <span id="rf-badge-state" class="rf-badge-active">ТЕСТИРОВАНИЕ</span>' +
				'  </div>' +
				'  <div style="margin-top:10px;font-size:13px;color:#eee;">' +
				'    <span>Прогресс: Шаг <b id="rf-step">0</b> из <b id="rf-total">8</b> (<span id="rf-pct">0%</span>)</span>' +
				'    <div style="margin-top:4px;">' +
				'      Текущая стратегия: <strong id="rf-strat-name" style="color:#00bc8c;">Инициализация...</strong>' +
				'    </div>' +
				'    <div id="rf-strat-args" style="font-size:11px;color:#888;font-family:monospace;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>' +
				'  </div>' +
				'  <div class="rf-progress-bar-bg">' +
				'    <div id="rf-bar-fill" class="rf-progress-bar-fill" style="width: 0%;"></div>' +
				'  </div>' +
				'  <div id="rf-testing-targets" style="font-size:12px;color:#aaa;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
				'    <span>🎯 Тестовые цели: <b>YouTube HTTPS</b> &amp; <b>Discord Gateway</b></span>' +
				'    <span>⚡ Очередь NFQUEUE: 205 (параллельный изолированный тест)</span>' +
				'  </div>' +
				'  <div id="rf-best-banner" style="display:none;"></div>' +
				'</div>' +

				// Results table container
				'<div id="autotest-results-table">' + window.renderZapretTable(initialResults) + '</div>' +
				'</div>' +

				'<script>' +
				'window.renderZapretTable = function(resultsObj) {' +
				'  if (!resultsObj || !resultsObj.results || !resultsObj.results.length) {' +
				'    return \'<div style="color:#888;margin:12px 0;">' + _('Авто-тест еще не запускался. Нажмите кнопку "Запустить авто-тест стратегий" для автоматического подбора конфигурации.') + '</div>\';' +
				'  }' +
				'  var rows = "";' +
				'  var best = resultsObj.best_preset || "";' +
				'  var sorted = resultsObj.results.slice().sort(function(a, b) { return b.score - a.score; });' +
				'  sorted.forEach(function(item) {' +
				'    var isBest = (item.id === best);' +
				'    var rowBg = isBest ? "background:#1e3d2f;" : "";' +
				'    var star = isBest ? \' <span class="badge" style="background:#28a745;color:#fff;margin-left:6px;font-weight:bold;">★ РЕКОМЕНДУЕТСЯ</span>\' : "";' +
				'    var ytBadge = item.yt_pass ?' +
				'      \'<span class="rf-badge-pass">✔ PASS (\' + item.yt_time_ms + \'ms)</span>\' :' +
				'      \'<span class="rf-badge-fail">✖ FAIL (Блок)</span>\';' +
				'    var dcBadge = item.dc_pass ?' +
				'      \'<span class="rf-badge-pass">✔ PASS (\' + item.dc_time_ms + \'ms)</span>\' :' +
				'      \'<span class="rf-badge-fail">✖ FAIL (Блок)</span>\';' +
				'    var applyBtn = \'<button class="btn cbi-button-action" style="padding:2px 8px;font-size:12px;" onclick="window.applyZapretPreset(\\\'\' + item.id + \'\\\')">\' + _(\'Применить\') + \'</button>\';' +
				'    rows += \'<div class="tr" style="\' + rowBg + \'"><div class="td" style="font-weight:bold;">\' + item.name + star + \'<br><small style="color:#aaa;font-weight:normal;">\' + item.args + \'</small></div><div class="td" style="vertical-align:middle;">\' + ytBadge + \'</div><div class="td" style="vertical-align:middle;">\' + dcBadge + \'</div><div class="td" style="vertical-align:middle;text-align:right;">\' + applyBtn + \'</div></div>\';' +
				'  });' +
				'  var timeInfo = resultsObj.timestamp ? \'<small style="color:#888;display:block;margin-top:6px;">Последний замер: \' + resultsObj.timestamp + \'</small>\' : "";' +
				'  return \'<div class="table" style="margin-top:10px;border:1px solid #444;border-radius:4px;overflow:hidden;"><div class="tr table-titles"><div class="th">\' + _(\'Профиль стратегии\') + \'</div><div class="th">\' + _(\'YouTube 4K\') + \'</div><div class="th">\' + _(\'Discord Gateway\') + \'</div><div class="th" style="text-align:right;">\' + _(\'Действие\') + \'</div></div>\' + rows + \'</div>\' + timeInfo;' +
				'};' +

				'var zapretPollTimer = null;' +

				'window.pollZapretStatus = function() {' +
				'  fs.read("/tmp/zapret-autotest-status.json").then(function(raw) {' +
				'    if (!raw) return;' +
				'    var st = null;' +
				'    try { st = JSON.parse(raw); } catch(e) { return; }' +
				'    var pBox = document.getElementById("zapret-progress-box");' +
				'    var pBar = document.getElementById("rf-bar-fill");' +
				'    var pPct = document.getElementById("rf-pct");' +
				'    var pStep = document.getElementById("rf-step");' +
				'    var pTotal = document.getElementById("rf-total");' +
				'    var pName = document.getElementById("rf-strat-name");' +
				'    var pArgs = document.getElementById("rf-strat-args");' +
				'    var pBadge = document.getElementById("rf-badge-state");' +
				'    var pSpinner = document.getElementById("rf-spinner");' +
				'    var pTitle = document.getElementById("rf-progress-title");' +
				'    var pBanner = document.getElementById("rf-best-banner");' +
				'    var pTable = document.getElementById("autotest-results-table");' +
				'    var btn = document.getElementById("btn-run-autotest");' +

				'    if (st.running) {' +
				'      if (pBox) pBox.style.display = "block";' +
				'      if (btn) btn.disabled = true;' +
				'      if (pBar) pBar.style.width = (st.progress || 0) + "%";' +
				'      if (pPct) pPct.innerText = (st.progress || 0) + "%";' +
				'      if (pStep) pStep.innerText = st.step || 0;' +
				'      if (pTotal) pTotal.innerText = st.total || 8;' +
				'      if (pName) pName.innerText = st.current_name || "";' +
				'      if (pArgs) pArgs.innerText = st.current_args || "";' +
				'      if (pBadge) { pBadge.className = "rf-badge-active"; pBadge.innerText = "ШАГ " + (st.step || 0) + " / " + (st.total || 8); }' +
				'      if (pSpinner) pSpinner.className = "rf-spin-icon";' +
				'      if (pTitle) pTitle.innerHTML = "' + _('Идет тестирование DPI стратегий...') + '";' +
				'      if (st.results && st.results.length > 0 && pTable) {' +
				'        pTable.innerHTML = window.renderZapretTable(st);' +
				'      }' +
				'    } else if (st.progress === 100 || (!st.running && st.best_preset)) {' +
				'      if (zapretPollTimer) { clearInterval(zapretPollTimer); zapretPollTimer = null; }' +
				'      if (btn) btn.disabled = false;' +
				'      if (pBar) pBar.style.width = "100%";' +
				'      if (pPct) pPct.innerText = "100%";' +
				'      if (pStep) pStep.innerText = st.total || 8;' +
				'      if (pSpinner) { pSpinner.className = "rf-done-icon"; pSpinner.innerText = "✔"; }' +
				'      if (pBadge) { pBadge.style.background = "#28a745"; pBadge.innerText = "ГОТОВО"; }' +
				'      if (pTitle) { pTitle.innerHTML = \'<span style="color:#28a745;font-weight:bold;">✔ Тестирование завершено! Рекомендуемый пресет: <b>\' + (st.best_preset || "") + \'</b></span>\'; }' +
				'      if (pName) pName.innerText = "Все стратегии успешно протестированы!";' +
				'      if (pArgs) pArgs.innerText = "";' +
				'      if (pBanner && st.best_preset) {' +
				'        pBanner.style.display = "block";' +
				'        pBanner.innerHTML = \'<div style="margin-top:12px;padding:12px;background:#1e3d2f;border:1px solid #28a745;border-radius:6px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">\' +' +
				'          \'<div><strong style="color:#28a745;font-size:14px;">★ Рекомендуемая стратегия: \' + st.best_preset + \'</strong><br><small style="color:#ccc;">Наивысшая скорость и гарантированный обход блокировок YouTube и Discord.</small></div>\' +' +
				'          \'<button class="btn cbi-button-save" style="font-weight:bold;padding:6px 14px;" onclick="window.applyZapretPreset(\\\'\' + st.best_preset + \'\\\')">Применить (\' + st.best_preset + \')</button>\' +' +
				'          \'</div>\';' +
				'      }' +
				'      if (st.results && pTable) {' +
				'        pTable.innerHTML = window.renderZapretTable(st);' +
				'      }' +
				'    }' +
				'  }).catch(function() {});' +
				'};' +

				'window.startZapretAutoTest = function() {' +
				'  var btn = document.getElementById("btn-run-autotest");' +
				'  var box = document.getElementById("zapret-progress-box");' +
				'  var banner = document.getElementById("rf-best-banner");' +
				'  var spinner = document.getElementById("rf-spinner");' +
				'  var pTitle = document.getElementById("rf-progress-title");' +
				'  var pBar = document.getElementById("rf-bar-fill");' +
				'  var status = document.getElementById("autotest-status");' +
				'  if (btn) btn.disabled = true;' +
				'  if (banner) banner.style.display = "none";' +
				'  if (box) box.style.display = "block";' +
				'  if (pBar) pBar.style.width = "0%";' +
				'  if (spinner) { spinner.className = "rf-spin-icon"; spinner.innerText = ""; }' +
				'  if (pTitle) pTitle.innerHTML = "' + _('Идет тестирование DPI стратегий...') + '";' +
				'  if (status) status.innerHTML = "";' +

				'  if (zapretPollTimer) clearInterval(zapretPollTimer);' +
				'  zapretPollTimer = setInterval(window.pollZapretStatus, 600);' +

				'  fs.exec_direct("/usr/bin/runet-fix", ["autotest", "--json"]).then(function(res) {' +
				'    setTimeout(function() {' +
				'      if (zapretPollTimer) { clearInterval(zapretPollTimer); zapretPollTimer = null; }' +
				'      window.pollZapretStatus();' +
				'    }, 1000);' +
				'  }).catch(function(err) {' +
				'    if (zapretPollTimer) { clearInterval(zapretPollTimer); zapretPollTimer = null; }' +
				'    if (btn) btn.disabled = false;' +
				'    if (pTitle) pTitle.innerHTML = \'<span style="color:#dc3545;">Ошибка выполнения теста: \' + err + \'</span>\';' +
				'  });' +
				'};' +

				'window.applyZapretPreset = function(presetId) {' +
				'  var status = document.getElementById("autotest-status");' +
				'  if (status) status.innerHTML = "<span style=\'color:#ffc107;font-weight:bold;\'>⏳ Применение пресета " + presetId + "...</span>";' +
				'  fs.exec_direct("/usr/bin/runet-fix", ["autotest", "--apply-preset", presetId]).then(function() {' +
				'    if (status) status.innerHTML = "<span style=\'color:#28a745;font-weight:bold;\'>✔ Пресет " + presetId + " успешно применен! Перезагрузка страницы...</span>";' +
				'    setTimeout(function() { location.reload(); }, 1200);' +
				'  }).catch(function(err) {' +
				'    if (status) status.innerHTML = "<span style=\'color:#dc3545;\'>Ошибка: " + err + "</span>";' +
				'  });' +
				'};' +

				(activeStatus && activeStatus.running ?
					'setTimeout(function() { var box = document.getElementById("zapret-progress-box"); if (box) box.style.display = "block"; window.pollZapretStatus(); zapretPollTimer = setInterval(window.pollZapretStatus, 600); }, 300);' :
					'') +
				'</script>';
		};

		// 2. Zapret Engine Settings Section
		var s = m.section(form.NamedSection, 'zapret', 'zapret', _('Zapret Engine Settings'));

		s.option(form.Flag, 'enabled', _('Enable Zapret DPI Engine'),
			_('Directs selected outgoing TCP/UDP traffic to Netfilter queue for desynchronization.'));

		var preset = s.option(form.ListValue, 'preset', _('Active DPI Bypass Preset'),
			_('Select a tested strategy or use the Auto-Tester above to detect the best one automatically.'));
		preset.value('youtube_4k', _('YouTube 4K Multisplit (Recommended - Multisplit + Seqovl)'));
		preset.value('flowseal_general', _('Flowseal General (Universal Fake + Split2, badseq, md5sig)'));
		preset.value('fakedsplit_badseq', _('Fakedsplit (Combined Fake + Data Split)'));
		preset.value('multisplit_badsum', _('Multisplit Badsum (Multisplit with Bad Checksum)'));
		preset.value('disorder2_badseq', _('Disorder2 Out-of-Order (TCP Reassembly Desync)'));
		preset.value('split2_pos2', _('Split2 Pos 2 (Alternative Split Position)'));
		preset.value('wsize_badsum', _('Fake Window Size 4 (TCP Window Desync)'));
		preset.value('tls_cutoff', _('TLS Cutoff d4 (Fast Cutoff)'));
		preset.value('discord_fix', _('Discord Full Fix (STUN Fake UDP + Media TCP 2053-8443)'));
		preset.value('custom', _('Custom Arguments (Enter below)'));
		preset.default = 'youtube_4k';

		var mode = s.option(form.ListValue, 'mode', _('Traffic Interception Scope'),
			_('Select whether all traffic or only specified domains should pass through Zapret.'));
		mode.value('all', _('All Outgoing Traffic (Recommended for full coverage)'));
		mode.value('list', _('Target Hostlist Only (Conserves router CPU)'));
		mode.default = 'all';

		var discord = s.option(form.Flag, 'discord_fix', _('Intercept Discord Voice UDP Ports'),
			_('Queues UDP ports 50000-50100 and 19294-19344 with fake STUN packets to restore Discord voice channels.'));
		discord.default = '1';

		var qnum = s.option(form.Value, 'qnum', _('Netfilter Queue Number (QNUM)'),
			_('Kernel queue index used for packet exchange between firewall and nfqws.'));
		qnum.datatype = 'port';
		qnum.default = '200';

		var custom = s.option(form.Value, 'custom_args', _('Custom nfqws Arguments'),
			_('Used only when Preset is set to "Custom". Example: --dpi-desync=fake,split2 --dpi-desync-split-pos=1'));
		custom.depends('preset', 'custom');

		// 3. Hostlist Section
		var s2 = m.section(form.NamedSection, 'zapret', 'zapret', _('Zapret Target Hostlist'),
			_('Domains that are desynchronized when in "Target Hostlist Only" mode. One domain per line.'));

		var hosts = s2.option(form.TextValue, '_hostlist');
		hosts.rows = 12;
		hosts.wrap = 'off';
		hosts.cfgvalue = function() {
			return hostlistContent;
		};
		hosts.write = function(section_id, formvalue) {
			return fs.write('/usr/share/runet-fix/lists/zapret-hosts.txt', formvalue.trim() + '\n');
		};

		return m.render();
	}
});