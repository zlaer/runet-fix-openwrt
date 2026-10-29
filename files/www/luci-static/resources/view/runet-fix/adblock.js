'use strict';
'require view';
'require form';
'require fs';

return view.extend({
	load: function() {
		return Promise.all([
			fs.read('/usr/share/runet-fix/lists/adblock-whitelist.txt').catch(function() { return ''; }),
			fs.read('/usr/share/runet-fix/lists/adblock-blacklist.txt').catch(function() { return ''; }),
			fs.read('/tmp/dnsmasq.d/runet-fix-adblock.conf').catch(function() { return ''; })
		]);
	},

	render: function(data) {
		var whitelistContent = data[0] || '';
		var blacklistContent = data[1] || '';
		var totalBlocked = data[2] ? data[2].trim().split('\n').length : 0;

		var m = new form.Map('runet-fix', _('Smart Adblock (dnsmasq integration)'),
			_('Ultra-lightweight DNS-level ad and tracking blocker. Loads high-quality filter lists directly into OpenWrt dnsmasq with zero background memory overhead.'));

		var s = m.section(form.NamedSection, 'adblock', 'adblock', _('Adblock Configuration'));

		s.option(form.Flag, 'enabled', _('Enable Adblock'),
			_('Applies domain-level blocking via dnsmasq address configuration.'));

		var info = s.option(form.DummyValue, '_info', _('Active Status'));
		info.rawhtml = true;
		info.cfgvalue = function() {
			return '<strong>' + totalBlocked + '</strong> ' + _('unique ad/tracking domains currently blocked in dnsmasq.');
		};

		var profile = s.option(form.ListValue, 'profile', _('Filter Profile'),
			_('Select filter intensity. Standard profile includes OISD Small and AdGuard RU filters.'));
		profile.value('light', _('Light (OISD Small ~40k domains, minimum false positives)'));
		profile.value('standard', _('Standard (OISD + AdGuard RU ~65k domains, blocks Russian banners)'));
		profile.value('aggressive', _('Aggressive (OISD + AdGuard RU + Global Filters ~120k domains)'));
		profile.default = 'standard';

		var schedule = s.option(form.ListValue, 'auto_update', _('Automatic List Update'),
			_('Automatically downloads updated filter rules in background.'));
		schedule.value('weekly', _('Weekly (Recommended)'));
		schedule.value('daily', _('Daily'));
		schedule.value('disabled', _('Disabled (Manual update only)'));
		schedule.default = 'weekly';

		// Custom Lists Section
		var s2 = m.section(form.NamedSection, 'adblock', 'adblock', _('Custom Whitelist & Blacklist'));

		var white = s2.option(form.TextValue, '_whitelist', _('Whitelist (Never Block)'));
		white.rows = 8;
		white.wrap = 'off';
		white.description = _('Domains to exclude from adblocking. One domain per line.');
		white.cfgvalue = function() { return whitelistContent; };
		white.write = function(section_id, formvalue) {
			return fs.write('/usr/share/runet-fix/lists/adblock-whitelist.txt', formvalue.trim() + '\n');
		};

		var black = s2.option(form.TextValue, '_blacklist', _('Blacklist (Always Block)'));
		black.rows = 8;
		black.wrap = 'off';
		black.description = _('Additional domains or tracking hosts to block. One domain per line.');
		black.cfgvalue = function() { return blacklistContent; };
		black.write = function(section_id, formvalue) {
			return fs.write('/usr/share/runet-fix/lists/adblock-blacklist.txt', formvalue.trim() + '\n');
		};

		return m.render();
	}
});
