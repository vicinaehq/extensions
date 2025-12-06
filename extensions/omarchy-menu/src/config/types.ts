import { ReactNode } from "react";

export type MenuItem = {
  id: string;
  name: string;
  icon: string;
  command?: string;
  items?: MenuItem[];
  preview?: ReactNode;
};
