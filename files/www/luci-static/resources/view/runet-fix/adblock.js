'use strict';
'require view';
'require form';
'require fs';

return view.extend({
	load: function() {
		return Promise.all([
			fs.read('/usr/share/runet-fix/lists/adblock-whitelist.txt').catch(function() { return ''; }),
			fs.read('/usr/share/runet-fix/lists/adblock-blacklist.txt').catch(function() { return ''; }),
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
		var whitelistContent = data[0] || '';
		var blacklistContent = data[1] || '';
		var totalBlocked = data[2] || 0;

		var m = new form.Map('runet-fix', _('Smart Adblock (dnsmasq integration)'),
			_('Ultra-lightweight DNS-level ad and tracking blocker. Loads high-quality filter lists directly into OpenWrt dnsmasq with zero background memory overhead.'));

		var s = m.section(form.NamedSection, 'adblock', 'adblock', _('Adblock Configuration'));

		s.option(form.Flag, 'enabled', _('Enable Adblock'),
			_('Applies domain-level blocking via dnsmasq address configuration.'));

		var info = s.option(form.DummyValue, '_info', _('Active Status'));
		info.rawhtml = true;
		info.cfgvalue = function() {
			if (totalBlocked > 0) {
				return '<span style="color:#28a745;font-weight:bold;">● ACTIVE:</span> <strong>' + totalBlocked.toLocaleString() + '</strong> ' + _('unique ad/tracking domains currently blocked in dnsmasq.');
			} else {
				return '<span style="color:#dc3545;font-weight:bold;">● INACTIVE:</span> ' + _('No active blocking rules loaded.');
			}
		};

		var ru = s.option(form.Flag, 'enable_ru', _('Подписка RU AdList (Яндекс.Директ, VK/Mail.ru трекеры, кинотеатры)'),
			_('Добавляет специализированные фильтры блокировки русскоязычной рекламы, счетчиков и онлайн-видеоплееров.'));
		ru.default = '1';

		var profile = s.option(form.ListValue, 'profile', _('Filter Profile'),
			_('Select filter intensity. Standard profile includes StevenBlack Unified and Russian filters.'));
		profile.value('standard', _('Standard (StevenBlack + RU AdList ~170k domains)'));
		profile.value('aggressive', _('Aggressive (Standard + Anti-Coinminer protection)'));
		profile.default = 'standard';

		var schedule = s.option(form.ListValue, 'auto_update', _('Automatic List Update (Cron)'),
			_('Automatically downloads updated filter rules in background.'));
		schedule.value('weekly', _('Weekly (Every Sunday at 04:00 - Recommended)'));
		schedule.value('daily', _('Daily (Every night at 04:00)'));
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