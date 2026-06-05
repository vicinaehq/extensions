import { showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import {
	clearIconifyCache,
	listIcons,
	listSets,
	searchIcons,
} from "./iconify-api";
import type { IconData, IconSet } from "./iconify-types";

type AsyncState<T> = {
	data: T;
	isLoading: boolean;
	error?: Error;
	refresh: () => void;
};

const useAsyncData = <T>(
	loader: (signal: AbortSignal) => Promise<T>,
	deps: ReadonlyArray<unknown>,
	initialData: T,
	errorTitle: string,
): AsyncState<T> => {
	const [data, setData] = useState<T>(initialData);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error>();
	const [reloadToken, setReloadToken] = useState(0);

	useEffect(() => {
		const controller = new AbortController();
		setIsLoading(true);
		setError(undefined);

		loader(controller.signal)
			.then((nextData) => {
				if (!controller.signal.aborted) {
					setData(nextData);
				}
			})
			.catch(async (nextError) => {
				if (controller.signal.aborted) {
					return;
				}

				const errorObject =
					nextError instanceof Error ? nextError : new Error(String(nextError));
				setError(errorObject);
				setData(initialData);
				await showToast(Toast.Style.Failure, errorTitle, errorObject.message);
			})
			.finally(() => {
				if (!controller.signal.aborted) {
					setIsLoading(false);
				}
			});

		return () => {
			controller.abort();
		};
	}, [...deps, reloadToken]);

	return {
		data,
		isLoading,
		error,
		refresh: () => setReloadToken((value) => value + 1),
	};
};

export const useIconSets = () =>
	useAsyncData(listSets, [], [] as IconSet[], "Couldn't fetch icon sets");

export const useIconSetIcons = (set?: IconSet) =>
	useAsyncData(
		(signal) => {
			if (!set) {
				return Promise.resolve([] as IconData[]);
			}
			return listIcons(set, signal);
		},
		[set?.id],
		[] as IconData[],
		"Couldn't fetch icons",
	);

export const useIconSearch = (query: string) =>
	useAsyncData(
		(signal) => searchIcons(query, signal),
		[query],
		[] as IconData[],
		"Couldn't search icons",
	);

export const resetIconifyCache = () => {
	clearIconifyCache();
};
