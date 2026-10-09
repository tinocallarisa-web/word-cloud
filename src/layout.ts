/**
 * Motor de colocación de la nube de palabras.
 *
 * Cada palabra se rasteriza en un canvas y se convierte en un sprite de bits empaquetados
 * (32 píxeles por entero), como hace d3-cloud. El tablero es otro mapa de bits del tamaño
 * del visual; comprobar si una palabra cabe en una posición es un AND por palabra de 32
 * bits, así que se pueden probar miles de posiciones por palabra sin que se note.
 *
 * - Las posiciones se recorren en espiral desde el centro de la forma.
 * - La forma (círculo, corazón, imagen...) se aplica marcando como ocupado, antes de
 *   empezar, todo lo que queda fuera de ella.
 * - Todo lo aleatorio sale de un generador con semilla: el mismo informe dibuja siempre
 *   la misma nube. Una nube que cambia en cada refresco no se puede comentar en una reunión.
 * - Sin red, sin dependencias: solo canvas.
 */

export interface LayoutWord {
    text: string;
    /** Tamaño de fuente en px, ya escalado por el visual. */
    size: number;
    /** Índice de la fila de origen, para volver a los datos (selección, tooltips). */
    index: number;
}

export interface PlacedWord extends LayoutWord {
    /** Centro del ancla del texto, en px del visual. */
    x: number;
    y: number;
    /** Grados, sentido horario. */
    rotate: number;
    /** Caja que ocupa ya rotada, para el foco del teclado y el hit-test. */
    box: { x: number; y: number; w: number; h: number };
}

export type ShapeName = "rectangle" | "ellipse" | "circle" | "diamond" | "triangle" | "star" | "heart" | "cloud" | "image";

export interface LayoutOptions {
    width: number;
    height: number;
    fontFamily: string;
    fontWeight: string;
    /** Separación mínima entre palabras, px. */
    padding: number;
    /** Ángulos permitidos, en grados. Se elige uno por palabra con el generador. */
    angles: number[];
    /** 0 = espiral perfecta desde el centro; 1 = punto de partida y giro muy dispersos. */
    jitter: number;
    seed: number;
    shape: ShapeName;
    /** Solo con shape = "image": máscara ya calculada (1 = se puede escribir). */
    imageMask?: { width: number; height: number; data: Uint8Array } | null;
    /** Margen de tiempo para colocar, ms. Lo que no quepa en ese tiempo se descarta. */
    timeBudgetMs?: number;
}

export interface LayoutResult {
    placed: PlacedWord[];
    dropped: LayoutWord[];
}

