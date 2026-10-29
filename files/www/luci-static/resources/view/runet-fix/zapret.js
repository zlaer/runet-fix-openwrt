'use strict';
'require view';
'require form';
'require fs';
'require ui';

var I18N = {
	ru: {
		title: 'Zapret (Обход блокировок DPI)',
		desc: 'Настройка десинхронизации пакетов nfqws для ускорения YouTube 4K, Discord и заблокированных сайтов.',
		lang_label: 'Язык:',
		section_engine: 'Настройки движка Zapret',
		enable_zapret: 'Включить движок Zapret DPI',
		enable_zapret_desc: 'Направляет исходящий трафик в очередь Netfilter для десинхронизации пакетов.',
		preset: 'Профиль стратегии обхода DPI',
		preset_desc: 'Выберите профиль десинхронизации для обхода ТСПУ/DPI для YouTube 4K, Discord и других ресурсов.',
		preset_custom: 'Пользовательские аргументы (введите ниже)',
		scope: 'Область перехвата трафика',
		scope_desc: 'Перехватывать весь исходящий трафик или только домены из списка.',
		scope_all: 'Весь исходящий трафик (Рекомендуется для полной работы)',
		scope_list: 'Только целевой список доменов (Экономит CPU роутера)',
		discord: 'Перехват голосовых портов Discord UDP',
		discord_desc: 'Направляет UDP-порты 50000-50100 и 19294-19344 с фейковыми STUN-пакетами для восстановления голосовых каналов Discord.',
		qnum: 'Номер очереди Netfilter (QNUM)',
		qnum_desc: 'Номер очереди ядра Linux для обмена пакетами между файрволом и nfqws.',
		custom_args: 'Пользовательские аргументы nfqws',
		custom_args_desc: 'Используется только при выборе профиля «Пользовательские аргументы». Пример: --dpi-desync=fake,split2 --dpi-desync-split-pos=1',
		section_exclude: 'Список исключений (Exclusion List)',
		desc_exclude: 'Домены российских сервисов (банки, Госуслуги, платежные системы МИР), которые НЕ должны подвергаться десинхронизации пакетов. Все поддомены исключаются автоматически. По одному домену на строку.',
		section_hosts: 'Целевой список доменов (Hostlist)',
		desc_hosts: 'Домены, которые обрабатываются через Zapret только при выборе режима «Только по списку». По одному домену на строку.'
	},
	en: {
		title: 'Zapret (DPI Circumvention)',
		desc: 'Configures nfqws packet desynchronization for unthrottling YouTube 4K, Discord voice & media, and ISP-blocked sites.',
		lang_label: 'Language:',
		section_engine: 'Zapret Engine Settings',
		enable_zapret: 'Enable Zapret DPI Engine',
		enable_zapret_desc: 'Directs selected outgoing TCP/UDP traffic to Netfilter queue for desynchronization.',
		preset: 'Active DPI Bypass Preset',
		preset_desc: 'Select a desync strategy profile to bypass TSPU/DPI blocking for YouTube 4K, Discord, and other resources.',
		preset_custom: 'Custom Arguments (Enter below)',
		scope: 'Traffic Interception Scope',
		scope_desc: 'Select whether all traffic or only specified domains should pass through Zapret.',
		scope_all: 'All Outgoing Traffic (Recommended for full coverage)',
		scope_list: 'Target Hostlist Only (Conserves router CPU)',
		discord: 'Intercept Discord Voice UDP Ports',
		discord_desc: 'Queues UDP ports 50000-50100 and 19294-19344 with fake STUN packets to restore Discord voice channels.',
		qnum: 'Netfilter Queue Number (QNUM)',
		qnum_desc: 'Kernel queue index used for packet exchange between firewall and nfqws.',
		custom_args: 'Custom nfqws Arguments',
		custom_args_desc: 'Used only when Preset is set to "Custom". Example: --dpi-desync=fake,split2 --dpi-desync-split-pos=1',
		section_exclude: 'Exclusion List (Domestic Services)',
		desc_exclude: 'Domains of Russian domestic services (banks, Gosuslugi, MIR payment gateways) that should NOT be desynchronized. All subdomains are automatically excluded. One domain per line.',
		section_hosts: 'Zapret Target Hostlist',
		desc_hosts: 'Domains that are desynchronized when in "Target Hostlist Only" mode. One domain per line.'
	}
};

