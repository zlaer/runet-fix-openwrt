# Runet-Fix: All-in-One решение для OpenWrt

**Runet-Fix** — это единое оптимизированное решение для роутеров под управлением **OpenWrt** (21.02, 22.03, 23.05, 24.x+), объединяющее три ключевые функции обхода блокировок и фильтрации трафика:

1. **Zapret (nfqws / nfqws2)** — эффективный обход DPI-блокировок YouTube (4K), Discord (голосовые каналы и медиа) и заблокированных сайтов с проверенными пресетами от Flowseal и bol-van.
2. **Transparent Telegram WebSocket Tunnel (tg-ws-proxy)** — модифицированный прозрачный прокси для клиентов Telegram. **Не требует настройки прокси на устройствах**: весь трафик Telegram в локальной сети (Wi-Fi и Ethernet) прозрачно перехватывается роутером и упаковывается в WebSocket-туннели через Cloudflare CDN / Workers на полной скорости.
3. **Smart Adblock** — сверхлегкая блокировка рекламы и трекеров (OISD, AdGuard RU), встроенная напрямую в штатный `dnsmasq` без запуска отдельных прожорливых демонов.
4. **Удобный веб-интерфейс в панели LuCI** — управление всеми тремя подсистемами, выбор пресетов, редактирование списков, диагностика и мониторинг логов в один клик.

---

## 🚀 Ключевые преимущества и оптимизация ресурсов

Обычные решения требуют запуска 3-4 отдельных тяжелых программ (Python, Node.js, v2ray/xray, AdGuardHome), потребляющих от 150 до 350 МБ оперативной памяти и перегружающих процессор роутера.

В **Runet-Fix** достигнута максимальная синергия и минимальное потребление ресурсов:

| Параметр | Обычный набор (Zapret + Python tg-ws + AdGuardHome) | **Runet-Fix (All-in-One)** | Экономия |
| :--- | :---: | :---: | :---: |
| **Оперативная память (RAM)** | 120 – 250 МБ | **< 4.5 МБ** (C-демоны + dnsmasq) | **до 95%** |
| **Размер на Flash-памяти** | 45 – 80 МБ (Python, runtime) | **< 450 КБ** (нативный пакет) | **до 99%** |
| **Нагрузка на CPU роутера** | 8 – 25% (перекладывание пакетов) | **< 1%** (zero-copy + connbytes) | **в 10 раз ниже** |
| **Настройка клиентов** | Ручная прописка MTProxy на каждом телефоне | **0 действий** (работает из коробки) | Полная прозрачность |

---

## 🧩 Архитектура решения и синергия

```mermaid
flowchart TD
    Client["Клиент (Телефон / ПК / ТВ)"] --> Router["Роутер OpenWrt"]
    
    subgraph OpenWrt ["Маршрутизация Runet-Fix"]
        DNS["dnsmasq (Smart Adblock)<br/>• Блокирует рекламу (0.0.0.0)<br/>• 0 extra RAM"]
        
        FW["Единый Firewall (nftables / iptables)<br/>• Исключает локальный трафик<br/>• Фильтрует по портам и протоколам"]
        
        TG["Transparent TG WS Proxy<br/>• Перехват TCP 80, 443, 5222, 8443<br/>• MTProto Obfuscated2 -> WebSocket"]
        
        ZAP["Zapret nfqws<br/>• Netfilter Queue 200<br/>• Desync: fake, multisplit, seqovl<br/>• YouTube 4K & Discord UDP/TCP"]
    end
    
    Client -- "DNS-запрос" --> DNS
    Client -- "Трафик Telegram (AS44907)" --> FW --> TG
    Client -- "YouTube / Discord / Сайты" --> FW --> ZAP
    
    TG -- "WSS (Cloudflare CDN / Workers)" --> TG_Server["Telegram DC1-DC5"]
    ZAP -- "Модифицированные пакеты (DPI bypass)" --> WAN["Провайдер / ТСПУ"]
```

### Как работает прозрачный обход блокировок Telegram:
1. Клиенты Telegram (Android, iOS, Windows, macOS, Telegram Web) по умолчанию подключаются к дата-центрам Telegram напрямую по протоколу MTProto Obfuscated2 на IP-адреса диапазонов `149.154.160.0/20`, `91.108.4.0/22`, `91.108.56.0/22` и др.
2. В сетях российских провайдеров прямые подключения к серверам медиа и звонков Telegram замедляются или сбрасываются ТСПУ.
3. Роутер с помощью правил `nftables` (fw4) или `iptables` (fw3) перенаправляет исходящие TCP-пакеты к подсетям Telegram на локальный прозрачный сокет (`SO_ORIGINAL_DST`, порт 1443).
4. Демон `tg-transproxy` / `tg_ws_transparent`:
   - Считывает оригинальный целевой IP дата-центра Telegram.
   - Декодирует прямой MTProto-хэндшейк клиента.
   - Устанавливает TLS WebSocket-соединение с доверенными ретрансляторами Cloudflare (`kws{dc}.*` или персональным Cloudflare Worker).
   - На лету транслирует MTProto-пакеты в бинарные кадры WebSocket и обратно.
