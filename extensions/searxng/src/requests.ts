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
    if (preferences.languages) {
        url.searchParams.append('language', preferences.languages);
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
            error_message: "Request **forbidden**. Please verify that your SearXNG instance has JSON format support enabled."
        }
    }
    
    if (!response.ok) {
        let data = {};
        try {
            data = await response.json();
        } catch (e) {
            // ignore
        }
        
        return {
            type: "error",
            status_code: response.status,
            error_message: data.error ?? "An unknown error occurred..."
        }
    }
    
    const data = (await response.json()) as RawSearxngRequest;
    return convertResult(data);
}

function convertResult(data: RawSearxngRequest): SearxngRequest {
    return ({
        ...data,
        type: "response",
        results: deduplicateResults(data.results.map(convertSearchResult)),
        infoboxes: data.infoboxes.map(convertInfobox)
    }) as SearxngRequest
}

function convertSearchResult(result: RawSearxngRequestResult): SearxngRequestResult {
    return ({
        ...result,
        type: "result",
        thumbnail: convertUrl(result.thumbnail),
        img_src: convertUrl(result.img_src),
        url: convertUrl(result.url),
        publishedDate: result.publishedDate ? new Date(result.publishedDate) : null
    }) as SearxngRequestResult;
}

function convertInfobox(infobox: RawSearxngRequestInfobox): SearxngRequestInfobox {
    return ({
        ...infobox,
        type: "infobox",
        thumbnail: convertUrl(infobox.thumbnail),
        img_src: convertUrl(infobox.img_src),
        url: convertUrl(infobox.url),
        publishedDate: infobox.publishedDate ? new Date(infobox.publishedDate) : null,
        id: convertUrl(infobox.id)
    }) as SearxngRequestInfobox
}

function deduplicateResults(results: SearxngRequestResult[]) {
    const foundUrls: Set<string> = new Set<string>();
    return results.filter((result) => {
        if (!result.url) {
            return false;
        }
        
        const url = result.url.toString();
        
        if (foundUrls.has(url)) {
            return false;
        }
        
        foundUrls.add(url);
        
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
    try {
        return new URL(url);
    } catch (e) {
        console.error(e);
        return null;
    }
}

export function findFavicon(url: URL|string): URL {
    try {
        url = new URL(url);
    } catch (e) {
        return new URL("");
    }
    
    const faviconUrl = new URL(`http://f1.allesedv.com/16/${url.host}`);
    return faviconUrl
}