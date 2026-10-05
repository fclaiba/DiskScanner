import webview
import threading
import time
import sys
from app import app, set_extended_scan_enabled
import licensing


def start_server():
    # Deshabilitamos el reloader para que no lance hilos duplicados
    # threaded=True is essential: a scan/cleanup SSE stream can run for
    # minutes (target dir defaults to "C:\"), and Werkzeug's dev server is
    # single-threaded by default - without this, the whole app would appear
    # frozen (disk-health checks, other buttons, a second scan) until the
    # first stream finishes.
    app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False, threaded=True)


def _prompt_activation():
    """Minimal Tkinter dialog collecting license key + email. Returns True if
    activation succeeded, False if the user cancelled. Kept as a plain Tk
    dialog rather than a new Flask route/page so there's nothing extra to
    bundle/serve before the app itself is known to be licensed."""
    import tkinter as tk
    from tkinter import messagebox

    result = {"ok": False}

    root = tk.Tk()
    root.title("Activate DiskScanner Turbo")
    root.resizable(False, False)

    tk.Label(root, text="License key:").grid(row=0, column=0, padx=10, pady=(10, 0), sticky="w")
    key_entry = tk.Entry(root, width=40)
    key_entry.grid(row=1, column=0, padx=10, pady=(0, 10))

    tk.Label(root, text="Email:").grid(row=2, column=0, padx=10, sticky="w")
    email_entry = tk.Entry(root, width=40)
    email_entry.grid(row=3, column=0, padx=10, pady=(0, 10))

    def do_activate():
        ok, message = licensing.activate(key_entry.get(), email_entry.get())
        if ok:
            result["ok"] = True
            root.destroy()
        else:
            messagebox.showerror("Activation failed", message)

    def do_cancel():
        root.destroy()

    btn_frame = tk.Frame(root)
    btn_frame.grid(row=4, column=0, pady=(0, 10))
    tk.Button(btn_frame, text="Activate", command=do_activate).pack(side="left", padx=5)
    tk.Button(btn_frame, text="Cancel", command=do_cancel).pack(side="left", padx=5)

    root.mainloop()
    return result["ok"]


def _ensure_licensed():
    """Blocks until a valid license is active or the user cancels activation.
    (DISKSCANNER_SKIP_LICENSE=1 is honored inside refresh_capabilities()
    itself, so the bypass applies consistently here and on every later
    periodic re-check - see licensing.py.)"""
    ok, _reason = licensing.refresh_capabilities()
    while not ok:
        if not _prompt_activation():
            return False
        ok, _reason = licensing.refresh_capabilities()
    return True


def _periodic_revalidation(interval_seconds=6 * 3600):
    """Background daemon loop. This just calls refresh_capabilities() on a
    timer - the function itself decides whether the ~14-day network re-check
    is actually due, so this doesn't hit the network on every tick."""
    while True:
        time.sleep(interval_seconds)
        ok, _reason = licensing.refresh_capabilities()
        set_extended_scan_enabled(ok)


if __name__ == '__main__':
    if not _ensure_licensed():
        sys.exit(0)
    set_extended_scan_enabled(True)

    # Arrancar Flask en un hilo de fondo
    server_thread = threading.Thread(target=start_server)
    server_thread.daemon = True
    server_thread.start()

    # Re-validar la licencia periodicamente en background (no bloquea el uso offline)
    revalidation_thread = threading.Thread(target=_periodic_revalidation)
    revalidation_thread.daemon = True
    revalidation_thread.start()

    # Abrir la ventana nativa apuntando a localhost
    webview.create_window(
        title='Scanner de Disco Turbo',
        url='http://127.0.0.1:5000',
        width=1200,
        height=850,
        resizable=True,
        min_size=(800, 600)
    )

    # Iniciar la interfaz gráfica
    webview.start()
