import { MenuItem, FlattenedMenuItem } from "~/config/types";

export const flatten = (items: MenuItem[], path: string[] = []) => {
  return items.reduce<FlattenedMenuItem[]>((flattenItems, item) => {
    const currentPath = [...path, item.name];
    flattenItems.push({
      ...item,
      path: currentPath.join(" → "),
    });

    if (item.items && item.items.length > 0) {
      flattenItems.push(...flatten(item.items, currentPath));
    }

    return flattenItems;
  }, []);
};
