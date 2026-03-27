"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { fetchEmojiList, codePointToEmoji } from "@/lib/emoji-list";
import { DEFAULT_EMOJI_CODE } from "@/lib/constants";

const PAGE_SIZE = 300;

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

  const filtered = useMemo(() => {
    if (!search.trim()) return emojiList;
    const lower = search.toLowerCase();
    return emojiList.filter((e) => {
      if (e.code.includes(lower)) return true;
      try {
        const char = codePointToEmoji(e.code);
        if (char === search) return true;
      } catch {
        /* skip */
      }
      return false;
    });
  }, [emojiList, search]);

  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length));
    }
  }, [filtered.length]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search]);

  const selectedChar = selectedEmoji
    ? codePointToEmoji(selectedEmoji.code)
    : null;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Emoji
      </label>

      {selectedEmoji && (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2">
          <span className="text-3xl leading-none">{selectedChar}</span>
          <span className="font-mono text-xs text-zinc-500">
            {selectedEmoji.code}
          </span>
        </div>
      )}

      <input
        type="text"
        placeholder="Search emoji or paste one..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <div className="text-[10px] text-zinc-600">
        {filtered.length.toLocaleString()} emojis
        {search && ` matching "${search}"`}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="grid max-h-[280px] grid-cols-8 gap-0.5 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800/50 p-1.5"
      >
        {emojiListLoading ? (
          <div className="col-span-8 py-8 text-center text-sm text-zinc-500">
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-8 py-8 text-center text-sm text-zinc-500">
            No emojis found
          </div>
        ) : (
          visible.map((emoji) => {
            const isSelected = selectedEmoji?.code === emoji.code;
            let char: string;
            try {
              char = codePointToEmoji(emoji.code);
            } catch {
              return null;
            }
            return (
              <button
                key={emoji.code}
                onClick={() => setSelectedEmoji(emoji)}
                title={emoji.code}
                className={`flex aspect-square items-center justify-center rounded-md text-lg transition-colors hover:bg-zinc-600 ${
                  isSelected
                    ? "bg-blue-600 ring-1 ring-blue-400"
                    : "hover:bg-zinc-700"
                }`}
              >
                {char}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
