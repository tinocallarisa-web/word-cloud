/**
 * Motor de colocación de la nube de palabras.
 *
 * Cada palabra se rasteriza en un canvas y se convierte en un sprite de bits empaquetados
 * (32 píxeles por entero), como hace d3-cloud. El tablero es otro mapa de bits del tamaño
 * del visual; comprobar si una palabra cabe en una posición es un AND por palabra de 32
 * bits, así que se pueden probar miles de posiciones por palabra sin que se note.
 *
 * - Las posiciones se recorren en espiral desde el centro de la forma.
 * - La forma (básica, icono, texto o imagen) es una máscara: lo que queda fuera se marca
 *   como ocupado antes de empezar. La misma máscara, pintada suave, es la silueta de fondo.
 * - Relleno: tras las palabras de los datos, se repiten en tamaños pequeños hasta cubrir la
 *   forma. Es lo que hace que un corazón se lea como corazón.
 * - Todo lo aleatorio sale de un generador con semilla: el mismo informe dibuja siempre
 *   la misma nube.
 * - Sin red, sin dependencias: solo canvas.
 */

export interface LayoutWord {
    text: string;
    /** Tamaño de fuente en px, ya escalado por el visual. */
    size: number;
    /** Índice de la palabra en los datos, para volver a ellos (selección, tooltips, color). */
    index: number;
}

export interface PlacedWord extends LayoutWord {
    x: number;
    y: number;
    rotate: number;
    /** true = repetición decorativa del relleno (no entra en el orden de teclado). */
    repeat: boolean;
    box: { x: number; y: number; w: number; h: number };
}

export interface ShapeMask {
    width: number;
    height: number;
    /** 1 = se puede escribir. */
    data: Uint8Array;
    /** La forma pintada en negro con bordes suavizados (para la silueta de fondo). */
    canvas: HTMLCanvasElement | null;
}

export type ShapeSpec =
    | { kind: "basic"; name: string }
    | { kind: "icon"; paths: string[] }
    | { kind: "text"; text: string; family: string }
    | { kind: "image"; img: HTMLImageElement };

export interface FillOptions {
    minSize: number;
    maxSize: number;
    budgetMs: number;
    maxCount: number;
}

export interface LayoutOptions {
    width: number;
    height: number;
    fontFamily: string;
    fontWeight: string;
    padding: number;
    angles: number[];
    jitter: number;
    seed: number;
    mask: ShapeMask | null;
    fill?: FillOptions | null;
    timeBudgetMs?: number;
}

export interface LayoutResult {
    placed: PlacedWord[];
    dropped: LayoutWord[];
}

/** Generador con semilla (mulberry32). */
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

/** Formas geométricas, en coordenadas normalizadas -1..1. */
export function insideBasic(name: string, u: number, v: number): boolean {
    switch (name) {
        case "ellipse": case "circle": return u * u + v * v <= 1;
        case "diamond": return Math.abs(u) + Math.abs(v) <= 1;
        case "triangle": return v >= -0.95 && Math.abs(u) <= (v + 0.95) / 1.9;
        case "hexagon": { const x = Math.abs(u), y = Math.abs(v); return y <= 0.866 && 0.866 * x + 0.5 * y <= 0.866; }
        default: return true;
    }
}

interface Sprite { bits: Uint32Array; words32: number; w: number; h: number; ax: number; ay: number }

export class CloudLayout {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private doc: Document;

    constructor(doc: Document) {
        this.doc = doc;
        this.canvas = doc.createElement("canvas");
        this.ctx = this.canvas.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D;
    }

    // ── Máscaras ──────────────────────────────────────────────────────────────

