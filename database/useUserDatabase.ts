import { Q } from '@nozbe/watermelondb';

import type { User as UserData } from './types/User';
import { database } from './watermelon/database';
import UserModel from './watermelon/models/User';

type UserInput = UserData & { email?: string | null };
type LegacyUser = UserData & { email?: string | null };

function toLegacyId(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function toOptionalLegacyNumber(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toUserData(user: UserModel): UserData {
  const legacyUser: LegacyUser = {
    id: toLegacyId(user.id),
    name: user.name,
    email: user.email,
    establishmentId: toOptionalLegacyNumber(user.establishmentId),
    establishmentName: user.establishmentName,
    role: user.role,
  };

  return legacyUser;
}

function userCollection() {
  return database.get<UserModel>('users');
}

async function findUser(id: number): Promise<UserModel | null> {
  const [user] = await userCollection().query(Q.where('id', String(id))).fetch();
  return user ?? null;
}

async function nextNumericId(): Promise<string> {
  const users = await userCollection().query().fetch();
  const ids = users
    .map((user) => Number(user.id))
    .filter((id) => Number.isSafeInteger(id) && id >= 0);
  const nextId = Math.max(0, ...ids) + 1;
  return String(nextId);
}

function establishmentId(value: number | null | undefined): string {
  return value == null ? '' : String(value);
}

export function useUserDatabase() {
  async function create(data: Omit<UserData, 'id'>) {
    const input = data as UserInput;
    const id = await database.write(async () => {
      const nextId = await nextNumericId();
      const preparedUser = userCollection().prepareCreateFromDirtyRaw({
        id: nextId,
        _status: 'created',
        _changed: '',
        name: input.name,
        email: input.email ?? null,
        establishment_id: establishmentId(input.establishmentId),
        establishment_name: input.establishmentName ?? null,
        role: input.role ?? 'EMPLOYEE',
      });

      await database.batch(preparedUser);
      return nextId;
    });

    return { insertedRowId: Number(id) };
  }

  async function show(id: number) {
    const user = await findUser(id);
    return user ? toUserData(user) : null;
  }

  async function update(data: UserData) {
    const user = await findUser(data.id);

    if (!user) return;

    await database.write(() => user.update((record) => {
      record.name = data.name;
      record.establishmentId = establishmentId(data.establishmentId);
      record.establishmentName = data.establishmentName ?? null;
    }));
  }

  async function list() {
    const users = await userCollection().query(Q.sortBy('name', Q.asc)).fetch();
    return users.map(toUserData);
  }

  return { create, show, update, list };
}
