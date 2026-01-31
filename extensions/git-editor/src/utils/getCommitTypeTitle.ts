import { List } from "@vicinae/api";
import { CommitType } from "../hooks/useRebase";

export const getCommitTypeTitle = (type: CommitType): List.Item.Accessory => {
  switch (type) {
    case "pick":
      return {
        tag: {
          color: "blue",
          value: "pick",
        },
      };
    case "edit":
      return {
        tag: {
          color: "yellow",
          value: "edit",
        },
      };
    case "fixup":
      return {
        tag: {
          color: "orange",
          value: "fixup",
        },
      };
    case "reword":
      return {
        tag: {
          color: "purple",
          value: "reword",
        },
      };
    case "squash":
      return {
        tag: {
          color: "magenta",
          value: "squash",
        },
      };
    case "drop":
      return {
        tag: {
          color: "red",
          value: "drop",
        },
      };
  }
};
