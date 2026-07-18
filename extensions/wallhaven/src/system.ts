export type Resolution = {
	width: number;
	height: number;
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export const aspectRatio = ({
	width,
	height,
}: Resolution): [number, number] => {
	const n = gcd(width, height);
	return [width / n, height / n];
};

export const parseResolution = (value: string): Resolution => {
	const [width, height] = value.split("x").map((s) => parseInt(s, 10));
	return { width, height };
};

export const formatResolution = ({ width, height }: Resolution): string =>
	`${width}x${height}`;
