"""R18-PREFLIGHT-01 payload. NON-TRAINING ResNet18 environment preflight.

Launched by preflight.py run as `python -B -` with this file on stdin, cwd = runner root.
Reads only its manifest-bound sibling config (fixed relative path, SHA-256 pinned below).
Never: argv paths, dataset access, weights download, domain checkpoint, backward, optimizer.
Prints exactly one JSON object on stdout. Exit 0 only when every required check passes.
A passing result does not mean data is ready or that training may start.
"""
import hashlib, json, os, platform, re, socket, sys, threading, time

SCHEMA = 'R18.PREFLIGHT.RESULT.v1'
CONFIG_REL = ('payloads', 'resnet18_preflight.config.json')
CONFIG_SHA256 = 'ae1ac67e7fc06218947e6e9eed3b253ba4cc9729064bc40ed18405f03805633c'
CKPT_NAME = re.compile(r'resnet18-([0-9a-f]{8})\.pth')
EXIT = {
    'OK': 0, 'E_INTERNAL': 19, 'E_TORCH_IMPORT': 10, 'E_CONFIG': 11, 'E_CONTEXT': 12,
    'E_PRETRAINED_CACHE': 13, 'E_TIMEOUT': 14, 'E_FORWARD': 15, 'E_GPU_GUARD': 16,
    'E_NETWORK_ATTEMPT': 17, 'E_CUDA_UNAVAILABLE': 18,
}
NETWORK_ATTEMPTS = []
_EMIT_LOCK = threading.Lock()
_EMITTED = []


class Stop(Exception):
    def __init__(self, code, detail):
        Exception.__init__(self, code + ':' + str(detail))
        self.code = code
        self.detail = str(detail)


def need(ok, code, detail):
    if not ok:
        raise Stop(code, detail)


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def taipei_now():
    import datetime
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()


def emit(record, code):
    with _EMIT_LOCK:
        if _EMITTED:
            return
        _EMITTED.append(code)
        record['exit_code'] = code
        record['ended_at_taipei'] = taipei_now()
        record['network_attempts'] = list(NETWORK_ATTEMPTS)
        sys.stdout.buffer.write((json.dumps(record, sort_keys=True, ensure_ascii=True) + '\n').encode('ascii'))
        sys.stdout.buffer.flush()
        if code:
            sys.stderr.buffer.write(('R18_PREFLIGHT_FAIL ' + str(record.get('error')) + '\n').encode('ascii', 'replace'))
            sys.stderr.buffer.flush()


def install_network_guard():
    """Defense in depth: any outbound connect/resolve inside this process is refused and recorded."""
    def deny(kind):
        def _deny(*args, **kwargs):
            NETWORK_ATTEMPTS.append(kind)
            raise OSError('R18_PREFLIGHT_NETWORK_DENIED:' + kind)
        return _deny
    socket.socket.connect = deny('socket.connect')
    socket.socket.connect_ex = deny('socket.connect_ex')
    socket.create_connection = deny('socket.create_connection')
    socket.getaddrinfo = deny('socket.getaddrinfo')


def arm_watchdog(seconds, record):
    def fire():
        record['status'] = 'FAIL'
        record['error'] = 'E_TIMEOUT:walltime_seconds=' + str(seconds)
        emit(record, EXIT['E_TIMEOUT'])
        os._exit(EXIT['E_TIMEOUT'])
    timer = threading.Timer(seconds, fire)
    timer.daemon = True
    timer.start()
    return timer


def check_context(argv):
    # Runner launches `python -B -`; argv is exactly ['-']. No user argv is accepted.
    need(list(argv) == ['-'], 'E_CONTEXT', 'argv_must_be_stdin_only')
    return {
        'argv': list(argv),
        'cwd': os.getcwd(),
        'runner_marker_env': bool(os.environ.get('WLR_MARKER_NAME')),
        'pythondontwritebytecode': os.environ.get('PYTHONDONTWRITEBYTECODE'),
    }


