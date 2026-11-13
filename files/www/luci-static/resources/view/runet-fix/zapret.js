'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('runet-fix'),
			fs.read('/usr/share/runet-fix/lists/zapret-hosts.txt').catch(function() { return ''; }),
			fs.read('/usr/share/runet-fix/lists/zapret-exclude.txt').catch(function() { return ''; }),
			fs.read('/usr/share/runet-fix/lists/zapret-hosts-auto.txt').catch(function() { return ''; }),
			fs.read('/tmp/dhcp.leases').catch(function() { return ''; })
		]);
	},

	render: function(data) {
		var hostlistContent = data[1] || '';
		var excludelistContent = data[2] || '';
		var autoHostsContent = data[3] || '';
		var dhcpLeasesContent = data[4] || '';

		var m = new form.Map('runet-fix',
			_('Zapret (DPI Circumvention)'),
			_('Configures nfqws packet desynchronization for unthrottling YouTube 4K, Discord voice & media, and ISP-blocked sites.'));

		// 1. Zapret Engine Settings Section
		var s = m.section(form.NamedSection, 'zapret', 'zapret', _('Zapret Engine Settings'));

		var o_en = s.option(form.Flag, 'enabled', _('Enable Zapret DPI Engine'), _('Directs selected outgoing TCP/UDP traffic to Netfilter queue for desynchronization.'));
		o_en.rmempty = false;
		o_en.default = o_en.enabled;

		var preset = s.option(form.ListValue, 'preset', _('Active DPI Bypass Preset'), _('Select a desync strategy profile to bypass TSPU/DPI blocking for YouTube 4K, Discord, and other resources.'));
		
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

		preset.value('custom', _('Custom Arguments (Enter below)'));
		preset.default = 'youtube_4k';

		var mode = s.option(form.ListValue, 'mode', _('Traffic Interception Scope'), _('Select filtering mode: all traffic, target hostlist only, or target hostlist with auto-detection.'));
		mode.value('all', _('All Outgoing Traffic (Recommended for full coverage)'));
		mode.value('list', _('Target Hostlist Only (Conserves router CPU)'));
		mode.value('list_auto', _('Target Hostlist + Auto-Detect (Learns blocked domains automatically)'));
		mode.default = 'all';

		var discord = s.option(form.Flag, 'discord_fix', _('Intercept Discord Voice UDP Ports'), _('Queues UDP ports 50000-50100 and 19294-19344 with fake STUN packets to restore Discord voice channels.'));
		discord.default = '1';
		discord.rmempty = false;

		var game = s.option(form.Flag, 'game_fix', _('Online Games UDP Acceleration (Game UDP Fix)'), _('Desynchronizes UDP ports 27015-27050 and 7777-7780 (Steam, CS2, Dota 2, GTA Online) with game binary patterns to eliminate TSPU packet drops.'));
		game.default = '0';
		game.rmempty = false;

		var qnum = s.option(form.Value, 'qnum', _('Netfilter Queue Number (QNUM)'), _('Kernel queue index used for packet exchange between firewall and nfqws.'));
		qnum.datatype = 'port';
		qnum.default = '200';

		var custom = s.option(form.Value, 'custom_args', _('Custom nfqws Arguments'), _('Used only when Preset is set to "Custom". Example: --dpi-desync=fake,split2 --dpi-desync-split-pos=1'));
		custom.depends('preset', 'custom');

		// 2. Exclusion List Section (Universal RU zone exclude + custom blacklist)
		var s_exclude = m.section(form.NamedSection, 'zapret', 'zapret', _('Exclusion List (Custom Blacklist)'), _('Custom user exclusion list of domains that should NOT be desynchronized. All subdomains are automatically excluded. One domain per line.'));

		var excl_ru = s_exclude.option(form.Flag, 'exclude_ru', _('Exclude RU zone (.ru, .рф, .su)'), _('Excludes .ru, .рф, .su domain suffixes across all desync profiles without downloading large lists.'));
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

		// 3. Hostlist Section (Used when mode is "list" or "list_auto")
		var s2 = m.section(form.NamedSection, 'zapret', 'zapret', _('Zapret Target Hostlist'), _('Domains that are desynchronized in "Target Hostlist Only" and "Target Hostlist + Auto-Detect" modes. One domain per line.'));

		var auto_upd_hosts = s2.option(form.ListValue, 'auto_update_hosts', _('Auto-Update Blocked Hostlist'), _('Periodically fetch the latest curated AntiFilter Community blocked domains list.'));
		auto_upd_hosts.value('disabled', _('Disabled'));
		auto_upd_hosts.value('weekly', _('Weekly (Recommended)'));
		auto_upd_hosts.value('daily', _('Daily'));
		auto_upd_hosts.default = 'weekly';

		var btn_upd_h = s2.option(form.Button, '_update_hosts_btn', _('Update list from AntiFilter Community'), _('Download latest blocked domains and merge with your custom hostlist.'));
		btn_upd_h.inputtitle = _('Update list from AntiFilter Community');
		btn_upd_h.inputstyle = 'apply';
		btn_upd_h.onclick = function() {
			return fs.exec('/usr/bin/runet-fix', ['update-hosts']).then(function() {
				ui.addNotification(null, E('p', _('Zapret hostlist updated successfully!')), 'info');
				setTimeout(function() { location.reload(); }, 1500);
			}).catch(function(e) {
				ui.addNotification(null, E('p', _('Error updating hostlist: ') + (e.message || e)), 'error');
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

		// 4. Auto-Discovered Hostlist Section
		var s_auto = m.section(form.NamedSection, 'zapret', 'zapret', _('Auto-Discovered Domains (Auto-Hostlist)'), _('Domains that were dynamically identified by nfqws as blocked and added to DPI bypass (persists across reboots).'));
		var autohosts_view = s_auto.option(form.TextValue, '_autohostlist');
		autohosts_view.rows = 8;
		autohosts_view.readonly = true;
		autohosts_view.wrap = 'off';
		autohosts_view.cfgvalue = function() {
			return autoHostsContent;
		};

		var btn_clear_auto = s_auto.option(form.Button, '_clear_auto_btn', _('Clear Auto-List'));
		btn_clear_auto.inputtitle = _('Clear Auto-List');
		btn_clear_auto.inputstyle = 'remove';
		btn_clear_auto.onclick = function() {
			return fs.write('/usr/share/runet-fix/lists/zapret-hosts-auto.txt', '').then(function() {
				ui.addNotification(null, E('p', _('Auto-list cleared successfully!')), 'info');
				setTimeout(function() { location.reload(); }, 1000);
			}).catch(function(e) {
				ui.addNotification(null, E('p', _('Error clearing auto-list: ') + (e.message || e)), 'error');
			});
		};

		// 5. Device Bypass (LAN exclusion by IP / MAC)
		var s_bypass = m.section(form.NamedSection, 'zapret', 'zapret', _('Device Bypass (LAN Exclusion)'), _('Local LAN devices (work VPN laptops, Smart TVs, consoles) whose traffic should bypass Zapret and Telegram proxies entirely.'));

		var clients = [];
		var leaseLines = (dhcpLeasesContent || '').trim().split('\n');
		for (var li = 0; li < leaseLines.length; li++) {
			var parts = leaseLines[li].trim().split(/\s+/);
			if (parts.length >= 3) {
				var devMac = parts[1].toLowerCase();
				var devIp = parts[2];
				var devName = (parts[3] && parts[3] !== '*') ? parts[3] : devIp;
				if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(devMac)) {
					clients.push({ mac: devMac, ip: devIp, name: devName });
				}
			}
		}

		if (clients.length > 0) {
			var dev_pick = s_bypass.option(form.ListValue, '_dev_picker', _('Add Connected Device'), _('Select an active device from your network to add to the exclusion list.'));
			dev_pick.value('', _('-- Select device from DHCP leases --'));
			clients.forEach(function(c) {
				dev_pick.value(c.mac, c.name + ' (' + c.ip + ' - ' + c.mac + ')');
			});

			var btn_add_dev = s_bypass.option(form.Button, '_add_dev_btn', _('Add to Exclusions'));
			btn_add_dev.inputtitle = _('Add to Exclusions');
			btn_add_dev.inputstyle = 'apply';
			btn_add_dev.onclick = function() {
				var sel_mac = dev_pick.formvalue('zapret');
				if (sel_mac && sel_mac !== '') {
					var current_macs = uci.get('runet-fix', 'zapret', 'excluded_macs') || [];
					if (!Array.isArray(current_macs)) current_macs = [current_macs];
					current_macs = current_macs.filter(function(x) { return x && x.trim() !== ''; });
					if (current_macs.indexOf(sel_mac) === -1) {
						current_macs.push(sel_mac);
						uci.set('runet-fix', 'zapret', 'excluded_macs', current_macs);
						uci.save();
						ui.addNotification(null, E('p', _('Device added to exclusions: ') + sel_mac), 'info');
						setTimeout(function() { location.reload(); }, 1000);
					}
				}
			};
		}

		var excl_ips = s_bypass.option(form.DynamicList, 'excluded_ips', _('Excluded IP Addresses'), _('IPv4 address (e.g. 192.168.1.150). One per item.'));
		excl_ips.datatype = 'ip4addr';
		excl_ips.rmempty = true;

		var excl_macs = s_bypass.option(form.DynamicList, 'excluded_macs', _('Excluded MAC Addresses'), _('MAC address (e.g. AA:BB:CC:DD:EE:FF). One per item.'));
		excl_macs.datatype = 'macaddr';
		excl_macs.rmempty = true;

		return m.render();
	}
});
