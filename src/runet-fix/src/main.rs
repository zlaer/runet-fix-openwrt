mod adblock;
mod autotune;
mod ipc;
mod os;
mod proxy;
mod test_cmd;
mod zapret;

use std::process::Command;

const VERSION: &str = "1.4.0";

struct SimpleLogger;
static LOGGER: SimpleLogger = SimpleLogger;

impl log::Log for SimpleLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= log::max_level()
    }

    fn log(&self, record: &log::Record) {
        if self.enabled(record.metadata()) {
            eprintln!("[{}] {}", record.level(), record.args());
        }
    }

    fn flush(&self) {}
}

fn init_logging(level: &str) {
    let filter = match level.to_lowercase().as_str() {
        "debug" => log::LevelFilter::Debug,
        "warn" => log::LevelFilter::Warn,
        "error" => log::LevelFilter::Error,
        _ => log::LevelFilter::Info,
    };
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(filter);
}

fn print_usage() {
    println!("runet-fix v{} - Unified High-Performance OpenWrt Suite", VERSION);
    println!("Usage: runet-fix <command> [options]");
    println!();
    println!("Applet Commands:");
    println!("  daemon [options]        Run Telegram transparent proxy daemon & IPC server");
    println!("  adblock [options]       Compile streaming adblock rules into dnsmasq (<0.4s)");
    println!("  autotune [--json|apply] Native async Tokio prober for best Zapret preset");
    println!("  test [--json]           RuNet Health Probe diagnostics");
    println!("  zapret-args <preset>    Output nfqws command-line flags for a preset");
    println!("  status [--json]         Query system and daemon status via IPC socket");
    println!("  start|stop|restart      Manage runet-fix system service");
    println!("  firewall <action>       Run firewall backend manager");
    println!("  version [--json]        Print software version");
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let prog_name = args.get(0).map(|s| s.as_str()).unwrap_or("");
    let is_tg_proxy = prog_name.ends_with("tg-ws-proxy") || prog_name.ends_with("tg-ws-proxy.exe");

    // Default to daemon mode when invoked as tg-ws-proxy or when options are passed directly
    if is_tg_proxy || (args.len() > 1 && args[1].starts_with("--")) {
        init_logging("info");
        let proxy_args = if args.len() > 1 { &args[1..] } else { &[] };
        return proxy::run(proxy_args);
    }

    let subcmd = args.get(1).map(|s| s.as_str()).unwrap_or("help");
    let subargs = if args.len() > 2 { &args[2..] } else { &[] };

    match subcmd {
        "daemon" | "proxy" => {
            init_logging("info");
            proxy::run(subargs)
        }
        "adblock" | "update-adblock" => {
            adblock::run(subargs)
        }
        "autotune" => {
            autotune::run(subargs)
        }
        "test" => {
            test_cmd::run(subargs)
        }
        "zapret-args" => {
            zapret::print_args(subargs)
        }
        "status" => {
            let is_json = subargs.iter().any(|a| a == "--json");
            if let Some(sock_resp) = ipc::query_daemon_socket("status") {
                if is_json {
                    println!("{}", sock_resp);
                } else {
                    println!("Daemon Socket Response: {}", sock_resp);
                }
            } else {
                let _ = Command::new("/etc/init.d/runet-fix")
                    .arg("status_all")
                    .status();
            }
            Ok(())
        }
        "version" | "-v" | "--version" => {
            let is_json = subargs.iter().any(|a| a == "--json");
            if is_json {
                println!("{{\"version\":\"{}\"}}", VERSION);
            } else {
                println!("{}", VERSION);
            }
            Ok(())
        }
        "start" | "stop" | "restart" => {
            let status = Command::new("/etc/init.d/runet-fix")
                .arg(subcmd)
                .status()?;
            std::process::exit(status.code().unwrap_or(0));
        }
        "firewall" => {
            let mut fw_cmd = Command::new("/usr/share/runet-fix/scripts/runet-fix-firewall.sh");
            for arg in subargs {
                fw_cmd.arg(arg);
            }
            let status = fw_cmd.status()?;
            std::process::exit(status.code().unwrap_or(0));
        }
        "help" | "-h" | "--help" | _ => {
            print_usage();
            Ok(())
        }
    }
}
