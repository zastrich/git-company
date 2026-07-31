"use client";

import { useState, useEffect, useRef } from "react";
import { use } from "react";
import { Send, Bot, User, Clock } from "lucide-react";

interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

type ContextWindow = "30d" | "90d" | "all";

export default function ChatPage({
  params,
}: {
  params: Promise<{ companySlug: string; agentId: string }>;
}) {
  const { companySlug, agentId } = use(params);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contextWindow, setContextWindow] = useState<ContextWindow>("30d");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    fetchHistory();
  }, [companySlug, agentId, contextWindow]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(
        `/api/chat/${companySlug}/${agentId}?window=${contextWindow}`
      );
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    // Otimistic update
    const tempUserMsg: ChatMsg = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/chat/${companySlug}/${agentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, contextWindow }),
      });

      const data = await res.json();

      if (res.ok) {
        const assistantMsg: ChatMsg = {
          id: data.id,
          role: "assistant",
          content: data.content,
          createdAt: data.createdAt,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        // Show error as system message
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "system",
            content: `Erro: ${data.error ?? "Falha ao processar"}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "system",
          content: "Erro de conexão com o servidor.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Chat com {agentId}</h1>
            <p className="text-xs text-zinc-500">Interação direta com o agente</p>
          </div>
        </div>

        {/* Context Window Selector */}
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-500" />
          <select
            value={contextWindow}
            onChange={(e) => setContextWindow(e.target.value as ContextWindow)}
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Janela de contexto"
          >
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="all">Todo o período</option>
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="w-12 h-12 text-zinc-700 mb-4" />
            <p className="text-zinc-500">
              Nenhuma mensagem ainda. Inicie a conversa com o agente.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role !== "user" && (
              <div className="flex-shrink-0 p-2 rounded-lg bg-indigo-500/10 text-indigo-400 h-fit">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : msg.role === "system"
                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                  : "bg-zinc-800 text-zinc-200 border border-zinc-700"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className="text-[10px] mt-2 opacity-50">
                {new Date(msg.createdAt).toLocaleString("pt-BR")}
              </p>
            </div>

            {msg.role === "user" && (
              <div className="flex-shrink-0 p-2 rounded-lg bg-zinc-800 text-zinc-400 h-fit">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 items-center">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-zinc-800 rounded-2xl px-4 py-3 border border-zinc-700">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="pt-4 border-t border-zinc-800">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            rows={1}
            className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-100 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 placeholder:text-zinc-600"
            disabled={isLoading}
            aria-label="Mensagem para o agente"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Enviar mensagem"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[11px] text-zinc-600 mt-2">
          Enter para enviar. Shift+Enter para nova linha. Contexto: {contextWindow === "30d" ? "30 dias" : contextWindow === "90d" ? "90 dias" : "completo"}.
        </p>
      </div>
    </div>
  );
}
