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

      {selectedGroup && selectedGroup.variants.length > 0 && (
        <VariantStrip
          group={selectedGroup}
          selectedCode={selectedEmoji?.code ?? ""}
          onSelect={setSelectedEmoji}
        />
      )}

      <input
        type="text"
        placeholder="Search by name, shortname, or code..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <select
        value={selectedCategory}
        onChange={(e) => setSelectedCategory(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">All Categories</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </select>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="grid max-h-[224px] grid-cols-8 gap-0.5 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800/50 p-1.5"
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
  onSelect,
}: {
  group: EmojiGroup;
  isSelected: boolean;
  onSelect: (emoji: EmojiGroup["base"]) => void;
}) {
  const char = tryEmoji(group.base.code);
  if (!char) return null;

  const hasVariants = group.variants.length > 0;

  return (
    <button
      onClick={() => onSelect(group.base)}
      title={
        hasVariants
          ? `${group.base.name} (+${group.variants.length} variants)`
          : group.base.name
      }
      className={`relative flex aspect-square items-center justify-center rounded-md text-lg transition-colors hover:bg-zinc-600 ${
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
  const allMembers = [group.base, ...group.variants];

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-1.5">
      <div className="mb-1 text-[10px] text-zinc-500">
        Variants ({allMembers.length})
      </div>
      <div className="flex gap-0.5 overflow-x-auto">
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
              onClick={() => onSelect(emoji)}
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
