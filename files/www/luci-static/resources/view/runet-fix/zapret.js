'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';

var I18N = {
	ru: {
		title: 'Zapret (Обход блокировок DPI)',
		desc: 'Настройка десинхронизации пакетов nfqws для ускорения YouTube 4K, Discord и заблокированных сайтов.',
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
		game_fix: 'Ускорение онлайн-игр (Game UDP Fix)',
		game_fix_desc: 'Направляет сетевые UDP-порты 27015-27050 и 7777-7780 (Steam, CS2, Dota 2, GTA Online) через Netfilter с игровыми бинарными паттернами для предотвращения потерь пакетов.',
		section_bypass: 'Исключение устройств локальной сети (Device Bypass)',
		desc_bypass: 'Устройства в домашней сети (рабочие ноутбуки с VPN, Smart TV, приставки), трафик которых должен идти напрямую без десинхронизации Zapret и проксирования Telegram.',
		excl_ips: 'Исключенные IP-адреса',
		excl_ips_desc: 'IPv4-адрес устройства (например: 192.168.1.150). По одному адресу на строку.',
		excl_macs: 'Исключенные MAC-адреса',
		excl_macs_desc: 'MAC-адрес устройства (например: AA:BB:CC:DD:EE:FF). По одному на строку.',
		qnum: 'Номер очереди Netfilter (QNUM)',
		qnum_desc: 'Номер очереди ядра Linux для обмена пакетами между файрволом и nfqws.',
		custom_args: 'Пользовательские аргументы nfqws',
		custom_args_desc: 'Используется только при выборе профиля «Пользовательские аргументы». Пример: --dpi-desync=fake,split2 --dpi-desync-split-pos=1',
		section_exclude: 'Список исключений (Exclusion List)',
		desc_exclude: 'Домены российских сервисов (банки, Госуслуги, платежные системы МИР), которые НЕ должны подвергаться десинхронизации пакетов. Все поддомены исключаются автоматически. По одному домену на строку.',
		exclude_ru: 'Исключать все домены зоны .ru, .рф, .su',
		exclude_ru_desc: 'Автоматически исключает любые российские сайты из обработки Zapret (как в режиме всего трафика, так и по списку) для предотвращения сбоев и прямого быстрого подключения.',
		section_hosts: 'Целевой список доменов (Hostlist)',
		desc_hosts: 'Домены, которые обрабатываются через Zapret только при выборе режима «Только по списку». По одному домену на строку.',
		autohostlist: 'Авто-обнаружение блокировок (AutoHostList)',
		autohostlist_desc: 'nfqws на лету определяет попытки блокировки провайдером по TCP RST / таймаутам и автоматически добавляет заблокированные домены в список обхода.',
		auto_update_hosts: 'Авто-обновление списка блокировок',
		auto_update_hosts_desc: 'Периодическая загрузка свежего курируемого списка заблокированных доменов AntiFilter Community.',
		btn_update_hosts: 'Обновить список из AntiFilter Community',
		btn_update_hosts_desc: 'Загрузить свежие заблокированные домены и объединить с вашим локальным списком.',
		update_hosts_ok: 'Список заблокированных доменов успешно обновлен!',
		update_hosts_err: 'Ошибка при обновлении списка: ',
		upd_disabled: 'Отключено',
		upd_weekly: 'Еженедельно (Рекомендуется)',
		upd_daily: 'Ежедневно'
	},
	en: {
		title: 'Zapret (DPI Circumvention)',
		desc: 'Configures nfqws packet desynchronization for unthrottling YouTube 4K, Discord voice & media, and ISP-blocked sites.',
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
		game_fix: 'Online Games UDP Acceleration (Game UDP Fix)',
		game_fix_desc: 'Desynchronizes UDP ports 27015-27050 and 7777-7780 (Steam, CS2, Dota 2, GTA Online) with game binary patterns to eliminate TSPU packet drops.',
		section_bypass: 'Device Bypass (LAN Exclusion)',
		desc_bypass: 'Local LAN devices (work VPN laptops, Smart TVs, consoles) whose traffic should bypass Zapret and Telegram proxies entirely.',
		excl_ips: 'Excluded IP Addresses',
		excl_ips_desc: 'IPv4 address (e.g. 192.168.1.150). One per item.',
		excl_macs: 'Excluded MAC Addresses',
		excl_macs_desc: 'MAC address (e.g. AA:BB:CC:DD:EE:FF). One per item.',
		qnum: 'Netfilter Queue Number (QNUM)',
		qnum_desc: 'Kernel queue index used for packet exchange between firewall and nfqws.',
		custom_args: 'Custom nfqws Arguments',
		custom_args_desc: 'Used only when Preset is set to "Custom". Example: --dpi-desync=fake,split2 --dpi-desync-split-pos=1',
		section_exclude: 'Exclusion List (Domestic Services)',
		desc_exclude: 'Domains of Russian domestic services (banks, Gosuslugi, MIR payment gateways) that should NOT be desynchronized. All subdomains are automatically excluded. One domain per line.',
		exclude_ru: 'Exclude all .ru, .рф, .su domains',
		exclude_ru_desc: 'Automatically bypasses Zapret DPI processing for all Russian domestic domains (in both All Traffic and Hostlist modes) to ensure zero interference.',
		section_hosts: 'Zapret Target Hostlist',
		desc_hosts: 'Domains that are desynchronized when in "Target Hostlist Only" mode. One domain per line.',
		autohostlist: 'Automatic DPI Block Detection (AutoHostList)',
		autohostlist_desc: 'nfqws dynamically detects TSPU block attempts via TCP RST/timeouts and automatically adds new blocked domains to the bypass list on the fly.',
		auto_update_hosts: 'Auto-Update Blocked Hostlist',
		auto_update_hosts_desc: 'Periodically fetch the latest curated AntiFilter Community blocked domains list.',
		btn_update_hosts: 'Update list from AntiFilter Community',
		btn_update_hosts_desc: 'Download latest blocked domains and merge with your custom hostlist.',
		update_hosts_ok: 'Zapret hostlist updated successfully!',
		update_hosts_err: 'Error updating hostlist: ',
		upd_disabled: 'Disabled',
		upd_weekly: 'Weekly (Recommended)',
		upd_daily: 'Daily'
	}
};

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('runet-fix'),
			fs.read('/usr/share/runet-fix/lists/zapret-hosts.txt').catch(function() { return ''; }),
			fs.read('/usr/share/runet-fix/lists/zapret-exclude.txt').catch(function() { return ''; })
		]);
	},

	render: function(data) {
		var curLang = localStorage.getItem('runet_fix_lang') || 'ru';
		if (curLang !== 'en' && curLang !== 'ru') curLang = 'ru';
		var t = I18N[curLang];

		var hostlistContent = data[1] || '';
		var excludelistContent = data[2] || '';

		var m = new form.Map('runet-fix', t.title, t.desc);

		// 1. Zapret Engine Settings Section
		var s = m.section(form.NamedSection, 'zapret', 'zapret', t.section_engine);

		var o_en = s.option(form.Flag, 'enabled', t.enable_zapret, t.enable_zapret_desc);
		o_en.rmempty = false;
		o_en.default = o_en.enabled;

		var preset = s.option(form.ListValue, 'preset', t.preset, t.preset_desc);
		
		// Standard Presets
		preset.value('youtube_4k', 'YouTube 4K Multisplit (Recommended - Multisplit + Seqovl)');
		preset.value('flowseal_general', 'Flowseal General (Multisplit Pos 1 Seqovl 568 + 4PDA BIN)');
		preset.value('fakedsplit_badseq', 'Fakedsplit (Combined Fake + Data Split)');
		preset.value('multisplit_badsum', 'Multisplit Badsum (Multisplit with Bad Checksum)');
		preset.value('disorder2_badseq', 'Disorder2 Out-of-Order (TCP Reassembly Desync)');
		preset.value('split2_pos2', 'Split2 Pos 2 (Alternative Split Position)');
		preset.value('wsize_badsum', 'Fake Window Size 4 (TCP Window Desync)');
		preset.value('tls_cutoff', 'TLS Cutoff d4 (Fast Cutoff)');
		preset.value('discord_fix', 'Discord Full Fix (STUN Fake UDP + Media TCP 2053-8443)');

		// Additional Desktop Alternative Configs (Flowseal ALT Suite)
		preset.value('general_alt', 'Flowseal ALT (Fake + Fakedsplit TS + STUN/Google/Sferum BIN)');
		preset.value('general_alt2', 'Flowseal ALT2 (Multisplit Pos 2 Seqovl 652 + Google BIN)');
		preset.value('general_alt3', 'Flowseal ALT3 (Fake + Hostfakesplit TS + ya.ru SNI)');
		preset.value('general_alt4', 'Flowseal ALT4 (Fake + Multisplit Badseq 1000 + Google BIN)');
		preset.value('general_alt5', 'Flowseal ALT5 (Syndata Multidisorder)');
		preset.value('general_alt6', 'Flowseal ALT6 (Multisplit Pos 1 Seqovl 681 + Google BIN)');
		preset.value('general_alt7', 'Flowseal ALT7 (Multisplit Pos 2 + Sniext Seqovl 679 + Google BIN)');
		preset.value('general_alt8', 'Flowseal ALT8 (Fake Badseq 2 + Sferum BIN)');
		preset.value('general_alt9', 'Flowseal ALT9 (Hostfakesplit TS + MD5Sig R4 + ozon.ru SNI)');
		preset.value('general_alt10', 'Flowseal ALT10 (Fake TS R6 + 4PDA/Sferum BIN)');
		preset.value('general_alt11', 'Flowseal ALT11 (Fake + Multisplit Pos 1 TS Seqovl 664 + Sferum BIN)');
		preset.value('general_alt12', 'Flowseal ALT12 (Fake + Multisplit Pos 1 TS Seqovl 664 + STUN/Sferum BIN)');
		preset.value('general_alt13', 'Flowseal ALT13 (Fake + Hostfakesplit TS + mail.ru + Sochi Park BIN)');
		preset.value('general_fake_tls_auto', 'Flowseal FAKE TLS AUTO (Multidisorder Midsld Badseq R11)');
		preset.value('general_fake_tls_alt', 'Flowseal FAKE TLS ALT (Fake + Fakedsplit Pos 1 Badseq 2 + Sferum BIN)');
		preset.value('general_fake_tls_alt2', 'Flowseal FAKE TLS ALT2 (Fake + Multisplit Pos 1 Badseq 10M Seqovl 681)');
		preset.value('general_fake_tls_alt3', 'Flowseal FAKE TLS ALT3 (Fake + Multisplit Pos 1 TS Seqovl 681 + Google BIN)');
		preset.value('general_simple_fake', 'Flowseal SIMPLE FAKE (Fake TS R6 + Google/Sferum BIN)');
		preset.value('general_simple_fake_alt', 'Flowseal SIMPLE FAKE ALT (Fake Badseq 2 + STUN2/Google/Sferum BIN)');
		preset.value('general_simple_fake_alt2', 'Flowseal SIMPLE FAKE ALT2 (Fake TS R6 + STUN2/Sferum BIN)');
		preset.value('general_exp', 'Flowseal EXP (Experimental Multisplit TS Seqovl 480 + STUN2/Sferum BIN)');

		preset.value('custom', t.preset_custom);
		preset.default = 'youtube_4k';

		var mode = s.option(form.ListValue, 'mode', t.scope, t.scope_desc);
		mode.value('all', t.scope_all);
		mode.value('list', t.scope_list);
		mode.default = 'all';

		var discord = s.option(form.Flag, 'discord_fix', t.discord, t.discord_desc);
		discord.default = '1';
		discord.rmempty = false;

		var game = s.option(form.Flag, 'game_fix', t.game_fix, t.game_fix_desc);
		game.default = '0';
		game.rmempty = false;

		var qnum = s.option(form.Value, 'qnum', t.qnum, t.qnum_desc);
		qnum.datatype = 'port';
		qnum.default = '200';

		var custom = s.option(form.Value, 'custom_args', t.custom_args, t.custom_args_desc);
		custom.depends('preset', 'custom');

		// 2. Exclusion List Section (Russian domestic services, banks, Gosuslugi)
		var s_exclude = m.section(form.NamedSection, 'zapret', 'zapret', t.section_exclude, t.desc_exclude);

		var excl_ru = s_exclude.option(form.Flag, 'exclude_ru', t.exclude_ru, t.exclude_ru_desc);
		excl_ru.rmempty = false;
		excl_ru.default = excl_ru.enabled;

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

		var autohost = s2.option(form.Flag, 'autohostlist', t.autohostlist, t.autohostlist_desc);
		autohost.rmempty = false;
		autohost.default = autohost.enabled;

		var auto_upd_hosts = s2.option(form.ListValue, 'auto_update_hosts', t.auto_update_hosts, t.auto_update_hosts_desc);
		auto_upd_hosts.value('disabled', t.upd_disabled);
		auto_upd_hosts.value('weekly', t.upd_weekly);
		auto_upd_hosts.value('daily', t.upd_daily);
		auto_upd_hosts.default = 'weekly';

		var btn_upd_h = s2.option(form.Button, '_update_hosts_btn', t.btn_update_hosts, t.btn_update_hosts_desc);
		btn_upd_h.inputtitle = t.btn_update_hosts;
		btn_upd_h.inputstyle = 'apply';
		btn_upd_h.onclick = function() {
			return fs.exec('/usr/bin/runet-fix', ['update-hosts']).then(function() {
				ui.addNotification(null, E('p', t.update_hosts_ok), 'info');
				setTimeout(function() { location.reload(); }, 1500);
			}).catch(function(e) {
				ui.addNotification(null, E('p', t.update_hosts_err + (e.message || e)), 'error');
			});
		};

		var hosts = s2.option(form.TextValue, '_hostlist');
		hosts.rows = 12;
		hosts.wrap = 'off';
		hosts.cfgvalue = function() {
			return hostlistContent;
		};
		hosts.write = function(section_id, formvalue) {
			return fs.write('/usr/share/runet-fix/lists/zapret-hosts.txt', formvalue.trim() + '\n');
		};

		// 4. Device Bypass (LAN exclusion by IP / MAC)
		var s_bypass = m.section(form.NamedSection, 'zapret', 'zapret', t.section_bypass, t.desc_bypass);
		var excl_ips = s_bypass.option(form.DynamicList, 'excluded_ips', t.excl_ips, t.excl_ips_desc);
		excl_ips.datatype = 'ip4addr';

		var excl_macs = s_bypass.option(form.DynamicList, 'excluded_macs', t.excl_macs, t.excl_macs_desc);
		excl_macs.datatype = 'macaddr';

		return m.render();
	}
});
