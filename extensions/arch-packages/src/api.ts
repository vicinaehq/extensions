import { useFetch } from "@raycast/utils";
import { useEffect } from "react";
import { useDebounceValue } from "./utils";

const APKG_DATA = { results: [] };
const AUR_DATA = { results: [] };

const MOCK_DATA = false;

/**
 * Search for Arch packages
 */
function useApkgSearch(query: string, execute: boolean) {
	const { data, isLoading, error } = useFetch(
		`https://archlinux.org/packages/search/json/?limit=20&q=${query}`,
		{
			initialData: [],
			keepPreviousData: true,
			execute,
			headers: {
				Accept: "application/json",
			},
			mapResult: (res: APkgSearchResponse) => {
				return {
					data: res.results,
					// hasMore: res.page < res.num_pages,
				};
			},
		},
	);

	return {
		data,
		isLoading,
		error,
	};
}

/**
 * Search for AUR packages
 */
function useAurSearch(query: string, execute: boolean) {
	const { data, isLoading, error } = useFetch(
		`https://aur.archlinux.org/rpc/v5/search/${query}`,
		{
			initialData: [],
			keepPreviousData: true,
			execute,
			headers: {
				Accept: "application/json",
			},
			mapResult: (res: AurSearchResponse) => {
				return {
					data: res.results,
				};
			},
		},
	);

	return {
		data,
		isLoading,
		error,
	};
}

/**
 * Search for packages in both APKG and AUR
 * @param query - The search query
 * @param packageType - The type of package to search for
 */
export function useAllSearch(query: string, packageType: PackageType) {
	const [searchText, setSearchText, debouncedSearchText] = useDebounceValue(
		query,
		300,
	);

	useEffect(() => {
		setSearchText(query);
	}, [query]);

	const apkg = useApkgSearch(
		debouncedSearchText,
		!!query && packageType !== "aur",
	);
	const aur = useAurSearch(
		debouncedSearchText,
		!!query && packageType !== "apkg",
	);

	if (MOCK_DATA) {
		apkg.data = APKG_DATA.results;
		aur.data = AUR_DATA.results;
	}

	const isLoading =
		apkg.isLoading || aur.isLoading || query !== debouncedSearchText;

	const apkgPackages: SearchResult[] = apkg.data.map((pkg) => ({
		...pkg,
		type: "apkg",
	}));
	const aurPackages: SearchResult[] = aur.data
		.sort((a, b) => b.Popularity - a.Popularity)
		.map((pkg) => ({ ...pkg, type: "aur" }));

	const allPackages =
		packageType === "all"
			? [...apkgPackages, ...aurPackages]
			: packageType === "apkg"
				? apkgPackages
				: aurPackages;

	const errors = [apkg.error, aur.error].filter(
		(error): error is Error => !!error,
	);

	return { allPackages, isLoading, errors };
}