def write_marker():
    # Same launch-marker convention as payloads/runner_ok.py (marker dir is outside the root).
    d, n = os.environ.get('WLR_MARKER_DIR'), os.environ.get('WLR_MARKER_NAME')
    if d and n and n not in ('.', '..') and '/' not in n and '\\' not in n:
        f = os.open(os.path.join(d, n), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.write(f, b'1')
        os.close(f)
        return True
    return False


def read_config(root):
    path = os.path.join(root, *CONFIG_REL)
    need(os.path.isfile(path) and not os.path.islink(path), 'E_CONFIG', 'config_missing_or_link')
    with open(path, 'rb') as fh:
        raw = fh.read()
    need(sha256_bytes(raw) == CONFIG_SHA256, 'E_CONFIG', 'config_sha256_mismatch')
    return json.loads(raw.decode('ascii')), sha256_bytes(raw)


def _exact(obj, keys, where):
    need(isinstance(obj, dict) and set(obj) == set(keys), 'E_CONFIG', 'fields:' + where)


def _is(v, t):
    return type(v) is t


def validate_config(c):
    _exact(c, ['schema', 'task', 'mode', 'training_allowed', 'backward_allowed', 'optimizer_allowed',
               'data_access_allowed', 'weights_download_allowed', 'domain_checkpoint_allowed', 'data_release',
               'model', 'synthetic_input', 'cpu', 'cuda_required', 'gpu_forward', 'training_reference',
               'limits', 'expected'], 'top')
    need(c['schema'] == 'R18.PREFLIGHT.CONFIG.v1' and c['task'] == 'resnet18_preflight'
         and c['mode'] == 'NON_TRAINING_PREFLIGHT', 'E_CONFIG', 'schema_task_mode')
    for k in ('training_allowed', 'backward_allowed', 'optimizer_allowed', 'data_access_allowed',
              'weights_download_allowed', 'domain_checkpoint_allowed'):
        need(c[k] is False, 'E_CONFIG', 'must_be_false:' + k)
    m = c['model']
    _exact(m, ['architecture', 'num_classes', 'pretrained_cache_filename', 'pretrained_cache_sha256_prefix',
               'pretrained_cache_required', 'load_cached_weights_weights_only'], 'model')
    need(m['architecture'] == 'resnet18' and m['num_classes'] == 1000 and _is(m['num_classes'], int), 'E_CONFIG', 'model_arch')
    hit = CKPT_NAME.fullmatch(m['pretrained_cache_filename']) if _is(m['pretrained_cache_filename'], str) else None
    need(hit is not None and hit.group(1) == m['pretrained_cache_sha256_prefix'], 'E_CONFIG', 'ckpt_name_must_be_torchvision_resnet18')
    need(_is(m['pretrained_cache_required'], bool) and _is(m['load_cached_weights_weights_only'], bool), 'E_CONFIG', 'model_bools')
    s = c['synthetic_input']
    _exact(s, ['batch', 'channels', 'height', 'width', 'seed', 'dtype'], 'synthetic_input')
    need(all(_is(s[k], int) for k in ('batch', 'channels', 'height', 'width', 'seed')) and 1 <= s['batch'] <= 2
         and s['channels'] == 3 and 32 <= s['height'] <= 448 and 32 <= s['width'] <= 448 and s['dtype'] == 'float32',
         'E_CONFIG', 'synthetic_input_caps')
    _exact(c['cpu'], ['threads'], 'cpu')
    need(_is(c['cpu']['threads'], int) and 1 <= c['cpu']['threads'] <= 4, 'E_CONFIG', 'cpu_threads_cap')
    need(_is(c['cuda_required'], bool), 'E_CONFIG', 'cuda_required')
    g = c['gpu_forward']
    _exact(g, ['enabled_if_available', 'min_free_mib', 'max_allocated_mib', 'max_seconds'], 'gpu_forward')
    need(_is(g['enabled_if_available'], bool) and all(_is(g[k], int) for k in ('min_free_mib', 'max_allocated_mib', 'max_seconds'))
         and 0 < g['max_allocated_mib'] <= 2048 and 0 < g['max_seconds'] <= 120 and g['min_free_mib'] >= g['max_allocated_mib'],
         'E_CONFIG', 'gpu_caps')
    _exact(c['training_reference'], ['gpu_mib', 'whole_gpu_mib', 'ram_mib', 'source'], 'training_reference')
    _exact(c['limits'], ['walltime_seconds'], 'limits')
    need(_is(c['limits']['walltime_seconds'], int) and 30 <= c['limits']['walltime_seconds'] <= 600, 'E_CONFIG', 'walltime_cap')
    _exact(c['expected'], ['python_version', 'torch_version', 'torchvision_version', 'version_mismatch_is_failure'], 'expected')
    need(_is(c['expected']['version_mismatch_is_failure'], bool), 'E_CONFIG', 'expected_bool')
    return True


def release_guard(c):
    """Mirror of d18 preflight DATA_NOT_RELEASED rule, narrowed: this payload never reads data.
    Only the NOT_RELEASED / unauthorized / ready_count 0 state is accepted; any release claim is refused,
    because this preflight is not a release authority and has no data path to check."""
    r = c['data_release']
    _exact(r, ['status', 'data_release_authorized', 'ready_count', 'basis'], 'data_release')
    released = r['status'] == 'RELEASED' and r['data_release_authorized'] is True
    need(not released, 'E_CONFIG', 'release_claim_unsupported_in_preflight')
    need(r['status'] == 'NOT_RELEASED' and r['data_release_authorized'] is False and r['ready_count'] == 0
         and _is(r['ready_count'], int), 'E_CONFIG', 'release_state_invalid')
    return {'data_status': 'NOT_READY', 'reason': 'DATA_NOT_RELEASED', 'ready_count': 0,
            'data_read': False, 'training_ready': False}


def host_resources():
    out = {'platform': platform.platform(), 'machine': platform.machine(), 'processor': platform.processor(),
           'cpu_count_logical': os.cpu_count(), 'ram_total_mib': None, 'ram_avail_mib': None, 'ram_source': None}
    try:
        if os.name == 'nt':
            import ctypes
            class MS(ctypes.Structure):
                _fields_ = [('dwLength', ctypes.c_ulong), ('dwMemoryLoad', ctypes.c_ulong),
                            ('ullTotalPhys', ctypes.c_ulonglong), ('ullAvailPhys', ctypes.c_ulonglong),
                            ('ullTotalPageFile', ctypes.c_ulonglong), ('ullAvailPageFile', ctypes.c_ulonglong),
                            ('ullTotalVirtual', ctypes.c_ulonglong), ('ullAvailVirtual', ctypes.c_ulonglong),
                            ('ullAvailExtendedVirtual', ctypes.c_ulonglong)]
            ms = MS()
            ms.dwLength = ctypes.sizeof(MS)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(ms)):
                out.update(ram_total_mib=ms.ullTotalPhys // 1048576, ram_avail_mib=ms.ullAvailPhys // 1048576,
                           ram_source='GlobalMemoryStatusEx')
        elif os.path.isfile('/proc/meminfo'):
            info = {}
            with open('/proc/meminfo') as fh:
                for line in fh:
                    k, v = line.split(':', 1)
                    info[k] = int(v.split()[0])
            out.update(ram_total_mib=info.get('MemTotal', 0) // 1024, ram_avail_mib=info.get('MemAvailable', 0) // 1024,
                       ram_source='/proc/meminfo')
    except Exception as exc:
        out['ram_error'] = type(exc).__name__
    return out


