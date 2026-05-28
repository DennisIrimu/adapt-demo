/**
 * ADAPT Logo Mark — inline SVG
 * Pixel-art diamond inspired by Africa's map silhouette.
 * Brand colours: Red #B82828 · Green #289145 · Gold #C2A363 · Yellow #F3A31E · Dark #201C1E
 */
export default function AdaptLogoMark({ size = 28 }) {
  // Each square cell is 8×8 with 2px gap → stride = 10
  // ViewBox: 52×58 (5 cells wide = 48px + 4px padding sides; 5 rows + tip)
  const VW = 52;

  // cell(x, y, color): axis-aligned square
  const sq = (x, y, color) => (
    <rect key={`${x},${y}`} x={x} y={y} width={8} height={8} fill={color} rx={0.5} />
  );

  // Widths & x-starts (centred in VW=52, stride=10, cell=8)
  // 5 cells: width=48, start=(52-48)/2=2
  // 4 cells: width=38, start=(52-38)/2=7
  // 2 cells: width=18, start=(52-18)/2=17

  const R = '#B82828'; // Rich Red
  const G = '#289145'; // Grass Green
  const Au= '#C2A363'; // Gold
  const Y = '#F3A31E'; // Sunny Yellow
  const K = '#201C1E'; // Soft Brown / near-black

  // Row definitions: [y, [ [x, color], ... ]]
  const rows = [
    // Row 0 — 2 gold squares
    [0,  [[17,Au],[27,Au]]],
    // Row 1 — 4 squares: red / red / green / green
    [10, [[7,R],[17,R],[27,G],[37,G]]],
    // Row 2 — 5 squares (widest): red / red / green / green / green
    [20, [[2,R],[12,R],[22,G],[32,G],[42,G]]],
    // Row 3 — 4 squares: green / green / yellow / yellow
    [30, [[7,G],[17,G],[27,Y],[37,Y]]],
    // Row 4 — 2 green squares
    [40, [[17,G],[27,G]]],
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VW} 58`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {rows.map(([y, cells]) =>
        cells.map(([x, color]) => sq(x, y, color))
      )}
      {/* Bottom tip: single small rotated square (black diamond) */}
      <rect
        x={22} y={50}
        width={8} height={8}
        fill={K}
        rx={0.5}
        transform="rotate(45 26 54)"
      />
    </svg>
  );
}
