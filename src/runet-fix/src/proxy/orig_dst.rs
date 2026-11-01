use std::io;
use std::net::{Ipv4Addr, SocketAddrV4};
use tokio::net::TcpStream;

#[cfg(target_os = "linux")]
use std::os::unix::io::AsRawFd;

/// Sol_ip level in Linux kernel
#[cfg(target_os = "linux")]
const SOL_IP: libc::c_int = 0;

/// Linux socket option SO_ORIGINAL_DST to retrieve netfilter redirected destination
#[cfg(target_os = "linux")]
const SO_ORIGINAL_DST: libc::c_int = 80;

/// Linux socket option SO_MARK (mark 0x40000000 to bypass nftables loops)
#[cfg(target_os = "linux")]
const SO_MARK: libc::c_int = 36;

pub const DEFAULT_OUTBOUND_MARK: u32 = 0x40000000;

/// Retrieves the original destination address from a redirected connection using SO_ORIGINAL_DST.
///
/// On Linux OpenWrt, nftables redirect rules in PREROUTING rewrite the destination IP/port
/// to the local proxy port (1443). The kernel conntrack table preserves the original IP/port,
/// which is queried via getsockopt(fd, SOL_IP, SO_ORIGINAL_DST, ...).
#[cfg(target_os = "linux")]
pub fn get_original_dst(stream: &TcpStream) -> io::Result<SocketAddrV4> {
    let fd = stream.as_raw_fd();
    unsafe {
        let mut addr: libc::sockaddr_in = std::mem::zeroed();
        let mut len = std::mem::size_of::<libc::sockaddr_in>() as libc::socklen_t;
        let ret = libc::getsockopt(
            fd,
            SOL_IP,
            SO_ORIGINAL_DST,
            &mut addr as *mut _ as *mut libc::c_void,
            &mut len,
        );
        if ret != 0 {
            return Err(io::Error::last_os_error());
        }
        let ip = Ipv4Addr::from(u32::from_be(addr.sin_addr.s_addr));
        let port = u16::from_be(addr.sin_port);
        Ok(SocketAddrV4::new(ip, port))
    }
}

#[cfg(not(target_os = "linux"))]
pub fn get_original_dst(stream: &TcpStream) -> io::Result<SocketAddrV4> {
    // Development fallback for non-Linux hosts (Windows/macOS)
    if let Ok(std::net::SocketAddr::V4(v4)) = stream.local_addr() {
        Ok(v4)
    } else {
        Ok(SocketAddrV4::new(Ipv4Addr::new(149, 154, 167, 51), 443))
    }
}

/// Sets the socket routing mark (SO_MARK) on an outbound connection.
///
/// Essential for OpenWrt to prevent routing loops: the proxy's own outbound
/// TCP/WebSocket traffic to Cloudflare or Telegram must not be matched by
/// prerouting redirect or nfqws DPI queues.
/// Sets the socket routing mark (SO_MARK) on an outbound file descriptor.
///
/// Essential for OpenWrt to prevent routing loops: the proxy's own outbound
/// TCP/WebSocket traffic to Cloudflare or Telegram must not be matched by
/// prerouting redirect or nfqws DPI queues.
#[cfg(target_os = "linux")]
pub fn set_outbound_mark_fd(fd: std::os::unix::io::RawFd, mark: u32) -> io::Result<()> {
    unsafe {
        let ret = libc::setsockopt(
            fd,
            libc::SOL_SOCKET,
            SO_MARK,
            &mark as *const _ as *const libc::c_void,
            std::mem::size_of::<u32>() as libc::socklen_t,
        );
        if ret != 0 {
            log::warn!("Failed to set SO_MARK 0x{:08x}: {}", mark, io::Error::last_os_error());
        }
    }
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn set_outbound_mark_fd(_fd: std::os::raw::c_int, _mark: u32) -> io::Result<()> {
    Ok(())
}

pub fn set_outbound_mark(stream: &TcpStream, mark: u32) -> io::Result<()> {
    #[cfg(target_os = "linux")]
    {
        set_outbound_mark_fd(stream.as_raw_fd(), mark)?;
    }
    let _ = mark;
    let _ = stream;
    Ok(())
}

/// Maps an intercepted destination IPv4 address to its corresponding Telegram Data Center ID (1..=5).
///
/// Official Telegram DC IP Allocation:
/// - DC 1: 149.154.175.0/24 (IP < .75)
/// - DC 2: 149.154.167.0/24, 149.154.166.0/24
/// - DC 3: 149.154.175.0/24 (IP >= .75)
/// - DC 4: 149.154.165.0/24, 149.154.164.0/24
/// - DC 5: 91.108.56.0/24, 91.108.4.0/22
pub fn dc_from_ip(ip: Ipv4Addr) -> u8 {
    let octets = ip.octets();
    match (octets[0], octets[1], octets[2]) {
        (149, 154, 175) => {
            if octets[3] < 75 {
                1
            } else {
                3
            }
        }
        (149, 154, 167) | (149, 154, 166) => 2,
        (149, 154, 165) | (149, 154, 164) => 4,
        (91, 108, 56) => 5,
        (91, 108, ..) => 5,
        _ => 2, // Safe default fallback: DC 2 (Amsterdam/Europe core)
    }
}

/// Returns default Telegram direct IP address for a given DC ID.
pub fn default_ip_for_dc(dc: u8) -> &'static str {
    match dc {
        1 => "149.154.175.50",
        2 => "149.154.167.51",
        3 => "149.154.175.100",
        4 => "149.154.167.91",
        5 => "91.108.56.165",
        _ => "149.154.167.51",
    }
}
