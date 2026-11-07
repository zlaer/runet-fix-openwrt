include $(TOPDIR)/rules.mk

PKG_NAME:=runet-fix
PKG_VERSION:=1.4.2
PKG_RELEASE:=1

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk

define Package/runet-fix
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Routing and Redirection
  TITLE:=All-in-One Zapret DPI, Transparent Telegram WS & Adblock
  DEPENDS:=+ipset +kmod-nft-queue
  MAINTAINER:=Flowseal & bol-van community
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

Build/Prepare:
	mkdir -p $(PKG_BUILD_DIR)

Build/Compile:

define Package/runet-fix/install
	# Install CLI binary
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/runet-fix $(1)/usr/bin/runet-fix

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
	[ -f ./version ] && $(INSTALL_DATA) ./version $(1)/usr/share/runet-fix/version

	$(INSTALL_DIR) $(1)/usr/share/runet-fix/bin
	$(INSTALL_DATA) ./files/usr/share/runet-fix/bin/* $(1)/usr/share/runet-fix/bin/

	$(INSTALL_DIR) $(1)/usr/share/runet-fix/scripts
	$(INSTALL_BIN) ./files/usr/share/runet-fix/scripts/* $(1)/usr/share/runet-fix/scripts/

	$(INSTALL_DIR) $(1)/usr/share/runet-fix/lists
	$(INSTALL_DATA) ./files/usr/share/runet-fix/lists/* $(1)/usr/share/runet-fix/lists/

	# Install Python Telegram WS Proxy fallback
	$(INSTALL_DIR) $(1)/usr/share/runet-fix/tg_ws_proxy
	$(INSTALL_DATA) ./files/usr/share/runet-fix/tg_ws_proxy/* $(1)/usr/share/runet-fix/tg_ws_proxy/
	$(INSTALL_BIN) ./files/usr/share/runet-fix/tg_ws_proxy/main.py $(1)/usr/share/runet-fix/tg_ws_proxy/main.py
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
endef

$(eval $(call BuildPackage,runet-fix))
$(eval $(call BuildPackage,luci-app-runet-fix))
