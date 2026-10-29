'use strict';
'require view';
'require form';
'require fs';

return view.extend({
	load: function() {
		return Promise.all([
			fs.read('/usr/share/runet-fix/lists/zapret-hosts.txt').catch(function() { return ''; }),
			fs.read('/usr/share/runet-fix/lists/zapret-exclude.txt').catch(function() { return ''; })
		]);
	},

	render: function(data) {
		var hostlistContent = data[0] || '';
		var excludelistContent = data[1] || '';

		var m = new form.Map('runet-fix', _('Zapret (DPI Circumvention)'),
			_('Configures nfqws packet desynchronization for unthrottling YouTube 4K, Discord voice & media, and ISP-blocked sites.'));

		// 1. Zapret Engine Settings Section
		var s = m.section(form.NamedSection, 'zapret', 'zapret', _('Zapret Engine Settings'));

		s.option(form.Flag, 'enabled', _('Enable Zapret DPI Engine'),
			_('Directs selected outgoing TCP/UDP traffic to Netfilter queue for desynchronization.'));

		var preset = s.option(form.ListValue, 'preset', _('Active DPI Bypass Preset'),
			_('Select a desync strategy profile to bypass TSPU/DPI blocking for YouTube 4K, Discord, and other resources.'));
		
		// Standard Presets
		preset.value('youtube_4k', _('YouTube 4K Multisplit (Recommended - Multisplit + Seqovl)'));
		preset.value('flowseal_general', _('Flowseal General (Universal Fake + Split2, badseq, md5sig)'));
		preset.value('fakedsplit_badseq', _('Fakedsplit (Combined Fake + Data Split)'));
		preset.value('multisplit_badsum', _('Multisplit Badsum (Multisplit with Bad Checksum)'));
		preset.value('disorder2_badseq', _('Disorder2 Out-of-Order (TCP Reassembly Desync)'));
		preset.value('split2_pos2', _('Split2 Pos 2 (Alternative Split Position)'));
		preset.value('wsize_badsum', _('Fake Window Size 4 (TCP Window Desync)'));
		preset.value('tls_cutoff', _('TLS Cutoff d4 (Fast Cutoff)'));
		preset.value('discord_fix', _('Discord Full Fix (STUN Fake UDP + Media TCP 2053-8443)'));

		// Additional Desktop Alternative Configs (Flowseal ALT Suite)
		preset.value('general_alt', _('Flowseal ALT (Fake + Fakedsplit TS, Pattern 0x00)'));
		preset.value('general_alt2', _('Flowseal ALT2 (Multisplit Pos 2)'));
		preset.value('general_alt3', _('Flowseal ALT3 (Fake + Hostfakesplit TS)'));
		preset.value('general_alt4', _('Flowseal ALT4 (Fake + Multisplit Badseq R6)'));
		preset.value('general_alt5', _('Flowseal ALT5 (Syndata Multidisorder)'));
		preset.value('general_alt6', _('Flowseal ALT6 (Multisplit Pos 1)'));
		preset.value('general_alt7', _('Flowseal ALT7 (Multisplit Pos 2 + Sniext)'));
		preset.value('general_alt8', _('Flowseal ALT8 (Fake Badseq R6)'));
		preset.value('general_alt9', _('Flowseal ALT9 (Hostfakesplit TS + MD5Sig R4)'));
		preset.value('general_alt10', _('Flowseal ALT10 (Fake TS R6)'));
		preset.value('general_alt11', _('Flowseal ALT11 (Fake + Multisplit Pos 1 TS R8)'));
		preset.value('general_alt12', _('Flowseal ALT12 (Hostfakesplit Simple TS)'));
		preset.value('general_alt13', _('Flowseal ALT13 (Fake + Hostfakesplit TS R5)'));
		preset.value('general_fake_tls_auto', _('Flowseal FAKE TLS AUTO (Multidisorder Midsld Badseq R11)'));
		preset.value('general_fake_tls_alt', _('Flowseal FAKE TLS ALT (Fake + Fakedsplit Pos 1 Badseq R8)'));
		preset.value('general_fake_tls_alt2', _('Flowseal FAKE TLS ALT2 (Fake + Multisplit Pos 1 Badseq R8)'));
		preset.value('general_fake_tls_alt3', _('Flowseal FAKE TLS ALT3 (Fake + Multisplit Pos 1 TS R8)'));
		preset.value('general_simple_fake', _('Flowseal SIMPLE FAKE (Fake TS R6)'));
		preset.value('general_simple_fake_alt', _('Flowseal SIMPLE FAKE ALT (Fake Badseq R6)'));
		preset.value('general_simple_fake_alt2', _('Flowseal SIMPLE FAKE ALT2 (Fake TS Cutoff n5 R6)'));
		preset.value('general_exp', _('Flowseal EXP (Experimental Multisplit TS R8)'));

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

		// 2. Exclusion List Section (Russian domestic services, banks, Gosuslugi)
		var s_exclude = m.section(form.NamedSection, 'zapret', 'zapret', _('Список исключений (Exclusion List)'),
			_('Домены российских сервисов (банки, Госуслуги, платежные системы МИР), которые НЕ должны подвергаться десинхронизации пакетов. Все поддомены исключаются автоматически. По одному домену на строку.'));

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