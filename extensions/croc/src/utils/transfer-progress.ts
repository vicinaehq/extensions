export const parseTransferProgressByFile = (output: string) => {
  const normalized = output.replace(/\r/g, "\n");
  const fileProgressLines = [
    ...normalized.matchAll(
      /\n?\s*([^\n|]+?)\s+\d{1,3}%\s+\|[^\n|]*\|\s*\(([^)]*)\)/g,
    ),
  ];

  if (fileProgressLines.length === 0) {
    return undefined;
  }

  const progressByFile = new Map<string, string>();

  for (const match of fileProgressLines) {
    const fileName = match[1]?.trim();
    const details = match[2]?.trim();

    if (!fileName || !details) continue;

    const sizePart = details.split(",")[0]?.trim();
    if (!sizePart) continue;

    const sizeMatch = sizePart.match(
      /(\d+(?:\.\d+)?)(?:\s*[KMGT]?B)?\s*\/\s*(\d+(?:\.\d+)?)(?:\s*([KMGT]?B))?/i,
    );

    if (!sizeMatch) {
      progressByFile.set(fileName, `${fileName}: ${sizePart}`);
      continue;
    }

    const currentValue = Number(sizeMatch[1]);
    const totalValue = Number(sizeMatch[2]);

    if (
      !Number.isFinite(currentValue) ||
      !Number.isFinite(totalValue) ||
      totalValue <= 0
    ) {
      progressByFile.set(fileName, `${fileName}: ${sizePart}`);
      continue;
    }

    const percent = Math.min(
      100,
      Math.round((currentValue / totalValue) * 100),
    );
    progressByFile.set(fileName, `${fileName}: ${sizePart} (${percent}%)`);
  }

  return [...progressByFile.values()].join("\n");
};
