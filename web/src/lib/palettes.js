// Color palettes the visitor can switch between. The colors themselves live in
// src/styles/global.css (one block per palette); this list drives the picker.
// `swatches` are the background, the accent and the brand color, as shown in the
// picker: a test keeps them equal to the CSS.

export const DEFAULT_PALETTE = 'clasica';

export const PALETTES = [
  { id: 'clasica', name: 'Clásica', swatches: ['#0b0b0c', '#d4af37', '#9e1b1b'] },
  { id: 'jade', name: 'Jade', swatches: ['#08110e', '#5fc59a', '#1f6f54'] },
  { id: 'noche', name: 'Noche azul', swatches: ['#090d16', '#7fb2ff', '#3555b8'] },
  { id: 'pergamino', name: 'Pergamino', swatches: ['#f6f0e4', '#8a5d00', '#9e1b1b'] },
];

export const isPalette = (id) => PALETTES.some((palette) => palette.id === id);

// WCAG contrast ratio between two #rrggbb colors, from 1 to 21.
export function contrastRatio(a, b) {
  const luminance = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
