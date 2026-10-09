"use strict";

import powerbi from "powerbi-visuals-api";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import {
    HtmlSubSelectableClass, HtmlSubSelectionHelper, SubSelectableDisplayNameAttribute,
    SubSelectableObjectNameAttribute, SubSelectableTypeAttribute,
} from "powerbi-visuals-utils-onobjectutils";
import { CloudLayout, LayoutWord, PlacedWord, ShapeMask, ShapeSpec } from "./layout";
import { tokenize, detectLanguages } from "./text";
import { ICONS } from "./icons";
import { PALETTES, paletteById, ramp, hashIndex } from "./palettes";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import DataView = powerbi.DataView;

const SVG = "http://www.w3.org/2000/svg";

// ─── Ajustes ──────────────────────────────────────────────────────────────────

interface Settings {
    template: string;
    maxWords: number; minFont: number; maxFont: number; scale: string;
    fontFamily: string; bold: boolean; italic: boolean; underline: boolean; padding: number; lowerCase: boolean; fit: boolean;
    autoLang: boolean; langEn: boolean; langEs: boolean; langPt: boolean; langFr: boolean; langDe: boolean; langIt: boolean;
    minLength: number; exclude: string; bigrams: boolean;
    orientation: string; verticalShare: number; fromAngle: number; toAngle: number; steps: number;
    shape: string; icon: string; shapeText: string;
    silhouette: boolean; silhouetteColor: string; silhouetteOpacity: number;
    outline: boolean; outlineColor: string; outlineWidth: number;
    fillShape: boolean; fillMinFont: number; stretch: boolean;
    jitter: number; seed: number; animate: boolean;
    colorMode: string; palette: string; wordColor: string; lowColor: string; highColor: string; background: string;
}

const DEFAULTS: Settings = {
    template: "clean",
    maxWords: 150, minFont: 10, maxFont: 64, scale: "sqrt",
    fontFamily: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif", bold: false, italic: false, underline: false, padding: 2, lowerCase: false, fit: true,
    autoLang: true, langEn: true, langEs: false, langPt: false, langFr: false, langDe: false, langIt: false,
    minLength: 3, exclude: "", bigrams: false,
    orientation: "horizontal", verticalShare: 30, fromAngle: -45, toAngle: 45, steps: 3,
    shape: "rectangle", icon: "heart", shapeText: "TCViz",
    silhouette: true, silhouetteColor: "", silhouetteOpacity: 12,
    outline: false, outlineColor: "", outlineWidth: 2,
    fillShape: true, fillMinFont: 6, stretch: false,
    jitter: 15, seed: 7, animate: true,
    colorMode: "palette", palette: "tcviz", wordColor: "#2B6CB0", lowColor: "#9DB8D9", highColor: "#1F4E80", background: "",
};

/**
 * Plantillas: un punto de partida. Solo rellenan lo que el usuario no ha tocado: cualquier
 * ajuste escrito a mano (presente en metadata.objects) gana a la plantilla.
 */
const TEMPLATES: Record<string, Partial<Settings>> = {
    none: {},
    clean: {},
    bold: { bold: true, orientation: "mixed", verticalShare: 25, padding: 1, maxFont: 80, scale: "linear", jitter: 25, palette: "vivid" },
    editorial: { fontFamily: "Georgia, 'Times New Roman', serif", colorMode: "size", palette: "ink", padding: 3, scale: "sqrt" },
    mono: { colorMode: "single", wordColor: "#3D3929", bold: true, padding: 2 },
    poster: { bold: true, shape: "icon", icon: "heart", outline: true, outlineWidth: 3, orientation: "mixed", verticalShare: 25, padding: 1, maxFont: 96, scale: "linear", palette: "sunset", fontFamily: "'Segoe UI Black', 'Segoe UI', sans-serif" },
};

type Objects = powerbi.DataViewObjects | undefined;

