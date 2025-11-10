import { Color } from "@vicinae/api";

export type FormValues = {
  name?: string;
  url?: string;
  color?: Color;
};

export const colorOptions = [
  { value: Color.Red, title: "Red" },
  { value: Color.Orange, title: "Orange" },
  { value: Color.Yellow, title: "Yellow" },
  { value: Color.Green, title: "Green" },
  { value: Color.Blue, title: "Blue" },
  { value: Color.Purple, title: "Purple" },
  { value: Color.Magenta, title: "Magenta" },
];