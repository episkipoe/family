import fs from 'node:fs/promises';
import path from 'node:path';
import { Redis } from '@upstash/redis';

const DATA_DIR = path.join(process.cwd(), 'data');
const useRedis = Boolean(process.env.USE_REDIS);

let redis = null;
if (useRedis) {
  if (!process.env.REDIS_URL || !process.env.REDIS_TOKEN) {
    throw new Error('USE_REDIS is set, but REDIS_URL or REDIS_TOKEN is missing.');
  }

  redis = new Redis({
    url: process.env.REDIS_URL,
    token: process.env.REDIS_TOKEN
  });
}

const seedFiles = {
  proposals: 'proposals.json',
  votes: 'votes.json',
  comments: 'comments.json',
  recipes: 'recipes.json',
  mealPlans: 'mealPlans.json',
  familyTree: 'family-tree.json'
};

const redisKey = (name) => `family-planner:${name}`;
const filePath = (name) => path.join(DATA_DIR, seedFiles[name]);

function newestByUpdatedAt(localItem, remoteItem) {
  const localTime = Date.parse(localItem?.updatedAt || localItem?.createdAt || '');
  const remoteTime = Date.parse(remoteItem?.updatedAt || remoteItem?.createdAt || '');

  if (Number.isFinite(localTime) && Number.isFinite(remoteTime)) {
    return remoteTime > localTime ? remoteItem : localItem;
  }

  return { ...localItem, ...remoteItem };
}

function mergeArrayById(localValue, remoteValue) {
  const mergedById = new Map();

  for (const item of localValue) {
    if (item?.id !== null && item?.id !== undefined) mergedById.set(item.id, item);
  }

  for (const remoteItem of remoteValue) {
    if (remoteItem?.id === null || remoteItem?.id === undefined) continue;
    const localItem = mergedById.get(remoteItem.id);
    mergedById.set(remoteItem.id, localItem ? newestByUpdatedAt(localItem, remoteItem) : remoteItem);
  }

  return [...mergedById.values()];
}

function mergeNestedObject(localValue, remoteValue) {
  const merged = { ...localValue };

  for (const [key, remoteEntry] of Object.entries(remoteValue)) {
    const localEntry = merged[key];

    if (Array.isArray(localEntry) && Array.isArray(remoteEntry)) {
      merged[key] = mergeArrayById(localEntry, remoteEntry);
    } else if (isPlainObject(localEntry) && isPlainObject(remoteEntry)) {
      merged[key] = { ...localEntry, ...remoteEntry };
    } else if (localEntry === undefined) {
      merged[key] = remoteEntry;
    } else {
      merged[key] = remoteEntry;
    }
  }

  return merged;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeData(localValue, remoteValue) {
  if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
    return mergeArrayById(localValue, remoteValue);
  }

  if (isPlainObject(localValue) && isPlainObject(remoteValue)) {
    return mergeNestedObject(localValue, remoteValue);
  }

  return remoteValue ?? localValue;
}

async function readJsonFile(name) {
  const raw = await fs.readFile(filePath(name), 'utf8');
  return JSON.parse(raw);
}

async function writeJsonFile(name, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath(name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function mergeRedisWithLocal(name) {
  const key = redisKey(name);
  const localValue = await readJsonFile(name);
  const remoteValue = await redis.get(key);

  if (remoteValue === null || remoteValue === undefined) {
    await redis.set(key, localValue);
    return;
  }

  await redis.set(key, mergeData(localValue, remoteValue));
}

export async function initStorage() {
  if (!useRedis) return;
  await Promise.all(Object.keys(seedFiles).map(mergeRedisWithLocal));
}

export async function getData(name) {
  if (useRedis) {
    const value = await redis.get(redisKey(name));
    if (value === null || value === undefined) return await readJsonFile(name);
    return value;
  }
  return await readJsonFile(name);
}

export async function setData(name, value) {
  if (useRedis) {
    await redis.set(redisKey(name), value);
    return;
  }
  await writeJsonFile(name, value);
}

export function storageMode() {
  return useRedis ? 'redis' : 'local-json';
}
