type ISO8601Date = string;

type Engine = string;
type Category = string;

type BaseSearxngRequest = {
    type: "response",
    query: string,
    number_of_results: number,
    answers: unknown[],
    corrections: unknown[],
    suggestions: unknown[],
    unresponsive_engines: unknown[]
}

type RawSearxngRequest = BaseSearxngRequest & {
    results: RawSearxngRequestResult[],
    infoboxes: RawSearxngRequestInfobox[]
}

type SearxngRequest = RawSearxngRequest & {
    results: SearxngRequestResult[],
    infoboxes: SearxngRequestInfobox[],
};

type BaseSearxngRequestResult = {
    template: string,
    engine: Engine,
    title: string,
    category: Category|'',
    score: number,
    positions: string,
    engines: Engine[],
    priority: string,
    content: string,
}

type RawSearxngRequestResult = BaseSearxngRequestResult & {
    thumbnail: string,
    url: string,
    publishedDate: ISO8601Date|null,
    img_src: string,
}

type SearxngRequestResult = BaseSearxngRequestResult & {
    type: "result",
    thumbnail: URL|null,
    url: URL,
    publishedDate: Date|null,
    img_src: URL|null,
}

type BaseSearxngRequestInfobox = BaseSearxngRequestResult & {
    infobox: string,
    urls: {
        title: string,
        url: string
    }[],
    attributes: []
}

type RawSearxngRequestInfobox = BaseSearxngRequestInfobox & RawSearxngRequestResult & {
    id: string
}

type SearxngRequestInfobox = BaseSearxngRequestInfobox & SearxngRequestResult & {
    type: "infobox",
    id: URL,
}

type SearxngRequestError = {
    type: "error"
    status_code?: number, 
    error_message: string
}