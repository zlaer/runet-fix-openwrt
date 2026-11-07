import importlib.util
import os

# Dynamically re-export all members from sibling utils.py
_parent_dir = os.path.dirname(os.path.dirname(__file__))
_utils_py = os.path.join(_parent_dir, 'utils.py')
if os.path.isfile(_utils_py):
    _spec = importlib.util.spec_from_file_location('_sibling_utils', _utils_py)
    if _spec and _spec.loader:
        _mod = importlib.util.module_from_spec(_spec)
        _spec.loader.exec_module(_mod)
        for _k, _v in _mod.__dict__.items():
            if not _k.startswith('__'):
                globals()[_k] = _v
