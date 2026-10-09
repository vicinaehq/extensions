export type Layout = readonly [
	x1Numerator: number,
	x1Denominator: number,
	x2Numerator: number,
	x2Denominator: number,
	y1Numerator: number,
	y1Denominator: number,
	y2Numerator: number,
	y2Denominator: number,
];

export const layouts = {
	"first-three-fourths": [0, 1, 3, 4, 0, 1, 1, 1],
	"first-third": [0, 1, 1, 3, 0, 1, 1, 1],
	"first-two-thirds": [0, 1, 2, 3, 0, 1, 1, 1],
	"first-fourth": [0, 1, 1, 4, 0, 1, 1, 1],
	"top-first-fourth": [0, 1, 1, 1, 0, 1, 1, 4],
	"left-half": [0, 1, 1, 2, 0, 1, 1, 1],
	"last-third": [2, 3, 1, 1, 0, 1, 1, 1],
	"last-two-thirds": [1, 3, 1, 1, 0, 1, 1, 1],
	"last-fourth": [3, 4, 1, 1, 0, 1, 1, 1],
	"last-three-fourths": [1, 4, 1, 1, 0, 1, 1, 1],
	"second-fourth": [1, 4, 1, 2, 0, 1, 1, 1],
	"top-second-fourth": [0, 1, 1, 1, 1, 4, 1, 2],
	"top-center-two-thirds": [1, 6, 5, 6, 0, 1, 2, 3],
	"top-third-fourth": [0, 1, 1, 1, 1, 2, 3, 4],
	"top-third": [0, 1, 1, 1, 0, 1, 1, 3],
	"top-two-thirds": [0, 1, 1, 1, 0, 1, 2, 3],
	"center-two-thirds": [1, 6, 5, 6, 0, 1, 1, 1],
	"bottom-third": [0, 1, 1, 1, 2, 3, 1, 1],
	"bottom-two-thirds": [0, 1, 1, 1, 1, 3, 1, 1],
	"third-fourth": [1, 2, 3, 4, 0, 1, 1, 1],
	"bottom-three-fourths": [0, 1, 1, 1, 1, 4, 1, 1],
	"center-three-fourths": [1, 8, 7, 8, 0, 1, 1, 1],
	"top-right-sixth": [2, 3, 1, 1, 0, 1, 1, 2],
	"bottom-right-sixth": [2, 3, 1, 1, 1, 2, 1, 1],
	"top-left-sixth": [0, 1, 1, 3, 0, 1, 1, 2],
	"bottom-left-sixth": [0, 1, 1, 3, 1, 2, 1, 1],
	"top-center-sixth": [1, 3, 2, 3, 0, 1, 1, 2],
	"bottom-center-sixth": [1, 3, 2, 3, 1, 2, 1, 1],

	// Corner quarters: half the width and half the height.
	"top-left-quarter": [0, 1, 1, 2, 0, 1, 1, 2],
	"top-right-quarter": [1, 2, 1, 1, 0, 1, 1, 2],
	"bottom-left-quarter": [0, 1, 1, 2, 1, 2, 1, 1],
	"bottom-right-quarter": [1, 2, 1, 1, 1, 2, 1, 1],

	// Complete the full-height horizontal bands.
	"right-half": [1, 2, 1, 1, 0, 1, 1, 1],
	"center-half": [1, 4, 3, 4, 0, 1, 1, 1],
	"center-third": [1, 3, 2, 3, 0, 1, 1, 1],
	"center-fourth": [3, 8, 5, 8, 0, 1, 1, 1],

	// Full-width bands: middle is the vertical center.
	"top-half": [0, 1, 1, 1, 0, 1, 1, 2],
	"middle-half": [0, 1, 1, 1, 1, 4, 3, 4],
	"bottom-half": [0, 1, 1, 1, 1, 2, 1, 1],
	"middle-third": [0, 1, 1, 1, 1, 3, 2, 3],
	"middle-two-thirds": [0, 1, 1, 1, 1, 6, 5, 6],
	"middle-fourth": [0, 1, 1, 1, 3, 8, 5, 8],
	"bottom-first-fourth": [0, 1, 1, 1, 3, 4, 1, 1],
	"top-three-fourths": [0, 1, 1, 1, 0, 1, 3, 4],
	"middle-three-fourths": [0, 1, 1, 1, 1, 8, 7, 8],

	// Two thirds of both dimensions, at every horizontal/vertical position.
	"top-left-two-thirds": [0, 1, 2, 3, 0, 1, 2, 3],
	"top-right-two-thirds": [1, 3, 1, 1, 0, 1, 2, 3],
	"middle-left-two-thirds": [0, 1, 2, 3, 1, 6, 5, 6],
	"middle-center-two-thirds": [1, 6, 5, 6, 1, 6, 5, 6],
	"middle-right-two-thirds": [1, 3, 1, 1, 1, 6, 5, 6],
	"bottom-left-two-thirds": [0, 1, 2, 3, 1, 3, 1, 1],
	"bottom-center-two-thirds": [1, 6, 5, 6, 1, 3, 1, 1],
	"bottom-right-two-thirds": [1, 3, 1, 1, 1, 3, 1, 1],

	// Center the existing sixth-sized windows vertically as well.
	"middle-left-sixth": [0, 1, 1, 3, 1, 4, 3, 4],
	"middle-center-sixth": [1, 3, 2, 3, 1, 4, 3, 4],
	"middle-right-sixth": [2, 3, 1, 1, 1, 4, 3, 4],
} as const satisfies Record<string, Layout>;

export type LayoutId = keyof typeof layouts;
