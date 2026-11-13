include $(TOPDIR)/rules.mk

PKG_NAME:=runet-fix
PKG_VERSION:=1.6.0
PKG_RELEASE:=1

PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=Flowseal & bol-van community

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk

define Package/runet-fix
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Routing and Redirection
  TITLE:=All-in-One Zapret DPI, Transparent Telegram WS & Adblock
  DEPENDS:=+dnsmasq +jsonfilter +curl +ipset
  MAINTAINER:=Flowseal & bol-van community
endef

define Package/runet-fix/conffiles
/etc/config/runet-fix
/usr/share/runet-fix/lists/adblock-whitelist.txt
/usr/share/runet-fix/lists/adblock-blacklist.txt
/usr/share/runet-fix/lists/zapret-exclude.txt
/usr/share/runet-fix/lists/zapret-hosts-auto.txt
endef

define Package/runet-fix/description
  Unified high-performance solution for OpenWrt routers:
  1. Zapret (nfqws) for YouTube 4K & Discord DPI circumvention.
  2. Transparent Telegram MTProto WebSocket proxy (zero-config on LAN).
  3. Ultra-lightweight dnsmasq-integrated Adblock.
endef

define Package/luci-app-runet-fix
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for Runet-Fix
  DEPENDS:=+runet-fix +luci-base
endef

define Package/luci-app-runet-fix/description
  Web user interface for managing Runet-Fix in OpenWrt LuCI.
endef

.PHONY: check
check:
	sh scripts/check.sh

Build/Prepare:
	mkdir -p $(PKG_BUILD_DIR)

Build/Compile:
	# Build native Rust binary if cargo is available in environment
	if command -v cargo >/dev/null 2>&1; then \
		cargo build --manifest-path ./src/runet-fix/Cargo.toml --release || exit 1; \
	fi

define Package/runet-fix/install
	# Install CLI binary
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/runet-fix $(1)/usr/bin/runet-fix

	# Install Rust core daemon if compiled or available in prebuilt
	if [ -f ./src/runet-fix/target/release/runet-fix ]; then \
		$(INSTALL_BIN) ./src/runet-fix/target/release/runet-fix $(1)/usr/bin/runet-fix-core; \
	elif [ -f ./src/runet-fix/target/$(ARCH)-unknown-linux-musl/release/runet-fix ]; then \
		$(INSTALL_BIN) ./src/runet-fix/target/$(ARCH)-unknown-linux-musl/release/runet-fix $(1)/usr/bin/runet-fix-core; \
	elif [ -f ./prebuilt/runet-fix-core-$(ARCH) ]; then \
		$(INSTALL_BIN) ./prebuilt/runet-fix-core-$(ARCH) $(1)/usr/bin/runet-fix-core; \
	fi

	# Install init.d service
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/runet-fix $(1)/etc/init.d/runet-fix

	# Install UCI configuration
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/runet-fix $(1)/etc/config/runet-fix

	# Install UCI defaults
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/99-runet-fix $(1)/etc/uci-defaults/99-runet-fix

	# Install scripts, lists, bin templates, and version
	$(INSTALL_DIR) $(1)/usr/share/runet-fix
	if [ -f ./version ]; then \
		$(INSTALL_DATA) ./version $(1)/usr/share/runet-fix/version; \
	else \
		echo "Error: ./version file not found"; exit 1; \
	fi

	$(INSTALL_DIR) $(1)/usr/share/runet-fix/bin
	$(INSTALL_DATA) ./files/usr/share/runet-fix/bin/* $(1)/usr/share/runet-fix/bin/

	$(INSTALL_DIR) $(1)/usr/share/runet-fix/scripts
	$(INSTALL_BIN) ./files/usr/share/runet-fix/scripts/* $(1)/usr/share/runet-fix/scripts/

	$(INSTALL_DIR) $(1)/usr/share/runet-fix/lists
	$(INSTALL_DATA) ./files/usr/share/runet-fix/lists/* $(1)/usr/share/runet-fix/lists/

	# Install Python Telegram WS Proxy fallback
	$(INSTALL_DIR) $(1)/usr/share/runet-fix/tg_ws_proxy
	$(INSTALL_DATA) ./files/usr/share/runet-fix/tg_ws_proxy/*.py $(1)/usr/share/runet-fix/tg_ws_proxy/
	$(INSTALL_BIN) ./files/usr/share/runet-fix/tg_ws_proxy/main.py $(1)/usr/share/runet-fix/tg_ws_proxy/main.py
	$(INSTALL_DIR) $(1)/usr/share/runet-fix/tg_ws_proxy/utils
	$(INSTALL_DATA) ./files/usr/share/runet-fix/tg_ws_proxy/utils/*.py $(1)/usr/share/runet-fix/tg_ws_proxy/utils/
endef

define Package/luci-app-runet-fix/install
	# Install LuCI menus
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./files/usr/share/luci/menu.d/luci-app-runet-fix.json $(1)/usr/share/luci/menu.d/

	# Install RPCD ACLs
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/luci-app-runet-fix.json $(1)/usr/share/rpcd/acl.d/

	# Install Ucitrack
	$(INSTALL_DIR) $(1)/usr/share/ucitrack
	$(INSTALL_DATA) ./files/usr/share/ucitrack/luci-app-runet-fix.json $(1)/usr/share/ucitrack/

	# Install LuCI JS Views
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/runet-fix
	$(INSTALL_DATA) ./files/www/luci-static/resources/view/runet-fix/* $(1)/www/luci-static/resources/view/runet-fix/

	# Install LuCI i18n translations
	if command -v po2lmo >/dev/null 2>&1; then \
		$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n; \
		po2lmo ./po/ru/runet-fix.po $(1)/usr/lib/lua/luci/i18n/runet-fix.ru.lmo; \
	elif command -v msgfmt >/dev/null 2>&1; then \
		$(INSTALL_DIR) $(1)/usr/share/locale/ru/LC_MESSAGES; \
		msgfmt -o $(1)/usr/share/locale/ru/LC_MESSAGES/runet-fix.mo ./po/ru/runet-fix.po; \
	fi
endef

$(eval $(call BuildPackage,runet-fix))
$(eval $(call BuildPackage,luci-app-runet-fix))
