# Scryfall for Vicinae

Search Magic: The Gathering cards from [Vicinae](https://docs.vicinae.com) using the [Scryfall API](https://scryfall.com/docs/api).

## Usage

Run **Search Scryfall** (`scry`) and type a card name or any [Scryfall search syntax](https://scryfall.com/docs/syntax):

- `lightning bolt`
- `t:dragon c:r cmc<=4`
- `o:"draw a card" f:modern`

The first few matches are shown with the card image and details. The last row opens the full results on scryfall.com in your default browser.

| Action | Result |
| --- | --- |
| Enter on a card | Open it on Scryfall |
| Copy Card Name / Oracle Text | Copy to clipboard |

The number of cards listed can be changed in the extension preferences.

## Network use

The extension only talks to the public [Scryfall API](https://scryfall.com/docs/api) (`api.scryfall.com`) and loads card images from Scryfall. Searches are debounced to respect Scryfall's rate limits. No analytics, accounts or API keys are involved.

## Development

```bash
npm install
npm run dev    # live reload
npm run build  # install into Vicinae
```

## Disclaimer

This extension is unofficial. It is not provided by, endorsed by, or affiliated with Scryfall. Card data and images are provided by the [Scryfall API](https://scryfall.com/docs/api); Scryfall is a separate project and is not responsible for this extension.

### Wizards of the Coast Fan Content Policy

Scryfall for Vicinae is unofficial Fan Content permitted under the [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy). Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC. Magic: The Gathering is a trademark of Wizards of the Coast.

## Credits

Mana symbol glyphs are from the [Mana font](https://mana.andrewgioia.com) by Andrew Gioia, licensed under the [SIL Open Font License 1.1](https://openfontlicense.org).
