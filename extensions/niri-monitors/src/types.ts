export type OutputMode = {
  width: number;
  height: number;
  refresh_rate: number;
  is_preferred: boolean;
};

export interface LogicalOutput {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  transform: string;
}

export type Output = {
  name: string;
  make: string;
  model: string;
  serial: string | null;
  physical_size: [number, number];
  modes: OutputMode[];
  current_mode: number;
  vrr_supported: boolean;
  vrr_enabled: boolean;
  logical: LogicalOutput | null;
};

export const COMMON_SCALES = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5];

export const TRANSFORMS = [
  { label: "Normal", value: "normal" },
  { label: "90° Clockwise", value: "90" },
  { label: "180° Inverted", value: "180" },
  { label: "270° Counter-Clockwise", value: "270" },
  { label: "Flipped Horizontal", value: "flipped" },
  { label: "Flipped 90°", value: "flipped-90" },
  { label: "Flipped 180°", value: "flipped-180" },
  { label: "Flipped 270°", value: "flipped-270" },
];

export interface OutputConfigUpdate {
  enabled: boolean;
  mode: string;
  scale: number;
  transform: string;
}

export interface OutputBlock {
  name: string;
  blockStart: number;
  blockEnd: number;
  bodyStart: number;
  bodyEnd: number;
  fullBlock: string;
}
