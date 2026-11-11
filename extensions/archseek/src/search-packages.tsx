// various import
import {
	Action,
	ActionPanel,
	Detail,
	Icon,
	List,
	showToast,
	Toast,
	Color,
    getPreferenceValues,
    Keyboard,
} from "@vicinae/api";
import TurndownService from "turndown"
import {
	useEffect,
	useState
} from 'react';
import { DOMParser } from '@xmldom/xmldom'
import { useFetch,useExec } from '@raycast/utils'
interface Preferences {
    "aur-helper": string;
    "run-probe": boolean;
    
}
interface PackageDescription{
    pkgname: string
    pkgbase: string
    repo: string
    arch: string
    pkgver: string
    pkgrel: string
    epoch: number
    pkgdesc: string
    url: string
    filename: string
    compressed_size: number
    installed_size: number
    build_date: string //for now, going to try to parse this later (TODO)
    last_update: string // same as for build_date (TODO)
    flag_date: null | string //in case it was flagged
    maintainers: string[]
    packager: string
    groups: string[]
    licenses: string[]
    conflicts: string[]
    provides: string[]
    replaces: string[]
    depends: string[]
    optdepends: string[]
    makedepends: string[]
    checkdepends: string[]
}
interface PackageSearchResult {
    version: number
    limit: number
    valid: boolean
    results: PackageDescription[]
    num_pages: number
    count: number
    page: number
}
interface AURPackageDescription{
    Description: string
    FirstSubmitted: EpochTimeStamp
    ID: number
    LastModified: EpochTimeStamp
    Maintainer: string
    Name: string
    NumVotes: number
    OutOfDate: null | EpochTimeStamp
    PackageBase: string
    PackageBaseID: number
    Popularity: number
    URL: string
    URLPath: string
    Version: string

}
interface AURPackageMoreInfoResult{
resultcount: number
results: AURPackageMoreInfoDescription[]
type: string
version: number
}
interface AURPackageMoreInfoDescription{
    CoMaintainers: string[]
    Conflicts: string[]
    Depends: string[]
    Description: string
    FirstSubmitted: EpochTimeStamp
    ID: number
    Keywords: string[]
    LastModified: EpochTimeStamp
    License: string[]
    Maintainer: string
    MakeDepends: string[]
    Name: string
    NumVotes: number
    OutOfDate: null | EpochTimeStamp
    PackageBase: string
    PackageBaseID: number
    Popularity: number
    Provides: string[]
    Submitter: string
    URL: string
    URLPath: string
    Version: string

}
interface AURSearchResult {
    resultcount: number
    results: AURPackageDescription[]
    type: string
    version: number
}
interface SearchState {
    officialResults: PackageDescription[]
    AURResults: AURPackageDescription[]
}
interface AURCommits{
    hash: string
    title: string
    date: string
    author: string
}
const defaultAurMoreInfoDescription = {CoMaintainers: [""],Conflicts: [""],Depends:[""],Description: "",FirstSubmitted:0,ID:0,Keywords:[""],LastModified:0,License:[""],Maintainer:"",MakeDepends:[""],Name:"",NumVotes:0,OutOfDate:null,PackageBase:"",PackageBaseID:0,Popularity:0,Provides:[""],Submitter:"",URL:"",URLPath:"",Version:""} as AURPackageMoreInfoDescription
const prefs = getPreferenceValues<Preferences>();
// Turndownservice initialisation (to be able to transform html to markdown)
var turndownService = new TurndownService({codeBlockStyle: `fenced`})
turndownService.addRule('del',{
    filter: function (node){
        return(
            node.className === 'del'
        )
    },
    replacement: function (content){
        return '<span style="color:red">' + content + '</span>  \n'
    }
})
 
