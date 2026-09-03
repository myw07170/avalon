import type { Locale } from "@/i18n/locale";
import {
  EngineError,
  createRng,
  isSupportedPlayerCount,
  shuffle,
  type Persona,
  type PlayerId,
} from "@/lib/game";
import rawCatalog from "@/data/persona-catalog.json";
import {
  personaCatalogFileSchema,
  type PersonaCatalogEntry,
} from "./persona-catalog-schema";

export type PersonaSelectionMap = Readonly<Partial<Record<PlayerId, string>>>;

const parsedCatalog = personaCatalogFileSchema.parse(rawCatalog);
export const PERSONA_CATALOG: readonly PersonaCatalogEntry[] = parsedCatalog.personas;

const CATALOG_BY_ID = new Map(PERSONA_CATALOG.map((entry) => [entry.id, entry]));
const PERSONA_RNG_SALT = 0x70657273;

export function personaCatalogEntry(id: string): PersonaCatalogEntry | undefined {
  return CATALOG_BY_ID.get(id);
}

export function localizedPersona(entry: PersonaCatalogEntry, locale: Locale): Persona {
  return entry[locale];
}

export interface AssignPersonasOptions {
  playerCount: number;
  humanSeat: PlayerId | null;
  selections?: PersonaSelectionMap;
  locale: Locale;
  /** 发牌 seed 只作为输入；函数内部派生独立 RNG，不会推进引擎的随机源。 */
  seed: number;
  catalog?: readonly PersonaCatalogEntry[];
}

/**
 * 按非人类座位顺序产出完整人设。手选优先，其余从未使用的人设中无重复补齐。
 */
export function assignPersonas(options: AssignPersonasOptions): Persona[] {
  const { playerCount, humanSeat, locale, seed } = options;
  if (!isSupportedPlayerCount(playerCount)) {
    throw new EngineError(`不支持 ${playerCount} 人局`, "CONFIG_INVALID", { playerCount });
  }
  if (
    humanSeat !== null &&
    (!Number.isInteger(humanSeat) || humanSeat < 0 || humanSeat >= playerCount)
  ) {
    throw new EngineError(`人类座位 ${humanSeat} 越界`, "CONFIG_INVALID", {
      humanSeat,
      playerCount,
    });
  }
  const catalog = options.catalog ?? PERSONA_CATALOG;
  const selections = options.selections ?? {};
  const aiSeats = Array.from({ length: playerCount }, (_, seat) => seat).filter(
    (seat) => seat !== humanSeat,
  );
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  const chosen = new Map<PlayerId, PersonaCatalogEntry>();
  const usedIds = new Set<string>();

  for (const [rawSeat, id] of Object.entries(selections)) {
    if (id === undefined) continue;
    const seat = Number(rawSeat);
    if (!Number.isInteger(seat) || !aiSeats.includes(seat)) {
      throw new EngineError(`不能给非 AI 座位 ${rawSeat} 指派人设`, "CONFIG_INVALID", {
        seat,
      });
    }
    const entry = byId.get(id);
    if (!entry) {
      throw new EngineError(`人设库中不存在「${id}」`, "CONFIG_INVALID", { id });
    }
    if (usedIds.has(id)) {
      throw new EngineError(`人设「${id}」被重复指派`, "CONFIG_INVALID", { id });
    }
    usedIds.add(id);
    chosen.set(seat, entry);
  }

  const missingSeats = aiSeats.filter((seat) => !chosen.has(seat));
  const available = catalog.filter((entry) => !usedIds.has(entry.id));
  if (available.length < missingSeats.length) {
    throw new EngineError(
      `人设库只剩 ${available.length} 份，需要为 ${missingSeats.length} 个 AI 座位补齐`,
      "CONFIG_INVALID",
      { available: available.length, required: missingSeats.length },
    );
  }

  const personaRng = createRng((seed ^ PERSONA_RNG_SALT) >>> 0);
  const randomEntries = shuffle(available, personaRng).slice(0, missingSeats.length);
  missingSeats.forEach((seat, index) => {
    const entry = randomEntries[index];
    if (entry) chosen.set(seat, entry);
  });

  return aiSeats.map((seat) => {
    const entry = chosen.get(seat);
    if (!entry) {
      throw new EngineError(`AI 座位 ${seat} 没有可用人设`, "INTERNAL", { seat });
    }
    return localizedPersona(entry, locale);
  });
}

export function filterPersonaCatalog(
  catalog: readonly PersonaCatalogEntry[],
  locale: Locale,
  query: string,
): PersonaCatalogEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...catalog];
  return catalog.filter((entry) => {
    const persona = localizedPersona(entry, locale);
    return [
      persona.name,
      ...persona.traits,
      persona.speechStyle,
      persona.mind?.reasoningStyle ?? "",
    ]
      .join("\n")
      .toLocaleLowerCase()
      .includes(needle);
  });
}
