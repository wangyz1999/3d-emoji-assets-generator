"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { fetchEmojiList } from "@/lib/emoji-list";
import {
  CATEGORIES,
  categorizeEmoji,
  getEmojiSortKey,
} from "@/lib/emoji-categories";
import { DEFAULT_EMOJI_CODE, TWEMOJI_BASE_URL } from "@/lib/constants";
import type { EmojiEntry } from "@/lib/types";

const PAGE_SIZE = 200;

interface CategorizedEmojis {
  category: string;
  label: string;
  emojis: EmojiEntry[];
}

export default function EmojiPicker() {
  const {
    emojiList,
    setEmojiList,
    emojiListLoading,
    setEmojiListLoading,
    selectedEmoji,
    setSelectedEmoji,
  } = useAppStore();

  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetchEmojiList()
      .then((list) => {
        const sorted = [...list].sort((a, b) =>
          getEmojiSortKey(a.code).localeCompare(getEmojiSortKey(b.code))
        );
        setEmojiList(sorted);
        if (sorted.length > 0 && !selectedEmoji) {
          const defaultEmoji =
            sorted.find((e) => e.code === DEFAULT_EMOJI_CODE) ?? sorted[0];
          setSelectedEmoji(defaultEmoji);
        }
      })
      .catch(console.error)
      .finally(() => setEmojiListLoading(false));
  }, [setEmojiList, setEmojiListLoading, setSelectedEmoji, selectedEmoji]);

  const filtered = useMemo(() => {
    if (!search.trim()) return emojiList;
    const lower = search.toLowerCase();
    return emojiList.filter((e) => e.code.includes(lower));
  }, [emojiList, search]);

  const categorized = useMemo((): CategorizedEmojis[] => {
    const groups: Record<string, EmojiEntry[]> = {};
    for (const emoji of filtered) {
      const cat = categorizeEmoji(emoji.code);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(emoji);
    }
    return CATEGORIES.filter((c) => groups[c.id]?.length).map((c) => ({
      category: c.id,
      label: c.label,
      emojis: groups[c.id],
    }));
  }, [filtered]);

  const flatList = useMemo(() => {
    type Item =
      | { type: "header"; category: string; label: string }
      | { type: "emoji"; emoji: EmojiEntry };
    const items: Item[] = [];
    for (const group of categorized) {
      items.push({
        type: "header",
        category: group.category,
        label: group.label,
      });
      for (const emoji of group.emojis) {
        items.push({ type: "emoji", emoji });
      }
    }
    return items;
  }, [categorized]);

  const visible = useMemo(
    () => flatList.slice(0, visibleCount),
    [flatList, visibleCount]
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, flatList.length));
    }
  }, [flatList.length]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search]);

  const scrollToCategory = (catId: string) => {
    setActiveCategory(catId);
    const el = categoryRefs.current[catId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Make sure enough items are visible
    const catIdx = flatList.findIndex(
      (item) => item.type === "header" && item.category === catId
    );
    if (catIdx >= 0 && catIdx >= visibleCount) {
      setVisibleCount(catIdx + PAGE_SIZE);
    }
  };

  const availableCategories = useMemo(
    () => categorized.map((g) => g.category),
    [categorized]
  );

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Emoji
      </label>
      <input
        type="text"
        placeholder="Search by code (e.g. 1f602)..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      {!search && (
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.filter((c) => availableCategories.includes(c.id)).map(
            (cat) => (
              <button
                key={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className={`rounded-md px-2 py-0.5 text-[10px] transition-colors ${
                  activeCategory === cat.id
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {cat.label}
              </button>
            )
          )}
        </div>
      )}

      <div className="text-xs text-zinc-500">
        {filtered.length.toLocaleString()} emojis
        {search && ` matching "${search}"`}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="max-h-[320px] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800/50 p-2"
      >
        {emojiListLoading ? (
          <div className="py-8 text-center text-sm text-zinc-500">
            Loading emojis...
          </div>
        ) : (
          <div>
            {visible.map((item, idx) => {
              if (item.type === "header") {
                return (
                  <div
                    key={`hdr-${item.category}`}
                    ref={(el) => {
                      categoryRefs.current[item.category] = el;
                    }}
                    className="sticky top-0 z-10 bg-zinc-800/90 px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 backdrop-blur-sm"
                  >
                    {item.label}
                  </div>
                );
              }
              return (
                <EmojiButton
                  key={item.emoji.code}
                  emoji={item.emoji}
                  isSelected={selectedEmoji?.code === item.emoji.code}
                  onClick={() => setSelectedEmoji(item.emoji)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmojiButton({
  emoji,
  isSelected,
  onClick,
}: {
  emoji: EmojiEntry;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={emoji.code}
      className={`inline-flex aspect-square w-[calc(12.5%-2px)] items-center justify-center rounded-md transition-colors hover:bg-zinc-600 ${
        isSelected ? "bg-blue-600 ring-2 ring-blue-400" : "bg-zinc-700/50"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${TWEMOJI_BASE_URL}/${emoji.code}.svg`}
        alt={emoji.code}
        width={22}
        height={22}
        loading="lazy"
        className="pointer-events-none"
      />
    </button>
  );
}
