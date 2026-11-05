#!/usr/bin/env python3
import sys
import json
import uuid

def try_gnome(bus):
    try:
        from gi.repository import Gio
        proxy = Gio.DBusProxy.new_sync(
            bus,
            Gio.DBusProxyFlags.NONE,
            None,
            'org.gnome.Shell.Screenshot',
            '/org/gnome/Shell/Screenshot',
            'org.gnome.Shell.Screenshot',
            None
        )
        res = proxy.call_sync('PickColor', None, Gio.DBusCallFlags.NONE, 60000, None)
        val = res.unpack()[0]
        if 'color' in val:
            r, g, b = val['color']
            return {
                "red": float(r),
                "green": float(g),
                "blue": float(b),
                "alpha": 1.0,
                "colorSpace": "sRGB"
            }
        return None
    except Exception as e:
        err_msg = str(e).lower()
        if "cancel" in err_msg or "abort" in err_msg or "dismiss" in err_msg:
            return "CANCELLED"
        return None

def try_portal(bus):
    try:
        from gi.repository import Gio, GLib
        loop = GLib.MainLoop()
        token = "picker_" + uuid.uuid4().hex[:8]
        sender = bus.get_unique_name()[1:].replace('.', '_')
        handle_path = f"/org/freedesktop/portal/desktop/request/{sender}/{token}"

        result_color = None

        def on_signal(connection, sender_name, object_path, interface_name, signal_name, parameters, user_data):
            nonlocal result_color
            try:
                response_code, results = parameters.unpack()
                if response_code == 0 and 'color' in results:
                    r, g, b = results['color']
                    result_color = {
                        "red": float(r),
                        "green": float(g),
                        "blue": float(b),
                        "alpha": 1.0,
                        "colorSpace": "sRGB"
                    }
            finally:
                loop.quit()

        bus.signal_subscribe(
            None,
            "org.freedesktop.portal.Request",
            "Response",
            handle_path,
            None,
            Gio.DBusSignalFlags.NONE,
            on_signal,
            None
        )

        params = GLib.Variant.new_tuple(
            GLib.Variant.new_string(""),
            GLib.Variant('a{sv}', {'handle_token': GLib.Variant('s', token)})
        )

        bus.call_sync(
            "org.freedesktop.portal.Desktop",
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.portal.Screenshot",
            "PickColor",
            params,
            None,
            Gio.DBusCallFlags.NONE,
            -1,
            None
        )
        loop.run()
        return result_color
    except Exception:
        return None

def main():
    try:
        from gi.repository import Gio
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    except Exception as e:
        sys.stderr.write(f"Failed to connect to D-Bus: {e}\n")
        sys.exit(2)

    # 1. First try GNOME Shell native loupe (direct, no portal prompt)
    color = try_gnome(bus)
    if color == "CANCELLED":
        sys.exit(1)
    if color:
        print(json.dumps(color))
        sys.exit(0)

    # 2. Fallback to XDG Desktop Portal (KDE, Wayland compositors)
    color = try_portal(bus)
    if color:
        print(json.dumps(color))
        sys.exit(0)

    sys.exit(1)

if __name__ == "__main__":
    main()
