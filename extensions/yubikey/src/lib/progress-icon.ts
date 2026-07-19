import { Color, environment } from "@vicinae/api";

/** Verde acima de 10s, laranja de 10 a 6, vermelho nos últimos 5. */
export function urgency(remaining: number): "fresh" | "expiring" | "dead" {
  if (remaining <= 5) return "dead";
  if (remaining <= 10) return "expiring";
  return "fresh";
}

export function urgencyColor(remaining: number): Color {
  switch (urgency(remaining)) {
    case "dead":
      return Color.Red;
    case "expiring":
      return Color.Orange;
    default:
      return Color.Green;
  }
}

const STROKE = {
  fresh: "#4EC98B",
  expiring: "#E8833A",
  dead: "#E5484D",
} as const;

/**
 * Gera o data-URI de um anel para `secondsLeft` de `period`.
 *
 * Não é chamado no caminho quente: os anéis são pré-computados por `ringTable` e só consultados.
 * O Vicinae re-serializa a árvore React inteira a cada segundo, então gerar a string e escapá-la
 * por item por segundo apareceria no perfil de CPU. Aqui a string é montada uma vez por (período,
 * segundo) e reusada.
 */
function buildRing(secondsLeft: number, period: number): string {
  const total = Math.max(period, 1);
  const left = Math.min(Math.max(secondsLeft, 0), total);
  const ratio = left / total;

  const r = 13;
  const c = 16;
  const circ = 2 * Math.PI * r;
  const filled = circ * ratio;

  const track = environment.appearance === "light" ? "#00000018" : "#FFFFFF20";
  const stroke = STROKE[urgency(left)];

  // Um único <circle> por cima de um trilho, com stroke-dasharray "preenchido resto". Bem menor
  // que dois círculos completos, e o data-URI é o que domina o payload por segundo.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<circle cx="16" cy="16" r="13" fill="none" stroke="${track}" stroke-width="3"/>` +
    `<circle cx="16" cy="16" r="13" fill="none" stroke="${stroke}" stroke-width="3" ` +
    `stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${circ.toFixed(1)}" ` +
    `transform="rotate(-90 16 16)"/></svg>`;

  // base64 cresce 4/3 fixo; encodeURIComponent quase dobra (escapa <, >, ", #, espaço).
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/**
 * Tabela de anéis por período: os 0..period estados, construídos uma vez sob demanda.
 *
 * A UI só faz `ringTable(period)[secondsLeft]`, sem gerar SVG nem escapar nada no tick de 1s.
 */
const cache = new Map<number, string[]>();

export function ringTable(period: number): string[] {
  const key = period || 30;
  let table = cache.get(key);
  if (!table) {
    table = Array.from({ length: key + 1 }, (_, s) => buildRing(s, key));
    cache.set(key, table);
  }
  return table;
}

export function countdownRing(secondsLeft: number, period: number): string {
  const table = ringTable(period);
  const idx = Math.min(Math.max(Math.ceil(secondsLeft), 0), table.length - 1);
  return table[idx];
}
