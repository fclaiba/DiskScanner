import secrets
import socket
import threading
import time

import licensing
from app import app, configure_security, set_extended_scan_enabled

WINDOW_TITLE = "DiskScanner Turbo"


def _pick_free_port():
    """Random free loopback port (contract: never a fixed, guessable port).
    Tiny race between close() and Flask's bind is acceptable here."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_server(port):
    # Deshabilitamos el reloader para que no lance hilos duplicados
    # threaded=True is essential: a scan/cleanup SSE stream can run for
    # minutes (target dir defaults to "C:\"), and Werkzeug's dev server is
    # single-threaded by default - without this, the whole app would appear
    # frozen (disk-health checks, other buttons, a second scan) until the
    # first stream finishes.
    app.run(host='127.0.0.1', port=port, debug=False, use_reloader=False, threaded=True)


def _wait_for_server(port, timeout=10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.05)
    return False


def _entitlement_loop(interval_seconds=licensing.REFRESH_INTERVAL_SECONDS):
    """Background daemon: refresh the signed entitlement at startup and then
    every 6h. Never blocks the UI - the app is usable (free mode, or Pro from
    the cached entitlement) while this talks to the network."""
    while True:
        try:
            licensing.refresh_entitlement(force=True)
        except Exception:
            pass  # never let a background refresh kill the loop
        set_extended_scan_enabled(licensing.has_feature("cleanup"))
        time.sleep(interval_seconds)


def main():
    # Imported lazily so the rest of the app (and the test suite) doesn't
    # need pywebview installed.
    import webview

    port = _pick_free_port()
    configure_security(port, secrets.token_urlsafe(32))

    # Always start in free mode (or Pro from the cached signed entitlement);
    # no blocking activation dialog. Linking happens from inside the UI.
    set_extended_scan_enabled(licensing.has_feature("cleanup"))

    server_thread = threading.Thread(target=start_server, args=(port,), daemon=True)
    server_thread.start()

    refresh_thread = threading.Thread(target=_entitlement_loop, daemon=True)
    refresh_thread.start()

    _wait_for_server(port)

    # Abrir la ventana nativa apuntando a localhost
    webview.create_window(
        title=WINDOW_TITLE,
        url=f'http://127.0.0.1:{port}',
        width=1200,
        height=850,
        resizable=True,
        min_size=(800, 600)
    )

    # Iniciar la interfaz gráfica
    webview.start()


if __name__ == '__main__':
    main()
