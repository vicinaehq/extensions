import { useEffect, useState } from "react";

export function useDebounceValue<T>(initialValue: T, delay: number) {
	const [value, setValue] = useState<T>(initialValue);
	const [debouncedValue, setDebouncedValue] = useState<T>(initialValue);

	useEffect(() => {
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);
		return () => {
			clearTimeout(handler);
		};
	}, [value, delay]);
	return [value, setValue, debouncedValue] as const;
}

export function getPkgName(searchResult: SearchResult) {
	return searchResult.type === "apkg"
		? searchResult.pkgname
		: searchResult.Name;
}

export function getPkgUrl(pkg: SearchResult) {
	return pkg.type === "apkg"
		? `https://archlinux.org/packages/${pkg.repo}/${pkg.arch}/${pkg.pkgname}/`
		: `https://aur.archlinux.org/packages/${pkg.Name}`;
}

export function bytesNumberToHumanString(bytes: number) {
	const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
	let unitIndex = 0;
	let size = bytes;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}
	return `${size.toFixed(2)} ${units[unitIndex]}`;
}
