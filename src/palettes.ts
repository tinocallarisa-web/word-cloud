/**
 * Paletas de color. "cb" = segura para daltonismo (deuteranopía y protanopía), según su
 * fuente: Okabe & Ito (2008), Paul Tol (2021), Viridis/Cividis (matplotlib).
 *
 * - cat: categóricas, una por palabra (por un hash estable de la palabra: la misma palabra
 *   conserva su color al filtrar).
 * - seq: secuenciales, de poco a mucho.
 * - div: divergentes, con un centro neutro (sentimiento, desviación sobre cero).
 */
export interface Palette { id: string; name: string; type: "cat" | "seq" | "div"; cb: boolean; colors: string[] }

export const PALETTES: Palette[] = [
    // Categóricas
    { id: "tcviz", name: "TCViz", type: "cat", cb: false, colors: ["#2B6CB0", "#3E9C5B", "#1F4E80", "#D9A441", "#4A9BC9", "#6BAF7E", "#8E5FC4", "#C96442"] },
    { id: "okabe", name: "Okabe-Ito", type: "cat", cb: true, colors: ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#000000"] },
    { id: "tolBright", name: "Tol Bright", type: "cat", cb: true, colors: ["#4477AA", "#EE6677", "#228833", "#CCBB44", "#66CCEE", "#AA3377", "#BBBBBB"] },
    { id: "tolMuted", name: "Tol Muted", type: "cat", cb: true, colors: ["#332288", "#88CCEE", "#44AA99", "#117733", "#999933", "#DDCC77", "#CC6677", "#882255", "#AA4499"] },
    { id: "tolVibrant", name: "Tol Vibrant", type: "cat", cb: true, colors: ["#EE7733", "#0077BB", "#33BBEE", "#EE3377", "#CC3311", "#009988", "#BBBBBB"] },
    { id: "tableau", name: "Tableau 10", type: "cat", cb: false, colors: ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC"] },
    { id: "vivid", name: "Vivid", type: "cat", cb: false, colors: ["#E58606", "#5D69B1", "#52BCA3", "#99C945", "#CC61B0", "#24796C", "#DAA51B", "#2F8AC4", "#764E9F", "#ED645A"] },
    { id: "pastel", name: "Pastel", type: "cat", cb: false, colors: ["#66C5CC", "#F6CF71", "#F89C74", "#DCB0F2", "#87C55F", "#9EB9F3", "#FE88B1", "#C9DB74", "#8BE0A4", "#B497E7"] },
    { id: "earth", name: "Earth", type: "cat", cb: false, colors: ["#7F4F24", "#936639", "#A68A64", "#B6AD90", "#656D4A", "#414833", "#333D29", "#C2C5AA"] },
    { id: "ocean", name: "Ocean", type: "cat", cb: false, colors: ["#03045E", "#023E8A", "#0077B6", "#0096C7", "#00B4D8", "#48CAE4", "#90E0EF"] },
    { id: "sunset", name: "Sunset", type: "cat", cb: false, colors: ["#F72585", "#B5179E", "#7209B7", "#560BAD", "#3A0CA3", "#4361EE", "#4CC9F0"] },
    { id: "forest", name: "Forest", type: "cat", cb: false, colors: ["#081C15", "#1B4332", "#2D6A4F", "#40916C", "#52B788", "#74C69D", "#95D5B2"] },
    { id: "candy", name: "Candy", type: "cat", cb: false, colors: ["#FF595E", "#FF924C", "#FFCA3A", "#8AC926", "#1982C4", "#6A4C93"] },
    { id: "corporate", name: "Corporate", type: "cat", cb: false, colors: ["#1F3A5F", "#3B6A9A", "#5C8DB8", "#8FB4D6", "#4F5D75", "#2D3142", "#BFC0C0"] },
    { id: "neon", name: "Neon", type: "cat", cb: false, colors: ["#FF00A0", "#00E5FF", "#C6FF00", "#FFEA00", "#7C4DFF", "#FF3D00"] },
    { id: "retro", name: "Retro", type: "cat", cb: false, colors: ["#D1495B", "#EDAE49", "#00798C", "#30638E", "#003D5B", "#8F2D56"] },
    // Secuenciales
    { id: "blues", name: "Blues", type: "seq", cb: true, colors: ["#C6DBEF", "#6BAED6", "#2171B5", "#08306B"] },
    { id: "greens", name: "Greens", type: "seq", cb: true, colors: ["#C7E9C0", "#74C476", "#238B45", "#00441B"] },
    { id: "tealBlue", name: "Teal to blue", type: "seq", cb: true, colors: ["#A8DDB5", "#4EB3D3", "#2B8CBE", "#084081"] },
    { id: "viridis", name: "Viridis", type: "seq", cb: true, colors: ["#440154", "#3B528B", "#21918C", "#5DC863", "#FDE725"] },
    { id: "cividis", name: "Cividis", type: "seq", cb: true, colors: ["#00224E", "#434E6C", "#7D7C78", "#BCAF6F", "#FEE838"] },
    { id: "magma", name: "Magma", type: "seq", cb: true, colors: ["#000004", "#51127C", "#B73779", "#FC8961", "#FCFDBF"] },
    { id: "plasma", name: "Plasma", type: "seq", cb: true, colors: ["#0D0887", "#7E03A8", "#CC4778", "#F89540", "#F0F921"] },
    { id: "ink", name: "Ink (greys)", type: "seq", cb: true, colors: ["#BDBDBD", "#737373", "#252525"] },
    { id: "warm", name: "Warm", type: "seq", cb: false, colors: ["#FDD49E", "#FC8D59", "#D7301F", "#7F0000"] },
    // Divergentes
    { id: "sentiment", name: "Sentiment (red - grey - green)", type: "div", cb: false, colors: ["#C0392B", "#E8A39B", "#BDBDBD", "#9BD3AE", "#1E8449"] },
    { id: "blueOrange", name: "Blue - orange", type: "div", cb: true, colors: ["#2166AC", "#92C5DE", "#E0E0E0", "#F4A582", "#B2182B"] },
    { id: "tolSunset", name: "Tol Sunset", type: "div", cb: true, colors: ["#364B9A", "#6EA6CD", "#EAECCC", "#FDB366", "#A50026"] },
    { id: "purpleGreen", name: "Purple - green", type: "div", cb: true, colors: ["#762A83", "#C2A5CF", "#F7F7F7", "#A6DBA0", "#1B7837"] },
    { id: "brownTeal", name: "Brown - teal", type: "div", cb: true, colors: ["#8C510A", "#DFC27D", "#F5F5F5", "#80CDC1", "#01665E"] },
    { id: "pinkGreen", name: "Pink - green", type: "div", cb: true, colors: ["#C51B7D", "#F1B6DA", "#F7F7F7", "#B8E186", "#4D9221"] },
    // Del usuario: degradado entre Low color y High color
    { id: "custom", name: "Custom (Low and High colors)", type: "seq", cb: false, colors: [] },
];

export function paletteById(id: string): Palette {
    return PALETTES.find(p => p.id === id) || PALETTES[0];
}

/** Color en t (0..1) a lo largo de las paradas de la paleta. */
export function ramp(colors: string[], t: number): string {
    if (!colors.length) return "#888888";
    if (colors.length === 1) return colors[0];
    const x = Math.max(0, Math.min(1, t)) * (colors.length - 1);
    const i = Math.min(colors.length - 2, Math.floor(x));
    return mix(colors[i], colors[i + 1], x - i);
}

export function mix(a: string, b: string, t: number): string {
    const p = (c: string) => {
        const h = c.replace("#", "");
        const n = parseInt(h.length === 3 ? h.split("").map(x => x + x).join("") : h, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
    const f = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
    return "#" + f(r1, r2) + f(g1, g2) + f(b1, b2);
}

/** Hash estable de una palabra -> índice de color: la palabra no cambia de color al filtrar. */
export function hashIndex(key: string, n: number): number {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % Math.max(1, n));
}
