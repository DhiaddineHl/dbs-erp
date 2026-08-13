"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings, Plus, Pencil, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NAV_STRUCTURE } from "@/lib/nav";
import type { RoleRow } from "@/lib/services/permissions";
import {
  createUserAction,
  creerRoleAction,
  deleteUserAction,
  majRoleAction,
  setPrixFaconAction,
  supprimerRoleAction,
  togglePermissionAction,
  updateUserAction,
} from "./actions";

type ManagedUser = { id: string; name: string; email: string; role: string };
type PermMatrix = Record<string, Record<string, boolean>>;

export function ParametresClient({
  users,
  matrix,
  roles,
  prixFacon,
}: {
  users: ManagedUser[];
  matrix: PermMatrix;
  roles: RoleRow[];
  prixFacon: number;
}) {
  const router = useRouter();
  const [userDialog, setUserDialog] = useState<{ open: boolean; edit: ManagedUser | null }>({ open: false, edit: null });
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; edit: RoleRow | null }>({ open: false, edit: null });
  const [, startTransition] = useTransition();

  const libelle = (key: string) => roles.find((r) => r.key === key)?.label ?? key;
  const couleur = (key: string) => roles.find((r) => r.key === key)?.color ?? "#64748b";
  const autresRoles = roles.filter((r) => r.key !== "admin");
  const comptesParRole = (key: string) => users.filter((u) => u.role === key).length;

  const run = (p: Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    startTransition(async () => {
      const res = await p;
      if (res.ok) {
        toast.success(okMsg);
        router.refresh();
      } else {
        toast.error(res.error || "Erreur");
      }
    });

  return (
    <>
      <PageHeader
        icon={Settings}
        title="Paramètres"
        description="Configuration, données et permissions par rôle — comptes gérés par Better Auth"
      />

      {/* ── Financier ── */}
      <SectionPanel title="Paramètres financiers" icon="💶">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold text-secondary-foreground">
              Prix façon DBS par défaut (€/pcs)
            </Label>
            <Input
              type="number"
              step="0.01"
              defaultValue={prixFacon}
              className="bg-card"
              onBlur={(e) => run(setPrixFaconAction(parseFloat(e.target.value) || 3.5), "Paramètre enregistré")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold text-secondary-foreground">Société</Label>
            <Input value="DBS Fashion — Confection export" disabled className="bg-muted" />
          </div>
        </div>
      </SectionPanel>

      {/* ── Données ── */}
      <SectionPanel title="Données" icon="🗄">
        <p className="text-xs text-muted-foreground">
          Toutes les données — commandes, production (GPAO), facturation, comptes et permissions — sont désormais
          stockées en base PostgreSQL côté serveur et partagées en temps réel entre tous les utilisateurs. Plus aucune
          donnée n&apos;est conservée dans le navigateur ; les sauvegardes sont gérées au niveau de la base de données.
        </p>
      </SectionPanel>

      {/* ── Comptes ── */}
      <SectionPanel
        title="Comptes utilisateurs"
        icon="👥"
        actions={
          <Button size="sm" onClick={() => setUserDialog({ open: true, edit: null })}>
            <Plus className="size-4" /> Ajouter
          </Button>
        }
        flush
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-semibold text-brand">{u.email}</TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                    style={{ borderColor: couleur(u.role), color: couleur(u.role) }}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: couleur(u.role) }} />
                    {libelle(u.role)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setUserDialog({ open: true, edit: u })}>
                      <Pencil className="size-3.5" />
                    </Button>
                    {u.email !== "admin@dbs.local" && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          if (confirm(`Supprimer « ${u.name} » ?`)) run(deleteUserAction(u.id), "Utilisateur supprimé");
                        }}
                      >
                        <X className="size-3.5 text-[var(--danger-d)]" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionPanel>

      {/* ── Rôles ── */}
      <SectionPanel
        title="Rôles"
        icon="🎭"
        actions={
          <Button size="sm" onClick={() => setRoleDialog({ open: true, edit: null })}>
            <Plus className="size-4" /> Nouveau rôle
          </Button>
        }
        flush
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rôle</TableHead>
              <TableHead>Identifiant</TableHead>
              <TableHead className="text-right">Comptes</TableHead>
              <TableHead>Origine</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((r) => (
              <TableRow key={r.key}>
                <TableCell>
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <span className="size-2.5 rounded-full" style={{ background: r.color }} />
                    {r.label}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{r.key}</TableCell>
                <TableCell className="text-right tabular-nums">{comptesParRole(r.key)}</TableCell>
                <TableCell>
                  <StatusBadge tone={r.builtin ? "purple" : "brand"}>
                    {r.builtin ? "Rôle de base" : "Personnalisé"}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setRoleDialog({ open: true, edit: r })}>
                      <Pencil className="size-3.5" />
                    </Button>
                    {!r.builtin && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          if (confirm(`Supprimer le rôle « ${r.label} » et ses permissions ?`)) {
                            run(supprimerRoleAction(r.key), "Rôle supprimé");
                          }
                        }}
                      >
                        <X className="size-3.5 text-[var(--danger-d)]" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="px-4 py-2.5 text-[11px] text-muted-foreground">
          Les quatre rôles de base sont adossés à l&apos;authentification et ne peuvent pas être supprimés ; leur
          libellé reste modifiable. Un rôle personnalisé n&apos;existe que par sa ligne dans le tableau des
          permissions ci-dessous — aucun code ne le connaît.
        </p>
      </SectionPanel>

      {/* ── Permissions ── */}
      <SectionPanel title="Permissions par rôle" icon="🔐">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="size-4 text-purple" />
          <p className="text-xs text-muted-foreground">
            Cochez les modules accessibles à chaque rôle. L&apos;<b>Administrateur</b> a toujours accès à tout. Les
            changements s&apos;appliquent à la navigation des utilisateurs concernés.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead className="text-center text-purple">Admin</TableHead>
                {autresRoles.map((r) => (
                  <TableHead key={r.key} className="text-center whitespace-nowrap">
                    <span style={{ color: r.color }}>{r.label}</span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {NAV_STRUCTURE.map((grp) => (
                <Fragment key={grp.label}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell
                      colSpan={autresRoles.length + 2}
                      className="py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
                    >
                      {grp.label}
                    </TableCell>
                  </TableRow>
                  {grp.items.map((it) => {
                    const Icon = it.icon;
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="flex items-center gap-2 text-[13px]">
                          <Icon className="size-4 text-muted-foreground" />
                          {it.label}
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked disabled className="mx-auto" />
                        </TableCell>
                        {autresRoles.map((r) => (
                          <TableCell key={r.key} className="text-center">
                            <Checkbox
                              className="mx-auto"
                              checked={matrix[r.key]?.[it.id] !== false}
                              onCheckedChange={(v) =>
                                run(togglePermissionAction(r.key, it.id, v === true), "Permission mise à jour")
                              }
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionPanel>

      <RoleDialog
        key={`role-${roleDialog.edit?.key ?? "new"}`}
        open={roleDialog.open}
        edit={roleDialog.edit}
        onClose={() => setRoleDialog({ open: false, edit: null })}
        onSubmit={(data) => {
          run(
            roleDialog.edit
              ? majRoleAction({ key: roleDialog.edit.key, label: data.label, color: data.color })
              : creerRoleAction(data),
            roleDialog.edit ? "Rôle enregistré" : "Rôle créé",
          );
          setRoleDialog({ open: false, edit: null });
        }}
      />

      <UserDialog
        key={userDialog.edit?.id ?? "new"}
        open={userDialog.open}
        edit={userDialog.edit}
        onClose={() => setUserDialog({ open: false, edit: null })}
        roles={roles}
        onSubmit={(data) => {
          if (userDialog.edit) {
            run(
              updateUserAction({ userId: userDialog.edit.id, name: data.name, role: data.role, password: data.password || undefined }),
              "Utilisateur enregistré",
            );
          } else {
            run(createUserAction({ email: data.email, password: data.password, name: data.name, role: data.role }), "Utilisateur créé");
          }
          setUserDialog({ open: false, edit: null });
        }}
      />
    </>
  );
}

function UserDialog({
  open,
  edit,
  onClose,
  onSubmit,
  roles,
}: {
  open: boolean;
  edit: ManagedUser | null;
  onClose: () => void;
  onSubmit: (data: { email: string; password: string; name: string; role: string }) => void;
  roles: RoleRow[];
}) {
  const [email, setEmail] = useState(edit?.email ?? "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(edit?.name ?? "");
  const [role, setRole] = useState<string>(edit?.role ?? "analyst");

  const submit = () => {
    if (!name.trim()) return toast.error("Le nom est requis");
    if (!edit && (!email.trim() || !password)) return toast.error("Email et mot de passe requis");
    onSubmit({ email: email.trim(), password, name: name.trim(), role });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px]">Email *</Label>
            <Input type="email" value={email} disabled={!!edit} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px]">{edit ? "Nouveau mot de passe" : "Mot de passe *"}</Label>
            <Input
              type="password"
              value={password}
              placeholder={edit ? "(laisser vide = inchangé)" : ""}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-[11px]">Nom complet *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-[11px]">Rôle</Label>
            <Select value={role} onValueChange={(v) => v && setRole(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({
  open,
  edit,
  onClose,
  onSubmit,
}: {
  open: boolean;
  edit: RoleRow | null;
  onClose: () => void;
  onSubmit: (data: { key: string; label: string; color: string }) => void;
}) {
  const [key, setKey] = useState(edit?.key ?? "");
  const [label, setLabel] = useState(edit?.label ?? "");
  const [color, setColor] = useState(edit?.color ?? "#64748b");

  /* L'identifiant est immuable : il est écrit dans la matrice de permissions
   * et sur chaque compte. Le renommer casserait les deux en silence. */
  const submit = () => {
    if (!label.trim()) return toast.error("Le libellé est requis");
    if (!edit && !key.trim()) return toast.error("L'identifiant est requis");
    onSubmit({ key: key.trim().toLowerCase(), label: label.trim(), color });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit ? `Modifier le rôle « ${edit.label} »` : "Nouveau rôle"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-[11px]">Libellé affiché *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Magasin tissu" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px]">Identifiant *</Label>
            <Input
              value={key}
              disabled={!!edit}
              onChange={(e) => setKey(e.target.value)}
              placeholder="magtissu"
              className="font-mono"
            />
            <span className="text-[10px] text-muted-foreground">
              {edit ? "Non modifiable après création." : "Minuscules, chiffres et _."}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px]">Couleur du badge</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border border-input bg-card"
              />
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
            </div>
          </div>
        </div>
        {!edit && (
          <p className="text-[11px] text-muted-foreground">
            Le rôle démarre avec l&apos;accès à tous les modules sauf les paramètres. Ajustez ensuite ses droits dans
            le tableau des permissions.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
