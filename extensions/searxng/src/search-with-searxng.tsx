import {Detail, List} from "@vicinae/api";
import {issueRequest} from "./requests";
import { useState, useCallback, useRef } from "react";
import ResultItem from "./components/ResultItem";
import { throttle } from "lodash";

export default function SimpleList() {
	const currentResponseRef = useRef<SearxngRequest|null>(null);
	const pageNumber = useRef<number>(1);
	
	const [errorState, setErrorState] = useState<SearxngRequestError|null>(null);
	
	const [isLoading, setIsLoading] = useState<boolean>(false)
	const [showDetails, setShowDetails] = useState<boolean>(false);
	
	const throttleSearchUpdate = useCallback(throttle(async () => {
		if (!currentResponseRef.current) {
			return;
		}
		
		setIsLoading(true);
		const newPageNumber = pageNumber.current + 1;
		const response = await issueRequest(currentResponseRef.current.query, newPageNumber);
		pageNumber.current = newPageNumber;

		if (response.type === "error") {
			setIsLoading(false);
			setErrorState(response);
			return;
		}

		setErrorState(null);
		const newCurrentResponse = {
			...currentResponseRef.current,
			results: [
				...currentResponseRef.current.results,
				...response.results
			]
		};
		currentResponseRef.current = newCurrentResponse;

		setIsLoading(false);
	}), [pageNumber, currentResponseRef])
	
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
		pageNumber.current = 1;
		currentResponseRef.current = response;
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
		
		if (!currentResponseRef.current) {
			return;
		}
		
		const maxIndexResults = currentResponseRef.current.results.length;
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
			{currentResponseRef.current?.type === "response" ? (
				<>
					<List.Section title="Info" key="section-info">
						{currentResponseRef.current.infoboxes.map((result: SearxngRequestInfobox, index: number) => (
							<ResultItem key={`infobox-${index.toString()}`} result={result} index={index} toggleShowDetails={invertShowDetails} />
						))}
					</List.Section>
					<List.Section title="Results"  key="section-results">
						{[...currentResponseRef.current.results]
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

