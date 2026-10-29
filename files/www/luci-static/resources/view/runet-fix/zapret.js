'use strict';
'require view';
'require form';
'require fs';

return view.extend({
	load: function() {
		return Promise.all([
			fs.read('/usr/share/runet-fix/lists/zapret-hosts.txt').catch(function() { return ''; })
		]);
	},

	render: function(data) {
		var hostlistContent = data[0] || '';

		var m = new form.Map('runet-fix', _('Zapret (DPI Circumvention)'),
			_('Configures nfqws/nfqws2 packet modification for bypassing YouTube throttling, Discord voice/media blocking, and provider DPI filters.'));

		var s = m.section(form.NamedSection, 'zapret', 'zapret', _('Zapret Engine Settings'));

		s.option(form.Flag, 'enabled', _('Enable Zapret DPI Engine'),
			_('Directs selected outgoing TCP/UDP traffic to Netfilter queue for desynchronization.'));

		var preset = s.option(form.ListValue, 'preset', _('DPI Bypass Preset'),
			_('Pre-tuned profiles based on proven Flowseal and Bol-van strategies.'));
		preset.value('flowseal_general', _('Flowseal General (YouTube 4K + Discord Voice/Media + General ISP Bypass)'));
		preset.value('youtube_4k', _('YouTube 4K Turbo (Fake ClientHello + Multisplit Seqovl)'));
		preset.value('discord_fix', _('Discord Full Fix (STUN Fake UDP + Media TCP 2053-8443)'));
		preset.value('custom', _('Custom Arguments (Enter below)'));
		preset.default = 'flowseal_general';

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

		// Hostlist section
		var s2 = m.section(form.NamedSection, 'zapret', 'zapret', _('Zapret Target Hostlist'),
			_('Domains that are desynchronized when in "Target Hostlist Only" mode. One domain per line.'));

		var hosts = s2.option(form.TextValue, '_hostlist');
		hosts.rows = 15;
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
