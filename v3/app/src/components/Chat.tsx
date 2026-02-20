"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatProps {
  toolId?: string;
  suggestions?: string[];
}

export default function Chat({ toolId, suggestions }: ChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: toolId ? { toolId } : undefined,
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (text: string) => {
    if (!text.trim() || isLoading) return;
    sendMessage({ text: text.trim() });
    setInput("");
    // Re-focus input after sending
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto space-y-4 p-4"
      >
        {messages.length === 0 && suggestions && (
          <div className="space-y-2">
            <p className="text-sm text-muted">Try asking:</p>
            {suggestions.map((q) => (
              <button
                key={q}
                onClick={() => handleSubmit(q)}
                className="block w-full rounded-lg border border-card-border px-3 py-2 text-left text-sm hover:bg-muted-bg transition-colors"
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
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-cornell-red text-white"
                  : "bg-muted-bg"
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
                        {part.text}
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
            className="flex-1 rounded-lg border border-card-border bg-card-bg px-3 py-2 text-sm placeholder:text-muted focus:border-cornell-red focus:outline-none focus:ring-1 focus:ring-cornell-red"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="rounded-lg bg-cornell-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cornell-dark disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
