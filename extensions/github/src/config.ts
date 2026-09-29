export const issueDropdownItems = [
  { title: "My Issues", value: "my" },
  { title: "Assigned to Me", value: "assigned" },
  { title: "Mentioning Me", value: "mentioning" },
] as const;

export const prDropdownItems = [
  { title: "My Pull Requests", value: "my" },
  { title: "Assigned to Me", value: "assigned" },
  { title: "Mentioning Me", value: "mentioning" },
  { title: "My Merged Pull Requests", value: "my-merged" },
  { title: "My Closed Pull Requests", value: "my-closed" },
] as const;