turndownService.addRule('add',{
    filter: function (node){
        return(
            node.className === 'add'
        )
    },
    replacement: function(content){
        return '<span style="color:green">' + content + '</span>  \n'
    }
})
turndownService.addRule('hunk',{
    filter: function (node){
        return(
            node.className === 'hunk'
        )
    },
    replacement: function (content){
        return '<span style="color:#5c5cbd">' + content + '</span>  \n'
    }
})
turndownService.addRule('head',{
    filter: function (node){
        return(
            node.className === 'head'
        )
        
    },replacement: function(content){
            return '**' + content + '**  \n'
    }
})
function useGetMoreAURInfo(packageName : string|null){
    let doWeExecute : boolean = true
    if (packageName == null){
        doWeExecute = false
        packageName = ""
    }
    if (packageName?.length == 0){
        doWeExecute = false
        packageName = ""
    }
    const {data,isLoading,error,revalidate} = useFetch<AURPackageMoreInfoResult>(`https://aur.archlinux.org/rpc/v5/info?arg[]=${encodeURIComponent(packageName)}`,{execute:doWeExecute,async onError(error){await showToast({style:Toast.Style.Failure,title:"Failed to fetch AUR package description",message:String(error)})}})
    
    return {
        AURPackageInfo: data?.results[0] ?? defaultAurMoreInfoDescription,
        revalidate:revalidate,
        isLoading:isLoading,
        error:error
    }
}

function useSearchPackage(searchTerm: string, source: string){
    let doWeExecuteAUR: boolean = false
    let doWeExecuteOfficial: boolean = false
    let searchResults = {officialResults: [],AURResults: []} as SearchState
    if (source == "AUR" || source == "All"){
        doWeExecuteAUR = true
    }
    if (source == "Official" || source == "All"){
        doWeExecuteOfficial = true
    }
    if(searchTerm == null){
        doWeExecuteAUR = false
        doWeExecuteOfficial = false
    }
    if (searchTerm.length == 0){
        doWeExecuteAUR = false
        doWeExecuteOfficial = false
    }
    if (searchTerm.length < 2){
        doWeExecuteAUR = false
    }

    const {data:AURData,error:AURError,isLoading:AURIsLoading,revalidate:AURRevalidate} = useFetch<AURSearchResult>(`https://aur.archlinux.org/rpc/v5/search/${encodeURIComponent(searchTerm)}`,{execute:doWeExecuteAUR,async onError(error){await showToast({style:Toast.Style.Failure,title:"Failed to fetch the search results",message:String(error)})}})
    // set to blank if no results
    searchResults.AURResults = AURData?.results ?? [] 
    const {data:OfficialData,error:OfficialError,isLoading:OfficialIsLoading,revalidate:OfficialRevalidate} = useFetch<PackageSearchResult>(`https://archlinux.org/packages/search/json/?q=${encodeURIComponent(searchTerm)}`,{execute:doWeExecuteOfficial,async onError(error){await showToast({style:Toast.Style.Failure,title:"Failed to fetch the search results",message:String(error)})}})
    searchResults.officialResults = OfficialData?.results ?? []
    return {
        searchResults,
        AURIsLoading,
        OfficialIsLoading
    }

}
function useFetchPKGBUILD(packageName:string|null){
    let doWeExecute : boolean = true
    if (packageName == null){
        doWeExecute = false
    }
    if (packageName?.length == 0){
        doWeExecute = false
    }
    const {isLoading, data, revalidate,error} = useFetch<string>(`https://aur.archlinux.org/cgit/aur.git/plain/PKGBUILD?h=${encodeURIComponent(packageName ?? "")}`,{execute:doWeExecute,async onError(error){await showToast({title:"Failed to fetch PKGBUILD",style:Toast.Style.Failure,message:String(error)})}})

    return {
        PKGBUILD: data ?? "",
        isLoading,
        revalidate,
        error
    }
    

}

function useFetchPKGBUILDCommits(packageName:string|null){
    let doWeExecute : boolean = true
    if (packageName == null){
        doWeExecute = false
    }
    if (packageName?.length == 0){
        doWeExecute = false
    }

    const {isLoading, data, revalidate,error} = useFetch<string>(`https://aur.archlinux.org/cgit/aur.git/atom/?h=${encodeURIComponent(packageName ?? "")}`,{execute:doWeExecute,async onError(error){await showToast({style:Toast.Style.Failure,title:"Failed to fetch commits list",message:String(error)})}})
        let aurCommits : AURCommits[] = []
        if (data){
        const xmlDoc = new DOMParser().parseFromString(String(data),"text/xml")
        let allEntrylements = xmlDoc.getElementsByTagName("entry")
        for (let i =0; i<allEntrylements.length;i++){  
                if (allEntrylements[i].hasChildNodes() === false){
                    continue
                }
                const idContent = String(allEntrylements[i].getElementsByTagName("id")[0].textContent)
                const titleContent = String(allEntrylements[i].getElementsByTagName("title")[0].textContent)
                const dateContent = String(allEntrylements[i].getElementsByTagName("published")[0].textContent)
                const authorContent = String(allEntrylements[i].getElementsByTagName("author")[0].textContent)
                aurCommits.push({hash: idContent,title:titleContent,date: dateContent,author:authorContent})
                
        

    }
}
    return {
        aurCommits: aurCommits,
        isLoading: doWeExecute ? isLoading : false,
        revalidate,
        error
    }


}

