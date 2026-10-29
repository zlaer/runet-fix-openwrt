'use strict';
'require view';
'require form';
'require fs';
'require ui';

var I18N = {
	ru: {
		title: 'Умный Adblock (интеграция с dnsmasq)',
		desc: 'Сверхлегкая блокировка рекламы и трекеров на уровне DNS. Загружает качественные фильтры прямо в dnsmasq без расхода оперативной памяти.',
		lang_label: 'Язык:',
		section_conf: 'Настройки Adblock',
		enable: 'Включить блокировку рекламы',
		enable_desc: 'Блокирует рекламные домены через конфигурацию адресов dnsmasq.',
		active_status: 'Текущий статус',
		active_badge: 'АКТИВЕН',
		inactive_badge: 'НЕАКТИВЕН',
		blocked_suffix: 'уникальных рекламных доменов заблокировано в dnsmasq.',
		inactive_msg: 'Правила блокировки не загружены.',
		ru_filter: 'Подписка RU AdList (Яндекс.Директ, VK/Mail.ru трекеры, кинотеатры)',
		ru_filter_desc: 'Добавляет специализированные фильтры блокировки русскоязычной рекламы, счетчиков и онлайн-видеоплееров.',
		profile: 'Профиль фильтрации',
		profile_desc: 'Выберите профиль фильтрации. Стандартный включает StevenBlack Unified и русские фильтры.',
		profile_standard: 'Стандартный (StevenBlack + RU AdList ~170 тыс. доменов)',
		profile_aggressive: 'Агрессивный (Стандартный + защита от скрытого майнинга)',
		schedule: 'Автоматическое обновление списков (Cron)',
		schedule_desc: 'Автоматически загружает свежие правила фильтрации в фоновом режиме.',
		sched_weekly: 'Еженедельно (Каждое воскресенье в 04:00 - Рекомендуется)',
		sched_daily: 'Ежедневно (Каждую ночь в 04:00)',
		sched_disabled: 'Отключено (Только ручное обновление)',
		section_custom: 'Белый и черный списки пользователя',
		whitelist: 'Белый список (Никогда не блокировать)',
		whitelist_desc: 'Домены, которые нельзя блокировать. По одному домену на строку.',
		blacklist: 'Черный список (Всегда блокировать)',
		blacklist_desc: 'Дополнительные рекламные хосты или трекеры для блокировки. По одному домену на строку.'
	},
	en: {
		title: 'Smart Adblock (dnsmasq integration)',
		desc: 'Ultra-lightweight DNS-level ad and tracking blocker. Loads high-quality filter lists directly into OpenWrt dnsmasq with zero background memory overhead.',
		lang_label: 'Language:',
		section_conf: 'Adblock Configuration',
		enable: 'Enable Adblock',
		enable_desc: 'Applies domain-level blocking via dnsmasq address configuration.',
		active_status: 'Active Status',
		active_badge: 'ACTIVE',
		inactive_badge: 'INACTIVE',
		blocked_suffix: 'unique ad/tracking domains currently blocked in dnsmasq.',
		inactive_msg: 'No active blocking rules loaded.',
		ru_filter: 'RU AdList Subscription (Yandex.Direct, VK/Mail.ru trackers, video players)',
		ru_filter_desc: 'Adds specialized filters for blocking Russian ads, trackers, counters, and web players.',
		profile: 'Filter Profile',
		profile_desc: 'Select filter intensity. Standard profile includes StevenBlack Unified and Russian filters.',
		profile_standard: 'Standard (StevenBlack + RU AdList ~170k domains)',
		profile_aggressive: 'Aggressive (Standard + Anti-Coinminer protection)',
		schedule: 'Automatic List Update (Cron)',
		schedule_desc: 'Automatically downloads updated filter rules in background.',
		sched_weekly: 'Weekly (Every Sunday at 04:00 - Recommended)',
		sched_daily: 'Daily (Every night at 04:00)',
		sched_disabled: 'Disabled (Manual update only)',
		section_custom: 'Custom Whitelist & Blacklist',
		whitelist: 'Whitelist (Never Block)',
		whitelist_desc: 'Domains to exclude from adblocking. One domain per line.',
		blacklist: 'Blacklist (Always Block)',
		blacklist_desc: 'Additional domains or tracking hosts to block. One domain per line.'
	}
};

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

		var whitelistContent = data[0] || '';
		var blacklistContent = data[1] || '';
		var totalBlocked = data[2] || 0;

		window.setRunetFixLang = function(lang) {
			localStorage.setItem('runet_fix_lang', lang);
			location.reload();
		};

		var m = new form.Map('runet-fix', t.title, t.desc);

		// Top language bar
		var s_top = m.section(form.NamedSection, 'adblock', 'adblock');
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

		var s = m.section(form.NamedSection, 'adblock', 'adblock', t.section_conf);

		s.option(form.Flag, 'enabled', t.enable, t.enable_desc);

		var info = s.option(form.DummyValue, '_info', t.active_status);
		info.rawhtml = true;
		info.cfgvalue = function() {
			if (totalBlocked > 0) {
				return '<span class="badge" style="background:#28a745;color:#fff;padding:3px 6px;border-radius:3px;font-weight:bold;">' + t.active_badge + '</span> <strong>' + totalBlocked.toLocaleString() + '</strong> ' + t.blocked_suffix;
			} else {
				return '<span class="badge" style="background:#dc3545;color:#fff;padding:3px 6px;border-radius:3px;font-weight:bold;">' + t.inactive_badge + '</span> ' + t.inactive_msg;
			}
		};

		var ru = s.option(form.Flag, 'enable_ru', t.ru_filter, t.ru_filter_desc);
		ru.default = '1';

		var profile = s.option(form.ListValue, 'profile', t.profile, t.profile_desc);
		profile.value('standard', t.profile_standard);
		profile.value('aggressive', t.profile_aggressive);
		profile.default = 'standard';

		var schedule = s.option(form.ListValue, 'auto_update', t.schedule, t.schedule_desc);
		schedule.value('weekly', t.sched_weekly);
		schedule.value('daily', t.sched_daily);
		schedule.value('disabled', t.sched_disabled);
		schedule.default = 'weekly';

		// Custom Lists Section
		var s2 = m.section(form.NamedSection, 'adblock', 'adblock', t.section_custom);

		var white = s2.option(form.TextValue, '_whitelist', t.whitelist);
		white.rows = 8;
		white.wrap = 'off';
		white.description = t.whitelist_desc;
		white.cfgvalue = function() { return whitelistContent; };
		white.write = function(section_id, formvalue) {
			return fs.write('/usr/share/runet-fix/lists/adblock-whitelist.txt', formvalue.trim() + '\n');
		};

		var black = s2.option(form.TextValue, '_blacklist', t.blacklist);
		black.rows = 8;
		black.wrap = 'off';
		black.description = t.blacklist_desc;
		black.cfgvalue = function() { return blacklistContent; };
		black.write = function(section_id, formvalue) {
			return fs.write('/usr/share/runet-fix/lists/adblock-blacklist.txt', formvalue.trim() + '\n');
		};

		return m.render();
	}
});
