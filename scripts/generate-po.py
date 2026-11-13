import os
import re
import json

MAPPING = {
    'Runet Fix': 'Runet Fix',
    'Overview': 'Обзор',
    'Zapret (DPI)': 'Zapret (DPI)',
    'Telegram Bypass': 'Обход блокировок Telegram',
    'Adblock': 'Блокировка рекламы',
    'Diagnostics & Logs': 'Диагностика и логи',

    'Smart Adblock (dnsmasq integration)': 'Умный Adblock (интеграция с dnsmasq)',
    'Ultra-lightweight DNS-level ad and tracking blocker. Loads high-quality filter lists directly into OpenWrt dnsmasq with zero background memory overhead.': 'Сверхлегкая блокировка рекламы и трекеров на уровне DNS. Загружает качественные фильтры прямо в dnsmasq без расхода оперативной памяти.',
    'Adblock Configuration': 'Настройки Adblock',
    'Enable Adblock': 'Включить блокировку рекламы',
    'Applies domain-level blocking via dnsmasq address configuration.': 'Блокирует рекламные домены через конфигурацию адресов dnsmasq.',
    'Active Status': 'Текущий статус',
    'ACTIVE': 'АКТИВЕН',
    'INACTIVE': 'НЕАКТИВЕН',
    'unique ad/tracking domains currently blocked in dnsmasq.': 'уникальных рекламных доменов заблокировано в dnsmasq.',
    'No active blocking rules loaded.': 'Правила блокировки не загружены.',
    'RU AdList Subscription (Yandex.Direct, VK/Mail.ru trackers, video players)': 'Подписка RU AdList (Яндекс.Директ, VK/Mail.ru трекеры, кинотеатры)',
    'Adds specialized filters for blocking Russian ads, trackers, counters, and web players.': 'Добавляет специализированные фильтры блокировки русскоязычной рекламы, счетчиков и онлайн-видеоплееров.',
    'Filter Profile': 'Профиль фильтрации',
    'Select filter intensity. Standard profile includes StevenBlack Unified and Russian filters.': 'Выберите профиль фильтрации. Стандартный включает StevenBlack Unified и русские фильтры.',
    'Micro (<2 MB RAM - curated RU AdList ~15k domains, for 64MB RAM routers)': 'Микро (<2 МБ ОЗУ - только RU AdList ~15 тыс. доменов, для роутеров 64 МБ RAM)',
    'Standard (StevenBlack + RU AdList ~76k domains)': 'Стандартный (StevenBlack + RU AdList ~76 тыс. доменов)',
    'Aggressive (Standard + Anti-Coinminer protection)': 'Агрессивный (Стандартный + защита от скрытого майнинга)',
    'Filter IPv6 AAAA Queries (filter-aaaa)': 'Защита от обхода через IPv6 (filter-aaaa)',
    'Filters out AAAA (IPv6) DNS responses, forcing all LAN devices over IPv4 through Zapret and proxy tunnels without leaks.': 'Блокирует AAAA (IPv6) DNS-ответы, принудительно направляя устройства исключительно по IPv4 через Zapret и прокси без утечек.',
    'Automatic List Update (Cron)': 'Автоматическое обновление списков (Cron)',
    'Automatically downloads updated filter rules in background.': 'Автоматически загружает свежие правила фильтрации в фоновом режиме.',
    'Weekly (Every Sunday at 04:00 - Recommended)': 'Еженедельно (Каждое воскресенье в 04:00 - Рекомендуется)',
    'Daily (Every night at 04:00)': 'Ежедневно (Каждую ночь в 04:00)',
    'Disabled (Manual update only)': 'Отключено (Только ручное обновление)',
    'Custom Whitelist & Blacklist': 'Белый и черный списки пользователя',
    'Whitelist (Never Block)': 'Белый список (Никогда не блокировать)',
    'Domains to exclude from adblocking. One domain per line.': 'Домены, которые нельзя блокировать. По одному домену на строку.',
    'Blacklist (Always Block)': 'Черный список (Всегда блокировать)',
    'Additional domains or tracking hosts to block. One domain per line.': 'Дополнительные рекламные хосты или трекеры для блокировки. По одному домену на строку.',

    'Telegram Transparent Gateway (Zero Client Configuration)': 'Прозрачный шлюз Telegram (Без настройки на устройствах)',
    'Automatically intercepts and tunnels Telegram traffic at the router level. No proxy configuration is required on phones, PCs, or Smart TVs — Telegram works out-of-the-box for all LAN devices.': 'Автоматически перехватывает и туннелирует трафик Telegram на уровне роутера. На смартфонах, компьютерах и Smart TV настраивать прокси НЕ нужно — Telegram работает штатно для всех устройств в домашней сети.',
    'Transparent Gateway Parameters': 'Параметры прозрачного шлюза',
    'Enable Telegram Transparent Gateway': 'Включить прозрачный шлюз Telegram',
    'Router firewall intercepts outgoing Telegram DC traffic and tunnels it around ISP throttling.': 'Файрвол роутера автоматически перехватывает соединения к дата-центрам Telegram и туннелирует их в обход ТСПУ.',
    'Zero Client Configuration Mode:': 'Режим без настройки устройств (Zero Configuration):',
    'All devices on your network (iPhone, Android, Windows, Mac, Smart TV) connect to Telegram automatically.<br>You <b>do not</b> need to configure proxy settings in Telegram apps on any device.': 'Все устройства в вашей сети (iPhone, Android, Windows, Mac, Smart TV) подключаются к Telegram автоматически.<br>Вам <b>не нужно</b> включать прокси в настройках Telegram на телефонах или компьютерах.',
    'Cloudflare Worker Setup (Advanced)': 'Настройка Cloudflare Worker (дополнительно)',
    'How to get a free Cloudflare Worker address (2 minutes):': 'Как получить бесплатный адрес Cloudflare Worker (2 минуты):',
    '1. Register at <a href="https://dash.cloudflare.com" target="_blank" style="color:#38bdf8;text-decoration:underline;">dash.cloudflare.com</a> and go to <b>Workers & Pages</b> → <b>Create application</b>.<br>2. Click <b>Create Worker</b> → <b>Deploy</b> → then <b>Edit code</b>.<br>3. Paste the websocket bridge script and click <b>Deploy</b>.<br>4. Copy your assigned <code>*.workers.dev</code> address and paste it into the field above.': '1. Зарегистрируйтесь на <a href="https://dash.cloudflare.com" target="_blank" style="color:#38bdf8;text-decoration:underline;">dash.cloudflare.com</a> и перейдите в <b>Workers & Pages</b> → <b>Create application</b>.<br>2. Нажмите <b>Create Worker</b> → <b>Deploy</b> → затем <b>Edit code</b>.<br>3. Вставьте скрипт websocket-моста и нажмите <b>Deploy</b>.<br>4. Скопируйте полученный домен (<code>*.workers.dev</code>) и вставьте в поле выше.',
    'Cloudflare Worker (Relay Address)': 'Cloudflare Worker (Адрес реле)',
    'Address of your free Cloudflare Worker (e.g. my-tg.username.workers.dev). Router tunnels Telegram traffic for all home devices through this relay, bypassing ISP blocks. Multiple can be comma-separated.': 'Адрес вашего бесплатного воркера (например: my-tg.username.workers.dev). Роутер пропускает через него трафик Telegram всех устройств, полностью обходя блокировку провайдера и ускоряя загрузку фото/видео. Можно указать несколько через запятую.',
    'Custom Cloudflare Relay Domains (CfProxy)': 'Дополнительные домены Cloudflare (CfProxy)',
    'Custom domains pointed to Cloudflare (kws1..kws5). Leave empty if using Worker.': 'Пользовательские домены, направленные на Cloudflare (kws1..kws5). Оставьте пустым, если указан Worker.',
    'Internal Service Port': 'Порт внутреннего сервиса',
    'Local router port where transparent traffic is handled (default: 1443).': 'Локальный порт роутера для прозрачной маршрутизации (по умолчанию 1443).',
    'Optional: Manual MTProxy Connection': 'Дополнительно: Ручное подключение MTProxy',
    'Use only if connecting guest devices outside your home network:': 'Если вам требуется подключить гостевое устройство вне домашней сети или использовать прямое MTProto-подключение:',
    'Connect in Telegram': 'Подключить в Telegram',
    't.me Link': 'Ссылка t.me',
    'Copy': 'Копировать',
    'MTProxy Secret': 'Секрет MTProxy',

    'Zapret (DPI Circumvention)': 'Zapret (Обход блокировок DPI)',
    'Configures nfqws packet desynchronization for unthrottling YouTube 4K, Discord voice & media, and ISP-blocked sites.': 'Настройка десинхронизации пакетов nfqws для ускорения YouTube 4K, Discord и заблокированных сайтов.',
    'Zapret Engine Settings': 'Настройки движка Zapret',
    'Enable Zapret DPI Engine': 'Включить движок Zapret DPI',
    'Directs selected outgoing TCP/UDP traffic to Netfilter queue for desynchronization.': 'Направляет исходящий трафик в очередь Netfilter для десинхронизации пакетов.',
    'Active DPI Bypass Preset': 'Профиль стратегии обхода DPI',
    'Select a desync strategy profile to bypass TSPU/DPI blocking for YouTube 4K, Discord, and other resources.': 'Выберите профиль десинхронизации для обхода ТСПУ/DPI для YouTube 4K, Discord и других ресурсов.',
    'Custom Arguments (Enter below)': 'Пользовательские аргументы (введите ниже)',
    'Traffic Interception Scope': 'Область перехвата трафика',
    'Select filtering mode: all traffic, target hostlist only, or target hostlist with auto-detection.': 'Выберите режим фильтрации: весь трафик, по списку или по списку с авто-обнаружением блокировок.',
    'All Outgoing Traffic (Recommended for full coverage)': 'Весь исходящий трафик (Рекомендуется для полной работы)',
    'Target Hostlist Only (Conserves router CPU)': 'Только целевой список доменов (Экономит CPU роутера)',
    'Target Hostlist + Auto-Detect (Learns blocked domains automatically)': 'Список + авто-обнаружение блокировок (Автоматически добавляет недоступные домены)',
    'Intercept Discord Voice UDP Ports': 'Перехват голосовых портов Discord UDP',
    'Queues UDP ports 50000-50100 and 19294-19344 with fake STUN packets to restore Discord voice channels.': 'Направляет UDP-порты 50000-50100 и 19294-19344 с фейковыми STUN-пакетами для восстановления голосовых каналов Discord.',
    'Online Games UDP Acceleration (Game UDP Fix)': 'Ускорение онлайн-игр (Game UDP Fix)',
    'Desynchronizes UDP ports 27015-27050 and 7777-7780 (Steam, CS2, Dota 2, GTA Online) with game binary patterns to eliminate TSPU packet drops.': 'Направляет сетевые UDP-порты 27015-27050 и 7777-7780 (Steam, CS2, Dota 2, GTA Online) через Netfilter с игровыми бинарными паттернами для предотвращения потерь пакетов.',
    'Netfilter Queue Number (QNUM)': 'Номер очереди Netfilter (QNUM)',
    'Kernel queue index used for packet exchange between firewall and nfqws.': 'Номер очереди ядра Linux для обмена пакетами между файрволом и nfqws.',
    'Custom nfqws Arguments': 'Пользовательские аргументы nfqws',
    'Used only when Preset is set to "Custom". Example: --dpi-desync=fake,split2 --dpi-desync-split-pos=1': 'Используется только при выборе профиля «Пользовательские аргументы». Пример: --dpi-desync=fake,split2 --dpi-desync-split-pos=1',
    'Exclusion List (Custom Blacklist)': 'Список исключений (Exclusion List)',
    'Custom user exclusion list of domains that should NOT be desynchronized. All subdomains are automatically excluded. One domain per line.': 'Пользовательский список доменов (черный список), которые НЕ должны подвергаться десинхронизации пакетов. Все поддомены исключаются автоматически. По одному домену на строку.',
    'Exclude RU zone (.ru, .рф, .su)': 'Исключать зону РФ (.ru, .рф, .su)',
    'Excludes .ru, .рф, .su domain suffixes across all desync profiles without downloading large lists.': 'Исключение по суффиксу домена .ru, .рф, .su из всех профилей десинхронизации. Полный список доменов не скачивается.',
    'Zapret Target Hostlist': 'Целевой список доменов (Hostlist)',
    'Domains that are desynchronized in "Target Hostlist Only" and "Target Hostlist + Auto-Detect" modes. One domain per line.': 'Домены, которые обрабатываются через Zapret в режимах «Только список» и «Список + авто-обнаружение». По одному домену на строку.',
    'Auto-Update Blocked Hostlist': 'Авто-обновление списка блокировок',
    'Periodically fetch the latest curated AntiFilter Community blocked domains list.': 'Периодическая загрузка свежего курируемого списка заблокированных доменов AntiFilter Community.',
    'Disabled': 'Отключено',
    'Weekly (Recommended)': 'Еженедельно (Рекомендуется)',
    'Daily': 'Ежедневно',
    'Update list from AntiFilter Community': 'Обновить список из AntiFilter Community',
    'Download latest blocked domains and merge with your custom hostlist.': 'Загрузить свежие заблокированные домены и объединить с вашим локальным списком.',
    'Zapret hostlist updated successfully!': 'Список заблокированных доменов успешно обновлен!',
    'Error updating hostlist: ': 'Ошибка при обновлении списка: ',
    'Auto-Discovered Domains (Auto-Hostlist)': 'Автоматически обнаруженные домены (Auto-Hostlist)',
    'Domains that were dynamically identified by nfqws as blocked and added to DPI bypass (persists across reboots).': 'Домены, которые были автоматически определены nfqws как заблокированные и добавлены в обход DPI (сохраняются между перезагрузками).',
    'Clear Auto-List': 'Очистить авто-список',
    'Auto-list cleared successfully!': 'Авто-список успешно очищен!',
    'Error clearing auto-list: ': 'Ошибка при очистке авто-списка: ',
    'Device Bypass (LAN Exclusion)': 'Исключение устройств локальной сети (Device Bypass)',
    'Local LAN devices (work VPN laptops, Smart TVs, consoles) whose traffic should bypass Zapret and Telegram proxies entirely.': 'Устройства в домашней сети (рабочие ноутбуки с VPN, Smart TV, приставки), трафик которых должен идти напрямую без десинхронизации Zapret и проксирования Telegram.',
    'Add Connected Device': 'Добавить подключенное устройство',
    'Select an active device from your network to add to the exclusion list.': 'Выберите активное устройство из сети роутера для добавления в список исключений.',
    '-- Select device from DHCP leases --': '-- Выберите устройство из списка DHCP --',
    'Add to Exclusions': 'Добавить в исключения',
    'Device added to exclusions: ': 'Устройство добавлено в исключения: ',
    'Excluded IP Addresses': 'Исключенные IP-адреса',
    'IPv4 address (e.g. 192.168.1.150). One per item.': 'IPv4-адрес устройства (например: 192.168.1.150). По одному адресу на строку.',
    'Excluded MAC Addresses': 'Исключенные MAC-адреса',
    'MAC address (e.g. AA:BB:CC:DD:EE:FF). One per item.': 'MAC-адрес устройства (например: AA:BB:CC:DD:EE:FF). По одному на строку.',

    'Runet Fix - All-in-One Dashboard': 'Runet Fix - Панель управления',
    'Unified high-performance suite for OpenWrt: Zapret DPI bypass, Transparent Telegram WebSocket tunnel, and Smart Adblock.': 'Единый комплекс для OpenWrt: обход блокировок Zapret DPI, прозрачный WebSocket туннель Telegram и умная блокировка рекламы.',
    'Master Switch & System Overview': 'Главный переключатель и состояние системы',
    'Enable All Services': 'Включить все службы',
    'Globally enables or disables all Runet-Fix subsystems.': 'Глобально включает или отключает все подсистемы Runet-Fix.',
    'Runet-Fix Version': 'Версия Runet-Fix',
    'Check for Updates': 'Проверить обновления',
    'Update': 'Обновить',
    'Checking GitHub...': 'Сверка с GitHub...',
    'Update available': 'Доступно обновление',
    'Update to': 'Обновить до',
    'Latest version installed': 'Установлена последняя версия',
    'Response error': 'Ошибка ответа',
    'Update Runet-Fix to version v': 'Выполнить обновление Runet-Fix до версии v',
    'Update Runet-Fix from GitHub to the latest version?': 'Выполнить обновление Runet-Fix с GitHub до последней версии?',
    'Updating Runet-Fix': 'Обновление Runet-Fix',
    'Downloading latest release from GitHub, updating files and restarting services...': 'Загрузка свежего релиза с GitHub, обновление бинарных файлов, скриптов и перезапуск сервисов...',
    'Update installed successfully! Reloading page...': 'Обновление успешно установлено! Перезагрузка страницы...',
    'Update error: ': 'Ошибка при обновлении: ',
    'Run Zapret Autotune?\n\nKey strategies will be benchmarked against YouTube and Discord (~10-15s). The fastest working preset will be activated automatically.': 'Запустить авто-подбор пресета Zapret?\n\nБудет выполнено тестирование ключевых стратегий против серверов YouTube и Discord (~10-15 сек). Лучший пресет будет автоматически применен.',
    'Zapret Autotune': 'Авто-подбор пресета Zapret',
    'Benchmarking desync strategies (Flowseal General, YouTube 4K, ALT, FAKE TLS)... Please wait.': 'Идет тестирование стратегий десинхронизации (Flowseal General, YouTube 4K, ALT, FAKE TLS)... Пожалуйста, подождите.',
    'Fastest preset activated: ': 'Успешно подобран и активирован пресет: ',
    'Autotune result: ': 'Результат теста: ',
    'Autotune error: ': 'Ошибка при авто-подборе: ',
    'Testing...': 'Проверка...',
    'Test Services (1 sec)': 'Проверить сервисы (1 сек)',
    'Available': 'Доступен',
    'Blocked': 'Заблокирован',
    'Unavailable': 'Недоступен',
    '(Tunnel :1443 active)': '(Туннель :1443 активен)',
    'sessions: ': 'сессий: ',
    'Connected': 'Подключен',
    'STOPPED': 'ОСТАНОВЛЕН',
    '(Blocking active)': '(Блокировка работает)',
    'DNS OK': 'DNS OK',
    'DNS Error': 'Ошибка DNS',
    'RPC Error: ': 'Ошибка RPC: ',
    'Working...': 'Выполняется...',
    'Success!': 'Успешно!',
    'Warning! Are you sure you want to completely uninstall Runet-Fix from this router?\n\nAll services will be stopped, nftables rules removed, cron jobs cleaned, and all scripts, lists, and LuCI web views deleted.\nConfig backup will be saved in /etc/config/.\n\nType UNINSTALL to confirm:': 'Внимание! Вы действительно хотите полностью удалить Runet-Fix с роутера?\n\nБудут остановлены все службы, удалены правила файрвола nftables, очищен cron, удалены все скрипты, списки и веб-интерфейс LuCI.\nБэкап конфигурации будет сохранён в /etc/config/.\n\nВведите слово UNINSTALL для подтверждения:',
    'Uninstall cancelled: confirmation mismatch': 'Удаление отменено: подтверждение не совпадает',
    'Uninstalling Runet-Fix from router...': 'Удаление Runet-Fix с роутера...',
    'Uninstall Runet-Fix': 'Удаление Runet-Fix',
    'Runet-Fix has been removed. Redirecting...': 'Runet-Fix успешно удален. Перенаправление...',
    'Completely Uninstall Runet-Fix': 'Полностью удалить Runet-Fix',
    'Subsystem Status': 'Состояние подсистем',
    'hostlist: ': 'по списку: ',
    'domains': 'доменов',
    'RUNNING': 'РАБОТАЕТ',
    'act., total: ': 'акт., всего: ',
    'Zapret (YouTube 4K & Discord DPI)': 'Zapret (YouTube 4K и Discord DPI)',
    'Telegram Transparent Proxy': 'Telegram Transparent Proxy',
    '(Zero-config for whole LAN)': '(Без настройки клиентов, для всей сети)',
    'dnsmasq Smart Adblock': 'dnsmasq Smart Adblock',
    '(0 extra daemons, RAM optimized)': '(Без фоновых демонов, экономия ОЗУ)',
    'Service Availability Diagnostics (RuNet Health Probe)': 'Диагностика доступности сервисов (RuNet Health Probe)',
    'Real-Time Network Health Probe': 'Проверка сетевых сервисов в реальном времени',
    'Instant verification (1–2 sec): YouTube 4K, Discord Gateway, Telegram tunnel, and adblock status.': 'Мгновенная проверка (1–2 сек): доступность YouTube 4K, Discord Gateway, Telegram туннеля и блокировки рекламы.',
    'YouTube 4K (DPI)': 'YouTube 4K (DPI)',
    'Not checked': 'Не проверялось',
    'Discord Gateway': 'Discord Gateway',
    'Telegram WebSocket': 'Telegram WebSocket',
    'DNS & Adblock': 'DNS и Adblock',
    'Quick Actions': 'Быстрые действия',
    'Restart Services': 'Перезапустить службы',
    'Update Zapret Hosts': 'Обновить список Zapret',
    'Update Adblock Now': 'Обновить Adblock',
    'Refresh Status': 'Обновить статус',
    'Completely remove the Runet-Fix suite, stop all daemons, delete nftables firewall rules, clean cron schedule and LuCI web views.': 'Полное и чистое удаление пакета Runet-Fix, остановка служб, сброс правил файрвола nftables, очистка cron и интерфейса LuCI.',

    # diagnostics.js strings
    'Runet Fix - Diagnostics & System Logs': 'Runet Fix - Диагностика и логи',
    'Check connectivity status to YouTube, Discord, and Telegram WebSocket relays, and view live system logs.': 'Проверка доступности YouTube, Discord и WebSocket-реле Telegram, а также просмотр системных логов.',
    'Connectivity Test': 'Тест сетевой доступности',
    'Running Tests...': 'Тестирование...',
    'Rerun Test': 'Повторить тест',
    'Error Running Test': 'Ошибка выполнения теста',
    'Recent System Logs': 'Системные логи',
    'Refresh Logs': 'Обновить логи',
}

