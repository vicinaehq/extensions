import { useState, useEffect } from "react";
import { execSync } from "child_process";

export const getIsHyprlandInstalled = () => {
  const test = execSync("which hyprctl").toString().trim();
  return test !== "";
};
