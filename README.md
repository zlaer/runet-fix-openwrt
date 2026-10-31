# Runet-Fix: All-in-One решение для OpenWrt

[![OpenWrt](https://img.shields.io/badge/OpenWrt-21.02_--_25.x-blue.svg)](https://openwrt.org)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub release](https://img.shields.io/badge/Release-v1.1.0-orange.svg)](https://github.com/zlaer/runet-fix-openwrt)
[![AI Generated](https://img.shields.io/badge/AI-Generated_Project-blueviolet.svg)](#)

> [!NOTE]
> **Проект разработан при помощи искусственного интеллекта (AI-Generated / AI-Assisted)**  
> Данный проект, архитектура интеграции компонентов, веб-интерфейс LuCI, скрипты автоматизации и документация полностью созданы и сопровождаются с использованием технологий ИИ.

**Runet-Fix** — это единый высокопроизводительный программный комплекс для роутеров под управлением **OpenWrt** (21.02, 22.03, 23.05, 24.x, 25.x+), объединяющий все необходимые инструменты для обхода блокировок и ускорения сети в Рунете:

1. **Zapret (nfqws / nfqws2)** — эффективный обход DPI-блокировок YouTube (4K/60fps), Discord (голосовые каналы WebRTC/STUN и медиапотоки) и заблокированных веб-сайтов. Включает полную библиотеку из 22 пресетов Flowseal (включая ALT, FAKE TLS и EXP) и 23 оригинальных бинарных шаблона легитимных российских сервисов (Сферум, 4PDA, Ozon, Mail.ru).
2. **Transparent Telegram WebSocket Tunnel (tg-ws-proxy)** — прозрачный шлюз для клиентов Telegram. **Не требует ручной настройки прокси на устройствах**: трафик клиентов в домашней сети автоматически перехватывается роутером и направляется через Cloudflare WebSocket туннели или пользовательские воркеры на полной скорости провайдера.
3. **Smart Adblock** — фильтрация рекламы, счетчиков и трекеров Рунета (OISD, AdGuard RU), встроенная напрямую в штатный `dnsmasq` роутера. Работает без запуска сторонних демонов и не расходует оперативную память.
4. **Защита от ECH-блокировок и DoH-утечек** — автоматическая вырезка DNS-записей Type 65 (HTTPS RR) через `filter-rr=65` и блокировка канареечного домена DoH, что предотвращает блокировку браузерного Discord и современных сайтов со стороны ТСПУ.
5. **Двуязычный интерфейс LuCI (RU / ENG)** — мониторинг статуса служб, замер задержек (RuNet Health Probe), переключение пресетов, редактирование списков, просмотр системных логов и **обновление прошивки/пакета в 1 клик прямо из панели управления**.

---

## Веб-интерфейс в панели LuCI

Пакет включает современный веб-интерфейс на базе LuCI JavaScript API:

* **Обзор (Overview)**:
  * Статус служб: Zapret, Telegram Transparent Proxy, dnsmasq Smart Adblock (с количеством заблокированных доменов).
  * **Виджет версии и обновлений**: отображение текущей версии, сверка с GitHub и кнопка обновления в один клик.
  * **Экспресс-диагностика RuNet Health Probe**: проверка доступности YouTube 4K, Discord Gateway, туннеля Telegram и DNS за 1–2 секунды с замером задержки.
  * Быстрые действия: перезапуск служб, переход в настройки Zapret, обновление Adblock, смена языка интерфейса (RU/ENG), удаление пакета.
* **Zapret (DPI)**:
  * Выбор из 22 проверенных пресетов:
    * `YouTube 4K Multisplit` (Рекомендуемый - Multisplit + Seqovl)
    * `Flowseal General` (Multisplit Pos 1 Seqovl 568 + 4PDA BIN)
    * Линейка `Flowseal ALT (ALT1–ALT13)`
    * Семейство `Flowseal FAKE TLS AUTO / ALT`
    * `Flowseal SIMPLE FAKE` и `Flowseal EXP`
    * `Custom` (ручной ввод аргументов nfqws)
  * Режим работы: «Весь трафик» (All Traffic) или «Только список хостов» (Hostlist Mode).
  * Фикс голосовых каналов Discord (WebRTC & STUN UDP).
  * Встроенные редакторы списков исключений (российские банки, Госуслуги) и целевых доменов.
* **Telegram Proxy**:
  * Включение/отключение прозрачного перехвата.
  * Настройка порта (по умолчанию 1443).
  * Подключение персональных Cloudflare Workers и кастомных доменов.
* **Smart Adblock**:
  * Выбор профиля фильтрации: Легкий (~40k), Стандартный (~76k+ с доменами Рунета), Агрессивный.
  * Редакторы белого и черного списков.
  * Автоматическое обновление базы по расписанию.
* **Диагностика и Логи**:
  * Полный тест сетевых сокетов и просмотр системных логов `logread` в реальном времени.

---

## Установка на роутер OpenWrt

### Быстрая установка одной командой по SSH

Подключитесь к роутеру по SSH (`ssh root@192.168.1.1`) и выполните команду:

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/zlaer/runet-fix-openwrt/master/install.sh)"
```

Скрипт автоматически:
1. Определит архитектуру процессора роутера (`mips`, `mipsel`, `aarch64`, `arm`, `x86_64`).
2. Определит версию файрвола (`nftables / fw4` или `iptables / fw3`).
3. Установит необходимые зависимости ядра (`kmod-nft-queue`, `ipset`, `curl`).
4. Загрузит свежие бинарные шаблоны Flowseal, скрипты и веб-интерфейс LuCI.
5. Настроит автозапуск и применит оптимальную конфигурацию.

---

### Сборка из исходников через OpenWrt SDK / ImageBuilder

1. Склонируйте репозиторий в папку пакетов OpenWrt SDK:
   ```sh
   git clone https://github.com/zlaer/runet-fix-openwrt.git package/runet-fix
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

3. Скомпилируйте пакет:
   ```sh
   make package/runet-fix/compile V=s
   ```

4. Установите полученный пакет на роутер:
   ```sh
   opkg install runet-fix_*.ipk luci-app-runet-fix_*.ipk
   ```

---

## Управление через командную строку (CLI)

Утилита `/usr/bin/runet-fix` предоставляет полный контроль над всеми подсистемами:

```sh
# Проверить статус всех служб и версию
runet-fix status

# Показать текущую установленную версию
runet-fix version

# Проверить наличие обновлений на GitHub
runet-fix check-update

# Автоматически обновить Runet-Fix до последней версии с GitHub
runet-fix update

# Провести экспресс-тест доступности сервисов (YouTube, Discord, Telegram, DNS)
runet-fix test

# Тест в формате JSON (для скриптов и LuCI)
runet-fix test --json

# Принудительно обновить списки Adblock
runet-fix update-adblock

# Показать статус правил файрвола nftables
runet-fix firewall

# Посмотреть свежие системные логи
runet-fix log

# Перезапустить все службы
runet-fix restart

# Остановить службы
runet-fix stop

# Полностью удалить Runet-Fix с очисткой системы
runet-fix uninstall
```

---

## Конфигурация (`/etc/config/runet-fix`)

Файл конфигурации управляется стандартной утилитой OpenWrt `uci`:

```uci
config global 'main'
	option enabled '1'
	option log_level 'info'

config zapret 'zapret'
	option enabled '1'
	option preset 'youtube_4k'
	option mode 'all'
	option discord_fix '1'
	option qnum '200'
	option custom_args ''

config telegram 'telegram'
	option enabled '1'
	option mode 'transparent'
	option port '1443'
	option engine 'auto'
	option secret ''
	option custom_domains ''
	option custom_workers ''

config adblock 'adblock'
	option enabled '1'
	option profile 'standard'
	option enable_ru '1'
	option auto_update 'weekly'
```

---

## Лицензия и благодарности

Проект распространяется под лицензией **MIT License**.

Благодарности авторам проектов:
* [bol-van](https://github.com/bol-van) — за создание утилиты `zapret` и движка `nfqws`.
* [Flowseal](https://github.com/Flowseal) — за пресеты десинхронизации zapret-discord-youtube и концепцию tg-ws-proxy.