def escape_po(s):
    return s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n"\n"')

def main():
    os.makedirs('po/templates', exist_ok=True)
    os.makedirs('po/ru', exist_ok=True)

    header = (
        'msgid ""\n'
        'msgstr ""\n'
        '"Project-Id-Version: runet-fix 1.5.2\\n"\n'
        '"Report-Msgid-Bugs-To: \\n"\n'
        '"POT-Creation-Date: 2026-11-13 00:00+0300\\n"\n'
        '"PO-Revision-Date: 2026-11-13 00:00+0300\\n"\n'
        '"Last-Translator: Flowseal & bol-van community\\n"\n'
        '"Language-Team: Russian\\n"\n'
        '"Language: ru\\n"\n'
        '"MIME-Version: 1.0\\n"\n'
        '"Content-Type: text/plain; charset=UTF-8\\n"\n'
        '"Content-Transfer-Encoding: 8bit\\n"\n'
        '"Plural-Forms: nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);\\n"\n\n'
    )

    pot_header = (
        'msgid ""\n'
        'msgstr ""\n'
        '"Project-Id-Version: runet-fix 1.5.2\\n"\n'
        '"Report-Msgid-Bugs-To: \\n"\n'
        '"POT-Creation-Date: 2026-11-13 00:00+0300\\n"\n'
        '"MIME-Version: 1.0\\n"\n'
        '"Content-Type: text/plain; charset=UTF-8\\n"\n'
        '"Content-Transfer-Encoding: 8bit\\n"\n\n'
    )

    with open('po/templates/runet-fix.pot', 'w', encoding='utf-8') as pot, \
         open('po/ru/runet-fix.po', 'w', encoding='utf-8') as po:
        
        pot.write(pot_header)
        po.write(header)

        for en_str in sorted(MAPPING.keys()):
            ru_str = MAPPING[en_str]

            pot.write(f'msgid "{escape_po(en_str)}"\n')
            pot.write('msgstr ""\n\n')

            po.write(f'msgid "{escape_po(en_str)}"\n')
            po.write(f'msgstr "{escape_po(ru_str)}"\n\n')

    print(f"Generated po/templates/runet-fix.pot and po/ru/runet-fix.po ({len(MAPPING)} entries)")

if __name__ == '__main__':
    main()
