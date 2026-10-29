import time
import random
from collections import Counter
from typing import Dict, List, Iterator 


class _Balancer:
    def __init__(self):
        self.domains: List[str] = []
        self._dc_to_domain: Dict[int, str] = {}
        self._failure_counts: Dict[str, int] = {}
        self._failed_until: Dict[str, float] = {}
    
    def update_domains_list(self, domains_list: List[str]) -> None:
        if Counter(self.domains) == Counter(domains_list):
            return
        
        self.domains = domains_list[:]

        primary = self.domains[:min(6, len(self.domains))] if self.domains else []
        self._dc_to_domain = {
            dc_id: random.choice(primary) if primary else ""
            for dc_id in (1, 2, 3, 4, 5, 203)
        }

    def update_domain_for_dc(self, dc_id: int, domain: str) -> bool:
        self._failure_counts[domain] = 0
        self._failed_until.pop(domain, None)
        if self._dc_to_domain.get(dc_id) == domain:
            return False
        
        self._dc_to_domain[dc_id] = domain
        return True

    def report_failure(self, dc_id: int, domain: str) -> None:
        count = self._failure_counts.get(domain, 0) + 1
        self._failure_counts[domain] = count
        if count >= 3:
            if self._dc_to_domain.get(dc_id) == domain:
                self._dc_to_domain[dc_id] = ""
            self._failed_until[domain] = time.monotonic() + 60.0

    def get_domains_for_dc(self, dc_id: int) -> Iterator[str]:
        now = time.monotonic()
        current_domain = self._dc_to_domain.get(dc_id)
        if current_domain and self._failed_until.get(current_domain, 0) < now:
            yield current_domain

        # Yield from high-priority verified pool first (first 10 domains)
        high_pri = [d for d in self.domains[:10] if d != current_domain and self._failed_until.get(d, 0) < now]
        random.shuffle(high_pri)
        for domain in high_pri:
            yield domain

        # Yield any remaining fallback domains
        fallbacks = [d for d in self.domains[10:] if d != current_domain and self._failed_until.get(d, 0) < now]
        random.shuffle(fallbacks)
        for domain in fallbacks:
            yield domain

        # If all domains are in backoff, yield all domains anyway as last resort
        all_other = [d for d in self.domains if d != current_domain]
        random.shuffle(all_other)
        for domain in all_other:
            yield domain


balancer = _Balancer()