return view.extend({
	load: function() {
		return Promise.all([
			fs.read('/usr/share/runet-fix/lists/zapret-hosts.txt').catch(function() { return ''; }),
			fs.read('/usr/share/runet-fix/lists/zapret-exclude.txt').catch(function() { return ''; })
		]);
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(function() {
			ui.changes.apply(mode == '0');
			return fs.exec('/usr/bin/runet-fix', ['restart']);
		});
	},

	render: function(data) {
		var curLang = localStorage.getItem('runet_fix_lang') || 'ru';
		if (curLang !== 'en' && curLang !== 'ru') curLang = 'ru';
		var t = I18N[curLang];

		var hostlistContent = data[0] || '';
		var excludelistContent = data[1] || '';

		window.setRunetFixLang = function(lang) {
			localStorage.setItem('runet_fix_lang', lang);
			location.reload();
		};

		var m = new form.Map('runet-fix', t.title, t.desc);

		// Top language bar
		var s_top = m.section(form.NamedSection, 'zapret', 'zapret');
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

		// 1. Zapret Engine Settings Section
		var s = m.section(form.NamedSection, 'zapret', 'zapret', t.section_engine);

		s.option(form.Flag, 'enabled', t.enable_zapret, t.enable_zapret_desc);

		var preset = s.option(form.ListValue, 'preset', t.preset, t.preset_desc);
		
		// Standard Presets
		preset.value('youtube_4k', 'YouTube 4K Multisplit (Recommended - Multisplit + Seqovl)');
		preset.value('flowseal_general', 'Flowseal General (Universal Fake + Split2, badseq, md5sig)');
		preset.value('fakedsplit_badseq', 'Fakedsplit (Combined Fake + Data Split)');
		preset.value('multisplit_badsum', 'Multisplit Badsum (Multisplit with Bad Checksum)');
		preset.value('disorder2_badseq', 'Disorder2 Out-of-Order (TCP Reassembly Desync)');
		preset.value('split2_pos2', 'Split2 Pos 2 (Alternative Split Position)');
		preset.value('wsize_badsum', 'Fake Window Size 4 (TCP Window Desync)');
		preset.value('tls_cutoff', 'TLS Cutoff d4 (Fast Cutoff)');
		preset.value('discord_fix', 'Discord Full Fix (STUN Fake UDP + Media TCP 2053-8443)');

		// Additional Desktop Alternative Configs (Flowseal ALT Suite)
		preset.value('general_alt', 'Flowseal ALT (Fake + Fakedsplit TS, Pattern 0x00)');
		preset.value('general_alt2', 'Flowseal ALT2 (Multisplit Pos 2)');
		preset.value('general_alt3', 'Flowseal ALT3 (Fake + Hostfakesplit TS)');
		preset.value('general_alt4', 'Flowseal ALT4 (Fake + Multisplit Badseq R6)');
		preset.value('general_alt5', 'Flowseal ALT5 (Syndata Multidisorder)');
		preset.value('general_alt6', 'Flowseal ALT6 (Multisplit Pos 1)');
		preset.value('general_alt7', 'Flowseal ALT7 (Multisplit Pos 2 + Sniext)');
		preset.value('general_alt8', 'Flowseal ALT8 (Fake Badseq R6)');
		preset.value('general_alt9', 'Flowseal ALT9 (Hostfakesplit TS + MD5Sig R4)');
		preset.value('general_alt10', 'Flowseal ALT10 (Fake TS R6)');
		preset.value('general_alt11', 'Flowseal ALT11 (Fake + Multisplit Pos 1 TS R8)');
		preset.value('general_alt12', 'Flowseal ALT12 (Hostfakesplit Simple TS)');
		preset.value('general_alt13', 'Flowseal ALT13 (Fake + Hostfakesplit TS R5)');
		preset.value('general_fake_tls_auto', 'Flowseal FAKE TLS AUTO (Multidisorder Midsld Badseq R11)');
		preset.value('general_fake_tls_alt', 'Flowseal FAKE TLS ALT (Fake + Fakedsplit Pos 1 Badseq R8)');
		preset.value('general_fake_tls_alt2', 'Flowseal FAKE TLS ALT2 (Fake + Multisplit Pos 1 Badseq R8)');
		preset.value('general_fake_tls_alt3', 'Flowseal FAKE TLS ALT3 (Fake + Multisplit Pos 1 TS R8)');
		preset.value('general_simple_fake', 'Flowseal SIMPLE FAKE (Fake TS R6)');
		preset.value('general_simple_fake_alt', 'Flowseal SIMPLE FAKE ALT (Fake Badseq R6)');
		preset.value('general_simple_fake_alt2', 'Flowseal SIMPLE FAKE ALT2 (Fake TS Cutoff n5 R6)');
		preset.value('general_exp', 'Flowseal EXP (Experimental Multisplit TS R8)');

		preset.value('custom', t.preset_custom);
		preset.default = 'youtube_4k';

		var mode = s.option(form.ListValue, 'mode', t.scope, t.scope_desc);
		mode.value('all', t.scope_all);
		mode.value('list', t.scope_list);
		mode.default = 'all';

		var discord = s.option(form.Flag, 'discord_fix', t.discord, t.discord_desc);
		discord.default = '1';

		var qnum = s.option(form.Value, 'qnum', t.qnum, t.qnum_desc);
		qnum.datatype = 'port';
		qnum.default = '200';

		var custom = s.option(form.Value, 'custom_args', t.custom_args, t.custom_args_desc);
		custom.depends('preset', 'custom');

		// 2. Exclusion List Section (Russian domestic services, banks, Gosuslugi)
		var s_exclude = m.section(form.NamedSection, 'zapret', 'zapret', t.section_exclude, t.desc_exclude);

		var exhosts = s_exclude.option(form.TextValue, '_excludelist');
		exhosts.rows = 12;
		exhosts.wrap = 'off';
		exhosts.cfgvalue = function() {
			return excludelistContent;
		};
		exhosts.write = function(section_id, formvalue) {
			return fs.write('/usr/share/runet-fix/lists/zapret-exclude.txt', formvalue.trim() + '\n');
		};

		// 3. Hostlist Section (Only used when Traffic Interception Scope is set to "Target Hostlist Only")
		var s2 = m.section(form.NamedSection, 'zapret', 'zapret', t.section_hosts, t.desc_hosts);

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