function useFetchPKGBUILDDiffs(packageName:string|null,hash:string|null){
    let doWeExecute: boolean = true
    let diffText : string = "Select a commit to start."
    if (packageName == null || hash == null){
        doWeExecute = false
        packageName = ""
        diffText = "Select a commit to start."

    }
    if (packageName?.length == 0){
        doWeExecute = false
        packageName = ""
        diffText = "Select a commit to start."
    }
    let hashRegex = hash?.match(/^urn:sha\d*:(.*)/)
    if (hashRegex == null){
        doWeExecute = false
        packageName = ""
        diffText = "Select a commit to start."
        
    }
    const {data,isLoading,error,revalidate} = useFetch<string>(`https://aur.archlinux.org/cgit/aur.git/commit/?h=${encodeURIComponent(packageName)}&id=${hashRegex?.[1]}`,{execute:doWeExecute,async onError(error){await showToast({style:Toast.Style.Failure,title:"Failed to fetch diffs",message:String(error)})}}) 
    if (data){
        const htmlDoc = new DOMParser().parseFromString(data,'text/html')
        let diffObj = htmlDoc.getElementsByClassName("diff").toString()
        diffText = diffObj
    }
    return{
        diffs:diffText,
        isLoading:isLoading,
        error:error,
        revalidate:revalidate
    }
}
function useProbeDB(packageName:string|null){
    let doWeExecute: boolean = true
    let version: string = ""
    let installed:boolean = false
    if (packageName == null){
        doWeExecute = false
    }
    if (packageName?.length == 0){
        doWeExecute = false
    }
    if (prefs["run-probe"] == false){
        doWeExecute = false
    }
    const {isLoading, data,revalidate,error} = useExec("/bin/sh",["-c",`pacman -Q -- "${packageName}" 2>/dev/null || true`],{execute:doWeExecute})
    
    if (data){
        if (data.startsWith(String(packageName))){
            installed = true
            const substrings = data.split(" ")
            version = substrings.slice(1)[0]
        }
    } else{
        version = ""
        installed = false   
    }
    return{
        isLoading:isLoading,
        revalidate:revalidate,
        installed:installed,
        version:version
    }

}
function ReadPKGBUILD({packageName}: {packageName:string|null}){
const {PKGBUILD,isLoading,revalidate,error} = useFetchPKGBUILD(packageName)
    return(
        <Detail
        isLoading={isLoading} 
        markdown={`# PKGBUILD  \n\`\`\`  \n${PKGBUILD}  \n\`\`\`\``} actions={
            <ActionPanel>
                <Action.CopyToClipboard title="Copy PKGBUILD" content={PKGBUILD} icon={Icon.CopyClipboard}/>
                <Action.OpenInBrowser title="Open PKGBUILD in browser" url={`https://aur.archlinux.org/cgit/aur.git/tree/PKGBUILD?h=${packageName}`} icon={{source: "extension_icon.png", tintColor: Color.SecondaryText}}/>
                <Action title="Reload PKGBUILD" onAction={revalidate} icon={Icon.ArrowClockwise} shortcut={Keyboard.Shortcut.Common.Refresh}/>
                
            </ActionPanel>
        }/>
    )
}
function ReadPKGBUILDDiffs({packageName} : {packageName:string|null} ){
    const {aurCommits:PKGBUILDCommits,isLoading:PKGBUILDCommitsIsLoading,revalidate,error} = useFetchPKGBUILDCommits(packageName)
    const [selectedCommit, setSelectedCommit] = useState<string>("")
    const [selectedID, setSelectedID] = useState<number>()
    const {diffs,isLoading:diffsIsLoading,error:diffsError,revalidate:diffsRevalidate} = useFetchPKGBUILDDiffs(packageName,selectedCommit)
    useEffect(() =>{
        setSelectedCommit("")
        setSelectedID(undefined)
    },[packageName])
    return(
        <Detail 
        isLoading={(PKGBUILDCommitsIsLoading || (diffsIsLoading && selectedID != undefined))}
        markdown={`## **${packageName}** | PKGBUILD Changes  \n  ${ selectedID != undefined ?  `\n#### **Title:** ${PKGBUILDCommits[Number(selectedID)].title}  \n#### **Author:** ${PKGBUILDCommits[Number(selectedID)].author.replace(/[\r\n]+/gm,"")}  \n#### **Date:** ${new Date(PKGBUILDCommits[Number(selectedID)].date).toLocaleString()} (${formatTime(PKGBUILDCommits[Number(selectedID)].date)}) \n` : "" }---  \n${turndownService.turndown(diffs)}`} actions={
            <ActionPanel>
                <ActionPanel.Submenu title="Select commit to compare" icon={Icon.Clock}>
                    {PKGBUILDCommits.map((elementObj,index) =>
                    <Action title={formatTime(elementObj.date) + ' - ' + elementObj.title} icon={Icon.Git} onAction={() => {
                        setSelectedCommit(elementObj.hash)
                        setSelectedID(index)
                    }} key={index}/>
                    )
                    }
                </ActionPanel.Submenu>
                <ActionPanel.Section>
                <Action title="Reload commits" onAction={revalidate} icon={Icon.ArrowClockwise} shortcut={Keyboard.Shortcut.Common.Refresh}/>
                </ActionPanel.Section>

            </ActionPanel>
        } />
    )
}
// formatBytes taken from https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
function formatBytes(bytes: number){
    if (!bytes)return "0 Bytes"
    const k = 1024
    const dm = 2
    const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}