/** Generador con semilla (mulberry32): rápido y suficiente para esto. */
export function seededRandom(seed: number): () => number {
    let a = (seed >>> 0) || 0x9e3779b9;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface Sprite {
    /** Bits por fila: rows * words32. */
    bits: Uint32Array;
    words32: number;
    w: number;
    h: number;
    /** Desplazamiento del ancla del texto dentro del sprite. */
    ax: number;
    ay: number;
}

/** ¿Está (u, v), en coordenadas normalizadas -1..1, dentro de la forma? */
function insideShape(shape: ShapeName, u: number, v: number): boolean {
    switch (shape) {
        case "rectangle": return true;
        case "ellipse":
        case "circle": return u * u + v * v <= 1;
        case "diamond": return Math.abs(u) + Math.abs(v) <= 1;
        case "triangle": return v >= -0.95 && Math.abs(u) <= (v + 0.95) / 1.9;
        case "star": {
            const a = Math.atan2(v, u) + Math.PI / 2;
            const r = Math.sqrt(u * u + v * v);
            const k = (Math.cos(5 * a) + 1) / 2;          // 1 en las puntas, 0 en los valles
            return r <= 0.45 + 0.55 * k;
        }
        case "heart": {
            // Corazón clásico (x² + y² - 1)³ - x² y³ <= 0, con y hacia arriba.
            const x = u * 1.25, y = -v * 1.25 + 0.25;
            const q = x * x + y * y - 1;
            return q * q * q - x * x * y * y * y <= 0;
        }
        case "cloud": {
            const c = (cx: number, cy: number, r: number) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
            return c(-0.45, 0.15, 0.5) || c(0.05, -0.2, 0.62) || c(0.5, 0.1, 0.5) || (Math.abs(u) <= 0.85 && v >= 0.05 && v <= 0.6);
        }
        default: return true;
    }
}

export class CloudLayout {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    constructor(doc: Document) {
        this.canvas = doc.createElement("canvas");
        this.ctx = this.canvas.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D;
    }

    /** Ancho del texto con la fuente dada, para el visual (truncado, accesibilidad). */
    public measure(text: string, size: number, family: string, weight: string): number {
        this.ctx.font = `${weight} ${size}px ${family}`;
        return this.ctx.measureText(text).width;
    }

    private sprite(word: LayoutWord, rotate: number, o: LayoutOptions): Sprite | null {
        const ctx = this.ctx;
        const font = `${o.fontWeight} ${word.size}px ${o.fontFamily}`;
        ctx.font = font;
        const m = ctx.measureText(word.text);
        const asc = m.actualBoundingBoxAscent || word.size * 0.8;
        const desc = m.actualBoundingBoxDescent || word.size * 0.2;
        const tw = m.width, th = asc + desc;
        const rad = rotate * Math.PI / 180;
        const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
        const pad = Math.max(0, o.padding);
        const w = Math.ceil(tw * cos + th * sin + 2 * pad + 4);
        const h = Math.ceil(tw * sin + th * cos + 2 * pad + 4);
        if (w <= 0 || h <= 0 || w > o.width || h > o.height) return null;

        this.canvas.width = w; this.canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.font = font;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#000"; ctx.strokeStyle = "#000";
        ctx.lineWidth = pad * 2;
        ctx.lineJoin = "round";
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(rad);
        // El ancla (centro horizontal, línea base) se desplaza para que el centro de la caja
        // del texto quede en el centro del sprite.
        const by = (asc - desc) / 2;
        ctx.fillText(word.text, 0, by);
        if (pad > 0) ctx.strokeText(word.text, 0, by);
        ctx.restore();

        const img = ctx.getImageData(0, 0, w, h).data;
        const words32 = (w >> 5) + 2;
        const bits = new Uint32Array(h * words32);
        let any = false;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (img[(y * w + x) * 4 + 3] > 24) {
                    bits[y * words32 + (x >> 5)] |= 0x80000000 >>> (x & 31);
                    any = true;
                }
            }
        }
        if (!any) return null;
        // Ancla en el sistema del sprite: centro + desplazamiento de la línea base rotado.
        const ax = w / 2 - by * Math.sin(rad);
        const ay = h / 2 + by * Math.cos(rad);
        return { bits, words32, w, h, ax, ay };
    }

    public run(words: LayoutWord[], o: LayoutOptions): LayoutResult {
        const W = Math.max(1, Math.floor(o.width)), H = Math.max(1, Math.floor(o.height));
        const bw = (W >> 5) + 2;
        const board = new Uint32Array(H * bw);
        const rnd = seededRandom(o.seed);
        const t0 = Date.now();
        const budget = o.timeBudgetMs ?? 1500;

        // Máscara: todo lo que queda fuera de la forma se marca como ocupado.
        const mask = o.shape === "image" ? o.imageMask : null;
        let cx = W / 2, cy = H / 2;
        if (o.shape !== "rectangle") {
            const rx = o.shape === "circle" ? Math.min(W, H) / 2 : W / 2;
            const ry = o.shape === "circle" ? Math.min(W, H) / 2 : H / 2;
            let sx = 0, sy = 0, n = 0;
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    let inside: boolean;
                    if (mask) {
                        const mx = Math.floor(x * mask.width / W), my = Math.floor(y * mask.height / H);
                        inside = mask.data[my * mask.width + mx] === 1;
                    } else {
                        inside = insideShape(o.shape, (x - W / 2) / rx, (y - H / 2) / ry);
                    }
                    if (!inside) board[y * bw + (x >> 5)] |= 0x80000000 >>> (x & 31);
                    else { sx += x; sy += y; n++; }
                }
            }
            if (n > 0) { cx = sx / n; cy = sy / n; }     // centro de masa de la forma
        }

        const collides = (s: Sprite, px: number, py: number): boolean => {
            const shift = px & 31, base = px >> 5;
            for (let r = 0; r < s.h; r++) {
                const row = (py + r) * bw + base, srow = r * s.words32;
                let carry = 0;
                for (let j = 0; j < s.words32; j++) {
                    const v = s.bits[srow + j];
                    const word = shift ? ((v >>> shift) | carry) : v;
                    carry = shift ? (v << (32 - shift)) : 0;
                    if (word && (board[row + j] & word)) return true;
                }
                if (carry && (board[row + s.words32] & carry)) return true;
            }
            return false;
        };
        const stamp = (s: Sprite, px: number, py: number) => {
            const shift = px & 31, base = px >> 5;
            for (let r = 0; r < s.h; r++) {
                const row = (py + r) * bw + base, srow = r * s.words32;
                let carry = 0;
                for (let j = 0; j < s.words32; j++) {
                    const v = s.bits[srow + j];
                    board[row + j] |= shift ? ((v >>> shift) | carry) : v;
                    carry = shift ? (v << (32 - shift)) : 0;
                }
                if (carry) board[row + s.words32] |= carry;
            }
        };

        const placed: PlacedWord[] = [], dropped: LayoutWord[] = [];
        const maxR = Math.sqrt(W * W + H * H);
        const ratio = W / Math.max(1, H);
        for (const word of words) {
            if (Date.now() - t0 > budget) { dropped.push(word); continue; }
            const rotate = o.angles.length ? o.angles[Math.floor(rnd() * o.angles.length) % o.angles.length] : 0;
            const s = this.sprite(word, rotate, o);
            if (!s) { dropped.push(word); continue; }
            // Punto de partida: el centro, desplazado más o menos según el jitter.
            const jx = (rnd() - 0.5) * W * 0.5 * o.jitter, jy = (rnd() - 0.5) * H * 0.5 * o.jitter;
            const startX = cx + jx, startY = cy + jy;
            const dir = rnd() < 0.5 ? 1 : -1;
            const phase = rnd() * Math.PI * 2 * o.jitter;
            // Espiral de Arquímedes: vueltas separadas ~4 px (2π · 0.65), así no se salta huecos.
            let ok = false, i = 0;
            while (true) {
                const th = i * 0.1;
                const r = 0.65 * th;
                if (r > maxR) break;
                const a = dir * th + phase;
                const x = Math.round(startX + r * Math.cos(a) * Math.sqrt(ratio) - s.ax);
                const y = Math.round(startY + r * Math.sin(a) / Math.sqrt(ratio) - s.ay);
                i += 1;
                if (x < 0 || y < 0 || x + s.w >= W || y + s.h >= H) continue;
                if (!collides(s, x, y)) {
                    stamp(s, x, y);
                    placed.push({ ...word, x: x + s.ax, y: y + s.ay, rotate, box: { x, y, w: s.w, h: s.h } });
                    ok = true;
                    break;
                }
            }
            if (!ok) dropped.push(word);
        }
        return { placed, dropped };
    }

    /** Máscara de una imagen (Base64 o URL data:): escribible = píxel oscuro y opaco. */
    public static async maskFromImage(doc: Document, src: string, res = 200): Promise<{ width: number; height: number; data: Uint8Array } | null> {
        if (!/^data:image\//i.test(src)) return null;              // nunca una URL externa
        const img = doc.createElement("img");
        const loaded = await new Promise<boolean>(ok => {
            img.onload = () => ok(true); img.onerror = () => ok(false); img.src = src;
        });
        if (!loaded || !img.naturalWidth) return null;
        const k = res / Math.max(img.naturalWidth, img.naturalHeight);
        const w = Math.max(8, Math.round(img.naturalWidth * k)), h = Math.max(8, Math.round(img.naturalHeight * k));
        const c = doc.createElement("canvas"); c.width = w; c.height = h;
        const ctx = c.getContext("2d") as CanvasRenderingContext2D;
        ctx.drawImage(img, 0, 0, w, h);
        const px = ctx.getImageData(0, 0, w, h).data;
        const data = new Uint8Array(w * h);
        let n = 0;
        for (let i = 0; i < w * h; i++) {
            const a = px[i * 4 + 3], lum = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
            if (a > 128 && lum < 160) { data[i] = 1; n++; }
        }
        return n > w * h * 0.02 ? { width: w, height: h, data } : null;
    }
}