    /**
     * Máscara de la forma al tamaño del visual. Básicas: geometría. Icono y texto: se
     * dibujan en un canvas a la mayor escala que cabe, centrados. Imagen: lo oscuro y opaco.
     */
    public buildMask(spec: ShapeSpec, W: number, H: number, circle = false, stretch = false): ShapeMask | null {
        W = Math.max(1, Math.floor(W)); H = Math.max(1, Math.floor(H));
        const c = this.doc.createElement("canvas"); c.width = W; c.height = H;
        const ctx = c.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D;
        ctx.fillStyle = "#000";
        const margin = 0.03;
        if (spec.kind === "basic") {
            if (spec.name === "rectangle") return null;
            const rx = circle ? Math.min(W, H) / 2 : W / 2, ry = circle ? Math.min(W, H) / 2 : H / 2;
            const img = ctx.createImageData(W, H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                if (insideBasic(spec.name, (x + 0.5 - W / 2) / (rx * (1 - margin)), (y + 0.5 - H / 2) / (ry * (1 - margin)))) img.data[(y * W + x) * 4 + 3] = 255;
            }
            ctx.putImageData(img, 0, 0);
        } else if (spec.kind === "icon") {
            // Se dibuja grande aparte, se recorta a la silueta real (los iconos traen margen
            // dentro de su caja de 24x24) y se escala para llenar el visual.
            const R = 512, src = this.doc.createElement("canvas"); src.width = R; src.height = R;
            const sctx = src.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D;
            sctx.scale(R / 24, R / 24);
            sctx.fillStyle = "#000";
            for (const d of spec.paths) sctx.fill(new Path2D(d));
            this.drawFitted(ctx, src, W, H, margin, stretch);
        } else if (spec.kind === "text") {
            const lines = spec.text.split(/\||\n/).map(l => l.trim()).filter(Boolean);
            if (!lines.length) return null;
            // La mayor fuente con la que el bloque de líneas cabe en el visual.
            let size = 400;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            const fits = (sz: number) => {
                ctx.font = `900 ${sz}px ${spec.family}`;
                const w = Math.max(...lines.map(l => ctx.measureText(l).width));
                return w <= W * (1 - 2 * margin) && sz * 1.05 * lines.length <= H * (1 - 2 * margin);
            };
            while (size > 8 && !fits(size)) size *= 0.92;
            ctx.font = `900 ${size}px ${spec.family}`;
            const lh = size * 1.05, top = H / 2 - (lines.length - 1) * lh / 2;
            lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh));
        } else if (spec.kind === "image") {
            // La parte oscura y opaca de la imagen es la forma; también se recorta y se escala.
            const iw = spec.img.naturalWidth, ih = spec.img.naturalHeight;
            if (!iw || !ih) return null;
            const k = Math.min(1, 512 / Math.max(iw, ih));
            const sw = Math.max(1, Math.round(iw * k)), sh = Math.max(1, Math.round(ih * k));
            const src = this.doc.createElement("canvas"); src.width = sw; src.height = sh;
            const sctx = src.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D;
            sctx.drawImage(spec.img, 0, 0, sw, sh);
            const px0 = sctx.getImageData(0, 0, sw, sh);
            for (let i = 0; i < sw * sh; i++) {
                const d = px0.data, a = d[i * 4 + 3], lum = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
                d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 0;
                d[i * 4 + 3] = a > 128 && lum < 160 ? 255 : 0;
            }
            sctx.putImageData(px0, 0, 0);
            this.drawFitted(ctx, src, W, H, margin, stretch);
        }
        const px = ctx.getImageData(0, 0, W, H).data;
        const data = new Uint8Array(W * H);
        let n = 0;
        for (let i = 0; i < W * H; i++) if (px[i * 4 + 3] > 127) { data[i] = 1; n++; }
        if (n < W * H * 0.02) return null;          // forma vacía o diminuta: rectángulo
        return { width: W, height: H, data, canvas: c };
    }

    /**
     * Copia la silueta de `src` (lo opaco) en el canvas del visual: recortada a sus límites
     * reales y escalada para llenarlo, conservando la proporción o estirada.
     */
    private drawFitted(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, W: number, H: number, margin: number, stretch: boolean): void {
        const sctx = src.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D;
        const d = sctx.getImageData(0, 0, src.width, src.height).data;
        let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
        for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
            if (d[(y * src.width + x) * 4 + 3] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        if (x1 < x0 || y1 < y0) return;
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        const aw = W * (1 - 2 * margin), ah = H * (1 - 2 * margin);
        let dw = aw, dh = ah;
        if (!stretch) { const s = Math.min(aw / bw, ah / bh); dw = bw * s; dh = bh * s; }
        ctx.drawImage(src, x0, y0, bw, bh, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }

    /** La silueta pintada de un color, como imagen data: para el fondo del SVG. */
    public static silhouette(doc: Document, mask: ShapeMask, color: string): string | null {
        if (!mask.canvas) return null;
        const c = doc.createElement("canvas"); c.width = mask.width; c.height = mask.height;
        const ctx = c.getContext("2d") as CanvasRenderingContext2D;
        ctx.drawImage(mask.canvas, 0, 0);
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, c.width, c.height);
        return c.toDataURL("image/png");
    }

    /**
     * Borde de la forma: un anillo de `width` px POR FUERA de la silueta, para que nunca
     * pise las palabras. Se dilata la máscara (copias desplazadas en círculo) y se le
     * resta la forma original.
     */
    public static outline(doc: Document, mask: ShapeMask, color: string, width: number): string | null {
        if (!mask.canvas || width <= 0) return null;
        const c = doc.createElement("canvas"); c.width = mask.width; c.height = mask.height;
        const ctx = c.getContext("2d") as CanvasRenderingContext2D;
        const steps = Math.max(12, Math.round(width * 8));
        for (let i = 0; i < steps; i++) {
            const a = (i / steps) * Math.PI * 2;
            ctx.drawImage(mask.canvas, Math.cos(a) * width, Math.sin(a) * width);
        }
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.globalCompositeOperation = "destination-out";
        ctx.drawImage(mask.canvas, 0, 0);
        return c.toDataURL("image/png");
    }

    /** Carga una imagen data: (nunca una URL externa: el visual no sale a la red). */
    public static loadImage(doc: Document, src: string): Promise<HTMLImageElement | null> {
        if (!/^data:image\//i.test(src)) return Promise.resolve(null);
        const img = doc.createElement("img");
        return new Promise(ok => { img.onload = () => ok(img); img.onerror = () => ok(null); img.src = src; });
    }

    // ── Sprites ───────────────────────────────────────────────────────────────

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
        const by = (asc - desc) / 2;       // la caja del texto queda centrada en el sprite
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
        return { bits, words32, w, h, ax: w / 2 - by * Math.sin(rad), ay: h / 2 + by * Math.cos(rad) };
    }

    // ── Colocación ────────────────────────────────────────────────────────────

    public run(words: LayoutWord[], o: LayoutOptions): LayoutResult {
        const W = Math.max(1, Math.floor(o.width)), H = Math.max(1, Math.floor(o.height));
        const bw = (W >> 5) + 2;
        const board = new Uint32Array(H * bw);
        const rnd = seededRandom(o.seed);
        const t0 = Date.now();
        const budget = o.timeBudgetMs ?? 1500;

        // Máscara: lo que queda fuera de la forma, ocupado desde el principio.
        const mask = o.mask && o.mask.width === W && o.mask.height === H ? o.mask : null;
        let cx = W / 2, cy = H / 2;
        const free: number[] = [];                  // píxeles dentro de la forma (muestreados), para el relleno
        if (mask) {
            let sx = 0, sy = 0, n = 0;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                if (mask.data[y * W + x]) { sx += x; sy += y; n++; if (((x * 7 + y * 13) & 15) === 0) free.push(y * W + x); }
                else board[y * bw + (x >> 5)] |= 0x80000000 >>> (x & 31);
            }
            if (n > 0) { cx = sx / n; cy = sy / n; }
        } else {
            for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) free.push(y * W + x);
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
        const ratio = Math.sqrt(W / Math.max(1, H));
        /** Espiral de Arquímedes desde (sx, sy), vueltas cada ~4 px, hasta maxR. */
        const spiral = (s: Sprite, sx: number, sy: number, maxR: number, dir: number, phase: number): [number, number] | null => {
            for (let i = 0; ; i++) {
                const th = i * 0.1, r = 0.65 * th;
                if (r > maxR) return null;
                const a = dir * th + phase;
                const x = Math.round(sx + r * Math.cos(a) * ratio - s.ax);
                const y = Math.round(sy + r * Math.sin(a) / ratio - s.ay);
                if (x < 0 || y < 0 || x + s.w >= W || y + s.h >= H) continue;
                if (!collides(s, x, y)) return [x, y];
            }
        };

        const placed: PlacedWord[] = [], dropped: LayoutWord[] = [];
        const maxR = Math.sqrt(W * W + H * H);
        for (const word of words) {
            if (Date.now() - t0 > budget) { dropped.push(word); continue; }
            const rotate = o.angles.length ? o.angles[Math.floor(rnd() * o.angles.length) % o.angles.length] : 0;
            const s = this.sprite(word, rotate, o);
            if (!s) { dropped.push(word); continue; }
            const jx = (rnd() - 0.5) * W * 0.5 * o.jitter, jy = (rnd() - 0.5) * H * 0.5 * o.jitter;
            const pos = spiral(s, cx + jx, cy + jy, maxR, rnd() < 0.5 ? 1 : -1, rnd() * Math.PI * 2 * o.jitter);
            if (!pos) { dropped.push(word); continue; }
            stamp(s, pos[0], pos[1]);
            placed.push({ ...word, x: pos[0] + s.ax, y: pos[1] + s.ay, rotate, repeat: false, box: { x: pos[0], y: pos[1], w: s.w, h: s.h } });
        }

        // Relleno: repetir las palabras colocadas, de mayor a menor, en huecos libres.
        const f = o.fill;
        if (f && placed.length && free.length) {
            const tf = Date.now();
            const pool = placed.slice();
            const isFree = (p: number) => {
                const x = p % W, y = (p / W) | 0;
                return !(board[y * bw + (x >> 5)] & (0x80000000 >>> (x & 31)));
            };
            // Se vacía la lista de candidatos a medida que se ocupan: así cada intento empieza
            // en un hueco de verdad, no en un punto que ya tapa una palabra grande.
            let cand = free.filter(isFree);
            let fails = 0, count = 0, k = 0;
            let size = f.maxSize;
            while (count < f.maxCount && Date.now() - tf < f.budgetMs && size >= f.minSize && cand.length) {
                const src = pool[k++ % pool.length];
                const rotate = o.angles.length ? o.angles[Math.floor(rnd() * o.angles.length) % o.angles.length] : 0;
                const w2: LayoutWord = { text: src.text, index: src.index, size };
                const s = this.sprite(w2, rotate, o);
                const ci = Math.floor(rnd() * cand.length), p = cand[ci];
                const pos = s ? spiral(s, p % W, Math.floor(p / W), Math.max(10, size * 2.5), rnd() < 0.5 ? 1 : -1, rnd() * 6.28) : null;
                if (s && pos) {
                    stamp(s, pos[0], pos[1]);
                    placed.push({ ...w2, x: pos[0] + s.ax, y: pos[1] + s.ay, rotate, repeat: true, box: { x: pos[0], y: pos[1], w: s.w, h: s.h } });
                    count++; fails = 0;
                    if (count % 25 === 0) cand = cand.filter(isFree);
                } else {
                    // Ese punto no admite esta palabra: fuera de la lista si ya está tapado.
                    if (!isFree(p)) { cand[ci] = cand[cand.length - 1]; cand.pop(); }
                    if (++fails > 120) {
                        // Este tamaño ya no cabe: bajar y seguir rellenando.
                        size *= 0.85; fails = 0;
                        cand = cand.filter(isFree);
                    }
                }
            }
        }
        return { placed, dropped };
    }
}
