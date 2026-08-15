import { desc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { Rapport, type Sauvegarde, dateOuNull, entier, nombre, nombreOuNull } from "./source";
import type { IndexCommandes } from "./commandes";

const { commande, qcInspection, qcDefaut, qcMesure, mQrqc } = schema;

/* Magasin tissu, contrôle qualité et QRQC. */

/** Six lignes de réception tissu, qui se rangent sur la commande elle-même :
 * le magasin tissu est en relation 1:1 avec elle, il n'a pas de table. */
export async function importerTissus(src: Sauvegarde, idx: IndexCommandes, r: Rapport) {
  r.etape("Magasin tissu");
  let n = 0;

  for (const t of src.tissus) {
    const commandeId = idx.parIdSource.get(t.cmdId);
    if (!commandeId) {
      r.alerte(`réception tissu ${t.id} rattachée à une commande absente (${t.cmdId}) — ignorée`);
      continue;
    }
    const controle = ["ok", "reserve", "refuse"].includes(r.texte(t.ctrl))
      ? r.texte(t.ctrl) === "ok"
        ? "conforme"
        : r.texte(t.ctrl)
      : "";

    /* Les lignes du magasin tissu sont des jetons de passage : les six portent
     * `qte_recue: 1`, là où la commande elle-même connaît le métrage (430 m,
     * 2400 m). Écraser l'un par l'autre perdait la quantité et faussait le
     * calcul de pièces coupables. On garde la meilleure information connue. */
    const [dejaLa] = await db
      .select({ tissuRecu: commande.tissuRecu })
      .from(commande)
      .where(eq(commande.id, commandeId));
    const metrage = Math.max(dejaLa?.tissuRecu ?? 0, nombre(t.qte_recue));

    await db
      .update(commande)
      .set({
        tissuRecu: metrage,
        tissuDateReelle: dateOuNull(t.date),
        tissuControle: controle,
        tissuNote: [r.texte(t.designation), r.texte(t.note)].filter(Boolean).join(" · "),
        // Le tissu est libéré si le contrôle le permet — c'est la règle des feux.
        tissuLibere: controle === "conforme" || controle === "reserve",
        updatedAt: new Date(),
      })
      .where(eq(commande.id, commandeId));
    n++;
  }

  r.ok("réceptions tissu", n);
}

/* ─────────── contrôle qualité ─────────── */

const GRAVITES = ["critique", "majeur", "mineur"];

export async function importerQualite(src: Sauvegarde, idx: IndexCommandes, r: Rapport) {
  r.etape("Contrôle qualité");

  const [dernier] = await db.select({ numero: qcInspection.numero }).from(qcInspection).orderBy(desc(qcInspection.numero)).limit(1);
  let numero = dernier?.numero ?? 0;

  let inspections = 0;
  let defauts = 0;
  let mesures = 0;
  /** id PilotPro → id Postgres, pour rattacher les re-contrôles ensuite. */
  const parIdSource = new Map<number, number>();

  for (const i of src.qcInspections) {
    const commandeId = i.orderId ? (idx.parIdSource.get(i.orderId) ?? null) : null;
    const statut = r.texte(i.statut) === "cloture" ? "cloture" : "brouillon";
    const verdict = ["accepte", "reserve", "refuse"].includes(r.texte(i.verdict)) ? r.texte(i.verdict) : "";

    const [ligne] = await db
      .insert(qcInspection)
      .values({
        numero: ++numero,
        date: dateOuNull(i.date) ?? new Date().toISOString().slice(0, 10),
        commandeId,
        of: r.texte(i.of),
        client: r.texte(i.client),
        modele: r.texte(i.modele),
        ref: r.texte(i.ref),
        couleur: r.texte(i.couleur),
        faconnier: r.texte(i.faconnier),
        lot: entier(i.lot),
        controleur: r.texte(i.controleur),
        statut,
        /* Le verdict n'est « forcé » que s'il diffère de la proposition AQL, ce
         * qu'on ne peut pas savoir ici : on le pose comme verdict de clôture
         * quand l'inspection est close, et comme arbitrage sinon. */
        verdictForce: statut === "cloture" ? "" : verdict,
        verdictCloture: statut === "cloture" ? verdict : "",
        dateCloture: statut === "cloture" ? dateOuNull(i.date) : null,
        note: r.texte(i.note),
      })
      .returning({ id: qcInspection.id });

    parIdSource.set(i.id, ligne.id);
    inspections++;

    for (const d of i.defects ?? []) {
      const famille = r.texte(d.fam) || "Aspect / Matière";
      await db.insert(qcDefaut).values({
        inspectionId: ligne.id,
        famille,
        description: r.texte(d.desc),
        gravite: GRAVITES.includes(r.texte(d.grav)) ? r.texte(d.grav) : "majeur",
        nombre: entier(d.n, 1) || 1,
      });
      defauts++;
    }

    for (const m of i.mesures ?? []) {
      await db.insert(qcMesure).values({
        inspectionId: ligne.id,
        point: r.texte(m.point),
        taille: r.texte(m.taille),
        spec: nombreOuNull(m.spec),
        tolerance: nombreOuNull(m.tol),
        mesure: nombreOuNull(m.mesure),
      });
      mesures++;
    }
  }

  // Chaînage des re-contrôles, une fois toutes les inspections en base.
  let recontroles = 0;
  for (const i of src.qcInspections) {
    if (!i.recontroleDe) continue;
    const id = parIdSource.get(i.id);
    const source = parIdSource.get(i.recontroleDe);
    if (!id || !source) continue;
    await db.update(qcInspection).set({ recontroleDeId: source }).where(eq(qcInspection.id, id));
    recontroles++;
  }

  r.ok("inspections", inspections, `${defauts} défaut(s), ${mesures} mesure(s)`);
  if (recontroles) r.ok("re-contrôles chaînés", recontroles);

  /* Les photos vivent dans les `blobs` de la sauvegarde, que cette reprise ne
   * lit pas : les citer sans les stocker donnerait des vignettes mortes. */
  const photos =
    src.qcInspections.reduce((n, i) => n + (i.photosGen?.length ?? 0), 0) +
    src.qcInspections.reduce((n, i) => n + (i.defects ?? []).reduce((m, d) => m + (d.photos?.length ?? 0), 0), 0);
  if (photos) r.alerte(`${photos} photo(s) de contrôle non reprises — les blobs de la sauvegarde ne sont pas importés`);

  /* ── QRQC ── */
  let qrqcs = 0;
  for (const q of src.qrqcs) {
    const of = q.cmdId ? idx.parIdSource.get(q.cmdId) : null;
    let refCommande = "";
    if (of) {
      const [c] = await db.select({ of: commande.ofNumber }).from(commande).where(eq(commande.id, of));
      refCommande = c?.of ?? "";
    }
    const resolu = r.texte(q.statut) === "resolu";
    await db.insert(mQrqc).values({
      date: dateOuNull(q.date) ?? "",
      pb: r.texte(q.probleme),
      cause: r.texte(q.cause),
      cmd: refCommande,
      action: r.texte(q.action),
      statutTone: resolu ? "success" : "warning",
      statutLabel: resolu ? "Résolu" : "En cours",
    });
    qrqcs++;
  }
  r.ok("fiches QRQC", qrqcs);
}
