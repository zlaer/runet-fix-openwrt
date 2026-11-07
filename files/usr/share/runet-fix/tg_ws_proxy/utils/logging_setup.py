import logging
from logging.handlers import RotatingFileHandler

def build_log_handler(log_file, log_max_mb=5, backups=3):
    max_bytes = max(1, int(log_max_mb)) * 1024 * 1024
    try:
        return RotatingFileHandler(
            log_file,
            maxBytes=max_bytes,
            backupCount=int(backups),
            encoding='utf-8',
        )
    except Exception:
        return logging.FileHandler(log_file, encoding='utf-8')