def tensor_bytes(t):
    """Raw bytes of a CPU contiguous copy; numpy when present, else the tensor's own untyped storage."""
    x = t.detach().to('cpu').contiguous().clone()
    if x.numel() == 0:
        return b''
    try:
        return x.numpy().tobytes()
    except Exception:
        return bytes(x.untyped_storage())


def state_sha256(model):
    """Ordered SHA-256 over every state_dict tensor's raw bytes (CPU copy)."""
    h = hashlib.sha256()
    for k, t in model.state_dict().items():
        h.update(k.encode('utf-8') + b'\0' + str(t.dtype).encode('ascii') + b'\0' + str(tuple(t.shape)).encode('ascii') + b'\0')
        h.update(tensor_bytes(t))
    return h.hexdigest()


def pretrained_cache(torch, m):
    hub_dir = torch.hub.get_dir()  # path computation only; no download API is called anywhere in this file
    path = os.path.join(hub_dir, 'checkpoints', m['pretrained_cache_filename'])
    row = {'hub_dir': hub_dir, 'path': path, 'exists': False, 'size': None, 'sha256': None,
           'sha256_prefix_expected': m['pretrained_cache_sha256_prefix'], 'prefix_match': None,
           'download_attempted': False, 'other_resnet18_files': []}
    ckdir = os.path.join(hub_dir, 'checkpoints')
    if os.path.isdir(ckdir):
        row['other_resnet18_files'] = sorted(n for n in os.listdir(ckdir) if n.startswith('resnet18') and n != m['pretrained_cache_filename'])
    if os.path.isfile(path) and not os.path.islink(path):
        h = hashlib.sha256()
        size = 0
        with open(path, 'rb') as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b''):
                h.update(chunk)
                size += len(chunk)
        row.update(exists=True, size=size, sha256=h.hexdigest())
        row['prefix_match'] = row['sha256'][:8] == m['pretrained_cache_sha256_prefix']
    return row


