import { execAsync, handleError, showSuccess } from './utils';
import { Clipboard } from '@vicinae/api';

export default async function PickColor() {
  try {
    const { stdout } = await execAsync('niri msg --json pick-color');
    const colorData = JSON.parse(stdout.trim());

    if (colorData.rgb && Array.isArray(colorData.rgb)) {
      const [r, g, b] = colorData.rgb.map((val: number) => Math.round(val * 255));
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

      // Copy hex to clipboard
      await Clipboard.copy(hex);

      showSuccess('Color picked', `${hex} (copied to clipboard)`);
    } else {
      await Clipboard.copy(stdout);
      showSuccess('Color picked', stdout);
    }
  } catch (error) {
    handleError('Failed to pick color', error);
  }
}
