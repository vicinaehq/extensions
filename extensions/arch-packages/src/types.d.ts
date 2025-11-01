type APkgSearchResponse = {
	version: 2;
	limit: number;
	valid: boolean;
	results: APkgSearchResult[];
	num_pages: number;
	page: number;
};

type APkgSearchResult = {
	pkgname: string;
	pkgbase: string;
	repo: string;
	arch: string;
	pkgver: string;
	pkgrel: string;
	epoch: number;
	pkgdesc: string;
	url: string;
	filename: string;
	compressed_size: number;
	installed_size: number;
	build_date: string;
	last_update: string;
	flag_date: string | null;
	maintainers: string[];
	packager: string;
	groups: string[];
	licenses: string[];
	conflicts: string[];
	provides: string[];
	replaces: string[];
	depends: string[];
	optdepends: string[];
	makedepends: string[];
	checkdepends: string[];
};

type AurSearchResponse = {
	resultCount: number;
	results: AurSearchResult[];
};

type AurSearchResult = {
	Description: string;
	FirstSubmitted: number;
	ID: number;
	LastModified: number;
	Maintainer: string;
	Name: string;
	NumVotes: number;
	OutOfDate: number | null;
	PackageBase: string;
	PackageBaseID: number;
	Popularity: number;
	URL: string;
	URLPath: string;
	Version: string;
};

type SearchResult =
	| ({ type: "apkg" } & APkgSearchResult)
	| ({ type: "aur" } & AurSearchResult);

type PackageType = "all" | "apkg" | "aur";