// formatTime taken with very slight modifications from https://dev.to/ala_garbaa/format-time-ago-function-time-differences-in-typescript-5ag2
function formatTime(dateTime: string){
    let date = new Date(dateTime)
    const seconds: number = Math.floor((new Date().getTime() - date.getTime()) / 1000)
    const intervals: Record<string,number> = {
        year: 31536000,
        month: 2628000,
        day: 86400,
        hour: 3600,
        minute: 60
    }
    for (const [unit, secondsInUnit] of Object.entries(intervals)){
        const interval: number = Math.floor(seconds / secondsInUnit)
        if (interval > 1){
            return `${interval} ${unit}s ago`
        } else if (interval === 1){
            return `${interval} ${unit} ago`
        }
        
    }
    return "just now"
}
export default function ArchSeek(){
    const [query, setQuery] = useState("");
    const [sourceDropdown,setSourceDropdown] = useState("All")
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Make sure to reset ID if results changes
    useEffect(() =>{
        setSelectedId(null)
    },[query,sourceDropdown])

    let selectedPackage: string| null = null
    let selectedPKGBase: string | null = null
    let selectedAUR: string| null = null
    const {searchResults,AURIsLoading,OfficialIsLoading} = useSearchPackage(query, sourceDropdown)
    if (selectedId != null){
        if (selectedId.slice(0,4) == 'AUR-'){
            if(Number(selectedId.slice(4)) < searchResults.AURResults.length){
                selectedPackage = searchResults.AURResults[Number(selectedId.slice(4))].Name
                selectedPKGBase = searchResults.AURResults[Number(selectedId.slice(4))].PackageBase
                selectedAUR = selectedPackage
            } }
            else if (selectedId.slice(0,4) == "OFF-"){
                if(Number(selectedId.slice(4)) < searchResults.officialResults.length){
                    selectedPackage = searchResults.officialResults[Number(selectedId.slice(4))].pkgname
                }
            }
        
    } else {
        selectedPackage = ""
    }
    const {AURPackageInfo,isLoading:AURPackageInfoIsLoading,revalidate:AURPackageInfoRevalidate} = useGetMoreAURInfo(selectedAUR)
    const {revalidate:probingRevalidate,isLoading:probingIsLoading,version:probedVersion,installed:ProbedInstalled} = useProbeDB(selectedPackage)
    return(
        <List throttle={true} isLoading={AURIsLoading||OfficialIsLoading||AURPackageInfoIsLoading} onSearchTextChange={setQuery} isShowingDetail searchBarPlaceholder="Enter a search term to start" onSelectionChange={(id) => setSelectedId(id)} searchBarAccessory={
        <List.Dropdown tooltip="Source" value={sourceDropdown} onChange={setSourceDropdown}>
            <List.Dropdown.Item title="All" value="All"/>
            <List.Dropdown.Item title="AUR" value="AUR"/>
            <List.Dropdown.Item title="Official repos only" value="Official"/>
        </List.Dropdown>
    }>
            {query === "" ?(
                <List.EmptyView title="No Package Found" description="Try to search something else." icon={{source: "extension_icon.png", tintColor: Color.SecondaryText}}/>
            ) : (
                <>
                {searchResults.officialResults.map((officialPackage,index) =>
                <List.Item id={String('OFF-' + index)} title={officialPackage.pkgname} key={`${officialPackage.pkgname}-${officialPackage.repo}-${officialPackage.arch}`} icon="extension_icon.png" detail={
                    <List.Item.Detail markdown={`# ${officialPackage.pkgname} ${officialPackage.pkgver}  \n**Architecture:** ${officialPackage.arch}  \n**Repository:** ${officialPackage.repo}  \n**Description:** ${officialPackage.pkgdesc}  \n**Upstream URL:** ${officialPackage.url}  \n**License(s):** ${Array.isArray(officialPackage.licenses) && (officialPackage.licenses?.length) > 0 ? `${officialPackage.licenses.toString()}  \n` : ""}**Maintainers:** ${officialPackage.maintainers}  \n**Package Size:** ${formatBytes(officialPackage.compressed_size)}  \n**Installed Size:** ${formatBytes(officialPackage.installed_size)}  \n**Last Packager:** ${officialPackage.packager}  \n**Build Date:** ${new Date(officialPackage.build_date).toLocaleString()}  \n**Last Updated:** ${new Date(officialPackage.last_update).toLocaleString()} ${typeof officialPackage.flag_date === 'string' && officialPackage.flag_date?.length > 0 ? `  \n<span style="color:red">_**Flagged out-of-date on:** ${new Date(officialPackage.flag_date).toLocaleDateString()}</span>_`:""} ${prefs["run-probe"] == true ? `  \n**Installed?:** ${(ProbedInstalled) ? `<span style="color:green"> Yes (${probedVersion})</span>` : '<span style="color:red"> No</span>'}`: ""}`}/>
                } accessories={[
                    { tag: {value: `${officialPackage.repo}`,color: Color.Yellow}},

                    { tag: {value: "Arch Repos",color: Color.SecondaryText}}
                ]} actions={
                    <ActionPanel>
                        <Action.CopyToClipboard title="Copy package name" content={officialPackage.pkgname} icon={Icon.CopyClipboard}/>
                        <Action.RunInTerminal title="Install package" args={["/bin/bash","-c",`set -x;sudo pacman -S --needed ${officialPackage.pkgname}`]} options={{hold:true}}/>
                        <Action.OpenInBrowser title="Open package in the browser" url={`https://archlinux.org/packages/${officialPackage.repo}/${officialPackage.arch}/${officialPackage.pkgname}/`} icon="extension_icon.png" shortcut={Keyboard.Shortcut.Common.Open}/>
                        <Action.CopyToClipboard title="Copy upstream url to clipboard" content={officialPackage.url} icon={Icon.CopyClipboard} shortcut={Keyboard.Shortcut.Common.Copy}/>
                        <Action.CopyToClipboard title="Copy package url to clipboard" content={`https://archlinux.org/packages/${officialPackage.repo}/${officialPackage.arch}/${officialPackage.pkgname}/`} icon={Icon.CopyClipboard} shortcut={Keyboard.Shortcut.Common.CopyPath}/>
                    </ActionPanel>
                }/>

                )}
                {searchResults.AURResults.map((AURPackage,index) => 
                <List.Item id={String('AUR-' + index)} title={AURPackage.Name} key={`${AURPackage.ID}`} icon="extension_icon.png" detail={
                    <List.Item.Detail markdown={`# ${AURPackage.Name} ${AURPackage.Version}  \n**Package Base:** ${AURPackage.PackageBase}  \n**Description:** ${AURPackage.Description}  \n**Upstream URL:** ${AURPackage.URL}  \n${Array.isArray(AURPackageInfo?.Keywords) && (AURPackageInfo?.Keywords?.length) > 0 ?  `**Keywords:** ${AURPackageInfo.Keywords.toString()}  \n`: "" }${Array.isArray(AURPackageInfo?.License) && (AURPackageInfo?.License?.length) > 0 ? `**Licenses:** ${AURPackageInfo.License.toString()}  \n` : ""}${ Array.isArray(AURPackageInfo?.Conflicts) && (AURPackageInfo.Conflicts?.length) >0 ?`**Conflicts:** ${AURPackageInfo.Conflicts.toString()}  \n` : ""}${ Array.isArray(AURPackageInfo?.Provides)&& (AURPackageInfo?.Provides?.length) > 0 ? `**Provides:** ${AURPackageInfo.Provides.toString()}  \n` : ""}**Submitter:** ${AURPackageInfo?.Submitter}  \n**Maintainers:** ${AURPackage.Maintainer}${Array.isArray(AURPackageInfo.CoMaintainers)&&(AURPackageInfo.CoMaintainers?.length) >0 ? ` (${AURPackageInfo.CoMaintainers.toString()})` : ""}  \n**Votes:** ${AURPackage.NumVotes}  \n**Popularity:** ${AURPackage.Popularity}  \n**First Submitted:** ${new Date(AURPackage.FirstSubmitted * 1000).toLocaleString()}  \n**Last Updated:** ${new Date(AURPackage.LastModified * 1000).toLocaleString()} (${formatTime(String(new Date(AURPackage.LastModified * 1000)))}) ${(typeof AURPackageInfo.OutOfDate === 'number') ? `  \n<span style="color:red">_**Flagged out-of-date**(${new Date(AURPackageInfo.OutOfDate * 1000).toLocaleDateString()})</span>_` : ""}${prefs["run-probe"] == true ? `  \n**Installed? :** ${(ProbedInstalled ? `<span style="color:green"> Yes (${probedVersion})</span>` : '<span style="color:red"> No</span>')}`: ""}`}/>
                } accessories={[
                    { tag: { value: "AUR", color: Color.Green}}
                ]} actions={
                    <ActionPanel>
                        <Action.CopyToClipboard title="Copy AUR package name" content={AURPackage.Name} icon={Icon.CopyClipboard}/>
                        <Action.RunInTerminal title="Install package" args={["/bin/bash","-c",`set -x;${[prefs["aur-helper"]]} -S --needed ${AURPackage.Name}`]} options={{hold:true}} />
                        <Action.OpenInBrowser title="Open package in the browser" url={`https://aur.archlinux.org/packages/${AURPackage.Name}`} icon="extension_icon.png" shortcut={Keyboard.Shortcut.Common.Open}/>
                        <Action.Push title="View PKGBUILD" target={<ReadPKGBUILD packageName={AURPackage.PackageBase} />} icon={Icon.NewDocument} shortcut={{key:"v",modifiers:["cmd","shift"]}}/>
                        <Action.Push title="View PKGBUILD changes" target={<ReadPKGBUILDDiffs packageName={AURPackage.PackageBase} />} icon={Icon.Clock} shortcut={{key: "d",modifiers:["cmd","shift"]}}/>
                        <Action.CopyToClipboard title="Copy upstream url to clipboard" content={AURPackage.URL} icon={Icon.CopyClipboard} shortcut={Keyboard.Shortcut.Common.Copy}/>
                        <Action.CopyToClipboard title="Copy package url to clipboard" content={`https://aur.archlinux.org/packages/${AURPackage.Name}`} icon={Icon.CopyClipboard} shortcut={Keyboard.Shortcut.Common.CopyPath}/>
                        <Action title="Reload package informations" onAction={() => { AURPackageInfoRevalidate();probingRevalidate()}} icon={Icon.ArrowClockwise} shortcut={Keyboard.Shortcut.Common.Refresh}/>
                    </ActionPanel>
                }/>
                
            )}
            

                 </>   
            )
            
            }
        </List>
    );
}
