import {Detail, List} from "@vicinae/api";
import {issueRequest} from "./requests";
import { useState } from "react";
import ResultItem from "./components/ResultItem";
import _ from "lodash";

export default function SimpleList() {

	const [currentResponse, setCurrentResponse] = useState<SearxngRequest|null>();
	const [errorState, setErrorState] = useState<SearxngRequestError|null>(null);
	
	const [isLoading, setIsLoading] = useState<boolean>(false)
	const [showDetails, setShowDetails] = useState<boolean>(false);
	const [pageNumber, setPageNumber] = useState<number>(1);
	
	const throttleSearchUpdate = _.throttle(async () => {
		if (!currentResponse) {
			return;
		}
		
		setIsLoading(true);
		const newPageNumber = pageNumber + 1;
		const response = await issueRequest(currentResponse.query, newPageNumber);
		setPageNumber(newPageNumber);

		if (response.type === "error") {
			setErrorState(response);
			return;
		}

		setCurrentResponse({
			...currentResponse,
			results: [
				...currentResponse.results,
				...response.results
			]
		});

		setIsLoading(false);
	})
	
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

		setPageNumber(1);
		setCurrentResponse(response);
	}
	
	function invertShowDetails() {
		setShowDetails(!showDetails);
	}
	
	function sortResults(resultA: SearxngRequestResult, resultB: SearxngRequestResult) {
		return resultB.score - resultA.score;
	}
	
	async function infiniteScrollCheck(id: string) {
		if (!id.startsWith('result')) {
			return;
		}
		
		if (isLoading) {
			return;
		}
		
		if (!currentResponse) {
			return;
		}
		
		const maxIndexResults = currentResponse.results.length;
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
			{currentResponse?.type === "response" ? (
				<>
					<List.Section title="Info" key="section-info">
						{currentResponse?.infoboxes.map((result: SearxngRequestInfobox, index: number) => (
							<ResultItem key={`infobox-${index.toString()}`} result={result} index={index} toggleShowDetails={invertShowDetails} />
						))}
					</List.Section>
					<List.Section title="Results"  key="section-results">
						{currentResponse?.results
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

