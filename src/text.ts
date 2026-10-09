/**
 * Texto libre -> palabras con su peso.
 *
 * Para el campo "Text": comentarios de encuestas, tickets, reseñas. Se trocea por letras y
 * números de cualquier alfabeto (\p{L}\p{N}), se quitan las palabras vacías del idioma, y
 * cada fila reparte su peso (la medida Size, o 1) entre las palabras que contiene.
 */

const STOP: Record<string, string> = {
    en: "a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also get got one two us via",
    es: "a al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era eran es esa esas ese eso esos esta estaba estado estan estar estas este esto estos fue fueron ha habia han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros o os otra otro para pero poco por porque que quien se sea ser si sin sobre son su sus tambien tanto te tiene tienen todo todos tu tus un una uno unos y ya yo él más qué sí también está están",
    pt: "a ao aos as até com como da das de dela dele do dos e ela ele eles em entre era essa esse esta este eu foi for há isso isto já la lhe mais mas me mesmo meu minha muito na nas nem no nos nossa nosso não o os ou para pela pelo por qual quando que quem se sem ser seu sua são também te tem tu um uma você",
    fr: "a ai au aux avec c ce ces cet cette d dans de des du elle elles en est et eux il ils j je l la le les leur leurs lui m ma mais me même mes moi mon ne nos notre nous on ou par pas pour qu que qui s sa se ses son sur ta te tes toi ton tu un une vos votre vous y à été être",
    de: "aber alle als also am an auch auf aus bei bin bis da damit dann das dass dem den der des die doch du durch ein eine einem einen einer es für hat hatte ich ihr im in ist ja kann mein mit nach nicht noch nur oder sich sie sind so über um und uns unter vom von vor war was wenn wie wir wird zu zum zur",
    it: "a ad al alla alle anche che chi ci come con da dal dalla de degli dei del della delle di e ed è gli ha hanno i il in io la le lei lo loro lui ma mi mia mio ne nel nella noi non o per più quale quando questa questo se si sono su sua suo ti tra tu un una uno vi",
};

export interface TokenOptions {
    languages: string[];       // claves de STOP
    minLength: number;
    exclude: string[];         // palabras extra a quitar
    lowerCase: boolean;
    bigrams: boolean;          // también parejas de palabras ("customer service")
}

export function stopwords(languages: string[], extra: string[]): Set<string> {
    const s = new Set<string>();
    for (const lg of languages) for (const w of (STOP[lg] || "").split(" ")) if (w) s.add(w);
    for (const w of extra) if (w.trim()) s.add(w.trim().toLowerCase());
    return s;
}

/** Suma de pesos por palabra, y para cada palabra las filas de origen (para seleccionar). */
export function tokenize(texts: { text: string; weight: number; row: number }[], o: TokenOptions):
    Map<string, { weight: number; rows: number[]; display: string }> {
    const stop = stopwords(o.languages, o.exclude);
    const out = new Map<string, { weight: number; rows: number[]; display: string }>();
    const re = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
    for (const t of texts) {
        if (!t.text) continue;
        const raw = t.text.match(re) || [];
        const toks: string[] = [];
        for (let w of raw) {
            w = w.replace(/['’-]+$/, "");
            const key = w.toLowerCase();
            if (key.length < o.minLength || stop.has(key) || /^\d+$/.test(key)) { toks.push(""); continue; }
            toks.push(o.lowerCase ? key : w);
        }
        const add = (display: string) => {
            const key = display.toLowerCase();
            let e = out.get(key);
            if (!e) { e = { weight: 0, rows: [], display }; out.set(key, e); }
            e.weight += t.weight;
            if (e.rows[e.rows.length - 1] !== t.row) e.rows.push(t.row);
        };
        for (let i = 0; i < toks.length; i++) {
            if (!toks[i]) continue;
            add(toks[i]);
            if (o.bigrams && toks[i + 1]) add(toks[i] + " " + toks[i + 1]);
        }
    }
    return out;
}
