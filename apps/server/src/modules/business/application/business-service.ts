import { randomUUID } from 'node:crypto';
import { businessProfileSchema, clientInputSchema, clientSchema, serviceCategorySchema, type BusinessProfile, type Client, type ServiceCategory } from '@synectra/contracts';
import { getAppFirestore } from '../../../infrastructure/firestore';
import { isClientReferenced } from '../../invoice/application/invoice-service';

type OwnerData = { profile?: BusinessProfile; categories: ServiceCategory[]; clients: Client[] };
const owners = new Map<string, OwnerData>();
const useFirestore = process.env.FIREBASE_USE_FIRESTORE === 'true';

function data(ownerId: string) {
  let value = owners.get(ownerId);
  if (!value) {
    value = { categories: [], clients: [] };
    owners.set(ownerId, value);
  }
  return value;
}

function ownerDoc(ownerId: string) { return getAppFirestore().collection('owners').doc(ownerId); }

export class DuplicateClientNameError extends Error {
  constructor() { super('Nama klien sudah digunakan.'); }
}
function normalizedClientName(name: string) { return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('id-ID'); }
function nameExists(clients: Client[], name: string, exceptId?: string) {
  const normalized = normalizedClientName(name);
  return clients.some(client => client.id !== exceptId && normalizedClientName(client.name) === normalized);
}
function namesLock(ownerId: string) { return ownerDoc(ownerId).collection('internal').doc('clients_lock'); }


export async function getProfile(ownerId: string) {
  if (!useFirestore) return data(ownerId).profile ?? null;
  const snapshot = await ownerDoc(ownerId).get();
  const profile = snapshot.data()?.profile;
  return profile == null ? null : businessProfileSchema.parse(profile);
}
export async function saveProfile(ownerId: string, input: unknown) {
  const profile = businessProfileSchema.parse(input);
  if (useFirestore) await ownerDoc(ownerId).set({ profile }, { merge: true });
  else data(ownerId).profile = profile;
  return profile;
}
export async function listCategories(ownerId: string) {
  if (!useFirestore) return data(ownerId).categories;
  const snapshot = await ownerDoc(ownerId).collection('categories').get();
  return snapshot.docs.map((doc) => serviceCategorySchema.parse(doc.data()));
}
export async function createCategory(ownerId: string, input: unknown) {
  const category = serviceCategorySchema.parse({ id: randomUUID(), ...(input as object) });
  if (useFirestore) await ownerDoc(ownerId).collection('categories').doc(category.id).set(category);
  else data(ownerId).categories.push(category);
  return category;
}
export async function listClients(ownerId: string, search?: string) {
  const clients = useFirestore
    ? (await ownerDoc(ownerId).collection('clients').get()).docs.map((doc) => clientSchema.parse(doc.data()))
    : data(ownerId).clients;
  const query = search?.trim().toLocaleLowerCase();
  return query ? clients.filter((client) => `${client.name} ${client.phone} ${client.email ?? ''}`.toLocaleLowerCase().includes(query)) : clients;
}
export async function createClient(ownerId: string, input: unknown) {
  const client = clientSchema.parse({ id: randomUUID(), ...clientInputSchema.parse(input) });
  if (useFirestore) {
    const root = ownerDoc(ownerId), lock = namesLock(ownerId);
    await getAppFirestore().runTransaction(async tx => {
      const [lockSnapshot, existing] = await Promise.all([tx.get(lock), tx.get(root.collection('clients'))]);
      if (nameExists(existing.docs.map(doc => clientSchema.parse(doc.data())), client.name)) throw new DuplicateClientNameError();
      tx.set(lock, { revision: (lockSnapshot.data()?.revision ?? 0) + 1 });
      tx.create(root.collection('clients').doc(client.id), client);
    });
  } else {
    const owner = data(ownerId);
    if (nameExists(owner.clients, client.name)) throw new DuplicateClientNameError();
    owner.clients.push(client);
  }
  return client;
}
export async function updateClient(ownerId: string, id: string, input: unknown) {
  const client = clientSchema.parse({ id, ...clientInputSchema.parse(input) });
  if (useFirestore) {
    const root = ownerDoc(ownerId), ref = root.collection('clients').doc(id), lock = namesLock(ownerId);
    return getAppFirestore().runTransaction(async tx => {
      const [lockSnapshot, existing, all] = await Promise.all([tx.get(lock), tx.get(ref), tx.get(root.collection('clients'))]);
      if (!existing.exists) return null;
      const current = clientSchema.parse(existing.data());
      if (normalizedClientName(current.name) !== normalizedClientName(client.name) && nameExists(all.docs.map(doc => clientSchema.parse(doc.data())), client.name, id)) throw new DuplicateClientNameError();
      tx.set(lock, { revision: (lockSnapshot.data()?.revision ?? 0) + 1 });
      tx.set(ref, client);
      return client;
    });
  }
  const owner = data(ownerId);
  const index = owner.clients.findIndex(current => current.id === id);
  if (index < 0) return null;
  if (normalizedClientName(owner.clients[index]!.name) !== normalizedClientName(client.name) && nameExists(owner.clients, client.name, id)) throw new DuplicateClientNameError();
  owner.clients[index] = client;
  return client;
}
export async function getClient(ownerId: string, id: string) {
  if (useFirestore) {
    const snapshot = await ownerDoc(ownerId).collection('clients').doc(id).get();
    return snapshot.exists ? clientSchema.parse(snapshot.data()) : null;
  }
  return data(ownerId).clients.find((client) => client.id === id) ?? null;
}
export async function deleteClient(ownerId: string, id: string) {
  if (useFirestore) {
    const root = ownerDoc(ownerId), ref = root.collection('clients').doc(id), lock = namesLock(ownerId);
    return getAppFirestore().runTransaction(async tx => {
      const [lockSnapshot, existing, references] = await Promise.all([tx.get(lock), tx.get(ref), tx.get(root.collection('invoices').where('clientId', '==', id).limit(1))]);
      if (!existing.exists) return false;
      if (!references.empty) throw new Error('Client is referenced by invoices');
      tx.delete(ref);
      tx.set(lock, { revision: (lockSnapshot.data()?.revision ?? 0) + 1 });
      return true;
    });
  }
  if (await isClientReferenced(ownerId, id)) throw new Error('Client is referenced by invoices');
  const owner = data(ownerId);
  const index = owner.clients.findIndex(client => client.id === id);
  if (index < 0) return false;
  owner.clients.splice(index, 1);
  return true;
}
export function resetBusinessDataForTests() { owners.clear(); }
