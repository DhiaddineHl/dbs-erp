import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

/* Stockage objet, compatible S3.
 *
 * Les octets ne vivent plus en base : une photo de contrôle n'a rien à faire
 * dans un `pg_dump`, elle en double le volume sans jamais être interrogée. La
 * table `fichier` reste, mais comme index — hash, type, taille — ce qui garde
 * la déduplication et les clés étrangères de `qc_photo` sans faire transiter
 * les octets par Postgres.
 *
 * La configuration est celle que Railway expose sur un bucket, et ce sont les
 * noms standards du SDK AWS : la même application tourne sur n'importe quel
 * fournisseur S3 en changeant les seules variables d'environnement.
 *
 * Ce module n'est pas marqué « server-only », contrairement à `fichiers.ts`
 * qui l'enveloppe : `scripts/verifier-stockage.ts` doit pouvoir l'appeler hors
 * de Next pour vérifier le bucket, comme `scripts/import/db.ts` le fait déjà
 * pour la base. La protection reste entière — les identifiants sont lus dans
 * des variables sans préfixe `NEXT_PUBLIC_`, que Next n'expose jamais au
 * navigateur, et rien ici n'est importé par un composant. */

const REQUISES = ["AWS_ENDPOINT_URL", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_S3_BUCKET_NAME"] as const;

export function stockageConfigure(): boolean {
  return REQUISES.every((v) => !!process.env[v]);
}

function config() {
  const manquantes = REQUISES.filter((v) => !process.env[v]);
  if (manquantes.length) {
    throw new Error(
      `Stockage objet non configuré — variables manquantes : ${manquantes.join(", ")}. ` +
        `Sur Railway : « railway bucket credentials » donne les valeurs à poser sur le service.`,
    );
  }
  return {
    endpoint: process.env.AWS_ENDPOINT_URL!,
    bucket: process.env.AWS_S3_BUCKET_NAME!,
    region: process.env.AWS_DEFAULT_REGION || "auto",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    /* Railway annonce « virtual-host ». Un fournisseur qui ne sait faire que
     * des URL de la forme endpoint/bucket/clé exige l'inverse. */
    forcePathStyle: (process.env.AWS_S3_URL_STYLE || "virtual-host") === "path",
  };
}

let client: S3Client | null = null;

/** Client partagé — créé au premier usage, pour que l'absence de configuration
 * ne fasse pas échouer le build ni les écrans qui ne touchent aucun fichier. */
function s3(): S3Client {
  if (client) return client;
  const c = config();
  client = new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    forcePathStyle: c.forcePathStyle,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
  return client;
}

const bucket = () => config().bucket;

/** Clé d'un contenu. Adressée par le hash, donc immuable ; les deux premiers
 * octets servent de préfixe pour qu'un listing reste lisible une fois que le
 * bucket aura grossi. */
export const cleFichier = (hash: string) => `fichiers/${hash.slice(0, 2)}/${hash}`;

export async function deposer(hash: string, data: Buffer, mime: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: cleFichier(hash),
      Body: data,
      ContentType: mime,
      ContentLength: data.length,
      /* Le contenu ne peut pas changer sous une clé donnée : le cache navigateur
       * peut le garder indéfiniment. */
      CacheControl: "private, max-age=31536000, immutable",
    }),
  );
}

/** Récupère les octets sous forme de flux, pour ne pas charger le fichier
 * entier en mémoire avant de le renvoyer. */
export async function recuperer(hash: string): Promise<ReadableStream | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: cleFichier(hash) }));
    return res.Body ? (res.Body.transformToWebStream() as ReadableStream) : null;
  } catch (e) {
    const nom = (e as { name?: string }).name;
    if (nom === "NoSuchKey" || nom === "NotFound") return null;
    throw e;
  }
}

export async function supprimer(hash: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: cleFichier(hash) }));
}
