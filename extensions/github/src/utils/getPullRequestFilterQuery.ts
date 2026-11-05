import { FilterType } from "../types";

export function getPullRequestFilterQuery(filterType: FilterType, query = "") {
  switch (filterType) {
    case "my":
      return `author:@me is:pr state:open ${query}`;
    case "assigned":
      return `review-requested:@me is:pr state:open ${query}`;
    case "mentioning":
      return `mentions:@me is:pr state:open ${query}`;
    case "my-merged":
      return `author:@me is:pr is:merged ${query}`;
    case "my-closed":
      return `author:@me is:pr is:closed is:unmerged ${query}`;
    default:
      return `repo:${filterType} is:pr state:open ${query}`;
  }
}