def run(record, root):
    record['context'] = check_context(sys.argv)
    record['marker_written'] = write_marker()
    cfg, cfg_sha = read_config(root)
    record['config_sha256'] = cfg_sha
    validate_config(cfg)
    record['checks']['config'] = 'PASS'
    record['release_guard'] = release_guard(cfg)
    record['checks']['release_guard'] = 'NOT_READY_REPORTED'
    arm_watchdog(cfg['limits']['walltime_seconds'], record)
    record['host'] = host_resources()
    os.environ['OMP_NUM_THREADS'] = str(cfg['cpu']['threads'])
    os.environ['MKL_NUM_THREADS'] = str(cfg['cpu']['threads'])
    t0 = time.monotonic()
    try:
        import torch
        import torchvision
        from torchvision.models import resnet18
    except Exception as exc:
        raise Stop('E_TORCH_IMPORT', type(exc).__name__ + ':' + str(exc)[:200])
    record['timing']['import_seconds'] = round(time.monotonic() - t0, 3)
    exp = cfg['expected']
    env = {'python_version': platform.python_version(), 'python_executable': sys.executable,
           'torch_version': torch.__version__, 'torchvision_version': torchvision.__version__,
           'torch_cuda_build': torch.version.cuda, 'cudnn_version': torch.backends.cudnn.version()}
    env['matches_reference'] = {k: env[k] == exp[k] for k in ('python_version', 'torch_version', 'torchvision_version')}
    record['env'] = env
    if exp['version_mismatch_is_failure']:
        need(all(env['matches_reference'].values()), 'E_TORCH_IMPORT', 'version_mismatch')
    record['checks']['import'] = 'PASS'
    torch.set_num_threads(cfg['cpu']['threads'])
    torch.backends.cudnn.benchmark = False
    cuda = {'available': bool(torch.cuda.is_available()), 'device_count': 0}
    if cuda['available']:
        cuda['device_count'] = torch.cuda.device_count()
        p = torch.cuda.get_device_properties(0)
        free_b, total_b = torch.cuda.mem_get_info(0)
        ref = cfg['training_reference']
        cuda.update(name=p.name, capability=list(torch.cuda.get_device_capability(0)), total_mib=p.total_memory // 1048576,
                    free_mib_at_start=free_b // 1048576, meets_whole_gpu_mib=p.total_memory // 1048576 >= ref['whole_gpu_mib'],
                    meets_gpu_mib_free=free_b // 1048576 >= ref['gpu_mib'])
    record['cuda'] = cuda
    record['checks']['cuda'] = 'AVAILABLE' if cuda['available'] else 'UNAVAILABLE'
    m = cfg['model']
    cache = pretrained_cache(torch, m)
    record['pretrained_cache'] = cache
    cache_ok = cache['exists'] and cache['prefix_match'] is True
    if m['pretrained_cache_required']:
        need(cache_ok, 'E_PRETRAINED_CACHE', 'missing' if not cache['exists'] else 'sha256_prefix_mismatch')
    record['checks']['pretrained_cache'] = 'PRESENT_PREFIX_OK' if cache_ok else ('ABSENT' if not cache['exists'] else 'PREFIX_MISMATCH')
    model = resnet18(weights=None, num_classes=m['num_classes'])  # weights=None: torchvision performs no download
    record['weights_source'] = 'FRESH_RANDOM'
    if cache_ok and m['load_cached_weights_weights_only']:
        sd = torch.load(cache['path'], map_location='cpu', weights_only=True)
        res = model.load_state_dict(sd, strict=True)
        need(not res.missing_keys and not res.unexpected_keys, 'E_PRETRAINED_CACHE', 'strict_load_keys')
        record['weights_source'] = 'TORCH_HUB_CACHE_WEIGHTS_ONLY_IMAGENET'
        del sd
    for prm in model.parameters():
        prm.requires_grad_(False)
    model.eval()
    before = state_sha256(model)
    s = cfg['synthetic_input']
    gen = torch.Generator().manual_seed(s['seed'])
    x = torch.rand((s['batch'], s['channels'], s['height'], s['width']), generator=gen, dtype=torch.float32)
    t1 = time.monotonic()
    with torch.inference_mode():
        y = model(x)
    record['timing']['cpu_forward_seconds'] = round(time.monotonic() - t1, 3)
    need(tuple(y.shape) == (s['batch'], m['num_classes']), 'E_FORWARD', 'cpu_output_shape')
    need(bool(torch.isfinite(y).all()), 'E_FORWARD', 'cpu_output_nonfinite')
    after = state_sha256(model)
    record['forward'] = {'cpu': {'input_shape': list(x.shape), 'output_shape': list(y.shape),
                                 'output_sha256': sha256_bytes(tensor_bytes(y)),
                                 'mode': 'eval+inference_mode', 'requires_grad_any': any(p.requires_grad for p in model.parameters())}}
    record['state_sha256_before'] = before
    record['state_sha256_after_cpu'] = after
    need(before == after, 'E_FORWARD', 'state_changed_cpu')
    record['checks']['cpu_forward'] = 'PASS'
    g = cfg['gpu_forward']
    gpu = {'status': 'NOT_ATTEMPTED'}
    if cuda['available'] and g['enabled_if_available']:
        if cuda['free_mib_at_start'] < g['min_free_mib']:
            gpu['status'] = 'SKIPPED_LOW_FREE_VRAM'
        else:
            import copy
            torch.cuda.set_per_process_memory_fraction(min(1.0, g['max_allocated_mib'] * 1048576 / float(p.total_memory)), 0)
            torch.cuda.reset_peak_memory_stats(0)
            gm = copy.deepcopy(model).to('cuda:0').eval()
            t2 = time.monotonic()
            with torch.inference_mode():
                gy = gm(x.to('cuda:0'))
                torch.cuda.synchronize(0)
            secs = time.monotonic() - t2
            peak = torch.cuda.max_memory_allocated(0) // 1048576
            gy_cpu = gy.to('cpu')
            gpu.update(status='RUN', seconds=round(secs, 3), peak_allocated_mib=peak,
                       max_abs_diff_vs_cpu=float((gy_cpu - y).abs().max()))
            g_after = state_sha256(gm)
            gpu['state_sha256_after_gpu'] = g_after
            del gm, gy
            torch.cuda.empty_cache()
            need(peak <= g['max_allocated_mib'], 'E_GPU_GUARD', 'peak_allocated_mib')
            need(secs <= g['max_seconds'], 'E_GPU_GUARD', 'gpu_seconds')
            need(bool(torch.isfinite(gy_cpu).all()), 'E_FORWARD', 'gpu_output_nonfinite')
            need(g_after == before, 'E_FORWARD', 'state_changed_gpu')
    record['forward']['gpu'] = gpu
    record['checks']['gpu_forward'] = gpu['status']
    if cfg['cuda_required']:
        need(cuda['available'], 'E_CUDA_UNAVAILABLE', 'cuda_required')
    record['counters'] = {'backward_calls': 0, 'optimizer_steps': 0, 'epochs': 0, 'data_files_read': 0,
                          'domain_checkpoints_loaded': 0, 'weights_downloads': 0}
    need(not NETWORK_ATTEMPTS, 'E_NETWORK_ATTEMPT', ','.join(NETWORK_ATTEMPTS))
    record['status'] = 'PASS'
    record['verdict'] = 'ENV_PREFLIGHT_PASS_DATA_NOT_READY_TRAINING_NOT_ALLOWED'
    return 0


def main():
    install_network_guard()
    record = {'schema': SCHEMA, 'task': 'resnet18_preflight', 'started_at_taipei': taipei_now(),
              'status': 'FAIL', 'error': None, 'checks': {}, 'timing': {}, 'training_ready': False,
              'payload_note': 'non-training preflight; PASS is not a training or data-release decision'}
    try:
        code = run(record, os.getcwd())
    except Stop as stop:
        record['error'] = stop.code + ':' + stop.detail
        code = EXIT[stop.code]
    except Exception as exc:
        record['error'] = 'E_INTERNAL:' + type(exc).__name__ + ':' + str(exc)[:300]
        code = EXIT['E_INTERNAL']
    emit(record, code)
    return code


if __name__ == '__main__':
    sys.exit(main())
