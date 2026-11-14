"""Caché LRU con presupuesto de memoria retenida y caducidad opcional."""

from collections import OrderedDict
import os
import sys
from threading import Lock
import time


def budget_bytes(variable, default_mib):
    value = int(os.environ.get(variable, default_mib))
    if value < 0:
        raise ValueError("{} debe ser un entero mayor o igual a cero".format(variable))
    return value * 1024 * 1024


def retained_size(value, seen=None):
    """Estima buffers NumPy, contenedores y modelos; evita contar referencias repetidas.

    No pretende medir el RSS: WCS y otros objetos nativos pueden retener memoria
    adicional fuera de los buffers visibles desde Python.
    """
    if seen is None:
        seen = set()
    identity = id(value)
    if identity in seen:
        return 0
    seen.add(identity)
    size = sys.getsizeof(value)
    if hasattr(value, "nbytes"):
        return max(size, int(value.nbytes))
    if isinstance(value, dict):
        return size + sum(retained_size(k, seen) + retained_size(v, seen) for k, v in value.items())
    if isinstance(value, (list, tuple, set)):
        return size + sum(retained_size(v, seen) for v in value)
    if hasattr(type(value), "model_fields"):
        return size + retained_size(value.__dict__, seen)
    return size


class MemoryCache:
    def __init__(self, max_bytes, max_entries=256, ttl=None, clock=time.monotonic):
        self.max_bytes = max_bytes
        self.max_entries = max_entries
        self.ttl = ttl
        self._clock = clock
        self._entries = OrderedDict()
        self._bytes = 0
        self._lock = Lock()

    def _remove(self, key):
        _, size, _ = self._entries.pop(key)
        self._bytes -= size

    def get(self, key, default=None):
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return default
            value, _, expires = entry
            if expires is not None and self._clock() >= expires:
                self._remove(key)
                return default
            self._entries.move_to_end(key)
            return value

    def put(self, key, value, size=None):
        size = retained_size(value) if size is None else size
        if size < 0:
            raise ValueError("El tamaño de una entrada no puede ser negativo")
        with self._lock:
            if key in self._entries:
                self._remove(key)
            if not self.max_bytes or not self.max_entries or size > self.max_bytes:
                return False
            now = self._clock()
            for old_key, (_, _, expires) in list(self._entries.items()):
                if expires is not None and now >= expires:
                    self._remove(old_key)
            while self._entries and (self._bytes + size > self.max_bytes
                                     or len(self._entries) >= self.max_entries):
                self._remove(next(iter(self._entries)))
            expires = now + self.ttl if self.ttl is not None else None
            self._entries[key] = (value, size, expires)
            self._bytes += size
            return True

    def clear(self):
        with self._lock:
            self._entries.clear()
            self._bytes = 0

    def info(self):
        with self._lock:
            return {"entries": len(self._entries), "bytes": self._bytes,
                    "max_bytes": self.max_bytes, "max_entries": self.max_entries}
