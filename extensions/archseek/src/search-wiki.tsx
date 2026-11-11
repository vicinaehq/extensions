// various import
import { useFetch } from "@raycast/utils";
import {
	Action,
	ActionPanel,
	Detail,
	Icon,
	List,
	showToast,
	Toast,
	Color,
	Keyboard
} from "@vicinae/api";
import {
	useEffect,
	useMemo,
	useState
} from 'react';
import TurndownService, * as Turndown from "turndown"
// Turndownservice initialisation (to be able to transform html to markdown)
var turndownService = new TurndownService({codeBlockStyle: `fenced`})
var tables = require('turndown-plugin-gfm').tables

turndownService.use(tables)
turndownService.remove(function (node){
	return node.getAttribute('class') === 'mw-editsection-bracket'
}).remove(function (node){
	return node.getAttribute('class') === 'mw-editsection'
})

// custom interface to match Arch Wiki's response
interface SearchResult {
	query: string;
	titles: string[];
	description: string[];
	urls: string[];
}	

interface PageResult {
	 "parse":{
		title: string,
		pageid: number,
		redirects: string[],
		"text":{
			"*" : string
		}

	}
}

// Function to get a wiki page from it's title
function useWikiPage(title:string|undefined){
let doWeExecute : boolean = true
if (title == undefined){
	doWeExecute = false
}
if (title?.length ==0){
	doWeExecute = false
}
const {isLoading,data,revalidate,error} = useFetch<PageResult>(`https://wiki.archlinux.org/api.php?action=parse&page=${encodeURIComponent(title ?? "")}&format=json&prop=text&redirects=1`,{execute:doWeExecute,redirect:'follow',async onError(error){await showToast({title:"Failed to fetch wiki page",style:Toast.Style.Failure,message:String(error)})}})
let returnData : string|undefined
if (data){
	returnData = data?.parse?.text?.["*"]
}
return {
	wikiPage:returnData ?? "",
	isLoading: isLoading,
	revalidate:revalidate,
	error:error
}
}

function useSearchWikiPage(searchTerm: string){
	const archWikiUrlRegexMarch = searchTerm.match(/^(https:\/\/)?(wiki.archlinux.org\/title\/)(.*)/)
	if (archWikiUrlRegexMarch){
			searchTerm=archWikiUrlRegexMarch[3]
	}
	const defaultOuput = {} as SearchResult;
	defaultOuput.query =""
	defaultOuput.titles = []
	defaultOuput.description = []
	defaultOuput.urls = []
	let doWeExecute : boolean = true
	let wikiText: SearchResult = defaultOuput
	if (searchTerm.length == 0 ){
		doWeExecute = false
		
	}
	if (searchTerm == ""){
		doWeExecute = false
		
	}
	const {isLoading,revalidate,error,data} = useFetch<[string,string[],string[],string[]]>(`https://wiki.archlinux.org/api.php?action=opensearch&search=${encodeURIComponent(searchTerm)}&list=search`,{execute:doWeExecute,async onError(error){await showToast({style:Toast.Style.Failure,title:"Failed to search pages",message:String(error)})}})
	if (!Array.isArray(data)){
		wikiText = defaultOuput
	}
	if (Array.isArray(data)){
		wikiText.query = data[0]
		wikiText.titles = data[1]
		wikiText.description = data[2]
		wikiText.urls = data[3]
	} else{
		wikiText = defaultOuput
	}
	return {
		wikiText:wikiText,
		isLoading: isLoading,
		revalidate:revalidate,
		error:error
	}

}
export default function ArchSeek() {
	const [query, setQuery] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	let selectedTitle
	useEffect(() =>{
        setSelectedId(null)
	},[query])
	const {wikiText:wikiText,isLoading:wikiTextIsLoading} = useSearchWikiPage(query)
	if (selectedId != null){
		// safety check
		if (Number(selectedId) < wikiText.titles.length) {
			selectedTitle = wikiText.titles[Number(selectedId)]
		} 
	} else {
		// if selectedId is null, just return an empty selected title
		selectedTitle = ""
	}
	const {wikiPage,isLoading:wikiPageIsLoading,revalidate:wikiPageRevalidate,error:WikiPageError} = useWikiPage(selectedTitle)
    const body = useMemo(() => turndownService.turndown(wikiPage),[wikiPage])
	return(
        <List throttle={true} isLoading={wikiPageIsLoading||wikiTextIsLoading} onSearchTextChange={setQuery} isShowingDetail searchBarPlaceholder="Enter a search term to start" onSelectionChange={(id) => setSelectedId(id)}>
			{query === "" && wikiText.titles.length === 0 ? (
				<List.EmptyView title="No Page found" description="Try to search something else." icon={{ source: "extension_icon.png", tintColor: Color.SecondaryText}} />
) : (
		 wikiText.titles.map((title, index) =>
			<List.Item id={String(index)} key={title} title={title} icon="extension_icon.png" detail={
				<List.Item.Detail  markdown={`# ${title}\n\n`+body}/>
			} actions={
				<ActionPanel>
					<Action.Push title="Open in detail" target={
						<Detail isLoading={wikiPageIsLoading} markdown={`# ${title}\n\n`+body} actions={
							<ActionPanel>
								<ActionPanel.Section>
									<Action.CopyToClipboard title="Copy wiki url to clipboard" content={wikiText.urls[index]} icon={Icon.CopyClipboard}/>
									<Action.OpenInBrowser title="Open wiki page in browser" url={wikiText.urls[index]} icon="extension_icon.png" shortcut={Keyboard.Shortcut.Common.Open}/>
								</ActionPanel.Section>
								<ActionPanel.Section>
									<Action onAction={wikiPageRevalidate} title="Reload page" icon={Icon.ArrowClockwise} shortcut={Keyboard.Shortcut.Common.Refresh}/>
								</ActionPanel.Section>
							</ActionPanel>
						}/> } icon={Icon.AppWindow}/>
					<Action.CopyToClipboard title="Copy wiki url to clipboard" content={wikiText.urls[index]} icon={Icon.CopyClipboard}/>
					<Action.OpenInBrowser title="Open wiki page in browser" url={wikiText.urls[index]} icon="extension_icon.png" shortcut={Keyboard.Shortcut.Common.Open}/>

				</ActionPanel>
			}/>
		) 
			)
			
		}
			</List>
	
    );
	}

