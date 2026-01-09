import {getPreferenceValues} from "@vicinae/api";

const FORBIDDEN_CODE = 403;
export async function issueRequest(
    query: string,
    page: number
): Promise<SearxngRequest|SearxngRequestError> {
    const preferences = <Preferences>getPreferenceValues();
    
    const url = new URL("/search", preferences.instance_domain);
    url.searchParams.append("q", query);
    url.searchParams.append('format', 'json');
    url.searchParams.append('pageno', page.toString())
    
    if (preferences.default_category !== "default") {
        url.searchParams.append('categories', preferences.default_category);
    }
    if (preferences.engines && !query.startsWith('!')) {
        url.searchParams.append('engines', preferences.engines);
    }
    
    let response: Response;
    try {
        response = await fetch(url);
    } catch (e) {
        console.error(e);
        return {
            type: "error",
            error_message: `Unable to connect to '${preferences.instance_domain}'. Please validate the domain!`
        }
    }
    
    if (response.status === FORBIDDEN_CODE) {
        return {
            type: "error",
            status_code: FORBIDDEN_CODE,
            error_message: "Request **forbidden**. Please validate that your instance can read from JSON."
        }
    }
    
    if (!response.ok) {
        return {
            type: "error",
            status_code: response.status,
            error_message: "A unknown error happend..."
        }
    }
    
    const data = <RawSearxngRequest>(await response.json());
    return convertResult(data);
}

function convertResult(data: RawSearxngRequest): SearxngRequest {
    return <SearxngRequest>({
        ...data,
        type: "response",
        results: deduplicateResults(data.results.map(convertSearchResult)),
        infoboxes: data.infoboxes.map(convertInfobox)
    })
}

function convertSearchResult(result: RawSearxngRequestResult): SearxngRequestResult {
    return <SearxngRequestResult>({
        ...result,
        type: "result",
        thumbnail: convertUrl(result.thumbnail),
        img_src: convertUrl(result.img_src),
        url: convertUrl(result.url),
        publishedDate: result.publishedDate ? new Date(result.publishedDate) : null
    })
}

function convertInfobox(infobox: RawSearxngRequestInfobox): SearxngRequestInfobox {
    return <SearxngRequestInfobox>({
        ...infobox,
        type: "infobox",
        thumbnail: convertUrl(infobox.thumbnail),
        img_src: convertUrl(infobox.img_src),
        url: convertUrl(infobox.url),
        publishedDate: infobox.publishedDate ? new Date(infobox.publishedDate) : null,
        id: convertUrl(infobox.id)
    })
}

function deduplicateResults(results: SearxngRequestResult[]) {
    const foundUrls: string[] = [];
    return results.filter((result) => {
        if (foundUrls.includes(result.url.toString())) {
            return false;
        }
        
        foundUrls.push(result.url.toString());
        
        return true;
    })
}

function convertUrl(url: string|null): URL|null {
    if (url === null) {
        return null;
    }
    
    if (url === '') {
        return null;
    }
    return new URL(url);
}

export function findFavicon(url: URL): URL {
    const faviconUrl = new URL(url.host, "http://f1.allesedv.com/16/");
    return faviconUrl
}