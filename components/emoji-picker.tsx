"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAppStore } from "@/lib/store";
import {
  fetchEmojiList,
  codePointToEmoji,
  groupEmojis,
  filterEmojiGroups,
  findGroupForEmoji,
  getUniqueMainCategories,
} from "@/lib/emoji-list";
import { DEFAULT_EMOJI_CODE } from "@/lib/constants";
import type { EmojiGroup } from "@/lib/types";

const PAGE_SIZE = 300;

function tryEmoji(code: string): string | null {
  try {
    return codePointToEmoji(code);
  } catch {
    return null;
  }
}

export default function EmojiPicker() {
  const {
    emojiList,
    setEmojiList,
    emojiListLoading,
    setEmojiListLoading,
    selectedEmoji,
    setSelectedEmoji,
    selectedCategory,
    setSelectedCategory,
  } = useAppStore();

  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEmojiList()
      .then((list) => {
        setEmojiList(list);
        if (list.length > 0 && !selectedEmoji) {
          const defaultEmoji =
            list.find((e) => e.code === DEFAULT_EMOJI_CODE) ?? list[0];
          setSelectedEmoji(defaultEmoji);
        }
      })
      .catch(console.error)
      .finally(() => setEmojiListLoading(false));
  }, [setEmojiList, setEmojiListLoading, setSelectedEmoji, selectedEmoji]);

  const allGroups = useMemo(() => groupEmojis(emojiList), [emojiList]);

  const categories = useMemo(
    () => getUniqueMainCategories(emojiList),
    [emojiList]
  );

  const filteredGroups = useMemo(
    () => filterEmojiGroups(allGroups, search, selectedCategory || undefined),
    [allGroups, search, selectedCategory]
  );

  const visibleGroups = useMemo(
    () => filteredGroups.slice(0, visibleCount),
    [filteredGroups, visibleCount]
  );

  const selectedGroup = useMemo(() => {
    if (!selectedEmoji) return null;
    return findGroupForEmoji(allGroups, selectedEmoji) ?? null;
  }, [selectedEmoji, allGroups]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      setVisibleCount((prev) =>
        Math.min(prev + PAGE_SIZE, filteredGroups.length)
      );
    }
  }, [filteredGroups.length]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, selectedCategory]);

  const selectedChar = selectedEmoji ? tryEmoji(selectedEmoji.code) : null;

  const pickRandom = useCallback(() => {
    if (filteredGroups.length === 0) return;
    const group = filteredGroups[Math.floor(Math.random() * filteredGroups.length)];
    const all = [group.base, ...group.variants];
    setSelectedEmoji(all[Math.floor(Math.random() * all.length)]);
  }, [filteredGroups, setSelectedEmoji]);

  return (
    <div className="flex flex-col gap-2">
      {selectedEmoji && (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2">
          <span className="text-3xl leading-none">{selectedChar}</span>
          <div className="flex flex-col gap-0.5 overflow-hidden">
            <span className="truncate text-xs font-medium text-zinc-200">
              {selectedEmoji.name}
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              :{selectedEmoji.shortname}: · {selectedEmoji.code}
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-1.5">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <button
          onClick={pickRandom}
          title="Random emoji"
          className="flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="3" ry="3"/>
            <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          </svg>
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="grid max-h-[135px] grid-cols-8 gap-0 overflow-y-auto overflow-x-visible rounded-lg border border-zinc-700 bg-zinc-800/50 p-1.5 lg:max-h-[224px]"
      >
        {emojiListLoading ? (
          <div className="col-span-8 py-8 text-center text-sm text-zinc-500">
            Loading...
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="col-span-8 py-8 text-center text-sm text-zinc-500">
            No emojis found
          </div>
        ) : (
          visibleGroups.map((group) => (
            <GroupButton
              key={group.base.code}
              group={group}
              isSelected={
                selectedEmoji?.code === group.base.code ||
                group.variants.some(
                  (v) => v.code === selectedEmoji?.code
                )
              }
              selectedCode={selectedEmoji?.code ?? ""}
              onSelect={setSelectedEmoji}
            />
          ))
        )}
      </div>
    </div>
  );
}

function GroupButton({
  group,
  isSelected,
  selectedCode,
  onSelect,
}: {
  group: EmojiGroup;
  isSelected: boolean;
  selectedCode: string;
  onSelect: (emoji: EmojiGroup["base"]) => void;
}) {
  const char = tryEmoji(group.base.code);
  if (!char) return null;

  const hasVariants = group.variants.length > 0;
  const showVariants = isSelected && hasVariants;

  return (
    <div className="relative">
      {showVariants && (
        <VariantStrip
          group={group}
          selectedCode={selectedCode}
          onSelect={onSelect}
        />
      )}
      <button
        onClick={() => onSelect(group.base)}
        title={
          hasVariants
            ? `${group.base.name} (+${group.variants.length} variants)`
            : group.base.name
        }
        className={`relative flex aspect-square w-full items-center justify-center rounded-md text-lg transition-colors ${
          isSelected
            ? "bg-blue-600 ring-1 ring-blue-400"
            : "hover:bg-zinc-700"
        }`}
      >
        {char}
        {hasVariants && (
          <span className="absolute bottom-0 right-0 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-zinc-600 text-[6px] leading-none text-zinc-300">
            ▾
          </span>
        )}
      </button>
    </div>
  );
}

function VariantStrip({
  group,
  selectedCode,
  onSelect,
}: {
  group: EmojiGroup;
  selectedCode: string;
  onSelect: (emoji: EmojiGroup["base"]) => void;
}) {
  const allMembers = [group.base, ...group.variants].slice(0, 6);

  return (
    <div className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-lg border border-zinc-600 bg-zinc-800 p-1 shadow-lg">
      <div className="flex gap-0.5">
        {allMembers.map((emoji) => {
          const char = tryEmoji(emoji.code);
          if (!char) return null;
          const isActive = emoji.code === selectedCode;
          const qualifier = emoji.name.includes(": ")
            ? emoji.name.split(": ").slice(1).join(": ")
            : "default";
          return (
            <button
              key={emoji.code}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(emoji);
              }}
              title={qualifier}
              className={`flex-none rounded-md p-1 text-lg transition-colors ${
                isActive
                  ? "bg-blue-600 ring-1 ring-blue-400"
                  : "hover:bg-zinc-700"
              }`}
            >
              {char}
            </button>
          );
        })}
      </div>
    </div>
  );
}