5. **Результат:** Telegram на всех смартфонах, компьютерах и планшетах домашней сети работает с максимальной скоростью без зависания загрузки медиа, фото, видео и голосовых, и **без необходимости прописывать прокси**!

---

## 🖥️ Веб-интерфейс в панели LuCI

Пакет включает полнофункциональный веб-интерфейс на современном клиентом движке LuCI JavaScript API:

* **Обзор (Overview)**: единый статус трех подсистем (Zapret, Telegram, Adblock), PID процессов, количество заблокированных рекламных доменов, быстрые действия («Перезапустить», «Обновить списки», «Диагностика»).
* **Zapret (DPI)**:
  * Выбор готовых пресетов:
    * `Flowseal General` (YouTube 4K + Discord Voice/Media + General ISP Bypass)
    * `YouTube 4K Turbo` (Fake ClientHello + Multisplit Seqovl)
    * `Discord Full Fix` (Fake UDP STUN + Media TCP 2053-8443)
    * `Custom` (ручной ввод параметров nfqws)
  * Режим фильтрации: «Весь трафик» или «Только список доменов».
  * Переключатель фикса голосовых каналов Discord (UDP 50000-50100).
  * Встроенный редактор хостлиста.
* **Telegram Bypass**:
  * Переключатель прозрачного перехвата.
  * Выбор движка: `Native C (tg-transproxy)` для роутеров со слабой памятью или `Python Asyncio`.
  * Настройка пула Cloudflare-доменов и пользовательских воркеров.
  * Опциональный секрет MTProxy для гибридного режима.
* **Adblock**:
  * Профили: *Легкий* (OISD Small, ~40k доменов), *Стандартный* (+ AdGuard RU, ~65k доменов), *Агрессивный* (~120k доменов).
  * Редакторы белого и черного списков.
  * Расписание автообновления.
* **Диагностика и Логи**:
  * Встроенный тест доступности DNS, YouTube 4K, Discord Gateway, Telegram WebSocket Relay и прозрачной маршрутизации.
  * Просмотр системных логов в реальном времени.

---

## 📥 Установка на OpenWrt

### Вариант 1: Быстрая установка одной командой по SSH

Подключитесь к роутеру по SSH (`ssh root@192.168.1.1`) и выполните команду:

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/Flowseal/runet-fix/main/install.sh)"
```

Скрипт автоматически:
- Определит архитектуру процессора вашего роутера (mips, mipsel, aarch64, arm, x86_64).
- Определит версию файрвола (fw4 с nftables или fw3 с iptables).
- Установит необходимые зависимости ядра (`kmod-nft-queue`, `ipset`, `curl`).
- Настроит автозапуск и активирует меню в веб-интерфейсе LuCI.

---

### Вариант 2: Сборка пакета через OpenWrt SDK / ImageBuilder

1. Склонируйте репозиторий в каталог `package/` вашего OpenWrt SDK:
   ```sh
   git clone https://github.com/Flowseal/runet-fix.git package/runet-fix
   ```

2. Выберите пакеты в `make menuconfig`:
   ```text
   Network  --->
       Routing and Redirection  --->
           <*> runet-fix
   LuCI  --->
       3. Applications  --->
           <*> luci-app-runet-fix
   ```

3. Скомпилируйте пакеты:
   ```sh
   make package/runet-fix/compile V=s
   ```

4. Скопируйте получившиеся `.ipk` (или `.apk` для OpenWrt 24.x) файлы на роутер и установите:
   ```sh
   opkg install runet-fix_*.ipk luci-app-runet-fix_*.ipk
   ```

---

## 🛠️ Управление через командную строку (CLI)

Для удобства администрирования по SSH доступна утилита `runet-fix`:

```sh
# Проверить статус всех служб
runet-fix status

# Протестировать подключение к YouTube, Discord и Telegram
runet-fix test

# Принудительно обновить списки Adblock
runet-fix update-adblock

# Посмотреть состояние правил файрвола
runet-fix firewall

# Посмотреть свежие логи
runet-fix log

# Перезапустить сервис
runet-fix restart
```

---

## ⚙️ Конфигурация (`/etc/config/runet-fix`)

Файл конфигурации управляется стандартной подсистемой UCI OpenWrt:

```uci
config global 'main'
	option enabled '1'
	option log_level 'info'

config zapret 'zapret'
	option enabled '1'
	option preset 'flowseal_general'
	option mode 'all'
	option discord_fix '1'
	option qnum '200'

config telegram 'telegram'
	option enabled '1'
	option mode 'transparent'
	option port '1443'
	option engine 'auto'
	option custom_domains ''

config adblock 'adblock'
	option enabled '1'
	option profile 'standard'
	option auto_update 'weekly'
```

---

## 📄 Лицензия

MIT License. Свободно для частного и коммерческого использования.
Благодарности авторам:
- [bol-van](https://github.com/bol-van) за проект zapret и nfqws.
- [Flowseal](https://github.com/Flowseal) за пресеты zapret-discord-youtube и архитектуру tg-ws-proxy.
