import { supabase } from "./supabase";

// Types pour les données
export interface Client {
  id: number;
  nom: string;
  prenom: string | null;
  telephone: string;
  email: string | null;
  created_at: string;
}

export interface RendezVous {
  id: number;
  client_id: number;
  service_id: number | null;
  service_nom: string;
  date: string;
  heure: string;
  statut: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============= CLIENTS =============

export async function createClient(client: {
  nom: string;
  prenom?: string;
  telephone: string;
  email?: string;
}): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      nom: client.nom,
      prenom: client.prenom || null,
      telephone: client.telephone,
      email: client.email || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Erreur création client: ${error.message}`);
  }

  return data;
}

export async function findClientByPhone(
  telephone: string
): Promise<Client | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("telephone", telephone)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erreur recherche client: ${error.message}`);
  }

  return data;
}

export async function getClientById(id: number): Promise<Client | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Erreur récupération client: ${error.message}`);
  }

  return data;
}

export async function getAllclients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erreur récupération clients: ${error.message}`);
  }

  return data || [];
}

// ============= RENDEZ-VOUS =============

export async function createRendezVous(rdv: {
  client_id: number;
  service_id?: number;
  service_nom: string;
  date: string;
  heure: string;
  statut?: string;
  notes?: string;
  adresse_client?: string;
  // Nouveaux champs tarification
  duree_minutes?: number;
  prix_service?: number; // en centimes
  distance_km?: number;
  duree_trajet_minutes?: number;
  frais_deplacement?: number; // en centimes
  prix_total?: number; // en centimes
  telephone?: string;
  created_via?: string; // 'web', 'whatsapp', 'admin'
}): Promise<RendezVous> {
  const { data, error } = await supabase
    .from("reservations")
    .insert({
      client_id: rdv.client_id,
      service_id: rdv.service_id || null,
      service_nom: rdv.service_nom,
      date: rdv.date,
      heure: rdv.heure,
      statut: rdv.statut || "demande",
      notes: rdv.notes || null,
      adresse_client: rdv.adresse_client || null,
      // Nouveaux champs
      duree_minutes: rdv.duree_minutes || null,
      prix_service: rdv.prix_service || null,
      distance_km: rdv.distance_km || null,
      duree_trajet_minutes: rdv.duree_trajet_minutes || null,
      frais_deplacement: rdv.frais_deplacement || null,
      prix_total: rdv.prix_total || null,
      telephone: rdv.telephone || null,
      created_via: rdv.created_via || "web",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Erreur création RDV: ${error.message}`);
  }

  return data;
}

export async function getRendezVousById(id: number): Promise<RendezVous | null> {
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Erreur récupération RDV: ${error.message}`);
  }

  return data;
}

export async function getRendezVousByDate(date: string): Promise<RendezVous[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("date", date)
    .order("heure", { ascending: true });

  if (error) {
    throw new Error(`Erreur récupération RDV par date: ${error.message}`);
  }

  return data || [];
}

export async function getRendezVousByDateWithClients(date: string) {
  const { data, error } = await supabase
    .from("reservations")
    .select(`
      id,
      date,
      heure,
      service_nom,
      statut,
      notes,
      created_at,
      clients (
        id,
        nom,
        prenom,
        telephone,
        email
      )
    `)
    .eq("date", date)
    .order("heure", { ascending: true });

  if (error) {
    throw new Error(`Erreur récupération RDV avec clients: ${error.message}`);
  }

  // Reformater pour correspondre à l'ancien format
  return (data || []).map((rdv: any) => ({
    id: rdv.id,
    date: rdv.date,
    heure: rdv.heure,
    serviceNom: rdv.service_nom,
    statut: rdv.statut,
    notes: rdv.notes,
    createdAt: rdv.created_at,
    client: rdv.clients,
  }));
}

export async function getAllRendezVous(): Promise<RendezVous[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .order("date", { ascending: false })
    .order("heure", { ascending: true });

  if (error) {
    throw new Error(`Erreur récupération tous les RDV: ${error.message}`);
  }

  return data || [];
}

// Convertir "HH:MM" en minutes depuis minuit
function timeToMinutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

// Convertir minutes en "HH:MM"
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

// Durées par défaut des services (en minutes)
const SERVICE_DURATIONS: Record<string, number> = {
  "tresses classiques": 180,
  "tresses collées": 240,
  "locks": 120,
  "soin hydratant": 60,
  "brushing afro": 45,
  "shampoing": 30,
  "nattes": 150,
  "twist": 180,
};

