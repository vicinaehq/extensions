// Issue filter functions
export function getIssueFilterQuery(
  filterType: string,
  issueType: "pr" | "issue",
  query = "",
) {
  switch (filterType) {
    case "my":
      return `author:@me is:${issueType} state:open ${query}`;
    case "assigned":
      return `assignee:@me is:${issueType} state:open ${query}`;
    case "mentioning":
      return `mentions:@me is:${issueType} state:open ${query}`;
    default:
      return `repo:${filterType} is:${issueType} state:open ${query}`;
  }
}
