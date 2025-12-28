export function sortDevicesWithDefaultFirst<T extends { name: string }>(
  devices: T[],
  defaultName: string | undefined,
  getTitle: (d: T) => string,
): T[] {
  if (!devices.length) return devices;

  const withIndex = devices.map((d, idx) => ({ d, idx }));

  withIndex.sort((a, b) => {
    const aDefault = defaultName ? a.d.name === defaultName : false;
    const bDefault = defaultName ? b.d.name === defaultName : false;

    if (aDefault !== bDefault) return aDefault ? -1 : 1;

    const aTitle = getTitle(a.d);
    const bTitle = getTitle(b.d);
    const byTitle = aTitle.localeCompare(bTitle);
    if (byTitle !== 0) return byTitle;

    return a.idx - b.idx;
  });

  return withIndex.map((x) => x.d);
}