// Récupérer la durée d'un service
export function getServiceDuration(serviceNom: string): number {
  const normalizedName = serviceNom.toLowerCase().trim();

  // Chercher une correspondance exacte ou partielle
  for (const [key, duration] of Object.entries(SERVICE_DURATIONS)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return duration;
    }
  }

  // Durée par défaut si service non trouvé (60 minutes)
  return 60;
}

export interface AvailabilityResult {
  available: boolean;
  message: string;
  conflictWith?: {
    heure: string;
    heureFin: string;
    service: string;
  };
}

export async function checkAvailability(
  date: string,
  heure: string,
  dureeDemandee: number = 60
): Promise<AvailabilityResult> {
  // Récupérer tous les RDV de cette date (non annulés)
  const { data, error } = await supabase
    .from("reservations")
    .select("id, heure, service_nom")
    .eq("date", date)
    .neq("statut", "annule");

  if (error) {
    throw new Error(`Erreur vérification disponibilité: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return { available: true, message: "Ce créneau est disponible" };
  }

  const debutDemande = timeToMinutes(heure);
  const finDemande = debutDemande + dureeDemandee;

  // Vérifier les chevauchements avec chaque RDV existant
  for (const rdv of data) {
    const debutExistant = timeToMinutes(rdv.heure);
    const dureeExistante = getServiceDuration(rdv.service_nom);
    const finExistant = debutExistant + dureeExistante;

    // Vérifier si [debutDemande, finDemande] chevauche [debutExistant, finExistant]
    // Chevauchement si : debutDemande < finExistant ET finDemande > debutExistant
    if (debutDemande < finExistant && finDemande > debutExistant) {
      return {
        available: false,
        message: `Ce créneau chevauche un autre rendez-vous (${rdv.heure} - ${minutesToTime(finExistant)}, ${rdv.service_nom})`,
        conflictWith: {
          heure: rdv.heure,
          heureFin: minutesToTime(finExistant),
          service: rdv.service_nom,
        },
      };
    }
  }

  return { available: true, message: "Ce créneau est disponible" };
}

export async function updateRendezVousStatus(
  id: number,
  statut: string
): Promise<RendezVous | null> {
  const { data, error } = await supabase
    .from("reservations")
    .update({ statut, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Erreur mise à jour statut: ${error.message}`);
  }

  return data;
}

export async function deleteRendezVous(id: number): Promise<boolean> {
  const { error } = await supabase
    .from("reservations")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Erreur suppression RDV: ${error.message}`);
  }

  return true;
}

// ============= RENDEZ-VOUS AVEC INFOS CLIENT =============

export async function getRendezVousWithClient(id: number) {
  const { data, error } = await supabase
    .from("reservations")
    .select(`
      id,
      date,
      heure,
      service_nom,
      statut,
      notes,
      created_at,
      clients (
        id,
        nom,
        prenom,
        telephone,
        email
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Erreur récupération RDV avec client: ${error.message}`);
  }

  if (!data) return null;

  // Reformater pour correspondre à l'ancien format
  return {
    id: data.id,
    date: data.date,
    heure: data.heure,
    serviceNom: data.service_nom,
    statut: data.statut,
    notes: data.notes,
    createdAt: data.created_at,
    client: (data as any).clients,
  };
}

export async function getAllRendezVousWithClients() {
  // 1. Récupérer tous les rendez-vous
  const { data: rdvData, error: rdvError } = await supabase
    .from("reservations")
    .select("*")
    .order("date", { ascending: false })
    .order("heure", { ascending: true });

  if (rdvError) {
    throw new Error(`Erreur récupération RDV: ${rdvError.message}`);
  }

  if (!rdvData || rdvData.length === 0) {
    return [];
  }

  // 2. Récupérer tous les clients en une seule requête
  const clientIds = [...new Set(rdvData.map((rdv: any) => rdv.client_id).filter(Boolean))];

  const { data: clientsData, error: clientsError } = await supabase
    .from("clients")
    .select("*")
    .in("id", clientIds);

  if (clientsError) {
    throw new Error(`Erreur récupération clients: ${clientsError.message}`);
  }

  // 3. Créer un map des clients pour accès rapide
  const clientsMap = new Map<number, any>();
  (clientsData || []).forEach((client: any) => {
    clientsMap.set(client.id, client);
  });

  // 4. Combiner les données
  return rdvData.map((rdv: any) => ({
    id: rdv.id,
    date: rdv.date,
    heure: rdv.heure,
    serviceNom: rdv.service_nom,
    statut: rdv.statut,
    notes: rdv.notes,
    createdAt: rdv.created_at,
    client: rdv.client_id ? clientsMap.get(rdv.client_id) || null : null,
  }));
}
