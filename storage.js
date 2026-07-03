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
  mealPlans: 'mealPlans.json'
};

const redisKey = (name) => `family-planner:${name}`;
const filePath = (name) => path.join(DATA_DIR, seedFiles[name]);

async function readJsonFile(name) {
  const raw = await fs.readFile(filePath(name), 'utf8');
  return JSON.parse(raw);
}

async function writeJsonFile(name, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath(name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function seedRedisIfEmpty(name) {
  const key = redisKey(name);
  const exists = await redis.exists(key);
  if (!exists) {
    const seed = await readJsonFile(name);
    await redis.set(key, seed);
  }
}

export async function initStorage() {
  if (!useRedis) return;
  await Promise.all(Object.keys(seedFiles).map(seedRedisIfEmpty));
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