function readSettings(objects: Objects): Settings {
    const tplName = (objects?.["style"]?.["template"] as string) || DEFAULTS.template;
    const tpl = TEMPLATES[tplName] || {};
    const pick = <K extends keyof Settings>(obj: string, prop: string, key: K): Settings[K] => {
        const raw = objects?.[obj]?.[prop];
        if (raw !== undefined && raw !== null) {
            if (typeof raw === "object" && (raw as any).solid) return (raw as any).solid.color as Settings[K];
            return raw as Settings[K];
        }
        return (tpl[key] !== undefined ? tpl[key] : DEFAULTS[key]) as Settings[K];
    };
    return {
        template: tplName,
        maxWords: pick("words", "maxWords", "maxWords"), minFont: pick("words", "minFont", "minFont"),
        maxFont: pick("words", "maxFont", "maxFont"), scale: pick("words", "scale", "scale"),
        fontFamily: pick("words", "fontFamily", "fontFamily"), bold: pick("words", "bold", "bold"),
        italic: pick("words", "italic", "italic"), underline: pick("words", "underline", "underline"),
        padding: pick("words", "padding", "padding"), lowerCase: pick("words", "lowerCase", "lowerCase"), fit: pick("words", "fit", "fit"),
        autoLang: pick("freeText", "autoLang", "autoLang"), langEn: pick("freeText", "langEn", "langEn"), langEs: pick("freeText", "langEs", "langEs"), langPt: pick("freeText", "langPt", "langPt"),
        langFr: pick("freeText", "langFr", "langFr"), langDe: pick("freeText", "langDe", "langDe"), langIt: pick("freeText", "langIt", "langIt"),
        minLength: pick("freeText", "minLength", "minLength"), exclude: pick("freeText", "exclude", "exclude"), bigrams: pick("freeText", "bigrams", "bigrams"),
        orientation: pick("orientation", "mode", "orientation"), verticalShare: pick("orientation", "verticalShare", "verticalShare"),
        fromAngle: pick("orientation", "fromAngle", "fromAngle"), toAngle: pick("orientation", "toAngle", "toAngle"), steps: pick("orientation", "steps", "steps"),
        shape: pick("layout", "shape", "shape"), icon: pick("layout", "icon", "icon"), shapeText: pick("layout", "shapeText", "shapeText"),
        silhouette: pick("layout", "silhouette", "silhouette"), silhouetteColor: pick("layout", "silhouetteColor", "silhouetteColor"),
        silhouetteOpacity: pick("layout", "silhouetteOpacity", "silhouetteOpacity"),
        outline: pick("layout", "outline", "outline"), outlineColor: pick("layout", "outlineColor", "outlineColor"),
        outlineWidth: pick("layout", "outlineWidth", "outlineWidth"),
        fillShape: pick("layout", "fillShape", "fillShape"), fillMinFont: pick("layout", "fillMinFont", "fillMinFont"),
        stretch: pick("layout", "stretch", "stretch"),
        jitter: pick("layout", "jitter", "jitter"), seed: pick("layout", "seed", "seed"), animate: pick("layout", "animate", "animate"),
        colorMode: pick("colors", "mode", "colorMode"), palette: pick("colors", "palette", "palette"), wordColor: pick("colors", "wordColor", "wordColor"),
        lowColor: pick("colors", "lowColor", "lowColor"), highColor: pick("colors", "highColor", "highColor"), background: pick("colors", "background", "background"),
    };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

// ─── Modelo de datos ──────────────────────────────────────────────────────────

interface WordDatum {
    key: string;
    text: string;
    weight: number;
    colorValue: number | null;
    rows: number[];                    // filas de la categoría (1 en modo palabras; n en texto libre)
    ids: ISelectionId[];
    highlighted: boolean;              // false = otro visual lo ha dejado fuera del resaltado
    ruleColor: string | null;          // color de la regla fx, si la hay
    tooltipExtras: { name: string; value: string }[];
}

// ─── Visual ───────────────────────────────────────────────────────────────────

export class Visual implements IVisual {
    private host: IVisualHost;
    private root: HTMLDivElement;
    private svg: SVGSVGElement;
    private layout: CloudLayout;
    private selectionManager: ISelectionManager;
    private events: powerbi.extensibility.IVisualEventService;
    private loc: powerbi.extensibility.ILocalizationManager;
    private settings: Settings = DEFAULTS;
    private words: WordDatum[] = [];
    private placed: PlacedWord[] = [];
    private lastKey = "";                 // datos + ajustes de la última nube: si no cambia, no se re-anima
    private focusIndex = 0;
    private keyboardNav = false;
    private updateToken = 0;
    private images = new Map<string, Promise<HTMLImageElement | null>>();
    private maskCache: { key: string; mask: ShapeMask | null; hi: ShapeMask | null } | null = null;
    private dropped = 0;
    /** Formato desde el lienzo (on-object): el clic selecciona qué formatear, no filtra datos. */
    public visualOnObjectFormatting: powerbi.extensibility.visual.VisualOnObjectFormatting;
    private subSelectionHelper: HtmlSubSelectionHelper;
    private formatMode = false;
    /** Filas por bloques: Power BI entrega 30.000 cada vez; el visual pide las siguientes. */
    private lastFetchCount = 0;
    private fetchRounds = 0;
    private truncatedAt = 0;
    private readonly MAX_FETCH_ROUNDS = 60;
    private hasHighlights = false;
    private lastOptions: VisualUpdateOptions | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.loc = options.host.createLocalizationManager();
        this.selectionManager = options.host.createSelectionManager();
        this.root = document.createElement("div");
        this.root.className = "tcwc";
        this.root.style.cssText = "position:absolute;inset:0;overflow:hidden;";
        options.element.appendChild(this.root);
        this.svg = document.createElementNS(SVG, "svg") as SVGSVGElement;
        this.svg.setAttribute("role", "listbox");
        this.svg.setAttribute("aria-multiselectable", "true");
        this.root.appendChild(this.svg);
        this.layout = new CloudLayout(document);
        this.injectStyles();

        this.subSelectionHelper = HtmlSubSelectionHelper.createHtmlSubselectionHelper({
            hostElement: options.element,
            subSelectionService: options.host.subSelectionService,
            selectionIdCallback: () => undefined,
        });
        this.visualOnObjectFormatting = {
            getSubSelectionStyles: (subs) => this.getSubSelectionStyles(subs),
            getSubSelectionShortcuts: (subs) => this.getSubSelectionShortcuts(subs),
            getSubSelectables: (filter) => this.subSelectionHelper.getAllSubSelectables(filter),
        };

        // Clic en el fondo: limpiar selección. Menú contextual también en vacío.
        this.svg.addEventListener("click", (e) => {
            if (e.target === this.svg || (e.target as Element).getAttribute?.("data-bg")) {
                if (!this.canInteract || this.formatMode) return;
                this.selectionManager.clear().then(() => this.paintSelection());
            }
        });
        this.svg.addEventListener("contextmenu", (e) => {
            if ((e.target as Element).closest?.("[data-word]")) return;
            e.preventDefault();
            if (!this.canInteract) return;
            this.selectionManager.showContextMenu({} as ISelectionId, { x: e.clientX, y: e.clientY });
        });
        // Marcadores y selección hecha desde fuera (sync de selección): repintar.
        this.selectionManager.registerOnSelectCallback(() => this.paintSelection());
    }

    private get canInteract(): boolean {
        return (this.host as any).allowInteractions !== false;
    }

    private t(key: string, fallback: string): string {
        try { const v = this.loc.getDisplayName(key); return v && v !== key ? v : fallback; } catch { return fallback; }
    }

    private injectStyles(): void {
        const ID = "tcwc-styles";
        if (document.getElementById(ID)) return;
        const st = document.createElement("style");
        st.id = ID;
        st.textContent = [
            ".tcwc text[data-word]{cursor:pointer;outline:none}",
            ".tcwc text[data-word]:focus-visible{paint-order:stroke;stroke:#1F4E80;stroke-width:3px;stroke-linejoin:round}",
            ".tcwc .tcwc-in{transition:opacity .45s ease, transform .45s cubic-bezier(.2,.8,.2,1)}",
            "@media (prefers-reduced-motion: reduce){.tcwc .tcwc-in{transition:none!important}}",
            ".tcwc-landing{font-family:'Segoe UI',sans-serif;color:#3D3929;padding:16px;box-sizing:border-box;height:100%;display:flex;flex-direction:column;justify-content:center;gap:8px}",
            ".tcwc-landing h2{font-size:16px;margin:0 0 4px;color:#1F4E80}",
            ".tcwc-landing ol{margin:0;padding-left:20px;font-size:12px;line-height:1.6}",
            ".tcwc-landing p{margin:0;font-size:11px;color:#83827D}",
            ".tcwc-link{border:1px solid #2B6CB0;background:transparent;color:#2B6CB0;border-radius:4px;padding:2px 8px;font:11px 'Segoe UI',sans-serif;cursor:pointer;margin-left:4px}",
            ".tcwc-link:focus-visible{outline:2px solid #1F4E80;outline-offset:2px}",
        ].join("\n");
        (document.head || this.root).appendChild(st);
    }

    // ── Update ────────────────────────────────────────────────────────────────

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        const token = ++this.updateToken;
        this.lastOptions = options;
        try {
            const dv = options.dataViews?.[0];
            this.settings = readSettings(dv?.metadata?.objects);
            this.formatMode = !!(options as any).formatMode;
            this.subSelectionHelper.setFormatMode(this.formatMode);
            if (dv && this.streamSegments(options, dv)) {
                // Se ha pedido el siguiente bloque: Power BI volverá a llamar a update() con
                // todo junto. Dibujar ahora sería una nube parcial que se reemplaza enseguida.
                this.events.renderingFinished(options);
                return;
            }
            const ok = this.readData(dv);
            if (!ok) {
                this.landing();
                this.events.renderingFinished(options);
                return;
            }
            // La forma por imagen se carga una vez y se cachea por contenido.
            const src = this.settings.shape === "image" ? this.maskSource(dv) : null;
            if (src) {
                let p = this.images.get(src);
                if (!p) { p = CloudLayout.loadImage(document, src); this.images.set(src, p); }
                p.then(img => {
                    if (token === this.updateToken) { this.render(options, img); this.warnings(dv); this.updateOutlines(options); }
                    this.events.renderingFinished(options);
                }).catch(err => this.events.renderingFailed(options, String(err)));
                return;
            }
            this.render(options, null);
            this.warnings(dv);
            this.updateOutlines(options);
            this.events.renderingFinished(options);
        } catch (e) {
            this.events.renderingFailed(options, String(e));
            console.error("[WordCloud]", e);
        }
    }

    /**
     * Icono de aviso de Power BI (el triángulo de la cabecera) cuando la nube no cuenta toda la
     * historia: palabras que no caben, o filas que Power BI no ha entregado.
     */
    private warnings(dv: DataView | undefined): void {
        const msgs: string[] = [];
        if (this.dropped > 0) msgs.push(this.t("UI_WarnDropped", "Some words do not fit: enlarge the visual, lower Maximum words or the font sizes.") + " (" + this.dropped + ")");
        if (this.truncatedAt) msgs.push((this.isDesktop
            ? this.t("UI_WarnRowsDesktop", "Power BI Desktop sends a visual only the first rows: publish to the Service to count them all.")
            : this.t("UI_WarnRows", "Power BI sent only part of the rows: the cloud reflects the rows received.")) + " (" + this.truncatedAt + ")");
        const host: any = this.host;
        if (typeof host.displayWarningIcon === "function") {
            if (msgs.length) host.displayWarningIcon(this.t("UI_WarnTitle", "Word Cloud"), msgs.join(" "));
            else if (typeof host.hideWarningIcon === "function") host.hideWarningIcon();
        }
    }

    private get isDesktop(): boolean {
        const env = Number((this.host as any)?.hostEnv);
        return isFinite(env) && env > 0 ? (env & 4) !== 0 : false;
    }

    /**
     * Pide a Power BI los bloques de filas que faltan (más de 30.000: encuestas grandes en
     * texto libre). Desktop no entrega bloques a los visuales: ahí se dibuja lo que llega y
     * el icono de aviso lo dice.
     */
    private streamSegments(options: VisualUpdateOptions, dv: DataView): boolean {
        // operationKind 1 = Append (continuación de un bloque). Otra cosa es una consulta nueva.
        if ((options as any).operationKind !== 1) { this.lastFetchCount = 0; this.fetchRounds = 0; }
        this.truncatedAt = 0;
        if (!dv.metadata?.segment) return false;
        const loaded = dv.categorical?.categories?.[0]?.values?.length ?? 0;
        // Tres frenos: Desktop no puede; si no crece, Power BI está devolviendo lo mismo; y un tope de rondas.
        if (!this.isDesktop && loaded > this.lastFetchCount && this.fetchRounds < this.MAX_FETCH_ROUNDS) {
            this.lastFetchCount = loaded;
            this.fetchRounds++;
            if (this.host.fetchMoreData(true)) return true;
        }
        this.truncatedAt = loaded;
        return false;
    }

    // ── Formato desde el lienzo (on-object) ───────────────────────────────────

    private subSelectable(el: Element, objectName: string, displayName: string, type: powerbi.visuals.SubSelectionStylesType): void {
        if (!this.formatMode) return;
        el.classList.add(HtmlSubSelectableClass);
        el.setAttribute(SubSelectableObjectNameAttribute, objectName);
        el.setAttribute(SubSelectableDisplayNameAttribute, displayName);
        el.setAttribute(SubSelectableTypeAttribute, String(type));
    }

    private updateOutlines(options: VisualUpdateOptions): void {
        if (!this.formatMode) return;
        const subs = (options as any).subSelections as powerbi.visuals.CustomVisualSubSelection[] | undefined;
        this.subSelectionHelper.updateOutlinesFromSubSelections(subs ?? [], true);
    }

    private getSubSelectionStyles(subs: powerbi.visuals.CustomVisualSubSelection[]): powerbi.visuals.SubSelectionStyles | undefined {
        const name = subs[0]?.customVisualObjects[0]?.objectName;
        const ref = (objectName: string, propertyName: string, label: string) => ({ reference: { objectName, propertyName }, label });
        switch (name) {
            case "words":
                return {
                    type: powerbi.visuals.SubSelectionStylesType.Text,
                    fontFamily: ref("words", "fontFamily", this.t("Prop_words_fontFamily", "Font")),
                    fontSize: ref("words", "maxFont", this.t("Prop_words_maxFont", "Largest font size")),
                    bold: ref("words", "bold", this.t("Prop_words_bold", "Bold")),
                    italic: ref("words", "italic", this.t("Prop_words_italic", "Italic")),
                    underline: ref("words", "underline", this.t("Prop_words_underline", "Underline")),
                    fontColor: ref("colors", "wordColor", this.t("Prop_colors_wordColor", "Word color")),
                } as any;
            case "layout":
                return {
                    type: powerbi.visuals.SubSelectionStylesType.Shape,
                    fill: ref("layout", "silhouetteColor", this.t("Prop_layout_silhouetteColor", "Shape color")),
                    stroke: ref("layout", "outlineColor", this.t("Prop_layout_outlineColor", "Border color")),
                } as any;
            case "background":
                return {
                    type: powerbi.visuals.SubSelectionStylesType.Shape,
                    fill: ref("colors", "background", this.t("Prop_colors_background", "Background")),
                } as any;
        }
        return undefined;
    }

    private getSubSelectionShortcuts(subs: powerbi.visuals.CustomVisualSubSelection[]): powerbi.visuals.VisualSubSelectionShortcuts | undefined {
        const name = subs[0]?.customVisualObjects[0]?.objectName;
        const id = (objectName: string, propertyName: string) => ({ objectName, propertyName });
        const nav = (card: string, label: string) => ({ type: powerbi.visuals.VisualShortcutType.Navigate, destinationInfo: { cardUid: "Visual-" + card + "_card" }, label });
        switch (name) {
            case "words":
                return [
                    { type: powerbi.visuals.VisualShortcutType.Picker, ...id("orientation", "mode"), label: this.t("Obj_orientation", "Orientation") },
                    { type: powerbi.visuals.VisualShortcutType.Picker, ...id("colors", "palette"), label: this.t("Prop_colors_palette", "Palette") },
                    { type: powerbi.visuals.VisualShortcutType.Divider },
                    { type: powerbi.visuals.VisualShortcutType.Reset, relatedResetFormattingIds: [id("words", "fontFamily"), id("words", "maxFont"), id("words", "bold"),
                        id("words", "italic"), id("words", "underline"), id("colors", "wordColor"), id("orientation", "mode"), id("colors", "palette")] },
                    nav("words", this.t("Obj_words", "Words")),
                ] as any;
            case "layout":
                return [
                    { type: powerbi.visuals.VisualShortcutType.Picker, ...id("layout", "shape"), label: this.t("Prop_layout_shape", "Shape") },
                    { type: powerbi.visuals.VisualShortcutType.Toggle, ...id("layout", "silhouette"), relatedToggledFormattingIds: [id("layout", "silhouette")],
                        disabledLabel: this.t("UI_HideShape", "Hide shape"), enabledLabel: this.t("UI_ShowShape", "Show shape") },
                    { type: powerbi.visuals.VisualShortcutType.Divider },
                    { type: powerbi.visuals.VisualShortcutType.Reset, relatedResetFormattingIds: [id("layout", "silhouetteColor"), id("layout", "silhouetteOpacity"),
                        id("layout", "outline"), id("layout", "outlineColor"), id("layout", "outlineWidth")] },
                    nav("layout", this.t("Obj_layout", "Layout")),
                ] as any;
            case "background":
                return [
                    { type: powerbi.visuals.VisualShortcutType.Reset, relatedResetFormattingIds: [id("colors", "background")] },
                    nav("colors", this.t("Obj_colors", "Colors")),
                ] as any;
        }
        return undefined;
    }

    private maskSource(dv: DataView | undefined): string | null {
        const col = dv?.categorical?.values?.find(v => v.source.roles?.["maskImage"]);
        const v = col?.values?.find(x => typeof x === "string" && /^data:image\//i.test(x as string));
        return (v as string) || null;
    }

    /** Palabras con su peso, color de regla, resaltado e identidades. false = no hay datos. */
    private readData(dv: DataView | undefined): boolean {
        this.words = [];
        const cat = dv?.categorical?.categories?.[0];
        if (!cat || !cat.values?.length) return false;
        const vals = dv.categorical.values || ([] as any);
        const sizeCol = vals.find?.(v => v.source.roles?.["size"]);
        const colorCol = vals.find?.(v => v.source.roles?.["colorBy"]);
        const tipCols = (vals.filter?.(v => v.source.roles?.["tooltips"]) || []) as powerbi.DataViewValueColumn[];
        this.hasHighlights = !!sizeCol?.highlights;
        const isText = !!cat.source.roles?.["text"];
        const s = this.settings;
        const fmtSize = this.formatter(sizeCol?.source?.format, sizeCol);
        const idOf = (i: number) => this.host.createSelectionIdBuilder().withCategory(cat, i).createSelectionId();
        const ruleColorOf = (i: number): string | null => {
            const o = cat.objects?.[i]?.["colors"]?.["wordColor"] as any;
            return o?.solid?.color ?? null;
        };
        const num = (x: any) => (typeof x === "number" && Number.isFinite(x) ? x : null);

        if (!isText) {
            const seen = new Map<string, WordDatum>();
            cat.values.forEach((raw, i) => {
                if (raw === null || raw === undefined || raw === "") return;
                const text0 = String(raw);
                const text = s.lowerCase ? text0.toLowerCase() : text0;
                const w = sizeCol ? num(sizeCol.values[i]) : 1;
                if (w === null || w <= 0) return;
                const key = text.toLowerCase();
                let d = seen.get(key);
                if (!d) {
                    d = { key, text, weight: 0, colorValue: null, rows: [], ids: [], highlighted: !this.hasHighlights, ruleColor: ruleColorOf(i), tooltipExtras: [] };
                    seen.set(key, d);
                }
                d.weight += w;
                d.rows.push(i); d.ids.push(idOf(i));
                if (colorCol) d.colorValue = (d.colorValue ?? 0) + (num(colorCol.values[i]) ?? 0);
                if (this.hasHighlights && num(sizeCol.highlights[i])) d.highlighted = true;
                d.tooltipExtras = tipCols.map(c => ({ name: c.source.displayName, value: this.formatter(c.source.format, c)(c.values[i]) }));
            });
            this.words = Array.from(seen.values());
        } else {
            const langs = [["en", s.langEn], ["es", s.langEs], ["pt", s.langPt], ["fr", s.langFr], ["de", s.langDe], ["it", s.langIt]]
                .filter(x => x[1]).map(x => x[0] as string);
            if (s.autoLang) {
                for (const lg of detectLanguages(cat.values.map(v => (v === null || v === undefined ? "" : String(v))))) {
                    if (!langs.includes(lg)) langs.push(lg);
                }
            }
            const rows = cat.values.map((raw, i) => ({
                text: raw === null || raw === undefined ? "" : String(raw),
                weight: sizeCol ? (num(sizeCol.values[i]) ?? 0) : 1, row: i,
            })).filter(r => r.weight > 0);
            const toks = tokenize(rows, {
                languages: langs, minLength: clamp(s.minLength, 1, 30),
                exclude: (s.exclude || "").split(/[,;\n]/), lowerCase: !!s.lowerCase, bigrams: !!s.bigrams,
            });
            toks.forEach((v, key) => {
                const hl = !this.hasHighlights || v.rows.some(r => num(sizeCol.highlights[r]));
                this.words.push({
                    key, text: v.display, weight: v.weight, colorValue: null, rows: v.rows,
                    ids: v.rows.slice(0, 200).map(idOf), highlighted: hl, ruleColor: ruleColorOf(v.rows[0]), tooltipExtras: [],
                });
            });
        }
        this.words.sort((a, b) => b.weight - a.weight || a.text.localeCompare(b.text));
        this.words = this.words.slice(0, clamp(s.maxWords, 1, 1000));
        (this as any).fmtSize = fmtSize;
        return this.words.length > 0;
    }

    private formatter(format: string | undefined, col?: powerbi.DataViewValueColumn): (v: any) => string {
        const values = (col?.values || []).filter(v => typeof v === "number") as number[];
        const max = values.length ? Math.max(...values.map(Math.abs)) : 0;
        try {
            const f = valueFormatter.create({ format: format || "", value: max >= 1000 ? max : 0, cultureSelector: this.host.locale, displayUnitSystemType: 2 } as any);
            return (v: any) => (v === null || v === undefined ? "" : typeof v === "number" ? f.format(v) : String(v));
        } catch {
            return (v: any) => (v === null || v === undefined ? "" : String(v));
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    /** Máscara de la forma elegida, cacheada por forma y tamaño. null = rectángulo. */
    private shapeMask(W: number, H: number, img: HTMLImageElement | null): ShapeMask | null {
        const s = this.settings;
        const family = s.fontFamily || DEFAULTS.fontFamily;
        let spec: ShapeSpec | null = null, key = "";
        switch (s.shape) {
            case "icon": if (ICONS[s.icon]) { spec = { kind: "icon", paths: ICONS[s.icon] }; key = "icon:" + s.icon; } break;
            case "text": if ((s.shapeText || "").trim()) { spec = { kind: "text", text: s.shapeText, family }; key = "text:" + s.shapeText + family; } break;
            case "image": if (img) { spec = { kind: "image", img }; key = "image:" + img.src.length + ":" + img.src.slice(-64); } break;
            case "rectangle": break;
            default: spec = { kind: "basic", name: s.shape }; key = "basic:" + s.shape;
        }
        if (!spec) return null;
        key += "@" + W + "x" + H + (s.stretch ? ":stretch" : "");
        if (this.maskCache?.key === key) return this.maskCache.mask;
        const mask = this.layout.buildMask(spec, W, H, s.shape === "circle", !!s.stretch);
        // La misma forma a más resolución, solo para lo que se ve (silueta y borde): en una
        // pantalla con escalado al 150-200 % la imagen a 1x se veía borrosa.
        const k = Math.min(2, Math.max(1, (window.devicePixelRatio || 1)));
        const hi = mask && k > 1 ? this.layout.buildMask(spec, Math.round(W * k), Math.round(H * k), s.shape === "circle", !!s.stretch) : null;
        this.maskCache = { key, mask, hi };
        return mask;
    }

    private addSilhouette(mask: ShapeMask, color: string, opacity: number, W: number, H: number): void {
        const url = CloudLayout.silhouette(document, this.maskCache?.hi || mask, color);
        if (!url) return;
        const im = document.createElementNS(SVG, "image");
        im.setAttribute("href", url); im.setAttribute("width", String(W)); im.setAttribute("height", String(H));
        im.setAttribute("opacity", String(opacity));
        im.setAttribute("pointer-events", "none"); im.setAttribute("aria-hidden", "true");
        // En el menú de selección del modo de formato (no recibe clics: taparía las palabras).
        this.subSelectable(im, "layout", this.t("Prop_layout_shape", "Shape"), powerbi.visuals.SubSelectionStylesType.Shape);
        this.svg.appendChild(im);
    }

    private render(options: VisualUpdateOptions, img: HTMLImageElement | null): void {
        const s = this.settings;
        const W = Math.floor(options.viewport.width), H = Math.floor(options.viewport.height);
        const svg = this.svg;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        this.root.querySelector(".tcwc-landing")?.remove();
        svg.style.display = "";
        svg.setAttribute("width", String(W)); svg.setAttribute("height", String(H));
        svg.setAttribute("aria-label", this.t("UI_AriaCloud", "Word cloud") + ", " + this.words.length + " " + this.t("UI_AriaWords", "words"));

        const pal = this.host.colorPalette as any;
        const hc = !!pal.isHighContrast;
        const bg = hc ? pal.background?.value : s.background;
        const bgRect = document.createElementNS(SVG, "rect");
        bgRect.setAttribute("width", String(W)); bgRect.setAttribute("height", String(H));
        bgRect.setAttribute("fill", bg || "transparent"); bgRect.setAttribute("data-bg", "1");
        this.subSelectable(bgRect, "background", this.t("Prop_colors_background", "Background"), powerbi.visuals.SubSelectionStylesType.Shape);
        svg.appendChild(bgRect);

        const palette = paletteById(s.palette);
        const stops = palette.id === "custom" || !palette.colors.length ? [s.lowColor, s.highColor] : palette.colors;

        // Forma y silueta de fondo. En alto contraste, la silueta en el color del tema.
        const mask = W > 20 && H > 20 ? this.shapeMask(W, H, img) : null;
        let coverage = 1;
        if (mask) {
            let n = 0;
            for (let i = 0; i < mask.data.length; i++) n += mask.data[i];
            coverage = n / mask.data.length;
            const auto = s.colorMode === "single" ? s.wordColor
                : s.colorMode === "theme" ? pal.getColor("__shape__").value
                : (stops[Math.floor(stops.length / 2)] || stops[0]);
            if (hc) {
                this.addSilhouette(mask, pal.foreground?.value ?? "#000", 0.15, W, H);
            } else if (s.silhouette) {
                this.addSilhouette(mask, s.silhouetteColor || auto, clamp(s.silhouetteOpacity, 0, 100) / 100, W, H);
            }
            // Borde: en alto contraste, del color del tema y siempre visible si está activado.
            if (s.outline) {
                const hiM = this.maskCache?.hi || mask, kk = hiM.width / mask.width;
                const url = CloudLayout.outline(document, hiM, hc ? (pal.foreground?.value ?? "#000") : (s.outlineColor || s.silhouetteColor || auto), clamp(s.outlineWidth, 0, 20) * kk);
                if (url) {
                    const im = document.createElementNS(SVG, "image");
                    im.setAttribute("href", url); im.setAttribute("width", String(W)); im.setAttribute("height", String(H));
                    im.setAttribute("pointer-events", "none"); im.setAttribute("aria-hidden", "true");
                    this.svg.appendChild(im);
                }
            }
        }

        // Escala de tamaño: el mayor peso -> maxFont, el menor -> minFont.
        const ws = this.words.map(w => w.weight);
        const wMax = Math.max(...ws), wMin = Math.min(...ws);
        const f = s.scale === "log" ? Math.log1p : s.scale === "sqrt" ? Math.sqrt : (x: number) => x;
        const lo = f(Math.max(0, wMin)), hi = f(Math.max(0, wMax));
        // El tamaño máximo se acota al visual y, con forma, a lo que la forma deja libre.
        const shapeK = mask ? clamp(Math.sqrt(coverage) * 1.15, 0.4, 1) : 1;
        const maxFont0 = Math.min(clamp(s.maxFont, 6, 300), H * 0.35, W * 0.2) * shapeK;
        const minFont0 = Math.min(clamp(s.minFont, 4, 200), maxFont0);
        const angles = this.angles();
        const family = s.fontFamily || DEFAULTS.fontFamily;
        const weight = s.bold ? "700" : "400";
        const fillOn = !!mask && s.fillShape;
        const fillMin = clamp(s.fillMinFont, 4, 30);

        let factor = 1;
        let result = null as ReturnType<CloudLayout["run"]>;
        for (let attempt = 0; attempt < (s.fit ? 5 : 1); attempt++) {
            const lw: LayoutWord[] = this.words.map((w, i) => ({
                text: w.text, index: i,
                size: Math.max(4, (minFont0 + (hi > lo ? (f(Math.max(0, w.weight)) - lo) / (hi - lo) : 1) * (maxFont0 - minFont0)) * factor),
            }));
            result = this.layout.run(lw, {
                // La cursiva cambia el ancho: el motor mide con la misma fuente que se dibuja.
                width: W, height: H, fontFamily: family, fontWeight: (s.italic ? "italic " : "") + weight, padding: clamp(s.padding, 0, 20),
                angles, jitter: clamp(s.jitter, 0, 100) / 100, seed: Math.round(s.seed) || 0,
                mask, timeBudgetMs: 900,
                // El relleno va del tamaño de la palabra más pequeña hacia abajo, sin bajar del mínimo legible.
                fill: fillOn ? { minSize: fillMin, maxSize: Math.max(fillMin + 3, minFont0 * factor * 0.95), budgetMs: 700, maxCount: 1200 } : null,
            });
            // Ajustar: si se quedan fuera palabras de las primeras (las más importantes),
            // encoger todo y repetir. Unas pocas pequeñas fuera no justifican encoger.
            const lostTop = result.dropped.some(d => d.index < Math.ceil(this.words.length * 0.6));
            if (!s.fit || !lostTop) break;
            factor *= 0.82;
        }
        this.placed = result.placed;
        this.dropped = result.dropped.length;

        // Colores
        const cvs = this.words.map(w => w.colorValue).filter(v => v !== null) as number[];
        const cMin = cvs.length ? Math.min(...cvs) : 0, cMax = cvs.length ? Math.max(...cvs) : 1;
        const absMax = cvs.length ? Math.max(...cvs.map(Math.abs)) : 1;
        const catColors = palette.colors.length ? palette.colors : [s.lowColor, s.highColor];
        const colorOf = (w: WordDatum): string => {
            if (hc) return pal.foreground?.value ?? "#000";
            switch (s.colorMode) {
                case "single": return w.ruleColor || s.wordColor;
                case "size": return ramp(stops, hi > lo ? (f(Math.max(0, w.weight)) - lo) / (hi - lo) : 1);
                case "measure": return w.colorValue === null ? stops[0] : ramp(stops, cMax > cMin ? (w.colorValue - cMin) / (cMax - cMin) : 1);
                // Sentimiento: divergente centrado en cero; el signo decide el lado.
                case "sentiment": return w.colorValue === null ? ramp(stops, 0.5) : ramp(stops, 0.5 + (absMax ? w.colorValue / (2 * absMax) : 0));
                case "palette": return w.ruleColor || catColors[hashIndex(w.key, catColors.length)];
                default: return w.ruleColor || pal.getColor(w.key).value;
            }
        };

        // Animar solo cuando cambian los datos o el aspecto, no al seleccionar ni al redimensionar.
        const key = JSON.stringify([this.words.map(w => w.key + ":" + w.weight), s]);
        const animate = s.animate && key !== this.lastKey;
        this.lastKey = key;

        const g = document.createElementNS(SVG, "g");
        // Todas las palabras son un único objeto de texto para el formato desde el lienzo.
        this.subSelectable(g, "words", this.t("Obj_words", "Words"), powerbi.visuals.SubSelectionStylesType.Text);
        svg.appendChild(g);
        // Primero el relleno (debajo); luego las palabras de los datos, de la más importante a la menos.
        const repeats = this.placed.filter(p => p.repeat);
        const main = this.placed.filter(p => !p.repeat).sort((a, b) => a.index - b.index);
        const mk = (p: PlacedWord, rank: number) => {
            const w = this.words[p.index];
            const el = document.createElementNS(SVG, "text");
            el.textContent = p.text;
            el.setAttribute("data-word", String(p.index));
            el.setAttribute("x", String(p.x)); el.setAttribute("y", String(p.y));
            el.setAttribute("text-anchor", "middle");
            el.setAttribute("font-size", String(p.size));
            el.setAttribute("font-family", family);
            el.setAttribute("font-weight", weight);
            if (s.italic) el.setAttribute("font-style", "italic");
            if (s.underline) el.setAttribute("text-decoration", "underline");
            el.setAttribute("fill", colorOf(w));
            if (p.rotate) el.setAttribute("transform", "rotate(" + p.rotate + " " + p.x + " " + p.y + ")");
            if (p.repeat) {
                // Decorativo: se puede pulsar (selecciona su palabra), pero no entra en el
                // teclado ni en el lector de pantalla.
                el.setAttribute("data-repeat", "1");
                el.setAttribute("aria-hidden", "true");
            } else {
                el.setAttribute("role", "option");
                el.setAttribute("tabindex", rank === this.focusIndex ? "0" : "-1");
                el.setAttribute("aria-label", w.text + ", " + (this as any).fmtSize(w.weight));
            }
            if (animate) {
                el.setAttribute("class", "tcwc-in");
                el.style.opacity = "0";
                el.style.transitionDelay = Math.min((p.repeat ? 300 : 0) + rank * 10, 700) + "ms";
            }
            this.wire(el, w, rank, main.length, p.repeat);
            g.appendChild(el);
        };
        repeats.forEach((p, i) => mk(p, i));
        main.forEach((p, rank) => mk(p, rank));
        if (animate) {
            // Doble frame: el navegador pinta el estado inicial antes de la transición.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                g.querySelectorAll<SVGTextElement>("text.tcwc-in").forEach(el => { el.style.opacity = ""; });
            }));
        }
        this.paintSelection();
    }

    private angles(): number[] {
        const s = this.settings;
        switch (s.orientation) {
            case "vertical": return [-90];
            case "mixed": {
                const share = clamp(s.verticalShare, 0, 100) / 100;
                // 20 huecos: la proporción de verticales sale de la elección con semilla.
                const n = Math.round(share * 20);
                return Array.from({ length: 20 }, (_, i) => (i < n ? -90 : 0));
            }
            case "custom": {
                const a = clamp(s.fromAngle, -90, 90), b = clamp(s.toAngle, -90, 90), n = clamp(Math.round(s.steps), 1, 12);
                return n === 1 ? [a] : Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
            }
            default: return [0];
        }
    }

    // ── Interacción ───────────────────────────────────────────────────────────

    private wire(el: SVGTextElement, w: WordDatum, rank: number, total: number, repeat = false): void {
        el.addEventListener("click", (e) => {
            if (this.formatMode) return;           // el clic es para el formato desde el lienzo
            e.stopPropagation();
            this.keyboardNav = false;
            this.select(w, e.ctrlKey || e.metaKey);
        });
        el.addEventListener("contextmenu", (e) => {
            e.preventDefault(); e.stopPropagation();
            if (!this.canInteract) return;
            this.selectionManager.showContextMenu(w.ids[0] ?? ({} as ISelectionId), { x: e.clientX, y: e.clientY });
        });
        el.addEventListener("mousemove", (e) => this.showTooltip(w, e.clientX, e.clientY));
        el.addEventListener("mouseleave", () => this.host.tooltipService.hide({ immediately: false, isTouchEvent: false }));
        if (repeat) return;
        el.addEventListener("keydown", (e: KeyboardEvent) => {
            this.keyboardNav = true;
            const go = (i: number) => {
                const all = Array.from(this.svg.querySelectorAll<SVGTextElement>("text[data-word]:not([data-repeat])"));
                const j = (i + all.length) % all.length;
                all.forEach((t, k) => t.setAttribute("tabindex", k === j ? "0" : "-1"));
                this.focusIndex = j;
                all[j]?.focus();
            };
            let handled = true;
            switch (e.key) {
                case "ArrowRight": case "ArrowDown": go(rank + 1); break;
                case "ArrowLeft": case "ArrowUp": go(rank - 1); break;
                case "Home": go(0); break;
                case "End": go(total - 1); break;
                case "Enter": case " ": this.select(w, e.ctrlKey || e.metaKey); break;
                case "Escape": if (this.canInteract) this.selectionManager.clear().then(() => this.paintSelection()); break;
                case "ContextMenu": {
                    const r = el.getBoundingClientRect();
                    if (this.canInteract) this.selectionManager.showContextMenu(w.ids[0] ?? ({} as ISelectionId), { x: r.left + r.width / 2, y: r.top });
                    break;
                }
                case "F10":
                    if (e.shiftKey && this.canInteract) {
                        const r = el.getBoundingClientRect();
                        this.selectionManager.showContextMenu(w.ids[0] ?? ({} as ISelectionId), { x: r.left + r.width / 2, y: r.top });
                    } else handled = false;
                    break;
                default: handled = false;
            }
            if (handled) { e.preventDefault(); e.stopPropagation(); }
        });
    }

    private select(w: WordDatum, multi: boolean): void {
        if (!this.canInteract || !w.ids.length) return;
        this.selectionManager.select(w.ids, multi).then(() => this.paintSelection());
    }

    private showTooltip(w: WordDatum, x: number, y: number): void {
        const items: powerbi.extensibility.VisualTooltipDataItem[] = [
            { displayName: this.t("UI_TipWord", "Word"), value: w.text },
            { displayName: this.t("UI_TipSize", "Size"), value: (this as any).fmtSize(w.weight) },
        ];
        if (w.rows.length > 1) items.push({ displayName: this.t("UI_TipRows", "Rows"), value: String(w.rows.length) });
        for (const t of w.tooltipExtras) items.push({ displayName: t.name, value: t.value });
        this.host.tooltipService.show({ dataItems: items as any, identities: w.ids.slice(0, 1), coordinates: [x, y], isTouchEvent: false });
    }

    /** Opacidad según selección propia y resaltado que llega de otros visuales. */
    private paintSelection(): void {
        const sel = this.selectionManager.getSelectionIds() as ISelectionId[];
        const has = sel.length > 0;
        const isSel = (w: WordDatum) => w.ids.some(id => sel.some(s => (s as any).equals?.(id)));
        this.svg.querySelectorAll<SVGTextElement>("text[data-word]").forEach(el => {
            const w = this.words[Number(el.getAttribute("data-word"))];
            if (!w) return;
            const on = has ? isSel(w) : w.highlighted;
            el.setAttribute("opacity", on ? "1" : "0.25");
            el.setAttribute("aria-selected", has && on ? "true" : "false");
        });
        if (this.keyboardNav) {
            const f = this.svg.querySelector<SVGTextElement>(`text[data-word][tabindex="0"]`);
            f?.focus();
        }
    }

    // ── Página de inicio (asistente de configuración) ─────────────────────────

    private landing(): void {
        while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
        this.svg.style.display = "none";
        this.root.querySelector(".tcwc-landing")?.remove();
        const box = document.createElement("div");
        box.className = "tcwc-landing";
        const h = document.createElement("h2");
        h.textContent = this.t("UI_LandingTitle", "Word Cloud by TCViz");
        const ol = document.createElement("ol");
        for (const [k, fb] of [
            ["UI_Step1", "Drag a column of words to Words — or comments and answers to Text (free text)."],
            ["UI_Step2", "Optional: a measure to Size. Without it, each word counts how often it appears."],
            ["UI_Step3", "Pick a look in Format > Style template, then a Shape and an Orientation."],
        ]) {
            const li = document.createElement("li"); li.textContent = this.t(k, fb); ol.appendChild(li);
        }
        const p = document.createElement("p");
        p.textContent = this.t("UI_LandingHelp", "Guide, examples and FAQ: tinocallarisa-web.github.io/word-cloud");
        const link = document.createElement("button");
        link.className = "tcwc-link";
        link.textContent = this.t("UI_LandingOpen", "Open the guide");
        // launchUrl: Power BI abre el enlace y avisa al usuario; el visual no navega por su cuenta.
        link.addEventListener("click", () => this.host.launchUrl("https://tinocallarisa-web.github.io/word-cloud/support.html"));
        p.appendChild(document.createTextNode(" "));
        p.appendChild(link);
        box.append(h, ol, p);
        this.root.appendChild(box);
    }

    // ── Panel de formato ──────────────────────────────────────────────────────

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const s = this.settings;
        const T = (k: string, fb: string) => this.t(k, fb);
        const d = (obj: string, prop: string) => ({ objectName: obj, propertyName: prop });
        const num = (obj: string, prop: string, name: string, v: number) => ({ uid: `${obj}_${prop}`, displayName: T(`Prop_${obj}_${prop}`, name), control: { type: powerbi.visuals.FormattingComponent.NumUpDown, properties: { descriptor: d(obj, prop), value: v } } });
        const tog = (obj: string, prop: string, name: string, v: boolean) => ({ uid: `${obj}_${prop}`, displayName: T(`Prop_${obj}_${prop}`, name), control: { type: powerbi.visuals.FormattingComponent.ToggleSwitch, properties: { descriptor: d(obj, prop), value: v } } });
        const txt = (obj: string, prop: string, name: string, v: string) => ({ uid: `${obj}_${prop}`, displayName: T(`Prop_${obj}_${prop}`, name), control: { type: powerbi.visuals.FormattingComponent.TextInput, properties: { descriptor: d(obj, prop), value: v, placeholder: "" } } });
        const font = (obj: string, prop: string, name: string, v: string) => ({ uid: `${obj}_${prop}`, displayName: T(`Prop_${obj}_${prop}`, name), control: { type: powerbi.visuals.FormattingComponent.FontPicker, properties: { descriptor: d(obj, prop), value: v } } });
        const col = (obj: string, prop: string, name: string, v: string, cf = false) => ({
            uid: `${obj}_${prop}`, displayName: T(`Prop_${obj}_${prop}`, name),
            control: { type: powerbi.visuals.FormattingComponent.ColorPicker, properties: {
                descriptor: { ...d(obj, prop), ...(cf ? {
                    // ConstantOrRule muestra el botón fx; pbiviz lo busca por este nombre.
                    instanceKind: powerbi.VisualEnumerationInstanceKinds.ConstantOrRule,
                    // El selector comodín da a Power BI dónde escribir el color que resuelve la regla.
                    selector: dataViewWildcard.createDataViewWildcardSelector(dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals) as any,
                } : {}) },
                value: { value: v || "" },
            } },
        });
        const dd = (obj: string, prop: string, name: string, v: string, items: [string, string, string][]) => {
            const list = items.map(([value, key, fb]) => ({ value, displayName: T(key, fb) }));
            return { uid: `${obj}_${prop}`, displayName: T(`Prop_${obj}_${prop}`, name),
                control: { type: powerbi.visuals.FormattingComponent.Dropdown, properties: { descriptor: d(obj, prop), value: list.find(x => x.value === v) ?? list[0], items: list } as any } };
        };
        const card = (obj: string, name: string, slices: any[]) => ({ uid: `${obj}_card`, displayName: T(`Obj_${obj}`, name), groups: [{ uid: `${obj}_g`, displayName: "", slices }] });

        return {
            cards: [
                card("style", "Style template", [
                    dd("style", "template", "Template", s.template, [
                        ["none", "Enum_tpl_none", "None"], ["clean", "Enum_tpl_clean", "Clean"], ["bold", "Enum_tpl_bold", "Bold"],
                        ["editorial", "Enum_tpl_editorial", "Editorial"], ["mono", "Enum_tpl_mono", "Monochrome"], ["poster", "Enum_tpl_poster", "Poster"]]),
                ]),
                card("words", "Words", [
                    num("words", "maxWords", "Maximum words", s.maxWords),
                    num("words", "minFont", "Smallest font size", s.minFont),
                    num("words", "maxFont", "Largest font size", s.maxFont),
                    dd("words", "scale", "Size scale", s.scale, [["linear", "Enum_scale_linear", "Linear"], ["sqrt", "Enum_scale_sqrt", "Square root"], ["log", "Enum_scale_log", "Logarithmic"]]),
                    font("words", "fontFamily", "Font", s.fontFamily),
                    tog("words", "bold", "Bold", s.bold),
                    tog("words", "italic", "Italic", s.italic),
                    tog("words", "underline", "Underline", s.underline),
                    num("words", "padding", "Spacing", s.padding),
                    tog("words", "lowerCase", "Lower case", s.lowerCase),
                    tog("words", "fit", "Shrink to fit all words", s.fit),
                ]),
                card("freeText", "Free text", [
                    tog("freeText", "autoLang", "Detect languages automatically", s.autoLang),
                    tog("freeText", "langEn", "English stopwords", s.langEn),
                    tog("freeText", "langEs", "Spanish stopwords", s.langEs),
                    tog("freeText", "langPt", "Portuguese stopwords", s.langPt),
                    tog("freeText", "langFr", "French stopwords", s.langFr),
                    tog("freeText", "langDe", "German stopwords", s.langDe),
                    tog("freeText", "langIt", "Italian stopwords", s.langIt),
                    num("freeText", "minLength", "Minimum word length", s.minLength),
                    txt("freeText", "exclude", "Exclude words (comma separated)", s.exclude),
                    tog("freeText", "bigrams", "Include two-word phrases", s.bigrams),
                ]),
                card("orientation", "Orientation", [
                    dd("orientation", "mode", "Words", s.orientation, [["horizontal", "Enum_or_horizontal", "Horizontal"], ["mixed", "Enum_or_mixed", "Horizontal and vertical"], ["vertical", "Enum_or_vertical", "Vertical"], ["custom", "Enum_or_custom", "Custom angles"]]),
                    num("orientation", "verticalShare", "Vertical words %", s.verticalShare),
                    num("orientation", "fromAngle", "From angle", s.fromAngle),
                    num("orientation", "toAngle", "To angle", s.toAngle),
                    num("orientation", "steps", "Number of angles", s.steps),
                ]),
                card("layout", "Layout", [
                    dd("layout", "shape", "Shape", s.shape, [["rectangle", "Enum_sh_rectangle", "Rectangle"], ["ellipse", "Enum_sh_ellipse", "Ellipse"],
                        ["circle", "Enum_sh_circle", "Circle"], ["diamond", "Enum_sh_diamond", "Diamond"], ["triangle", "Enum_sh_triangle", "Triangle"],
                        ["hexagon", "Enum_sh_hexagon", "Hexagon"], ["icon", "Enum_sh_icon", "Icon"], ["text", "Enum_sh_text", "Text"],
                        ["image", "Enum_sh_image", "Image (Shape image field)"]]),
                    dd("layout", "icon", "Icon", s.icon, Object.keys(ICONS).map(k => [k, "Enum_icon_" + k, k.replace(/-/g, " ").replace(/^./, c => c.toUpperCase())] as [string, string, string])),
                    txt("layout", "shapeText", "Shape text", s.shapeText),
                    tog("layout", "stretch", "Stretch shape to fill", s.stretch),
                    tog("layout", "silhouette", "Show shape", s.silhouette),
                    col("layout", "silhouetteColor", "Shape color", s.silhouetteColor),
                    num("layout", "silhouetteOpacity", "Shape opacity %", s.silhouetteOpacity),
                    tog("layout", "outline", "Shape border", s.outline),
                    col("layout", "outlineColor", "Border color", s.outlineColor),
                    num("layout", "outlineWidth", "Border width", s.outlineWidth),
                    tog("layout", "fillShape", "Fill the shape", s.fillShape),
                    num("layout", "fillMinFont", "Smallest fill size", s.fillMinFont),
                    num("layout", "jitter", "Jitter %", s.jitter),
                    num("layout", "seed", "Seed", s.seed),
                    tog("layout", "animate", "Animate", s.animate),
                ]),
                card("colors", "Colors", [
                    dd("colors", "mode", "Color by", s.colorMode, [["palette", "Enum_col_palette", "Palette"], ["theme", "Enum_col_theme", "Theme colors"],
                        ["single", "Enum_col_single", "Single color"], ["size", "Enum_col_size", "Gradient by size"],
                        ["measure", "Enum_col_measure", "Gradient by Color value"], ["sentiment", "Enum_col_sentiment", "Sentiment (Color value, centred on zero)"]]),
                    dd("colors", "palette", "Palette", s.palette, PALETTES.map(pp => [pp.id, "Enum_pal_" + pp.id, pp.name + (pp.cb ? " (cb)" : "")] as [string, string, string])),
                    col("colors", "wordColor", "Word color", s.wordColor, true),
                    col("colors", "lowColor", "Low color", s.lowColor),
                    col("colors", "highColor", "High color", s.highColor),
                    col("colors", "background", "Background", s.background),
                ]),
            ],
        } as any;
    }
}
