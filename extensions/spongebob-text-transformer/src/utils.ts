export function toSpongebobCase(text: string): string {
	return text
		.split("")
		.map((char) => (Math.random() > 0.5 ? char.toLowerCase() : char.toUpperCase()))
		.join("");
}
