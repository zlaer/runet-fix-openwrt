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
			}).catch(function() { return null; })
		]);
	},

	render: function(data) {
		var hostlistContent = data[0] || '';
		var testResults = data[1] || null;

		var m = new form.Map('runet-fix', _('Zapret (DPI Circumvention)'),
			_('Configures nfqws/nfqws2 packet desynchronization for unthrottling YouTube 4K, Discord voice & media, and ISP-blocked sites.'));

		// 1. Auto-Tester & Benchmark Section
		var s_bench = m.section(form.NamedSection, 'zapret', 'zapret', _('Automated Strategy Benchmark & Tester'));
		
		var bench_ui = s_bench.option(form.DummyValue, '_autotest');
		bench_ui.rawhtml = true;
		bench_ui.cfgvalue = function() {
			var renderTable = function(resultsObj) {
				if (!resultsObj || !resultsObj.results || !resultsObj.results.length) {
					return '<div style="color:#888;margin:10px 0;">' + _('No benchmark has been run yet. Click "Run Strategy Auto-Test" below to find the best settings for your ISP.') + '</div>';
				}

				var rows = '';
				var best = resultsObj.best_preset || '';
				var sorted = resultsObj.results.slice().sort(function(a, b) { return b.score - a.score; });

				sorted.forEach(function(item) {
					var isBest = (item.id === best);
					var rowBg = isBest ? 'background:#1e3d2f;' : '';
					var star = isBest ? ' <span class="badge" style="background:#28a745;color:#fff;margin-left:6px;font-weight:bold;">★ RECOMMENDED</span>' : '';

					var ytBadge = item.yt_pass ?
						'<span style="color:#28a745;font-weight:bold;">✔ PASS (' + item.yt_time_ms + 'ms)</span>' :
						'<span style="color:#dc3545;font-weight:bold;">✖ FAIL (Blocked)</span>';

					var dcBadge = item.dc_pass ?
						'<span style="color:#28a745;font-weight:bold;">✔ PASS (' + item.dc_time_ms + 'ms)</span>' :
						'<span style="color:#dc3545;font-weight:bold;">✖ FAIL (Blocked)</span>';

					var applyBtn = '<button class="btn cbi-button-action" style="padding:2px 8px;font-size:12px;" onclick="window.applyZapretPreset(\'' + item.id + '\')">' + _('Apply') + '</button>';

					rows += '<div class="tr" style="' + rowBg + '">' +
						'<div class="td" style="font-weight:bold;">' + item.name + star + '<br><small style="color:#aaa;font-weight:normal;">' + item.args + '</small></div>' +
						'<div class="td" style="vertical-align:middle;">' + ytBadge + '</div>' +
						'<div class="td" style="vertical-align:middle;">' + dcBadge + '</div>' +
						'<div class="td" style="vertical-align:middle;text-align:right;">' + applyBtn + '</div>' +
						'</div>';
				});

				var timeInfo = resultsObj.timestamp ? '<small style="color:#888;display:block;margin-top:6px;">Last test: ' + resultsObj.timestamp + '</small>' : '';

				return '<div class="table" style="margin-top:10px;border:1px solid #444;border-radius:4px;overflow:hidden;">' +
					'<div class="tr table-titles">' +
					'<div class="th">' + _('Strategy Profile') + '</div>' +
					'<div class="th">' + _('YouTube 4K') + '</div>' +
					'<div class="th">' + _('Discord') + '</div>' +
					'<div class="th" style="text-align:right;">' + _('Action') + '</div>' +
					'</div>' + rows + '</div>' + timeInfo;
			};

			return '<div id="zapret-autotest-box">' +
				'<p style="margin-bottom:10px;">' + _('Different ISPs in Russia use varied DPI / TSPU hardware and filter rules. Run the auto-tester to benchmark candidate strategies against live YouTube and Discord endpoints and pick the optimal desync mode.') + '</p>' +
				'<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
				'<button class="btn cbi-button-save" id="btn-run-autotest" onclick="window.startZapretAutoTest()">' + _('🚀 Run Strategy Auto-Test') + '</button>' +
				'<span id="autotest-status" style="font-weight:bold;margin-left:10px;"></span>' +
				'</div>' +
				'<div id="autotest-results-table">' + renderTable(testResults) + '</div>' +
				'</div>' +
				'<script>' +
				'window.startZapretAutoTest = function() {' +
				'  var btn = document.getElementById("btn-run-autotest");' +
				'  var status = document.getElementById("autotest-status");' +
				'  var container = document.getElementById("autotest-results-table");' +
				'  btn.disabled = true;' +
				'  status.innerHTML = "<span style=\'color:#ffc107;\'>⏳ Benchmarking candidate strategies against YouTube & Discord (takes ~15s)...</span>";' +
				'  fs.exec_direct("/usr/bin/runet-fix", ["autotest", "--json"]).then(function(res) {' +
				'    btn.disabled = false;' +
				'    status.innerHTML = "<span style=\'color:#28a745;\'>✔ Benchmark complete!</span>";' +
				'    try {' +
				'      var parsed = JSON.parse(res);' +
				'      setTimeout(function() { location.reload(); }, 800);' +
				'    } catch(e) { location.reload(); }' +
				'  }).catch(function(err) {' +
				'    btn.disabled = false;' +
				'    status.innerHTML = "<span style=\'color:#dc3545;\'>Error running test: " + err + "</span>";' +
				'  });' +
				'};' +
				'window.applyZapretPreset = function(presetId) {' +
				'  var status = document.getElementById("autotest-status");' +
				'  status.innerHTML = "<span style=\'color:#ffc107;\'>Applying preset " + presetId + "...</span>";' +
				'  fs.exec_direct("/usr/bin/runet-fix", ["autotest", "--apply-preset", presetId]).then(function() {' +
				'    status.innerHTML = "<span style=\'color:#28a745;\'>Preset applied! Reloading...</span>";' +
				'    setTimeout(function() { location.reload(); }, 1000);' +
				'  }).catch(function(err) {' +
				'    status.innerHTML = "<span style=\'color:#dc3545;\'>Error: " + err + "</span>";' +
				'  });' +
				'};' +
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
