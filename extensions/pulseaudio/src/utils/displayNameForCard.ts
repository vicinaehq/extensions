import { PactlCardRaw } from "../pactl";

export const displayNameForCard = (card: PactlCardRaw): string => {
  return (
    card.properties?.["device.nick"] ||
    card.properties?.["api.alsa.card.name"] ||
    card.properties?.["alsa.card_name"] ||
    card.properties?.["alsa.id"] ||
    card.properties?.["device.description"] ||
    card.properties?.["device.product.name"] ||
    card.name
  ).toString();
};
