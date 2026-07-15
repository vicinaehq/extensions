import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Clipboard, closeMainWindow } from "@vicinae/api";
import { prefs } from "./oath-session";

const VICINAE_DIR = join(homedir(), ".local", "share", "vicinae");
const CLIPBOARD_DB = join(VICINAE_DIR, "clipboard.db");
const CLIPBOARD_DATA = join(VICINAE_DIR, "clipboard-data");

/** O Vicinae grava a seleção de forma assíncrona; damos algumas chances de ela aparecer. */
const PURGE_ATTEMPTS = 8;
const PURGE_INTERVAL_MS = 120;

/** Só apagamos entradas criadas agora. Protege contra remover algo antigo com o mesmo texto. */
const RECENT_WINDOW_S = 15;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Remove do histórico do Vicinae a entrada correspondente a `text`.
 *
 * Existe porque `Clipboard.paste()` não aceita a flag `concealed` que o `copy()` aceita:
 * colar um TOTP o grava em clipboard.db e no índice FTS, em texto puro e pesquisável.
 *
 * O casamento é por md5 do conteúdo (é assim que o Vicinae indexa: `selection.hash_md5`),
 * então o código nunca é escrito em SQL nem passa por argv de outro processo.
 *
 * Isto mexe no banco interno de outro programa. Se o schema mudar num update do Vicinae,
 * a função avisa e desiste — nunca deixa a exceção subir e quebrar o paste, que é o que
 * o usuário realmente pediu.
 */
export async function purgeFromHistory(text: string): Promise<boolean> {
  if (!text) return false;

  const hash = createHash("md5").update(text).digest("hex");

  let sqlite: typeof import("node:sqlite");
  try {
    sqlite = await import("node:sqlite");
  } catch {
    console.warn("[clipboard] node:sqlite unavailable; the code stays in Vicinae's history");
    return false;
  }

  for (let attempt = 0; attempt < PURGE_ATTEMPTS; attempt++) {
    try {
      const db = new sqlite.DatabaseSync(CLIPBOARD_DB, { timeout: 2000 });
      try {
        // Sem isto o ON DELETE CASCADE de data_offer não roda.
        db.exec("PRAGMA foreign_keys = ON");

        const cutoff = Math.floor(Date.now() / 1000) - RECENT_WINDOW_S;

        const offers = db
          .prepare(
            `SELECT d.id AS offerId
               FROM data_offer d
               JOIN selection s ON s.id = d.selection_id
              WHERE s.hash_md5 = ? AND s.created_at >= ?`,
          )
          .all(hash, cutoff) as { offerId: string }[];

        if (offers.length === 0) {
          db.close();
          await sleep(PURGE_INTERVAL_MS);
          continue;
        }

        // O trigger `selection_ad` limpa o selection_fts, e o CASCADE limpa o data_offer.
        const result = db
          .prepare("DELETE FROM selection WHERE hash_md5 = ? AND created_at >= ?")
          .run(hash, cutoff);

        db.close();

        // O conteúdo em si vive num arquivo nomeado pelo id do data_offer.
        for (const { offerId } of offers) {
          try {
            rmSync(join(CLIPBOARD_DATA, offerId), { force: true });
          } catch (err) {
            console.warn(`[clipboard] could not remove blob ${offerId}: ${String(err)}`);
          }
        }

        return Number(result.changes) > 0;
      } catch (err) {
        db.close();
        throw err;
      }
    } catch (err) {
      console.warn(`[clipboard] purge failed: ${String(err)}`);
      return false;
    }
  }

  // A entrada nunca apareceu. Pode ser que o Vicinae tenha deduplicado (ele ignora uma
  // seleção idêntica à atual) — nesse caso não há nada a remover.
  return false;
}

/**
 * Cola no campo que estava focado e, se o usuário quiser, apaga o rastro do histórico.
 *
 * A ordem importa: `closeMainWindow()` vem ANTES de `paste()`. É o que o próprio Vicinae
 * faz no `Action.Paste` nativo — a janela precisa sair da frente para o compositor
 * devolver o foco à janela anterior antes de a tecla ser injetada.
 */
export async function pasteAndForget(text: string): Promise<void> {
  await closeMainWindow();
  await Clipboard.paste(text);

  if (prefs().purgeClipboardHistory !== false) {
    await purgeFromHistory(text);
  }
}

/** Copia sem deixar rastro no histórico. É o plano B quando o paste não chega na janela certa. */
export async function copyConcealed(text: string): Promise<void> {
  await Clipboard.copy(text, { concealed: true });
}
