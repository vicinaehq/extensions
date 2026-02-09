import {Action, ActionPanel, List} from "@vicinae/api";
import {findFavicon} from "../requests";

function compileMarkdown(markdownComponents: {[x:string]: string|URL|null}) {
    return Object.entries(markdownComponents).map(([header, value]) => {
        if (value === null) {
            return null
        }
        let markdown = "# " + header + "\n\n";

        if (value instanceof URL) {
            markdown += `![image](${value})`
        } else {
            markdown += value
        }
        return markdown;
    }).filter(value => value).join("\n\n");
}

type ResultItemArgs = {
    result: SearxngRequestResult | SearxngRequestInfobox,
    toggleShowDetails: () => void,
    index: number
}

export default function ResultItem(
    { 
        toggleShowDetails,
        result,
        index
    }: ResultItemArgs
) {
    const markdown = compileMarkdown({
        "Description": result.content,
        "Image": result.img_src,
        "Thumbnail": result.thumbnail
    })

    const url = result.id ?? result.url;
    
    return (
        <List.Item title={result.infobox ?? result.title}
                   icon={findFavicon(url)}
                   id={`${result.type}-${index}`}
                   actions={(
                       <ActionPanel>
                           {result.urls?.map(url => (
                               <Action.OpenInBrowser title={`Open in browser (${url.title})`}
                                                     url={url.url}
                                                     key={`action-${url.title}`}
                               />
                           ))}
                           {
                               result.url ? (
                                   <Action.OpenInBrowser title={`Open in browser`}
                                                         url={result.url.toString()}
                                                         key={`action-default`}
                                   />
                               ) : <></>
                           }
                           <Action title="Toggle Details"
                                   onAction={toggleShowDetails}
                                   shortcut={{
                                       modifiers: ["ctrl"],
                                       key: "space"
                                   }}
                           />
                           
                       </ActionPanel>
                   )}
                   detail={(
                       <List.Item.Detail
                           markdown={markdown}
                           metadata={(
                               <List.Item.Detail.Metadata>
                                   <List.Item.Detail.Metadata.Label title="Engines" text={result.engines.join(', ')} />
                               </List.Item.Detail.Metadata>
                           )}
                       />
                   )}
        />
    )
}