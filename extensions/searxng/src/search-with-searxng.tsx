import {Detail, List, LocalStorage} from "@vicinae/api";
import {issueRequest} from "./requests";
import { useState, useCallback, useRef, useEffect } from "react";
import ResultItem from "./components/ResultItem";
import { throttle } from "lodash";
import {getPreviousState, saveState} from "./storage";

export default function SimpleList() {

	const [state, setState] = useState<State|null>(null);
	
	const [errorState, setErrorState] = useState<SearxngRequestError|null>(null);
	
	const [isLoading, setIsLoading] = useState<boolean>(false)
	const [showDetails, setShowDetails] = useState<boolean>(false);
	
	const throttleSearchUpdate = useCallback(throttle(async () => {
		if (!state?.response) {
			return;
		}
		
		setIsLoading(true);
		const newPageNumber = state.pageNumber + 1;
		const response = await issueRequest(state.response.query, newPageNumber);

		if (response.type === "error") {
			setIsLoading(false);
			setErrorState(response);
			return;
		}

		setErrorState(null);
		setState({
			response: {
				...state.response,
				results: [
					...state.response.results,
					...response.results
				]
			},
			pageNumber: newPageNumber
		})
		setIsLoading(false);
	}), [])
	
	const init = useCallback(async () => {
		setState(await getPreviousState());
		setIsLoading(false);
	}, []);
	useEffect(() => {
		init()
	}, []);

	useEffect(() => {
		saveState(state);
	}, [state]);
	
	async function updateRequest(query: string) {
		if (!query) {
			return;
		}
		
		setIsLoading(true);
		const response = await issueRequest(query, 1);
		setIsLoading(false);
		
		if (response.type === 'error') {
			setErrorState(response);
			return;
		}
		
		setErrorState(null);
		setState({
			pageNumber: 1,
			response: response
		})
	}
	
	function invertShowDetails() {
		setShowDetails(!showDetails);
	}
	
	function sortResults(resultA: SearxngRequestResult, resultB: SearxngRequestResult) {
		return resultB.score - resultA.score;
	}
	
	function infiniteScrollCheck(id: string) {
		if (!id.startsWith('result')) {
			return;
		}
		
		if (isLoading) {
			return;
		}
		
		if (!state) {
			return;
		}
		
		if (!state.response) {
			return;
		}
		
		const maxIndexResults = state.response.results.length;
		const threshold = (maxIndexResults - 8);
		const index = parseInt(id.split('-')[1]);
		
		if (index < threshold) {
			return;
		}
		
		throttleSearchUpdate();
	}
	
	if (errorState)  {
		return (
			<Detail markdown={`
# ERROR
${errorState.error_message}`}
			metadata={
				<Detail.Metadata>
					{errorState.status_code ? <Detail.Metadata.Label title={"Status Code"} text={errorState.status_code.toString()} /> : <></>}
				</Detail.Metadata>
			}/>
		)
	}
	
	return (
		<List searchBarPlaceholder="Search..."
			  isShowingDetail={showDetails}
			  throttle
			  onSearchTextChange={updateRequest}
			  onSelectionChange={infiniteScrollCheck}
			  isLoading={isLoading}
		>
			{state?.response?.type === "response" ? (
				<>
					<List.Section title="Info" key="section-info">
						{state.response.infoboxes.map((result: SearxngRequestInfobox, index: number) => (
							<ResultItem key={`infobox-${index.toString()}`} result={result} index={index} toggleShowDetails={invertShowDetails} />
						))}
					</List.Section>
					<List.Section title="Results"  key="section-results">
						{[...state.response.results]
							.sort(sortResults)
							.map((result: SearxngRequestResult, index: number) => (
								<ResultItem key={`result-${index.toString()}`} result={result} index={index} toggleShowDetails={invertShowDetails} />
							))}
					</List.Section>
				</>
			): null}
		</List>
	);
}

