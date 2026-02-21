"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useCallback } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatStore } from "@/components/ChatProvider";

interface ChatProps {
  toolId?: string;
  suggestions?: string[];
  header?: string;
  mode?: "general" | "planner";
}

/** Fix malformed markdown lists where the bullet and content are on separate lines */
function normalizeMarkdown(text: string): string {
  return text
    // Fix: "- \n\nContent" or "* \n\nContent" → "- Content"
    .replace(/^([*-])\s*\n\n+/gm, "$1 ")
    // Fix: "- \nContent" → "- Content"
    .replace(/^([*-])\s*\n(?!\n)/gm, "$1 ");
}

export default function Chat({ toolId, suggestions, header, mode }: ChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userScrolledUp = useRef(false);

  const conversationId = toolId ? `tool:${toolId}` : mode === "planner" ? "planner" : "general";
  const { getMessages, setMessages: storeMessages, clearConversation } = useChatStore();
  const initialMessages = getMessages(conversationId);

  const { messages, sendMessage, stop, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: toolId ? { toolId } : mode === "planner" ? { mode: "planner" } : undefined,
    }),
    messages: initialMessages.length > 0 ? initialMessages : undefined,
  });

  // Sync messages to localStorage store
  const prevLengthRef = useRef(initialMessages.length);
  useEffect(() => {
    if (messages.length !== prevLengthRef.current && messages.length > 0) {
      storeMessages(conversationId, messages);
      prevLengthRef.current = messages.length;
    }
  }, [messages, conversationId, storeMessages]);

  const isLoading = status === "streaming" || status === "submitted";

  // Track if user has scrolled up
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distanceFromBottom > 100;
  }, []);

  // Smart auto-scroll: only scroll if user is near the bottom
  useEffect(() => {
    if (scrollRef.current && !userScrolledUp.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (text: string) => {
    if (!text.trim() || isLoading) return;
    sendMessage({ text: text.trim() });
    setInput("");
    userScrolledUp.current = false; // Reset on new message
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header && (
        <div className="flex items-center justify-between border-b border-card-border px-4 py-3">
          <h2 className="font-semibold text-sm">{header}</h2>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearConversation(conversationId);
                window.location.reload();
              }}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              New chat
            </button>
          )}
        </div>
      )}
      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto space-y-4 p-4"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.length === 0 && suggestions && (
          <div className="space-y-2">
            <p className="text-sm text-muted">Try asking:</p>
            {suggestions.map((q) => (
              <button
                key={q}
                onClick={() => handleSubmit(q)}
                aria-label={`Ask: ${q}`}
                className="block w-full rounded-lg border border-card-border px-3 py-2.5 text-left text-sm hover:bg-muted-bg transition-colors focus:outline-none focus:ring-2 focus:ring-cornell-red"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] break-words rounded-xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-cornell-red text-white"
                  : "bg-accent-teal/10 text-foreground"
              }`}
            >
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  if (m.role === "user") {
                    return <span key={i}>{part.text}</span>;
                  }
                  return (
                    <div key={i} className="chat-markdown">
                      <Markdown remarkPlugins={[remarkGfm]}>
                        {normalizeMarkdown(part.text)}
                      </Markdown>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-muted-bg px-4 py-2.5 text-sm text-muted">
              Thinking...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
            Something went wrong: {error.message || "Unknown error"}
          </div>
        )}
      </div>

      {/* Collapsed suggestions after conversation starts */}
      {messages.length > 0 && suggestions && !isLoading && (
        <div className="flex gap-2 overflow-x-auto border-t border-card-border px-3 py-2">
          {suggestions.map((q) => (
            <button
              key={q}
              onClick={() => handleSubmit(q)}
              className="shrink-0 rounded-full border border-card-border px-3 py-1.5 text-xs text-muted hover:bg-muted-bg hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-cornell-red"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(input);
        }}
        className="border-t border-card-border p-3"
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isLoading ? "Waiting for response..." : "Ask a question..."}
            className="flex-1 rounded-lg border border-card-border bg-card-bg px-3 py-2 text-sm placeholder:text-muted focus:border-cornell-red focus:outline-none focus:ring-2 focus:ring-cornell-red"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-lg border border-card-border bg-card-bg px-4 py-2 text-sm font-medium transition-colors hover:bg-muted-bg focus:outline-none focus:ring-2 focus:ring-cornell-red"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-lg bg-cornell-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cornell-dark disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cornell-red focus:ring-offset-2"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
