// Issue filter functions
export function getIssueFilterQuery(filterType: "my-issues" | "assigned" | "mentioning" | "all") {
  switch (filterType) {
    case "my-issues":
      return "author:@me is:issue state:open";
    case "assigned":
      return "assignee:@me is:issue state:open";
    case "mentioning":
      return "mentions:@me is:issue state:open";
    case "all":
      return "";
    default:
      return "author:@me is:issue state:open";
  }
}

export const issueDropdownItems = [
  { title: "My Issues", value: "my-issues" },
  { title: "Assigned to Me", value: "assigned" },
  { title: "Mentioning Me", value: "mentioning" },
  { title: "All Issues", value: "all" },
] as const;

// Repository filter functions
export function getRepositoryFilterQuery(filterType: "all" | "my", searchQuery: string) {
  const baseQuery = searchQuery.trim();

  switch (filterType) {
    case "my":
      // For "my" repositories, fetch all repositories the user has access to
      // (owned, collaborator, organization member) and filter locally by search text
      return "user:@me";
    case "all":
    default:
      // For "all" repositories, only search when there's text
      return baseQuery || "";
  }
}

export const repositoryDropdownItems = [
  { title: "All Repositories", value: "all" },
  { title: "My Repositories", value: "my" },
] as const;