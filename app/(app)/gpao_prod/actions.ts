"use server";

import { revalidatePath } from "next/cache";
import { assertUser } from "@/lib/auth/server";
import * as g from "@/lib/services/gpao";
import type { journee as journeeTable } from "@/lib/db/schema";

/* Shared DB persistence for GPAO Production. Each mutation writes to Postgres
 * so journées/chaînes/modèles are visible to every user (no more localStorage).
 * Reads happen in the page server component; these only mutate + revalidate. */

const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });
const PATH = "/gpao_prod";

type JourneeInsert = typeof journeeTable.$inferInsert;

export async function createDay(input: {
  date: string;
  chaineId: number;
  modeleId: number;
  effectif: number;
  nbHeures: number;
}) {
  try {
    await assertUser();
    const cols = Array.from({ length: input.nbHeures }, (_, i) => `H${i + 1}`);
    const row = await g.insertJournee({ ...input, cols, sortie: {}, ops: {}, cloture: false });
    revalidatePath(PATH);
    return { ok: true as const, row };
  } catch (e) {
    return fail(e);
  }
}

/** Duplicate a day's header (chaîne/modèle/effectif/heures) with blank entry. */
export async function duplicateDay(input: {
  date: string;
  chaineId: number;
  modeleId: number;
  effectif: number;
  nbHeures: number;
  cols: string[];
  objManuel?: number | null;
}) {
  try {
    await assertUser();
    const row = await g.insertJournee({
      date: input.date,
      chaineId: input.chaineId,
      modeleId: input.modeleId,
      effectif: input.effectif,
      nbHeures: input.nbHeures,
      cols: input.cols,
      objManuel: input.objManuel ?? null,
      sortie: {},
      ops: {},
      ret: {},
      opsSam: {},
      opsPoste: {},
      opsDetail: {},
      cloture: false,
    });
    revalidatePath(PATH);
    return { ok: true as const, row };
  } catch (e) {
    return fail(e);
  }
}

export async function updateDay(id: number, patch: Record<string, unknown>) {
  try {
    await assertUser();
    await g.updateJournee(id, patch as Partial<JourneeInsert>);
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDay(id: number) {
  try {
    await assertUser();
    await g.deleteJournee(id);
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

export async function saveChaine(input: { id?: number; nom: string; chef: string }) {
  try {
    await assertUser();
    if (input.id) {
      await g.updateChaine(input.id, { nom: input.nom, chef: input.chef });
      revalidatePath(PATH);
      return { ok: true as const, id: input.id };
    }
    const row = await g.insertChaine({ nom: input.nom, chef: input.chef });
    revalidatePath(PATH);
    return { ok: true as const, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteChaine(id: number) {
  try {
    await assertUser();
    await g.deleteChaine(id);
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

export async function saveOuvriere(input: {
  id?: number;
  chaineId: number;
  nom: string;
  poste: string;
  sam: number;
}) {
  try {
    await assertUser();
    if (input.id) {
      await g.updateOuvriere(input.id, { nom: input.nom, poste: input.poste, sam: input.sam });
      revalidatePath(PATH);
      return { ok: true as const, id: input.id };
    }
    const row = await g.insertOuvriere({
      chaineId: input.chaineId,
      nom: input.nom,
      poste: input.poste,
      sam: input.sam,
    });
    revalidatePath(PATH);
    return { ok: true as const, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteOuvriere(id: number) {
  try {
    await assertUser();
    await g.deleteOuvriere(id);
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

export async function saveModele(input: {
  id?: number;
  nom: string;
  ref: string;
  client: string;
  sam: number;
  qte: number;
}) {
  try {
    await assertUser();
    if (input.id) {
      await g.updateModele(input.id, {
        nom: input.nom, ref: input.ref, client: input.client, sam: input.sam, qte: input.qte,
      });
      revalidatePath(PATH);
      return { ok: true as const, id: input.id };
    }
    const row = await g.insertModele({
      nom: input.nom, ref: input.ref, client: input.client, sam: input.sam, qte: input.qte,
    });
    revalidatePath(PATH);
    return { ok: true as const, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteModele(id: number) {
  try {
    await assertUser();
    await g.deleteModele(id);
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}
