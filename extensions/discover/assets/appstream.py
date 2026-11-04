#!/usr/bin/env python3
"""Read installed AppStream metadata through the system's optional introspection API."""
import json
import sys


def main():
    import gi
    gi.require_version('AppStream', '1.0')
    from gi.repository import AppStream as A
    pool = A.Pool()
    pool.load(None)
    query = sys.argv[1]
    box = pool.search(query)
    results = []
    for i in range(min(box.get_size(), 80)):
        c = box.index_safe(i)
        launch = c.get_launchable(A.LaunchableKind.DESKTOP_ID)
        screenshots = []
        for shot in c.get_screenshots_all()[:3]:
            image = shot.get_image(800, 600, 1)
            if image and image.get_url():
                screenshots.append(image.get_url())
        results.append(dict(id=c.get_id(), title=c.get_name(), summary=c.get_summary(),
                            description=c.get_description(), packages=list(c.get_pkgnames() or []),
                            desktopIds=list(launch.get_entries()) if launch else [],
                            url=c.get_url(A.UrlKind.HOMEPAGE), screenshots=screenshots))
    print(json.dumps(results, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
